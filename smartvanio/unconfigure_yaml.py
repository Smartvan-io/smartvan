#!/usr/bin/env python3
"""Inverse of configure_yaml.py: remove SmartVan.io entries.

Removes:
  - lovelace.resources entries pointing at our card bundles
  - lovelace.dashboards.smartvan-io
  - lovelace.mode (only if we set it AND there are no other dashboards
    or resources left after cleanup; otherwise leave whatever the user
    chose alone)

Idempotent: safe to run when entries are already absent.

Usage:
    python3 unconfigure_yaml.py /config/configuration.yaml
"""

import sys

import yaml


# ── Handle HA custom YAML tags (!include, !secret, etc.) ──
class _IncludeTag:
    def __init__(self, tag, value):
        self.tag = tag
        self.value = value


def _ha_tag_constructor(loader, tag_suffix, node):
    return _IncludeTag("!" + tag_suffix, loader.construct_scalar(node))


def _ha_tag_representer(dumper, data):
    return dumper.represent_scalar(data.tag, data.value)


yaml.add_multi_constructor("!", _ha_tag_constructor, Loader=yaml.SafeLoader)
yaml.add_representer(_IncludeTag, _ha_tag_representer, Dumper=yaml.SafeDumper)


SMARTVANIO_RESOURCE_URLS = {
    "/local/smartvanio/smartvan-io-inclinometer.js",
    "/local/smartvanio/smartvan-io-resistive-sensor.js",
    # Older v2.x releases shipped these; remove them too in case the
    # user upgraded through that version.
    "/local/smartvanio/smartvanio-main-card.js",
    "/local/smartvanio/kiosk-mode.js",
}
SMARTVANIO_DASHBOARD_KEY = "smartvan-io"


def unmerge_lovelace(config: dict) -> dict:
    lovelace = config.get("lovelace")
    if not isinstance(lovelace, dict):
        return config

    # Drop our resources, keep everything else.
    resources = lovelace.get("resources")
    if isinstance(resources, list):
        kept = [
            r
            for r in resources
            if not (
                isinstance(r, dict)
                and r.get("url") in SMARTVANIO_RESOURCE_URLS
            )
        ]
        if kept:
            lovelace["resources"] = kept
        else:
            lovelace.pop("resources", None)

    # Drop our dashboard registration.
    dashboards = lovelace.get("dashboards")
    if isinstance(dashboards, dict):
        dashboards.pop(SMARTVANIO_DASHBOARD_KEY, None)
        if not dashboards:
            lovelace.pop("dashboards", None)

    # If lovelace ends up empty, drop the whole key so it reverts to
    # HA's default storage mode for users who never configured anything
    # else there.
    if not lovelace:
        config.pop("lovelace", None)

    return config


def main():
    if len(sys.argv) < 2:
        print("Usage: unconfigure_yaml.py <configuration.yaml>", file=sys.stderr)
        sys.exit(1)

    config_path = sys.argv[1]

    with open(config_path) as f:
        config = yaml.safe_load(f) or {}

    config = unmerge_lovelace(config)

    with open(config_path, "w") as f:
        yaml.safe_dump(config, f, default_flow_style=False, sort_keys=False)


if __name__ == "__main__":
    main()
