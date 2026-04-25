"""Calibration write endpoints.

These translate UI form posts into HA service calls and confirm
that the entity state actually moved within a short window before
returning success. ESPHome devices that are offline will accept
service calls with HTTP 200 but the entity state never updates,
which would otherwise look like a successful save.

All routes return small HTML fragments suitable for hx-target swap.
"""

from __future__ import annotations

import logging

from flask import Blueprint, abort, render_template, request

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


def _result_partial(ok: bool, message: str):
    return render_template("partials/result.html", ok=ok, message=message)


# ── Inclinometer ──────────────────────────────────────────────


@bp.post("/device/<device_id>/inclinometer/orientation")
def set_orientation(device_id: str):
    ha, _ = _device_or_404(device_id)
    entity_id = _entity_or_400(ha, device_id, "orientation")
    option = request.form.get("option", "").strip()
    if not option:
        return _result_partial(False, "missing option"), 400
    try:
        ha.call_service(
            "select",
            "select_option",
            service_data={"option": option},
            target={"entity_id": entity_id},
        )
    except HAServiceError as exc:
        return _result_partial(False, f"HA rejected: {exc}"), 400

    confirmed = ha.wait_for_state(
        entity_id, lambda s: s is not None and s.get("state") == option
    )
    if not confirmed:
        return _result_partial(False, "saved, but the device didn't acknowledge — is it online?")
    return _result_partial(True, f"orientation: {option}")


@bp.post("/device/<device_id>/inclinometer/<axis>-compensation")
def set_compensation(device_id: str, axis: str):
    if axis not in ("pitch", "roll"):
        abort(404)
    channel = f"{axis}_adjustment_angle"
    ha, _ = _device_or_404(device_id)
    entity_id = _entity_or_400(ha, device_id, channel)

    raw = request.form.get("value", "").strip()
    try:
        value = float(raw)
    except ValueError:
        return _result_partial(False, f"value {raw!r} isn't a number"), 400

    try:
        ha.call_service(
            "number",
            "set_value",
            service_data={"value": value},
            target={"entity_id": entity_id},
        )
    except HAServiceError as exc:
        return _result_partial(False, f"HA rejected: {exc}"), 400

    confirmed = ha.wait_for_state(
        entity_id,
        lambda s: s is not None and abs(float(s.get("state", "nan")) - value) < 0.01,
    )
    if not confirmed:
        return _result_partial(False, "saved, but the device didn't acknowledge — is it online?")
    return _result_partial(True, f"{axis} compensation: {value}°")


@bp.post("/device/<device_id>/inclinometer/<action>-<axis>")
def press_calibration_button(device_id: str, action: str, axis: str):
    """Trigger calibrate-pitch / calibrate-roll / reset-pitch / reset-roll."""
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
        return _result_partial(False, f"HA rejected: {exc}"), 400

    return _result_partial(True, label)
