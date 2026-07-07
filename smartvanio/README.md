# SmartVan.io

One-click setup and device calibration for the SmartVan.io campervan control system.

Add the repository, install, and click **Start** — the add-on provisions everything you
need, then gives you a calibration UI in the Home Assistant sidebar.

[![Open your Home Assistant instance and show the add add-on repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https://github.com/Smartvan-io/smartvan)

## What it sets up

On first start the add-on automatically:

1. Installs the **Mosquitto MQTT broker** — where your devices connect.
2. Installs the **SmartVan.io Home Assistant integration** — turns each device's MQTT
   messages into Home Assistant entities.
3. Downloads the **SmartVan.io dashboard cards** (inclinometer and resistive sensor).
4. Registers a default **SmartVan.io dashboard** showing those cards.
5. Configures the MQTT and SmartVan.io integrations.

It then stays running as a small web UI — open **SmartVan.io** in the sidebar to calibrate
each device (live pitch/roll for inclinometers, voltage-to-level interpolation for tank
sensors).

> **Using the add-on? You don't need HACS.** The add-on installs *and updates* the
> integration and cards for you. Don't also install the cards via HACS, or you'll end up
> with two registrations of the same card at different versions.

See **DOCS.md** for the full guide — calibration flows, visual styles, add-on options, and
clean uninstall.
