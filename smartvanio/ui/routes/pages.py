"""HTML page routes."""

from __future__ import annotations

from flask import Blueprint, render_template

from ..ha_client import get_client

bp = Blueprint("pages", __name__)


@bp.get("/")
def index():
    ha = get_client()
    devices = ha.list_devices()
    # ha_ready=False means the HA WS hasn't auth'd yet on this boot.
    # The page still renders from the persistent /data cache; the
    # device-list area is also live-updated via /ws/devices.
    return render_template(
        "index.html",
        devices=devices,
        ha_ready=ha.is_ready(),
    )
