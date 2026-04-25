"""HTML page routes."""

from __future__ import annotations

from flask import Blueprint, abort, render_template, request

from ..ha_client import get_client

bp = Blueprint("pages", __name__)


@bp.get("/")
def index():
    # The Lit app fetches device state from /ws/devices on connect, so
    # the shell template doesn't need to be primed with anything.
    return render_template("index.html")


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


_INTERPOLATION_KINDS = ["linear", "quadratic", "cubic", "smooth"]


def _render_resistive(device, channels, ha):
    sensors = []
    for n in (1, 2):
        # Channel names in the firmware (note: "theshold" typo is real,
        # firmware-side; we mirror it so the HA unique_id lookup matches).
        ch = {
            "raw": channels.get(f"sensor_{n}_raw"),
            "interpolated": channels.get(f"sensor_{n}_interpolated_value"),
            "points": channels.get(f"sensor_{n}_interpolation_points"),
            "kind": channels.get(f"sensor_{n}_interpolation_kind"),
            "min_r": channels.get(f"sensor_{n}_min_resistance"),
            "max_r": channels.get(f"sensor_{n}_max_resistance"),
            "threshold": channels.get(f"sensor_{n}_open_circuit_voltage_theshold"),
            "open": channels.get(f"sensor_{n}_input_open"),
        }

        def _state(channel):
            eid = ch.get(channel)
            return ha.get_state(eid) if eid else None

        kind_state = _state("kind")
        kind_options = ((kind_state or {}).get("attributes") or {}).get(
            "options"
        ) or _INTERPOLATION_KINDS

        sensors.append(
            {
                "n": n,
                "raw_value": (_state("raw") or {}).get("state"),
                "interpolated_value": (_state("interpolated") or {}).get("state"),
                "points": _parse_points((_state("points") or {}).get("state", "[]")),
                "kind_value": (kind_state or {}).get("state"),
                "kind_options": kind_options,
                "min_r": (_state("min_r") or {}).get("state", ""),
                "max_r": (_state("max_r") or {}).get("state", ""),
                "threshold": (_state("threshold") or {}).get("state", ""),
                "input_open": (_state("open") or {}).get("state") == "on",
            }
        )

    return render_template("resistive.html", device=device, sensors=sensors)


def _parse_points(raw: str) -> list[list[float]]:
    """Tolerant decoder for the interpolation_points text entity.

    Accepts a JSON list-of-lists. Returns [] on any parse failure so
    the editor renders a clean empty state rather than 500-ing on
    malformed device payloads.
    """
    import json

    try:
        data = json.loads(raw)
        if not isinstance(data, list):
            return []
        out: list[list[float]] = []
        for pair in data:
            if isinstance(pair, list) and len(pair) >= 2:
                out.append([float(pair[0]), float(pair[1])])
        return out
    except (ValueError, TypeError):
        return []
