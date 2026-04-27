"""flask-sock WebSocket routes for live UI updates.

Two sockets:
  /ws/devices            — device-list snapshots (push on every change)
  /ws/device/<device_id> — per-channel state changes for a single device

Both push plain JSON. The Lit components own all rendering; this layer
just relays HA state.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import gevent
import gevent.event
import gevent.lock
import gevent.queue
from flask import Blueprint
from flask_sock import Sock
from gevent.queue import Queue

from ..ha_client import get_client

logger = logging.getLogger(__name__)
bp = Blueprint("ws", __name__)


def register(sock: Sock) -> None:
    @sock.route("/ws/devices")
    def ws_devices(ws):
        """Push the device list whenever HA's device registry changes."""
        ha = get_client()
        latest: Queue = Queue(maxsize=1)

        def on_devices(devices: dict[str, dict[str, Any]]) -> None:
            try:
                if latest.full():
                    latest.get_nowait()
            except gevent.queue.Empty:
                pass
            latest.put(devices)

        unsubscribe = ha.add_device_listener(on_devices)
        try:
            while True:
                devices = latest.get()
                payload = {
                    "devices": sorted(
                        devices.values(),
                        key=lambda d: (d.get("name") or "").lower(),
                    ),
                    "ha_ready": ha.is_ready(),
                }
                ws.send(json.dumps(payload))
        except Exception:
            logger.debug("/ws/devices client gone", exc_info=True)
        finally:
            unsubscribe()

    @sock.route("/ws/device/<device_id>")
    def ws_device(ws, device_id: str):
        """Push live entity state for a single device.

        Each frame is `{channel, value, attributes}`. The browser-side
        Lit component picks out the channels it cares about. We coalesce
        per-channel updates so a slow client never gets a backlog —
        only the latest value per channel is pushed each tick.
        """
        ha = get_client()
        device = ha.get_device(device_id)
        if device is None:
            ws.close()
            return

        latest: dict[str, dict[str, Any] | None] = {}
        wakeup = gevent.event.Event()
        pending_lock = gevent.lock.Semaphore()

        def on_entity(entity_id: str, state: dict[str, Any] | None) -> None:
            channel = _channel_for_entity(ha, device_id, entity_id)
            if channel is None:
                return
            with pending_lock:
                latest[channel] = state
            wakeup.set()

        unsubscribe = ha.add_entity_listener(device_id, on_entity)

        try:
            while True:
                wakeup.wait()
                with pending_lock:
                    snapshot = dict(latest)
                    latest.clear()
                    wakeup.clear()
                for channel, state in snapshot.items():
                    envelope = {
                        "channel": channel,
                        "value": (state or {}).get("state"),
                        "attributes": (state or {}).get("attributes") or {},
                    }
                    ws.send(json.dumps(envelope))
        except Exception:
            logger.debug("/ws/device/%s client gone", device_id, exc_info=True)
        finally:
            unsubscribe()


def _channel_for_entity(ha, device_id: str, entity_id: str) -> str | None:
    for channel, eid in ha.channels_for_device(device_id).items():
        if eid == entity_id:
            return channel
    return None
