# SmartVan.io

One-click setup and calibration for SmartVan.io campervan sensor modules.

## What it does

On first start the add-on:

1. Installs the **Mosquitto MQTT broker** (so your devices have somewhere to connect).
2. Installs the **SmartVan.io HA integration** (it's the bit that turns each device's MQTT messages into Home Assistant entities).
3. Downloads the **two sensor cards** for your dashboards (`smartvan-io-inclinometer` and `smartvan-io-resistive-sensor`).
4. Registers a default **SmartVan.io dashboard** showing those cards.
5. Configures the MQTT and SmartVan.io integrations.

After that, the add-on stays running as a small web UI you open from the **SmartVan.io** entry in the Home Assistant sidebar. That UI is where you calibrate every device.

## Quick start

1. Install and **Start** the add-on.
2. Wait for the log to say "SmartVan.io setup complete!" (≈30 s on a Pi). HA restarts itself once.
3. Click **SmartVan.io** in the sidebar. The page lists every discovered device.
4. Power on a SmartVan.io device. It appears in the list within 30 seconds of joining your WiFi.
5. Click the device. You get a calibration page tailored to its model:
   - **Inclinometer**: live pitch and roll, orientation picker, pitch/roll compensation, calibrate-from-current and reset buttons.
   - **Resistive sensor**: per-channel raw voltage, interpolation points editor, interpolation method, min/max resistance, open-circuit threshold.
6. Open the **SmartVan.io dashboard** (sidebar). Edit each card → pick the calibrated device → optionally pick a different visual style.

## Visual style variants

The cards each ship a few styles you can pick in the card editor:

- **Inclinometer**: `classic` (current bar indicator), `minimal` (large digits), `horizon` (aircraft-style attitude indicator).
- **Resistive sensor**: `tile` (number with raw voltage caption), `gauge` (analog half-disc), `bar` (horizontal fill).

Switching styles is non-destructive. Existing dashboards default to the original look (`classic` / `tile`).

## Add-on options

| Option | Default | Notes |
|---|---|---|
| `mqtt_user` | `smartvanio` | Username Mosquitto creates for your devices to log in with. |
| `mqtt_password` | `smartvanio123` | Change for any production deployment. |
| `channel` | `stable` | Which integration / cards branch to track. Switch to `beta` to get pre-release builds. |
| `force_reprovision` | `false` | Set to `true`, restart, to re-run the one-shot installer (Mosquitto, integration, cards, dashboard). Useful after a botched install. Set back to `false` when done. |

If you change `channel`, the add-on automatically re-runs provisioning on next start.

## Calibration flow (resistive sensor)

For each tank/level sensor:

1. **Add a few interpolation points** in the calibration page. Each point maps a measured voltage to an output value (typically %). Add at least two — one for "empty" and one for "full". More points give a smoother curve.
2. Choose an **interpolation method** — `linear` is fine for most tanks.
3. Optionally tune **min / max resistance** if you know the sender's range, and **open-circuit threshold** if your sender is producing false positives when nothing is connected.
4. Save. The values are written to the device immediately and the live raw voltage / interpolated value updates over the WebSocket as you move liquid in the tank.

## Calibration flow (inclinometer)

1. Pick the **orientation** — which face of the board is mounted up.
2. Park on a known-level surface, hit **Calibrate from current position** for both pitch and roll.
3. Optionally adjust the manual **compensation** values. Reset returns to zero offset.

## Cards via HACS — pick one

The two sensor cards are also published on HACS for users who don't run the add-on. **If you use the add-on, don't also install the cards via HACS** — you'd end up with two registrations of the same card with different versions.

## Troubleshooting

- **The page is blank inside the SmartVan.io sidebar entry.** Check the add-on log for waitress errors. A common cause is the integration not being installed yet — restart Home Assistant once.
- **No devices appear.** Check the Mosquitto add-on is running (Settings → Add-ons → Mosquitto broker → Start). Verify your device has WiFi credentials by checking ESPHome logs over USB.
- **A calibration save shows "the device didn't acknowledge".** The device received the service call but its entity didn't update within 5 s — usually because the device is offline. Check its MQTT availability in Settings → Devices.
- **I want to start over.** Set `force_reprovision: true`, restart the add-on. After it logs success, set `force_reprovision: false`.
