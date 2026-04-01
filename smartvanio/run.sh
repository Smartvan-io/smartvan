#!/usr/bin/with-contenv bashio
# SmartVan.io Add-on
# Fetches the integration and cards from GitHub, installs them,
# creates the dashboard, and configures MQTT + SmartVan.io integration.

set -e

# ── GitHub repos ─────────────────────────────────────────────

INTEGRATION_REPO="Smartvan-io/integration"
INTEGRATION_BRANCH="beta"
CARD_REPO="Smartvan-io/smartvanio-main-card"
CARD_BRANCH="beta"

# ── Config ───────────────────────────────────────────────────

MQTT_USER=$(bashio::config 'mqtt_user')
MQTT_PASSWORD=$(bashio::config 'mqtt_password')
MQTT_USER="${MQTT_USER:-smartvanio}"
MQTT_PASSWORD="${MQTT_PASSWORD:-smartvanio123}"

bashio::log.info "============================================="
bashio::log.info "  SmartVan.io Setup"
bashio::log.info "============================================="

# ── Helpers ──────────────────────────────────────────────────

ha_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    if [ -n "$data" ]; then
        curl -s -X "$method" \
            -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "http://supervisor/core/api${endpoint}" 2>/dev/null
    else
        curl -s -X "$method" \
            -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            -H "Content-Type: application/json" \
            "http://supervisor/core/api${endpoint}" 2>/dev/null
    fi
}

wait_for_ha() {
    bashio::log.info "Waiting for Home Assistant API..."
    for i in $(seq 1 60); do
        RESULT=$(ha_api GET "/" 2>/dev/null || echo "")
        if echo "$RESULT" | grep -q "API running"; then
            bashio::log.info "  Home Assistant API is ready"
            return 0
        fi
        sleep 2
    done
    bashio::log.warning "  Home Assistant API not available"
    return 1
}

# ── Step 1: Fetch and install integration ────────────────────

bashio::log.info ""
bashio::log.info "Step 1/5: Installing SmartVan.io integration..."

INTEGRATION_DIR="/config/custom_components/smartvanio"
INTEGRATION_REF="${INTEGRATION_BRANCH}"
bashio::log.info "  Fetching ${INTEGRATION_REPO} @ ${INTEGRATION_REF}..."

TMPDIR=$(mktemp -d)
if curl -sL "https://github.com/${INTEGRATION_REPO}/archive/refs/heads/${INTEGRATION_REF}.tar.gz" \
    -o "$TMPDIR/integration.tar.gz" 2>/dev/null; then

    tar -xzf "$TMPDIR/integration.tar.gz" -C "$TMPDIR" 2>/dev/null

    # Find the custom_components/smartvanio directory in the extracted archive
    SRC=$(find "$TMPDIR" -path "*/custom_components/smartvanio" -type d | head -1)

    if [ -n "$SRC" ] && [ -d "$SRC" ]; then
        mkdir -p "$INTEGRATION_DIR"
        rm -rf "$INTEGRATION_DIR"/*
        cp -r "$SRC"/* "$INTEGRATION_DIR"/
        bashio::log.info "  Installed $(ls "$INTEGRATION_DIR" | wc -l | tr -d ' ') files to ${INTEGRATION_DIR}"
    else
        bashio::log.error "  Could not find custom_components/smartvanio in archive"
        bashio::log.error "  Contents: $(ls -R "$TMPDIR" | head -20)"
    fi
else
    bashio::log.error "  Failed to download integration from GitHub"
fi
rm -rf "$TMPDIR"

# ── Step 2: Fetch and install main card ──────────────────────

bashio::log.info ""
bashio::log.info "Step 2/5: Installing dashboard card..."

CARDS_DIR="/config/www/smartvanio"
CARD_REF="${CARD_BRANCH}"
bashio::log.info "  Fetching ${CARD_REPO} @ ${CARD_REF}..."

mkdir -p "$CARDS_DIR"
TMPDIR=$(mktemp -d)

if curl -sL "https://github.com/${CARD_REPO}/archive/refs/heads/${CARD_REF}.tar.gz" \
    -o "$TMPDIR/card.tar.gz" 2>/dev/null; then

    tar -xzf "$TMPDIR/card.tar.gz" -C "$TMPDIR" 2>/dev/null

    # Find the built index.js (the card bundle)
    CARD_JS=$(find "$TMPDIR" -name "index.js" -path "*/main-card/*" | head -1)
    if [ -z "$CARD_JS" ]; then
        # Might be at the root of the repo
        CARD_JS=$(find "$TMPDIR" -maxdepth 2 -name "index.js" | head -1)
    fi

    if [ -n "$CARD_JS" ] && [ -f "$CARD_JS" ]; then
        cp "$CARD_JS" "$CARDS_DIR/smartvanio-main-card.js"
        bashio::log.info "  Installed smartvanio-main-card.js ($(du -h "$CARDS_DIR/smartvanio-main-card.js" | cut -f1))"
    else
        bashio::log.error "  Could not find index.js in card archive"
        bashio::log.error "  Contents: $(find "$TMPDIR" -name "*.js" | head -10)"
    fi

    # Also grab kiosk-mode.js if present
    KIOSK_JS=$(find "$TMPDIR" -name "kiosk-mode.js" | head -1)
    if [ -n "$KIOSK_JS" ] && [ -f "$KIOSK_JS" ]; then
        cp "$KIOSK_JS" "$CARDS_DIR/kiosk-mode.js"
        bashio::log.info "  Installed kiosk-mode.js"
    fi
else
    bashio::log.error "  Failed to download card from GitHub"
fi
rm -rf "$TMPDIR"

# ── Step 3: Create dashboard YAML ───────────────────────────

bashio::log.info ""
bashio::log.info "Step 3/5: Creating dashboard..."

DASHBOARDS_DIR="/config/dashboards"
mkdir -p "$DASHBOARDS_DIR"

cat > "$DASHBOARDS_DIR/smartvanio.yaml" <<'DASHEOF'
title: SmartVan.io

views:
  - title: Dashboard
    path: default
    type: panel
    cards:
      - type: custom:smartvanio-main-card
DASHEOF
bashio::log.info "  Created dashboards/smartvanio.yaml"

# Ensure configuration.yaml has the dashboard + resource entries
CONFIG_FILE="/config/configuration.yaml"
if [ -f "$CONFIG_FILE" ]; then
    if grep -q "smartvan-io:" "$CONFIG_FILE" 2>/dev/null; then
        bashio::log.info "  Dashboard already registered in configuration.yaml"
    else
        bashio::log.info "  Adding SmartVan.io dashboard to configuration.yaml..."
        cat >> "$CONFIG_FILE" <<'YAMLEOF'

# SmartVan.io — added by setup add-on
lovelace:
  mode: yaml
  resources:
    - url: /local/smartvanio/smartvanio-main-card.js
      type: module
  dashboards:
    smartvan-io:
      mode: yaml
      title: SmartVan.io
      icon: mdi:van-utility
      show_in_sidebar: true
      filename: dashboards/smartvanio.yaml
YAMLEOF
        bashio::log.info "  Added lovelace config"
    fi
fi

# ── Step 4: Check MQTT broker ────────────────────────────────

bashio::log.info ""
bashio::log.info "Step 4/5: Checking MQTT broker..."

MOSQUITTO_SLUG="core_mosquitto"
MQTT_HOST="core-mosquitto"

# Install Mosquitto if not present
if ! bashio::addons.installed "${MOSQUITTO_SLUG}" 2>/dev/null; then
    bashio::log.info "  Mosquitto not installed — installing..."
    curl -s -X POST \
        -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
        -H "Content-Type: application/json" \
        "http://supervisor/addons/${MOSQUITTO_SLUG}/install" >/dev/null 2>&1

    # Wait for install to complete
    for i in $(seq 1 60); do
        if bashio::addons.installed "${MOSQUITTO_SLUG}" 2>/dev/null; then
            bashio::log.info "  Mosquitto installed"
            break
        fi
        sleep 3
    done
fi

# Configure Mosquitto with smartvanio user
bashio::log.info "  Configuring Mosquitto..."
curl -s -X POST \
    -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"logins\":[{\"username\":\"${MQTT_USER}\",\"password\":\"${MQTT_PASSWORD}\"}],\"customize\":{\"active\":false,\"folder\":\"mosquitto\"}}" \
    "http://supervisor/addons/${MOSQUITTO_SLUG}/options" >/dev/null 2>&1

# Start Mosquitto if not running
ADDON_STATE=$(bashio::addons.info "${MOSQUITTO_SLUG}" "state" 2>/dev/null || echo "unknown")
if [ "${ADDON_STATE}" != "started" ]; then
    bashio::log.info "  Starting Mosquitto..."
    curl -s -X POST \
        -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
        "http://supervisor/addons/${MOSQUITTO_SLUG}/start" >/dev/null 2>&1
    sleep 10
fi
bashio::log.info "  Mosquitto is ready"

# ── Step 5: Configure integrations via HA API ────────────────

bashio::log.info ""
bashio::log.info "Step 5/5: Configuring integrations..."

# Restart HA so it picks up the newly installed integration + card files
bashio::log.info "  Restarting Home Assistant to load new components..."
ha_api POST "/services/homeassistant/restart" '{}' >/dev/null 2>&1 || true
sleep 15
wait_for_ha || true

# Register Lovelace resources via API (storage mode fallback)
EXISTING=$(ha_api GET "/config/lovelace/resources" 2>/dev/null || echo "[]")
MAIN_CARD_EXISTS=$(echo "$EXISTING" | jq -r '[.[] | select(.url | contains("smartvanio-main-card"))] | length' 2>/dev/null || echo "0")
if [ "$MAIN_CARD_EXISTS" = "0" ]; then
    ha_api POST "/config/lovelace/resources" \
        '{"res_type":"module","url":"/local/smartvanio/smartvanio-main-card.js"}' >/dev/null 2>&1 || true
    bashio::log.info "  Registered smartvanio-main-card.js resource"
fi

# Configure MQTT integration (must be done before SmartVan.io)
ENTRIES=$(ha_api GET "/config/config_entries/entry" 2>/dev/null || echo "[]")
MQTT_EXISTS=$(echo "$ENTRIES" | jq -r '[.[] | select(.domain == "mqtt")] | length' 2>/dev/null || echo "0")

if [ "$MQTT_EXISTS" = "0" ]; then
    bashio::log.info "  Configuring MQTT integration..."
    FLOW=$(ha_api POST "/config/config_entries/flow" \
        '{"handler":"mqtt","show_advanced_options":false}' 2>/dev/null || echo "")
    FLOW_ID=$(echo "$FLOW" | jq -r '.flow_id // empty' 2>/dev/null)
    if [ -n "$FLOW_ID" ]; then
        RESULT=$(ha_api POST "/config/config_entries/flow/${FLOW_ID}" \
            "{\"broker\":\"${MQTT_HOST}\",\"port\":1883,\"username\":\"${MQTT_USER}\",\"password\":\"${MQTT_PASSWORD}\"}" 2>/dev/null)
        RESULT_TYPE=$(echo "$RESULT" | jq -r '.type // empty' 2>/dev/null)
        if [ "$RESULT_TYPE" = "create_entry" ]; then
            bashio::log.info "  MQTT configured (broker: ${MQTT_HOST})"
        else
            bashio::log.warning "  MQTT config flow: ${RESULT_TYPE} — configure manually"
        fi
    fi
    # Give MQTT time to fully connect
    sleep 5
else
    bashio::log.info "  MQTT already configured"
fi

# Configure SmartVan.io integration
ENTRIES=$(ha_api GET "/config/config_entries/entry" 2>/dev/null || echo "[]")
SV_EXISTS=$(echo "$ENTRIES" | jq -r '[.[] | select(.domain == "smartvanio")] | length' 2>/dev/null || echo "0")

if [ "$SV_EXISTS" = "0" ]; then
    bashio::log.info "  Configuring SmartVan.io integration..."
    FLOW=$(ha_api POST "/config/config_entries/flow" \
        '{"handler":"smartvanio","show_advanced_options":false}' 2>/dev/null || echo "")
    FLOW_ID=$(echo "$FLOW" | jq -r '.flow_id // empty' 2>/dev/null)
    if [ -n "$FLOW_ID" ]; then
        RESULT=$(ha_api POST "/config/config_entries/flow/${FLOW_ID}" \
            '{"mqtt_prefix":"smartvanio"}' 2>/dev/null)
        RESULT_TYPE=$(echo "$RESULT" | jq -r '.type // empty' 2>/dev/null)
        if [ "$RESULT_TYPE" = "create_entry" ]; then
            bashio::log.info "  SmartVan.io integration configured"
        else
            bashio::log.warning "  SmartVan.io config: ${RESULT_TYPE}"
        fi
    fi
else
    bashio::log.info "  SmartVan.io already configured"
fi

# ── Summary ──────────────────────────────────────────────────

bashio::log.info ""
bashio::log.info "============================================="
bashio::log.info "  SmartVan.io setup complete!"
bashio::log.info ""
bashio::log.info "  Installed:"
bashio::log.info "    Integration: /config/custom_components/smartvanio/"
bashio::log.info "    Cards:       /config/www/smartvanio/"
bashio::log.info "    Dashboard:   /config/dashboards/smartvanio.yaml"
bashio::log.info ""
bashio::log.info "  Open the SmartVan.io dashboard from the sidebar."
bashio::log.info "  You can stop this add-on now."
bashio::log.info "============================================="

# Keep container alive for log viewing
while true; do
    sleep 3600
done
