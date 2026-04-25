"""Persistent WebSocket client to Home Assistant Core via Supervisor.

Why we don't subscribe to MQTT directly:
The smartvanio HA integration already subscribes to every device's
config/state/status MQTT topics and exposes them as HA entities and
device-registry entries. Running paho in this addon would duplicate
that work and couple the addon to the broker's connection details.
Instead we sit on top of HA's stable, documented WebSocket API.

Protocol:
  https://developers.home-assistant.io/docs/api/websocket
  - On connect, HA sends `auth_required`.
  - Reply with `{type: "auth", access_token: <SUPERVISOR_TOKEN>}`.
  - Then send commands with monotonically increasing ids; responses
    arrive with the same id and `success: true|false`.
  - `subscribe_*` commands stream events tagged with the subscription id.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import gevent
from gevent.event import AsyncResult, Event
from gevent.lock import RLock
from websocket import WebSocketException, create_connection

logger = logging.getLogger(__name__)

SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN", "")
HA_WS_URL = "ws://supervisor/core/websocket"
DEVICES_CACHE_PATH = Path("/data/devices-cache.json")
SMARTVANIO_DOMAIN = "smartvanio"

DeviceListener = Callable[[dict[str, dict[str, Any]]], None]
EntityListener = Callable[[str, dict[str, Any] | None], None]


class HAClient:
    """Single long-lived WebSocket to HA Core.

    Threading model:
      - Construction spawns one greenlet running `_run_forever`.
      - `_run_forever` connects, auths, primes caches, then blocks
        reading frames.
      - Public methods (`list_devices`, `call_service`, …) are called
        from request handlers (gevent greenlets too, since the WSGI
        server is gevent.pywsgi). They send commands and block on an
        AsyncResult until the matching response arrives.
      - On any error the loop reconnects after a backoff and re-primes.
    """

    def __init__(self) -> None:
        self._ws = None
        self._send_lock = RLock()
        self._id_lock = threading.Lock()
        self._next_id = 1
        self._pending: dict[int, AsyncResult] = {}
        self._devices: dict[str, dict[str, Any]] = {}
        self._device_listeners: list[DeviceListener] = []
        self._entity_listeners: dict[str, list[EntityListener]] = {}
        # device_id -> set(entity_id)
        self._device_entities: dict[str, set[str]] = {}
        # entity_id -> device_id (reverse lookup for fast event routing)
        self._entity_to_device: dict[str, str] = {}
        # device_id -> {channel: entity_id} (channel = unique_id minus "{device_id}_" prefix)
        self._channel_index: dict[str, dict[str, str]] = {}
        # entity_id -> last-known state dict {state, attributes, ...}
        self._states: dict[str, dict[str, Any]] = {}
        self._listener_lock = RLock()
        self._ready = Event()
        self._registry_sub_id: int | None = None
        self._state_sub_id: int | None = None
        self._load_devices_cache()
        gevent.spawn(self._run_forever)

    # ── Public API ────────────────────────────────────────────

    def is_ready(self) -> bool:
        return self._ready.is_set()

    def wait_ready(self, timeout: float = 30.0) -> bool:
        return self._ready.wait(timeout=timeout)

    def list_devices(self) -> list[dict[str, Any]]:
        """Return cached SmartVan.io devices, sorted by name."""
        return sorted(self._devices.values(), key=lambda d: (d.get("name") or "").lower())

    def get_device(self, device_id: str) -> dict[str, Any] | None:
        return self._devices.get(device_id)

    def call_service(
        self,
        domain: str,
        service: str,
        service_data: dict[str, Any] | None = None,
        target: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        msg: dict[str, Any] = {"type": "call_service", "domain": domain, "service": service}
        if service_data is not None:
            msg["service_data"] = service_data
        if target is not None:
            msg["target"] = target
        return self._send_and_await(msg)

    def get_state(self, entity_id: str) -> dict[str, Any] | None:
        """Last-known state for an entity, or None if not seen yet."""
        return self._states.get(entity_id)

    def get_entities_for_device(self, device_id: str) -> list[str]:
        return sorted(self._device_entities.get(device_id, ()))

    def entity_id_for(self, device_id: str, channel: str) -> str | None:
        """Map (device_id, channel) -> HA entity_id.

        `channel` is the firmware-side suffix (e.g. "pitch_adjustment_angle",
        "calibrate_pitch", "orientation"). This decouples the addon's UI
        from how HA happens to slug an entity_id; the integration's
        unique_id pattern of f"{device_id}_{channel}" is the contract
        and it's stable across firmware revisions.
        """
        return self._channel_index.get(device_id, {}).get(channel)

    def channels_for_device(self, device_id: str) -> dict[str, str]:
        """All known channel -> entity_id pairs for a device."""
        return dict(self._channel_index.get(device_id, {}))

    def wait_for_state(
        self,
        entity_id: str,
        predicate: Callable[[dict[str, Any] | None], bool],
        timeout: float = 5.0,
        poll_interval: float = 0.1,
    ) -> bool:
        """Block until `predicate(get_state(entity_id))` is true, or timeout.

        Used after a service write to confirm the new value actually
        landed: ESPHome devices that are offline accept service calls
        with HTTP 200 but the entity state never updates. Routes call
        this to surface a warning to the user instead of silently
        succeeding.

        Returns True if the predicate became true within the window,
        False on timeout. Cheap polling because we already have a live
        state cache fed by the state_changed subscription — there's
        no extra network call per poll.
        """
        deadline = time.monotonic() + timeout
        while True:
            try:
                if predicate(self._states.get(entity_id)):
                    return True
            except Exception:
                logger.exception("wait_for_state predicate raised")
                return False
            if time.monotonic() >= deadline:
                return False
            gevent.sleep(poll_interval)

    def add_entity_listener(
        self, device_id: str, cb: EntityListener
    ) -> Callable[[], None]:
        """Subscribe to state changes for entities owned by `device_id`.

        On registration, immediately calls `cb(entity_id, state)` for
        every currently-known entity of the device, so the caller can
        prime its UI without waiting for the next change.
        """
        with self._listener_lock:
            self._entity_listeners.setdefault(device_id, []).append(cb)
        for entity_id in self.get_entities_for_device(device_id):
            try:
                cb(entity_id, self._states.get(entity_id))
            except Exception:
                logger.exception("entity listener raised on initial snapshot")

        def remove() -> None:
            with self._listener_lock:
                listeners = self._entity_listeners.get(device_id)
                if listeners and cb in listeners:
                    listeners.remove(cb)

        return remove

    def add_device_listener(self, cb: DeviceListener) -> Callable[[], None]:
        with self._listener_lock:
            self._device_listeners.append(cb)
        # Push the current snapshot immediately so newly-attached
        # listeners (e.g. a freshly-opened browser WS) don't have to
        # wait for the next change to draw something.
        try:
            cb(dict(self._devices))
        except Exception:
            logger.exception("device listener raised on initial snapshot")

        def remove() -> None:
            with self._listener_lock:
                if cb in self._device_listeners:
                    self._device_listeners.remove(cb)

        return remove

    # ── Connection loop ──────────────────────────────────────

    def _run_forever(self) -> None:
        backoff = 2.0
        while True:
            try:
                self._connect_and_serve()
                backoff = 2.0
            except Exception:
                logger.exception("HA WS loop crashed; reconnecting in %.1fs", backoff)
                self._ready.clear()
                self._fail_pending(RuntimeError("HA WS connection lost"))
                gevent.sleep(backoff)
                backoff = min(backoff * 2.0, 30.0)

    def _connect_and_serve(self) -> None:
        if not SUPERVISOR_TOKEN:
            logger.error("SUPERVISOR_TOKEN missing; cannot connect to HA WS")
            gevent.sleep(10.0)
            return

        logger.info("Connecting to HA WS at %s", HA_WS_URL)
        ws = create_connection(HA_WS_URL, timeout=10)
        try:
            self._ws = ws
            self._authenticate(ws)
            self._prime_devices()
            self._prime_entities_and_states()
            self._subscribe_registry_updates()
            self._subscribe_state_changes()
            self._ready.set()
            logger.info(
                "HA WS ready (%d devices, %d entities)",
                len(self._devices),
                len(self._entity_to_device),
            )
            self._read_loop(ws)
        finally:
            self._ws = None
            try:
                ws.close()
            except Exception:
                pass

    def _authenticate(self, ws) -> None:
        # auth_required -> auth -> auth_ok | auth_invalid
        hello = json.loads(ws.recv())
        if hello.get("type") != "auth_required":
            raise WebSocketException(f"unexpected greeting: {hello!r}")
        ws.send(json.dumps({"type": "auth", "access_token": SUPERVISOR_TOKEN}))
        result = json.loads(ws.recv())
        if result.get("type") != "auth_ok":
            raise WebSocketException(f"HA WS auth failed: {result!r}")

    def _prime_devices(self) -> None:
        result = self._send_and_await({"type": "config/device_registry/list"})
        devices = {}
        for entry in result:
            if not _is_smartvanio_device(entry):
                continue
            device_id = _extract_device_id(entry)
            if not device_id:
                continue
            devices[device_id] = _normalise_device(entry, device_id)
        self._devices = devices
        self._persist_devices_cache()
        self._notify_devices()

    def _subscribe_registry_updates(self) -> None:
        # Listen for device_registry_updated events; on any change,
        # re-prime so we re-derive the SmartVan.io subset cleanly.
        self._registry_sub_id = self._send_and_await(
            {"type": "subscribe_events", "event_type": "device_registry_updated"},
            wait_for_result=True,
            also_returns_id=True,
        )

    def _subscribe_state_changes(self) -> None:
        # Subscribe to all state_changed events; we filter to
        # SmartVan.io entities in the read loop. Cheap given the
        # event volume in a typical home install.
        self._state_sub_id = self._send_and_await(
            {"type": "subscribe_events", "event_type": "state_changed"},
            wait_for_result=True,
            also_returns_id=True,
        )

    def _prime_entities_and_states(self) -> None:
        """Build {device_id: [entity_id]} and seed state cache.

        Two HA WS calls:
          - config/entity_registry/list -> entity -> device mapping
          - get_states -> initial snapshot of every entity's state
        Both are bounded one-shots. Live updates after this come
        through the state_changed subscription.
        """
        if not self._devices:
            self._device_entities = {}
            self._entity_to_device = {}
            self._states = {}
            return

        smartvanio_ha_ids = {d["ha_id"] for d in self._devices.values() if d.get("ha_id")}
        device_id_for_ha_id = {
            d["ha_id"]: d["device_id"]
            for d in self._devices.values()
            if d.get("ha_id")
        }

        entities = self._send_and_await({"type": "config/entity_registry/list"}) or []
        device_entities: dict[str, set[str]] = {d: set() for d in self._devices}
        entity_to_device: dict[str, str] = {}
        channel_index: dict[str, dict[str, str]] = {d: {} for d in self._devices}
        for entry in entities:
            ha_dev_id = entry.get("device_id")
            if ha_dev_id not in smartvanio_ha_ids:
                continue
            entity_id = entry.get("entity_id")
            if not entity_id:
                continue
            our_dev_id = device_id_for_ha_id[ha_dev_id]
            device_entities[our_dev_id].add(entity_id)
            entity_to_device[entity_id] = our_dev_id

            # Derive channel from unique_id. Integration sets it to
            # f"{device_id}_{channel}" — strip the prefix to recover
            # the firmware-side channel name.
            unique_id = entry.get("unique_id") or ""
            prefix = f"{our_dev_id}_"
            if unique_id.startswith(prefix):
                channel = unique_id[len(prefix):]
                channel_index[our_dev_id][channel] = entity_id

        states_raw = self._send_and_await({"type": "get_states"}) or []
        states: dict[str, dict[str, Any]] = {}
        for st in states_raw:
            eid = st.get("entity_id")
            if eid in entity_to_device:
                states[eid] = st

        self._device_entities = device_entities
        self._entity_to_device = entity_to_device
        self._channel_index = channel_index
        self._states = states

    def _read_loop(self, ws) -> None:
        for raw in _ws_messages(ws):
            msg = json.loads(raw)
            mtype = msg.get("type")
            mid = msg.get("id")

            if mtype == "result":
                pending = self._pending.pop(mid, None)
                if pending is not None:
                    if msg.get("success", False):
                        pending.set(msg.get("result"))
                    else:
                        pending.set_exception(
                            HAServiceError(msg.get("error", {}).get("message", "unknown"))
                        )
                continue

            if mtype == "event" and mid == self._registry_sub_id:
                # Any device-registry change triggers a re-prime. We
                # spawn so the read loop never blocks on an HA round
                # trip.
                gevent.spawn(self._handle_registry_event)
                continue

            if mtype == "event" and mid == self._state_sub_id:
                self._handle_state_event(msg.get("event", {}).get("data") or {})
                continue

    def _handle_registry_event(self) -> None:
        try:
            self._prime_devices()
            self._prime_entities_and_states()
        except Exception:
            logger.exception("re-prime after device_registry_updated failed")

    def _handle_state_event(self, data: dict[str, Any]) -> None:
        entity_id = data.get("entity_id")
        if not entity_id:
            return
        device_id = self._entity_to_device.get(entity_id)
        if device_id is None:
            return  # not one of ours
        new_state = data.get("new_state")
        if new_state is None:
            self._states.pop(entity_id, None)
        else:
            self._states[entity_id] = new_state
        with self._listener_lock:
            listeners = list(self._entity_listeners.get(device_id, ()))
        for cb in listeners:
            try:
                cb(entity_id, new_state)
            except Exception:
                logger.exception("entity listener raised on state change")

    # ── Plumbing ──────────────────────────────────────────────

    def _send_and_await(
        self,
        msg: dict[str, Any],
        timeout: float = 10.0,
        wait_for_result: bool = True,
        also_returns_id: bool = False,
    ) -> Any:
        ws = self._ws
        if ws is None:
            raise RuntimeError("HA WS not connected")
        message_id = self._claim_id()
        msg = {**msg, "id": message_id}
        result = AsyncResult()
        self._pending[message_id] = result
        try:
            with self._send_lock:
                ws.send(json.dumps(msg))
            if not wait_for_result:
                return None
            value = result.get(timeout=timeout)
            return message_id if also_returns_id else value
        except gevent.Timeout:
            self._pending.pop(message_id, None)
            raise

    def _claim_id(self) -> int:
        with self._id_lock:
            i = self._next_id
            self._next_id += 1
            return i

    def _fail_pending(self, exc: Exception) -> None:
        for result in list(self._pending.values()):
            if not result.ready():
                result.set_exception(exc)
        self._pending.clear()

    def _notify_devices(self) -> None:
        with self._listener_lock:
            listeners = list(self._device_listeners)
        snapshot = dict(self._devices)
        for cb in listeners:
            try:
                cb(snapshot)
            except Exception:
                logger.exception("device listener raised")

    def _load_devices_cache(self) -> None:
        try:
            if DEVICES_CACHE_PATH.exists():
                with DEVICES_CACHE_PATH.open() as f:
                    raw = json.load(f)
                if isinstance(raw, dict):
                    self._devices = raw
        except Exception:
            logger.exception("failed to load devices cache; starting empty")

    def _persist_devices_cache(self) -> None:
        try:
            DEVICES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            tmp = DEVICES_CACHE_PATH.with_suffix(".tmp")
            with tmp.open("w") as f:
                json.dump(self._devices, f)
            tmp.replace(DEVICES_CACHE_PATH)
        except Exception:
            logger.exception("failed to persist devices cache")


class HAServiceError(RuntimeError):
    pass


def _ws_messages(ws):
    while True:
        raw = ws.recv()
        if raw is None or raw == "":
            return
        yield raw


def _is_smartvanio_device(entry: dict[str, Any]) -> bool:
    for ident in entry.get("identifiers", []):
        if isinstance(ident, list) and len(ident) >= 2 and ident[0] == SMARTVANIO_DOMAIN:
            return True
        if isinstance(ident, tuple) and len(ident) >= 2 and ident[0] == SMARTVANIO_DOMAIN:
            return True
    return False


def _extract_device_id(entry: dict[str, Any]) -> str | None:
    for ident in entry.get("identifiers", []):
        if isinstance(ident, (list, tuple)) and len(ident) >= 2 and ident[0] == SMARTVANIO_DOMAIN:
            return str(ident[1])
    return None


def _normalise_device(entry: dict[str, Any], device_id: str) -> dict[str, Any]:
    return {
        "device_id": device_id,
        "name": entry.get("name_by_user") or entry.get("name") or device_id,
        "model": entry.get("model") or "smartvanio",
        "manufacturer": entry.get("manufacturer") or "SmartVan.io",
        "sw_version": entry.get("sw_version"),
        "ha_id": entry.get("id"),  # HA's internal device-registry UUID
        "configuration_url": entry.get("configuration_url"),
    }


_singleton: HAClient | None = None


def get_client() -> HAClient:
    global _singleton
    if _singleton is None:
        _singleton = HAClient()
    return _singleton
