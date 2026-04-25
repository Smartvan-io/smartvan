"""HTML page routes."""

from __future__ import annotations

from flask import Blueprint, abort, render_template

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


@bp.get("/device/<device_id>")
def device_detail(device_id: str):
    """Calibration page; template chosen by device model."""
    ha = get_client()
    device = ha.get_device(device_id)
    if device is None:
        abort(404)

    model = (device.get("model") or "").lower()
    channels = ha.channels_for_device(device_id)

    if "inclinometer" in model:
        return _render_inclinometer(device, channels, ha)
    if "resistive" in model or "tank" in model:
        return _render_resistive(device, channels, ha)

    return render_template("device_unknown.html", device=device)


def _render_inclinometer(device, channels, ha):
    # Read current values for the form's initial state. WS push keeps
    # the live readout fresh after first paint.
    def _state(channel):
        eid = channels.get(channel)
        return ha.get_state(eid) if eid else None

    orientation_state = _state("orientation")
    pitch_comp_state = _state("pitch_adjustment_angle")
    roll_comp_state = _state("roll_adjustment_angle")
    pitch_state = _state("adjusted_pitch_angle")
    roll_state = _state("adjusted_roll_angle")

    options = []
    if orientation_state and orientation_state.get("attributes"):
        options = orientation_state["attributes"].get("options") or []

    return render_template(
        "inclinometer.html",
        device=device,
        channels=channels,
        orientation_value=(orientation_state or {}).get("state"),
        orientation_options=options,
        pitch_compensation=(pitch_comp_state or {}).get("state", "0"),
        roll_compensation=(roll_comp_state or {}).get("state", "0"),
        pitch_value=(pitch_state or {}).get("state"),
        roll_value=(roll_state or {}).get("state"),
    )


def _render_resistive(device, channels, ha):
    # task #9 builds this out properly; placeholder for now so the
    # route doesn't 500 if a resistive sensor is selected mid-build.
    return render_template("device_unknown.html", device=device)
