"""JSON API for the SPA frontend.

Every save endpoint translates a UI action into an HA service call and
confirms the entity state moved within a short window before returning
success. ESPHome devices that are offline accept service calls with
HTTP 200 but the entity state never changes — without the wait-for-state
check this would look like a successful save.

All routes return JSON. The shape is uniform: `{ok: bool, message: str}`
on writes; reads return whatever data the SPA needs to hydrate.
"""

from __future__ import annotations

import json
import logging
import subprocess

from flask import Blueprint, abort, jsonify, request

from ..ha_client import HAServiceError, get_client

logger = logging.getLogger(__name__)

bp = Blueprint("api", __name__, url_prefix="/api")


def _device_or_404(device_id: str):
    ha = get_client()
    device = ha.get_device(device_id)
    if device is None:
        abort(404)
    return ha, device


def _entity_or_400(ha, device_id: str, channel: str) -> str:
    entity_id = ha.entity_id_for(device_id, channel)
    if entity_id is None:
        abort(400, description=f"unknown channel {channel!r} for device {device_id}")
    return entity_id


def _ok(message: str, **extra):
    return jsonify({"ok": True, "message": message, **extra})


def _fail(message: str, status: int = 400, **extra):
    return jsonify({"ok": False, "message": message, **extra}), status


# ── Device hydration ──────────────────────────────────────────


_INTERPOLATION_KINDS = ["linear", "quadratic", "cubic", "smooth"]


@bp.get("/device/<device_id>")
def device_detail(device_id: str):
    """Hydration payload for the SPA detail view.

    Returns enough to render the calibration UI without a second
    request. Live values are still fed via /ws/device/<id>; the values
    here are just the initial paint.
    """
    ha, device = _device_or_404(device_id)
    model = (device.get("model") or "").lower()
    channels = ha.channels_for_device(device_id)

    payload = {
        "device": device,
        "model_kind": _model_kind(model),
        "channels": channels,
    }

    if "inclinometer" in model:
        payload["inclinometer"] = _inclinometer_payload(ha, channels)
    elif "resistive" in model or "tank" in model:
        payload["resistive"] = _resistive_payload(ha, channels)

    return jsonify(payload)


def _model_kind(model: str) -> str:
    if "inclinometer" in model:
        return "inclinometer"
    if "resistive" in model or "tank" in model:
        return "resistive"
    return "unknown"


def _inclinometer_payload(ha, channels):
    def _state(channel):
        eid = channels.get(channel)
        return ha.get_state(eid) if eid else None

    orientation = _state("orientation") or {}
    pitch_comp = _state("pitch_adjustment_angle") or {}
    roll_comp = _state("roll_adjustment_angle") or {}
    pitch = _state("adjusted_pitch_angle") or {}
    roll = _state("adjusted_roll_angle") or {}

    options = (orientation.get("attributes") or {}).get("options") or []

    return {
        "orientation_value": orientation.get("state"),
        "orientation_options": options,
        "pitch_compensation": pitch_comp.get("state"),
        "roll_compensation": roll_comp.get("state"),
        "pitch_value": pitch.get("state"),
        "roll_value": roll.get("state"),
    }


def _resistive_payload(ha, channels):
    def _state(eid):
        return ha.get_state(eid) if eid else None

    sensors = []
    for n in (1, 2):
        # The "theshold" typo is firmware-side; mirror it so the
        # unique_id lookup matches.
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
        kind_state = _state(ch["kind"])
        kind_options = ((kind_state or {}).get("attributes") or {}).get(
            "options"
        ) or _INTERPOLATION_KINDS

        sensors.append(
            {
                "n": n,
                "raw_value": (_state(ch["raw"]) or {}).get("state"),
                "interpolated_value": (_state(ch["interpolated"]) or {}).get("state"),
                "points": _parse_points((_state(ch["points"]) or {}).get("state", "[]")),
                "kind_value": (kind_state or {}).get("state"),
                "kind_options": kind_options,
                "min_r": (_state(ch["min_r"]) or {}).get("state"),
                "max_r": (_state(ch["max_r"]) or {}).get("state"),
                "threshold": (_state(ch["threshold"]) or {}).get("state"),
                "input_open": (_state(ch["open"]) or {}).get("state") == "on",
            }
        )
    return {"sensors": sensors}


def _parse_points(raw: str) -> list[list[float]]:
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


# ── Inclinometer writes ───────────────────────────────────────


@bp.post("/device/<device_id>/inclinometer/orientation")
def set_orientation(device_id: str):
    ha, _ = _device_or_404(device_id)
    entity_id = _entity_or_400(ha, device_id, "orientation")
    option = (request.json or {}).get("option", "").strip() if request.is_json else request.form.get("option", "").strip()
    if not option:
        return _fail("missing option")
    try:
        ha.call_service(
            "select",
            "select_option",
            service_data={"option": option},
            target={"entity_id": entity_id},
        )
    except HAServiceError as exc:
        return _fail(f"HA rejected: {exc}")

    confirmed = ha.wait_for_state(
        entity_id, lambda s: s is not None and s.get("state") == option
    )
    if not confirmed:
        return _fail("saved, but the device didn't acknowledge — is it online?")
    return _ok(f"orientation: {option}")


@bp.post("/device/<device_id>/inclinometer/<axis>-compensation")
def set_compensation(device_id: str, axis: str):
    if axis not in ("pitch", "roll"):
        abort(404)
    ha, _ = _device_or_404(device_id)
    entity_id = _entity_or_400(ha, device_id, f"{axis}_adjustment_angle")

    raw = _read_value(request)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return _fail(f"value {raw!r} isn't a number")

    try:
        ha.call_service(
            "number",
            "set_value",
            service_data={"value": value},
            target={"entity_id": entity_id},
        )
    except HAServiceError as exc:
        return _fail(f"HA rejected: {exc}")

    confirmed = ha.wait_for_state(
        entity_id,
        lambda s: s is not None and abs(float(s.get("state", "nan")) - value) < 0.01,
    )
    if not confirmed:
        return _fail("saved, but the device didn't acknowledge — is it online?")
    return _ok(f"{axis} compensation: {value}°")


@bp.post("/device/<device_id>/inclinometer/<action>-<axis>")
def press_calibration_button(device_id: str, action: str, axis: str):
    if axis not in ("pitch", "roll"):
        abort(404)
    if action == "calibrate":
        channel = f"calibrate_{axis}"
        label = f"calibrated {axis}"
    elif action == "reset":
        channel = f"reset_{axis}_calibration"
        label = f"reset {axis} calibration"
    else:
        abort(404)

    ha, _ = _device_or_404(device_id)
    entity_id = _entity_or_400(ha, device_id, channel)

    try:
        ha.call_service(
            "button",
            "press",
            target={"entity_id": entity_id},
        )
    except HAServiceError as exc:
        return _fail(f"HA rejected: {exc}")

    return _ok(label)


# ── Resistive sensor writes ───────────────────────────────────


@bp.post("/device/<device_id>/resistive/<int:n>/points/save")
def points_save(device_id: str, n: int):
    ha, _ = _device_or_404(device_id)
    entity_id = _entity_or_400(ha, device_id, f"sensor_{n}_interpolation_points")

    body = request.json or {}
    raw_points = body.get("points") or []
    cleaned: list[list[float]] = []
    for pair in raw_points:
        try:
            cleaned.append([float(pair[0]), float(pair[1])])
        except (TypeError, ValueError, IndexError):
            continue
    cleaned.sort(key=lambda x: x[0])

    payload = json.dumps(cleaned)
    try:
        ha.call_service(
            "text",
            "set_value",
            service_data={"value": payload},
            target={"entity_id": entity_id},
        )
    except HAServiceError as exc:
        return _fail(f"HA rejected: {exc}")

    confirmed = ha.wait_for_state(
        entity_id, lambda s: s is not None and s.get("state") == payload
    )
    if not confirmed:
        return _fail("saved, but the device didn't acknowledge — is it online?")
    return _ok(f"saved {len(cleaned)} point(s)", points=cleaned)


@bp.post("/device/<device_id>/resistive/<int:n>/<field>")
def set_resistive_number_or_select(device_id: str, n: int, field: str):
    field_to_channel_and_kind = {
        "min-resistance": (f"sensor_{n}_min_resistance", "number"),
        "max-resistance": (f"sensor_{n}_max_resistance", "number"),
        "threshold": (f"sensor_{n}_open_circuit_voltage_theshold", "number"),
        "interpolation-kind": (f"sensor_{n}_interpolation_kind", "select"),
    }
    spec = field_to_channel_and_kind.get(field)
    if spec is None:
        abort(404)
    channel, kind = spec

    ha, _ = _device_or_404(device_id)
    entity_id = _entity_or_400(ha, device_id, channel)

    if kind == "number":
        raw = _read_value(request)
        try:
            value = float(raw)
        except (TypeError, ValueError):
            return _fail(f"value {raw!r} isn't a number")
        try:
            ha.call_service(
                "number",
                "set_value",
                service_data={"value": value},
                target={"entity_id": entity_id},
            )
        except HAServiceError as exc:
            return _fail(f"HA rejected: {exc}")
        confirmed = ha.wait_for_state(
            entity_id,
            lambda s: s is not None and abs(float(s.get("state", "nan")) - value) < 0.01,
        )
        if not confirmed:
            return _fail("saved, but the device didn't acknowledge — is it online?")
        return _ok(f"saved: {value}")

    option = (request.json or {}).get("option") if request.is_json else request.form.get("option")
    option = (option or "").strip()
    if not option:
        return _fail("missing option")
    try:
        ha.call_service(
            "select",
            "select_option",
            service_data={"option": option},
            target={"entity_id": entity_id},
        )
    except HAServiceError as exc:
        return _fail(f"HA rejected: {exc}")
    confirmed = ha.wait_for_state(
        entity_id, lambda s: s is not None and s.get("state") == option
    )
    if not confirmed:
        return _fail("saved, but the device didn't acknowledge — is it online?")
    return _ok(f"saved: {option}")


def _read_value(req):
    """Pull `value` from a JSON body or a form post."""
    if req.is_json:
        body = req.json or {}
        return body.get("value")
    return req.form.get("value", "").strip()


# ── Uninstall flow ────────────────────────────────────────────


@bp.post("/uninstall")
def uninstall():
    """Run cleanup.sh, then tell the user to remove the add-on.

    Form must include `confirm=yes` so a stray POST can't trigger
    destruction.
    """
    confirm = (request.json or {}).get("confirm") if request.is_json else request.form.get("confirm")
    if confirm != "yes":
        return _fail("missing confirmation")

    try:
        result = subprocess.run(
            ["bash", "/opt/smartvanio/cleanup.sh"],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return _fail("cleanup timed out — check the addon log", status=500)

    if result.returncode != 0:
        logger.error(
            "cleanup.sh failed (%d): %s", result.returncode, result.stderr.strip()
        )
        return _fail(
            f"cleanup script exited {result.returncode} — check the addon log",
            status=500,
        )

    return _ok("cleanup complete — you can remove the add-on now")
