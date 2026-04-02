#!/usr/bin/with-contenv bashio
# SmartVan.io Add-on
# Fetches the integration and cards from GitHub, installs them,
# creates the dashboard, and configures MQTT + SmartVan.io integration.

# Catch signals so we can see if the container is being killed
trap 'bashio::log.warning "Received SIGTERM — shutting down"; exit 0' SIGTERM
trap 'bashio::log.warning "Received SIGINT — shutting down"; exit 0' SIGINT

# ── GitHub repos ─────────────────────────────────────────────

INTEGRATION_REPO="Smartvan-io/integration"
INTEGRATION_BRANCH="beta"
CARD_REPO="Smartvan-io/smartvanio-main-card"
CARD_BRANCH="beta"

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
    for i in $(seq 1 30); do
        RESULT=$(curl -s -m 5 \
            -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            "http://supervisor/core/api/" 2>/dev/null || echo "")
        bashio::log.debug "  HA check ${i}: ${RESULT:0:80}"
        if echo "$RESULT" | grep -q "API running"; then
            bashio::log.info "  Home Assistant API is ready"
            return 0
        fi
        sleep 2
    done
    bashio::log.warning "  Home Assistant API not available after 60s"
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

# ── Step 4: Ensure MQTT broker is available ─────────────────

bashio::log.info ""
bashio::log.info "Step 4/5: Checking MQTT broker..."

# Make sure HA API is reachable before querying config entries
wait_for_ha || bashio::log.warning "  HA API not available, continuing anyway..."

MOSQUITTO_SLUG="core_mosquitto"

supervisor_api() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    if [ -n "$data" ]; then
        curl -s -X "$method" \
            -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "http://supervisor${endpoint}" 2>/dev/null || echo "{}"
    else
        curl -s -X "$method" \
            -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            -H "Content-Type: application/json" \
            "http://supervisor${endpoint}" 2>/dev/null || echo "{}"
    fi
}

# Check if MQTT integration is already configured
bashio::log.info "  Checking existing MQTT configuration..."
ENTRIES=$(ha_api GET "/config/config_entries/entry" 2>/dev/null || echo "[]")
MQTT_EXISTS=$(echo "$ENTRIES" | jq -r '[.[] | select(.domain == "mqtt")] | length' 2>/dev/null || echo "0")
bashio::log.info "  MQTT entries found: ${MQTT_EXISTS}"

if [ "$MQTT_EXISTS" != "0" ]; then
    bashio::log.info "  MQTT already configured — using existing broker"
else
    # No MQTT configured — check if Mosquitto add-on is installed
    MOSQ_INFO=$(supervisor_api GET "/addons/${MOSQUITTO_SLUG}/info" 2>/dev/null)
    MOSQ_STATE=$(echo "$MOSQ_INFO" | jq -r '.data.state // empty' 2>/dev/null)

    if [ -z "$MOSQ_STATE" ]; then
        # Mosquitto not installed — install it
        bashio::log.info "  No MQTT broker found — installing Mosquitto..."
        INSTALL_RESULT=$(supervisor_api POST "/addons/${MOSQUITTO_SLUG}/install")
        bashio::log.info "  Install: $(echo "$INSTALL_RESULT" | jq -r '.result // "unknown"')"

        # Wait for install to complete
        for i in $(seq 1 90); do
            MOSQ_INFO=$(supervisor_api GET "/addons/${MOSQUITTO_SLUG}/info" 2>/dev/null)
            MOSQ_STATE=$(echo "$MOSQ_INFO" | jq -r '.data.state // empty' 2>/dev/null)
            if [ -n "$MOSQ_STATE" ]; then
                bashio::log.info "  Mosquitto installed"
                break
            fi
            sleep 2
        done
    else
        bashio::log.info "  Mosquitto already installed (state: ${MOSQ_STATE})"
    fi

    # Start Mosquitto if not running
    MOSQ_INFO=$(supervisor_api GET "/addons/${MOSQUITTO_SLUG}/info" 2>/dev/null)
    MOSQ_STATE=$(echo "$MOSQ_INFO" | jq -r '.data.state // empty' 2>/dev/null)
    if [ "$MOSQ_STATE" != "started" ]; then
        bashio::log.info "  Starting Mosquitto..."
        supervisor_api POST "/addons/${MOSQUITTO_SLUG}/start" >/dev/null 2>&1
        sleep 10
    fi
    bashio::log.info "  Mosquitto is ready"
fi

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

# Configure MQTT integration if not already set up
ENTRIES=$(ha_api GET "/config/config_entries/entry" 2>/dev/null || echo "[]")
MQTT_EXISTS=$(echo "$ENTRIES" | jq -r '[.[] | select(.domain == "mqtt")] | length' 2>/dev/null || echo "0")

if [ "$MQTT_EXISTS" = "0" ]; then
    bashio::log.info "  Configuring MQTT integration..."
    FLOW=$(ha_api POST "/config/config_entries/flow" \
        '{"handler":"mqtt","show_advanced_options":false}' 2>/dev/null || echo "")

    # Check if flow offers addon mode (Mosquitto detected) or needs manual broker config
    STEP_ID=$(echo "$FLOW" | jq -r '.step_id // empty' 2>/dev/null)
    FLOW_ID=$(echo "$FLOW" | jq -r '.flow_id // empty' 2>/dev/null)

    if [ -n "$FLOW_ID" ]; then
        if [ "$STEP_ID" = "user" ] && echo "$FLOW" | jq -e '.menu_options' >/dev/null 2>&1; then
            # Menu with addon option — select it (auto-configures from Mosquitto add-on)
            bashio::log.info "  Using Mosquitto add-on for MQTT (auto-configured)"
            RESULT=$(ha_api POST "/config/config_entries/flow/${FLOW_ID}" \
                '{"next_step_id":"addon"}' 2>/dev/null)
        else
            # No menu — provide broker details manually
            RESULT=$(ha_api POST "/config/config_entries/flow/${FLOW_ID}" \
                '{"broker":"core-mosquitto","port":1883}' 2>/dev/null)
        fi
        RESULT_TYPE=$(echo "$RESULT" | jq -r '.type // empty' 2>/dev/null)
        if [ "$RESULT_TYPE" = "create_entry" ]; then
            bashio::log.info "  MQTT configured"
        else
            bashio::log.warning "  MQTT config flow result: ${RESULT_TYPE}"
            bashio::log.warning "  $(echo "$RESULT" | jq -c '.errors // empty' 2>/dev/null)"
        fi
        sleep 5
    fi
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
