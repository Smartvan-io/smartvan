#!/usr/bin/with-contenv bashio
# SmartVan.io cleanup. Inverse of provision.sh.
#
# Triggered from the addon's "Prepare for uninstall" UI button (HA
# Supervisor doesn't run anything when an add-on is removed, so the
# user has to do this before clicking Uninstall).
#
# Removes everything provision.sh wrote to /config and the
# smartvanio config entry from HA. Deliberately leaves alone:
#   - Mosquitto add-on (user may keep using it)
#   - MQTT integration config entry (same)
#   - /data/* (Supervisor wipes it on actual uninstall)

set -e

bashio::log.info "============================================="
bashio::log.info "  SmartVan.io cleanup"
bashio::log.info "============================================="

if [ -n "${SUPERVISOR_TOKEN:-}" ]; then
    MODE="supervisor"
else
    MODE="standalone"
fi

ha_api() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    if [ "$MODE" != "supervisor" ] || [ -z "${SUPERVISOR_TOKEN:-}" ]; then
        return 1
    fi
    local url="http://supervisor/core/api${endpoint}"
    if [ -n "$data" ]; then
        curl -s -X "$method" \
            -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$url" 2>/dev/null
    else
        curl -s -X "$method" \
            -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            -H "Content-Type: application/json" \
            "$url" 2>/dev/null
    fi
}

# ── Step 1: Remove the smartvanio HA config entry ────────────
#
# Done first so HA stops loading the integration before we yank
# the files out from under it.

if [ "$MODE" = "supervisor" ]; then
    bashio::log.info ""
    bashio::log.info "Step 1/4: Removing SmartVan.io HA config entry..."
    ENTRIES=$(ha_api GET "/config/config_entries/entry" 2>/dev/null || echo "[]")
    SV_ENTRY_IDS=$(echo "$ENTRIES" | jq -r '.[] | select(.domain == "smartvanio") | .entry_id' 2>/dev/null || echo "")
    if [ -z "$SV_ENTRY_IDS" ]; then
        bashio::log.info "  No SmartVan.io config entry to remove"
    else
        for entry_id in $SV_ENTRY_IDS; do
            bashio::log.info "  Removing entry ${entry_id}..."
            ha_api DELETE "/config/config_entries/entry/${entry_id}" >/dev/null 2>&1 || true
        done
    fi

    # Lovelace resources registered via the REST API (storage mode).
    # Best effort — if the user runs YAML mode, this returns an error
    # but unconfigure_yaml.py below handles that path.
    bashio::log.info "  Removing Lovelace resources (if storage mode)..."
    EXISTING=$(ha_api GET "/config/lovelace/resources" 2>/dev/null || echo "[]")
    SVIO_RESOURCE_IDS=$(echo "$EXISTING" | jq -r '.[] | select(.url | contains("/local/smartvanio/")) | .id' 2>/dev/null || echo "")
    for res_id in $SVIO_RESOURCE_IDS; do
        ha_api DELETE "/config/lovelace/resources/${res_id}" >/dev/null 2>&1 || true
    done
else
    bashio::log.info "Step 1/4: Skipping HA API cleanup (standalone mode)"
fi

# ── Step 2: Remove dashboard YAML + integration files + cards ──

bashio::log.info ""
bashio::log.info "Step 2/4: Removing files from /config..."

INTEGRATION_DIR="/config/custom_components/smartvanio"
CARDS_DIR="/config/www/smartvanio"
DASHBOARD_FILE="/config/dashboards/smartvanio.yaml"

if [ -d "$INTEGRATION_DIR" ]; then
    rm -rf "$INTEGRATION_DIR"
    bashio::log.info "  Removed ${INTEGRATION_DIR}"
fi

if [ -d "$CARDS_DIR" ]; then
    rm -rf "$CARDS_DIR"
    bashio::log.info "  Removed ${CARDS_DIR}"
fi

if [ -f "$DASHBOARD_FILE" ]; then
    rm -f "$DASHBOARD_FILE"
    bashio::log.info "  Removed ${DASHBOARD_FILE}"
fi

# Try to clean up the dashboards directory if we left it empty.
# Only if the dir was created by us in the first place — won't fail
# if it doesn't exist or isn't empty.
rmdir /config/dashboards 2>/dev/null && \
    bashio::log.info "  Removed empty /config/dashboards" || true

# ── Step 3: Strip our entries from configuration.yaml ────────

bashio::log.info ""
bashio::log.info "Step 3/4: Removing Lovelace entries from configuration.yaml..."

CONFIG_FILE="/config/configuration.yaml"
if [ -f "$CONFIG_FILE" ]; then
    if python3 /opt/smartvanio/unconfigure_yaml.py "$CONFIG_FILE"; then
        bashio::log.info "  Cleaned ${CONFIG_FILE}"
    else
        bashio::log.warning "  YAML cleanup failed — check ${CONFIG_FILE} manually"
    fi
else
    bashio::log.info "  ${CONFIG_FILE} not found — skipping"
fi

# ── Step 4: Restart HA so the changes take effect ────────────

if [ "$MODE" = "supervisor" ]; then
    bashio::log.info ""
    bashio::log.info "Step 4/4: Restarting Home Assistant..."
    ha_api POST "/services/homeassistant/restart" '{}' >/dev/null 2>&1 || true
    bashio::log.info "  Restart queued"
else
    bashio::log.info ""
    bashio::log.info "Step 4/4: Restart Home Assistant manually to pick up the changes."
fi

bashio::log.info ""
bashio::log.info "============================================="
bashio::log.info "  Cleanup complete."
bashio::log.info "  You can now uninstall the SmartVan.io add-on"
bashio::log.info "  from Settings -> Add-ons."
bashio::log.info "============================================="

exit 0
