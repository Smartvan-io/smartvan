"""flask-sock WebSocket routes for live UI updates.

Per-page protocol: server pushes JSON envelopes of the form
    {"target": "#some-id", "html": "<div ...>...</div>"}
The browser-side helper (live.js) replaces the targeted DOM region.

Why HTML fragments and not JSON state: keeping rendering server-side
means template logic lives in one place (Jinja) and the client stays
trivial. It also matches the htmx mental model the rest of the UI
uses for form submissions.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import gevent
import gevent.event
import gevent.lock
import gevent.queue
from flask import Blueprint, current_app, render_template
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
        # Coalesce bursts: store the latest snapshot, drop intermediates.
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
                devices = latest.get()  # blocks
                # Render the same partial used on initial page load
                # so the template is the single source of truth.
                with current_app.test_request_context("/"):
                    html = render_template(
                        "partials/device_list.html",
                        devices=sorted(
                            devices.values(),
                            key=lambda d: (d.get("name") or "").lower(),
                        ),
                    )
                envelope = json.dumps({"target": "#device-list", "html": html})
                ws.send(envelope)
        except Exception:
            # Browser closed, network blip, etc. Disconnect cleanly.
            logger.debug("/ws/devices client gone", exc_info=True)
        finally:
            unsubscribe()

    @sock.route("/ws/device/<device_id>")
    def ws_device(ws, device_id: str):
        """Push live entity-state fragments for a single device.

        Coalesces per-target updates so a slow client never gets a
        backlog. The page template marks live regions with both an
        id and a data-channel attribute; this handler renders one
        partial per channel based on the firmware-side channel name.
        """
        ha = get_client()
        device = ha.get_device(device_id)
        if device is None:
            ws.close()
            return

        # Per-channel coalescing queue. Each item is a (channel, state)
        # pair. We only keep the latest pending state per channel —
        # if the device fires faster than the browser can render, we
        # render the most recent value once and skip the intermediates.
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
        model = (device.get("model") or "").lower()

        try:
            while True:
                wakeup.wait()
                with pending_lock:
                    snapshot = dict(latest)
                    latest.clear()
                    wakeup.clear()
                for channel, state in snapshot.items():
                    envelope = _render_channel_envelope(
                        device, model, channel, state
                    )
                    if envelope is None:
                        continue
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


# Channels that have a corresponding live partial. Anything else is
# ignored so we don't waste bandwidth pushing buttons / configs.
_INCLINOMETER_LIVE_CHANNELS = {
    "adjusted_pitch_angle": ("#live-pitch", "partials/inclinometer_angle.html", "pitch"),
    "adjusted_roll_angle": ("#live-roll", "partials/inclinometer_angle.html", "roll"),
}


def _render_channel_envelope(device, model: str, channel: str, state):
    if "inclinometer" in model and channel in _INCLINOMETER_LIVE_CHANNELS:
        target, template, axis = _INCLINOMETER_LIVE_CHANNELS[channel]
        with current_app.test_request_context(f"/device/{device['device_id']}"):
            html = render_template(
                template,
                axis=axis,
                value=(state or {}).get("state"),
            )
        return {"target": target, "html": html}
    return None
