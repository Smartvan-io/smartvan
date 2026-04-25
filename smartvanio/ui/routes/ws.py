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
