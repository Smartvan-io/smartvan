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
        self._listener_lock = RLock()
        self._ready = Event()
        self._registry_sub_id: int | None = None
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
            self._subscribe_registry_updates()
            self._ready.set()
            logger.info("HA WS ready (%d SmartVan.io devices cached)", len(self._devices))
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

    def _handle_registry_event(self) -> None:
        try:
            self._prime_devices()
        except Exception:
            logger.exception("re-prime after device_registry_updated failed")

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
