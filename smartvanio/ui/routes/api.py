"""Calibration write endpoints.

These translate UI form posts into HA service calls and confirm
that the entity state actually moved within a short window before
returning success. ESPHome devices that are offline will accept
service calls with HTTP 200 but the entity state never updates,
which would otherwise look like a successful save.

All routes return small HTML fragments suitable for hx-target swap.
"""

from __future__ import annotations

import json
import logging
import subprocess

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


# ── Resistive sensor ──────────────────────────────────────────


def _collect_points(form) -> list[list[float]]:
    """Read v_0/p_0, v_1/p_1, … pairs from a posted form.

    Skips rows where either input is blank or non-numeric — lets a
    user partially clear a row without bringing the whole form down.
    Sorted ascending by voltage so the on-device interpolation gets
    monotone input regardless of the order rows were entered.
    """
    pairs: list[list[float]] = []
    i = 0
    while True:
        v_raw = form.get(f"v_{i}")
        p_raw = form.get(f"p_{i}")
        if v_raw is None and p_raw is None:
            break
        try:
            pairs.append([float(v_raw), float(p_raw)])
        except (TypeError, ValueError):
            pass
        i += 1
    pairs.sort(key=lambda x: x[0])
    return pairs


def _render_points_editor(device_id: str, n: int, points: list[list[float]]):
    return render_template(
        "partials/points_editor.html",
        device_id=device_id,
        n=n,
        points=points,
    )


@bp.post("/device/<device_id>/resistive/<int:n>/points/add")
def points_add(device_id: str, n: int):
    _device_or_404(device_id)
    points = _collect_points(request.form)
    points.append([0.0, 0.0])
    return _render_points_editor(device_id, n, points)


@bp.post("/device/<device_id>/resistive/<int:n>/points/remove")
def points_remove(device_id: str, n: int):
    _device_or_404(device_id)
    points = _collect_points(request.form)
    try:
        index = int(request.form.get("index", "-1"))
    except ValueError:
        index = -1
    if 0 <= index < len(points):
        del points[index]
    return _render_points_editor(device_id, n, points)


@bp.post("/device/<device_id>/resistive/<int:n>/points/save")
def points_save(device_id: str, n: int):
    ha, _ = _device_or_404(device_id)
    entity_id = _entity_or_400(ha, device_id, f"sensor_{n}_interpolation_points")
    points = _collect_points(request.form)
    payload = json.dumps(points)
    try:
        ha.call_service(
            "text",
            "set_value",
            service_data={"value": payload},
            target={"entity_id": entity_id},
        )
    except HAServiceError as exc:
        return _result_partial(False, f"HA rejected: {exc}"), 400

    confirmed = ha.wait_for_state(
        entity_id, lambda s: s is not None and s.get("state") == payload
    )
    if not confirmed:
        return _result_partial(False, "saved, but the device didn't acknowledge — is it online?")
    return _result_partial(True, f"saved {len(points)} point(s)")


@bp.post("/device/<device_id>/resistive/<int:n>/<field>")
def set_resistive_number_or_select(device_id: str, n: int, field: str):
    """Catch-all for the simpler per-sensor settings."""
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
        return _result_partial(True, f"saved: {value}")
    else:  # select
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
        return _result_partial(True, f"saved: {option}")


# ── Uninstall flow ────────────────────────────────────────────


@bp.post("/uninstall")
def uninstall():
    """Run cleanup.sh, then tell the user to remove the add-on.

    HA Supervisor doesn't run anything when the add-on is uninstalled,
    so cleanup must happen here, while the container is still alive.
    Form must include `confirm=yes` (the UI sends that after a confirm
    prompt) so a stray POST can't trigger destruction.
    """
    if request.form.get("confirm") != "yes":
        return _result_partial(False, "missing confirmation"), 400

    try:
        result = subprocess.run(
            ["bash", "/opt/smartvanio/cleanup.sh"],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return (
            _result_partial(False, "cleanup timed out — check the addon log"),
            500,
        )

    if result.returncode != 0:
        logger.error(
            "cleanup.sh failed (%d): %s", result.returncode, result.stderr.strip()
        )
        return (
            _result_partial(
                False,
                f"cleanup script exited {result.returncode} — check the addon log",
            ),
            500,
        )

    return render_template("partials/uninstall_done.html")
