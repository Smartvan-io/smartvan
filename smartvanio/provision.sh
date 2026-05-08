#!/usr/bin/with-contenv bashio
# SmartVan.io Setup App
# Provisions the full SmartVan.io stack into Home Assistant:
#   - Mosquitto MQTT broker
#   - SmartVan.io integration (from GitHub)
#   - Dashboard cards (from GitHub)
#   - Lovelace dashboard + kiosk mode
#   - MQTT + SmartVan.io config entries
#
# The bashio shebang loads s6 env vars (SUPERVISOR_TOKEN) and the
# bashio library automatically. No need to source bashio manually.

# ── Detect environment ───────────────────────────────────────

if [ -n "${SUPERVISOR_TOKEN:-}" ]; then
    MODE="supervisor"
else
    MODE="standalone"
fi

bashio::log.info "============================================="
bashio::log.info "  SmartVan.io Setup (mode: ${MODE})"
bashio::log.info "============================================="

MQTT_USER=$(bashio::config 'mqtt_user' 2>/dev/null || echo "")
MQTT_PASSWORD=$(bashio::config 'mqtt_password' 2>/dev/null || echo "")
MQTT_USER="${MQTT_USER:-smartvanio}"
MQTT_PASSWORD="${MQTT_PASSWORD:-smartvanio123}"

INTEGRATION_REPO="https://github.com/Smartvan-io/integration.git"
CHANNEL=$(bashio::config 'channel' 2>/dev/null || echo "stable")

# TEMP for v1 testing — until we cut v2 release tags and merge to
# main on each repo:
#   - integration v2 (MQTT-only) lives on `beta`. main is still the
#     old v1.0.6 ESPHome-API version that errors with
#     "Requirements for smartvanio not found: ['aioesphomeapi==29.0.0']".
#   - cards v2 (display-only + variants) lives on
#     `feature-v1-public-release`. main is still v1.x with the
#     in-card config UI we replaced.
# Both channels temporarily point at the working branches.
if [ "$CHANNEL" = "beta" ]; then
    INTEGRATION_BRANCH="beta"
    CARD_BRANCH="beta"
else
    INTEGRATION_BRANCH="beta"
    CARD_BRANCH="feature-v1-public-release"
fi

# Each sensor card lives in its own repo under the Smartvan-io org.
# Note: card repos are NOT under the `smartvanio-` prefix that the
# integration repo uses.
INCLINOMETER_CARD_URL="https://raw.githubusercontent.com/Smartvan-io/inclinometer-card/refs/heads/${CARD_BRANCH}"
RESISTIVE_CARD_URL="https://raw.githubusercontent.com/Smartvan-io/resistive-sensor-card/refs/heads/${CARD_BRANCH}"

bashio::log.info "  Channel: ${CHANNEL} (integration=${INTEGRATION_BRANCH}, cards=${CARD_BRANCH})"

# ── Helpers ──────────────────────────────────────────────────

ha_api() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"

    if [ "$MODE" = "supervisor" ]; then
        local url="http://supervisor/core/api${endpoint}"
        local token="${SUPERVISOR_TOKEN:-}"
    else
        local url="${HA_URL:-http://homeassistant:8123}/api${endpoint}"
        local token="${HA_TOKEN:-}"
    fi

    if [ -z "$token" ]; then
        return 1
    fi

    if [ -n "$data" ]; then
        curl -s -X "$method" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$url" 2>/dev/null
    else
        curl -s -X "$method" \
            -H "Authorization: Bearer ${token}" \
            -H "Content-Type: application/json" \
            "$url" 2>/dev/null
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
    bashio::log.warning "  Home Assistant API not available after 120s"
    return 1
}

# ── Step 1: Provision Mosquitto ──────────────────────────────

bashio::log.info ""
bashio::log.info "Step 1/5: Provisioning MQTT broker..."

if [ "$MODE" = "supervisor" ]; then
    MOSQUITTO_SLUG="core_mosquitto"

    # Use direct Supervisor API — bashio wrappers unreliable from inside addon containers
    mosquitto_api() {
        curl -s -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            "http://supervisor/addons/${MOSQUITTO_SLUG}/${1}" 2>/dev/null
    }

    mosquitto_api_post() {
        curl -s -X POST -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            "http://supervisor/addons/${MOSQUITTO_SLUG}/${1}" 2>/dev/null
    }

    # Check if installed — .data.version is non-null when installed
    # (.data.state returns "unknown" for both uninstalled AND installed-but-stopped)
    MOSQ_INFO=$(mosquitto_api "info")
    MOSQ_VER=$(echo "$MOSQ_INFO" | jq -r '.data.version // empty' 2>/dev/null)
    MOSQ_STATE=$(echo "$MOSQ_INFO" | jq -r '.data.state // empty' 2>/dev/null)

    if [ -n "$MOSQ_VER" ]; then
        bashio::log.info "  Mosquitto app already installed (v${MOSQ_VER}, state: ${MOSQ_STATE})"
    else
        bashio::log.info "  Installing Mosquitto app..."
        INSTALL_RESULT=$(curl -s -X POST -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
            "http://supervisor/store/addons/${MOSQUITTO_SLUG}/install" 2>/dev/null)
        INSTALL_STATUS=$(echo "$INSTALL_RESULT" | jq -r '.result // "unknown"' 2>/dev/null)
        bashio::log.info "  Install result: ${INSTALL_STATUS}"
        # Wait for install to complete
        for i in $(seq 1 24); do
            sleep 5
            MOSQ_VER=$(mosquitto_api "info" | jq -r '.data.version // empty' 2>/dev/null)
            if [ -n "$MOSQ_VER" ]; then
                bashio::log.info "  Mosquitto v${MOSQ_VER} installed"
                break
            fi
            bashio::log.info "  Waiting for Mosquitto install... (attempt ${i})"
        done
    fi

    # Ensure it's running
    MOSQ_STATE=$(mosquitto_api "info" | jq -r '.data.state // empty' 2>/dev/null)
    if [ "$MOSQ_STATE" != "started" ]; then
        bashio::log.info "  Starting Mosquitto..."
        mosquitto_api_post "start" >/dev/null
        for attempt in $(seq 1 15); do
            sleep 5
            MOSQ_STATE=$(mosquitto_api "info" | jq -r '.data.state // empty' 2>/dev/null)
            if [ "$MOSQ_STATE" = "started" ]; then
                break
            fi
            bashio::log.info "  Waiting for Mosquitto... (${MOSQ_STATE:-pending})"
        done
    fi

    if [ "$MOSQ_STATE" = "started" ]; then
        bashio::log.info "  Mosquitto is running"
    else
        bashio::log.warning "  Mosquitto state: ${MOSQ_STATE:-unknown} — MQTT may need manual setup"
    fi
    MQTT_HOST="core-mosquitto"
else
    bashio::log.info "  Skipping Mosquitto install (standalone mode)"
    MQTT_HOST="localhost"
fi

# ── Step 2: Install integration from GitHub ──────────────────

bashio::log.info ""
bashio::log.info "Step 2/5: Installing SmartVan.io integration..."

INTEGRATION_DIR="/config/custom_components/smartvanio"
TMP_DIR=$(mktemp -d)

bashio::log.info "  Cloning ${INTEGRATION_BRANCH} branch..."
if git clone --depth 1 --branch "$INTEGRATION_BRANCH" "$INTEGRATION_REPO" "$TMP_DIR" 2>/dev/null; then
    INTEGRATION_SHA=$(git -C "$TMP_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")
    INTEGRATION_VERSION=$(jq -r .version "$TMP_DIR/custom_components/smartvanio/manifest.json" 2>/dev/null || echo "unknown")
    rm -rf "$INTEGRATION_DIR"
    mkdir -p "$INTEGRATION_DIR"
    cp -r "$TMP_DIR/custom_components/smartvanio/"* "$INTEGRATION_DIR"/
    rm -rf "$TMP_DIR"
    bashio::log.info "  Installed to ${INTEGRATION_DIR}"
    bashio::log.info "  Version: ${INTEGRATION_VERSION} (sha ${INTEGRATION_SHA})"
    bashio::log.info "  ($(ls "$INTEGRATION_DIR" | wc -l | tr -d ' ') files)"
else
    rm -rf "$TMP_DIR"
    bashio::log.error "  Failed to clone integration from GitHub"
    bashio::log.error "  Check network connectivity and try again"
    exit 1
fi

# ── Step 3: Install dashboard cards from GitHub ──────────────

bashio::log.info ""
bashio::log.info "Step 3/5: Installing dashboard cards..."

CARDS_DIR="/config/www/smartvanio"
mkdir -p "$CARDS_DIR"

# Reusable card downloader. Args:
#   $1 = base URL (raw.githubusercontent.com root for the branch/tag)
#   $2 = output filename (must match SMARTVANIO_RESOURCES in configure_yaml.py
#        and the dashboard yaml's `type: custom:<filename-without-.js>`)
#   $3 = friendly name for log lines
download_card() {
    local base="$1"
    local out="$2"
    local label="$3"
    bashio::log.info "  Downloading ${out}..."
    if ! curl -sfL "${base}/index.js" -o "${CARDS_DIR}/${out}"; then
        bashio::log.error "  Failed to download ${label}"
        return 1
    fi
    local size
    size=$(wc -c < "${CARDS_DIR}/${out}" | tr -d ' ')
    if [ "$size" -lt 1000 ]; then
        bashio::log.error "  ${out} download looks too small (${size} bytes)"
        return 1
    fi
    bashio::log.info "  ${out} (${size} bytes)"
    # Per-card version marker for the future update entity. Fail open
    # — a missing package.json shouldn't break the install.
    local ver
    ver=$(curl -sfL "${base}/package.json" 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('version',''))" 2>/dev/null \
        || echo "")
    if [ -n "$ver" ]; then
        echo "$ver" > "${CARDS_DIR}/.${out%.js}.version"
        bashio::log.info "  ${label} version: ${ver}"
    fi
}

download_card "$INCLINOMETER_CARD_URL" "smartvan-io-inclinometer.js" "Inclinometer card"
download_card "$RESISTIVE_CARD_URL"     "smartvan-io-resistive-sensor.js" "Resistive-sensor card"

# ── Step 4: Install dashboard + configure lovelace ───────────

bashio::log.info ""
bashio::log.info "Step 4/5: Installing dashboard..."

# Copy dashboard YAML
DASHBOARDS_DIR="/config/dashboards"
SRC_DASHBOARDS="/opt/smartvanio/dashboards"

mkdir -p "$DASHBOARDS_DIR"

if [ -f "$SRC_DASHBOARDS/smartvanio.yaml" ]; then
    cp "$SRC_DASHBOARDS/smartvanio.yaml" "$DASHBOARDS_DIR/smartvanio.yaml"
    bashio::log.info "  Installed dashboards/smartvanio.yaml"
else
    bashio::log.warning "  Dashboard YAML not found — skipping"
fi

# Safely merge lovelace config into configuration.yaml
CONFIG_FILE="/config/configuration.yaml"
if [ -f "$CONFIG_FILE" ]; then
    if python3 /opt/smartvanio/configure_yaml.py "$CONFIG_FILE" 2>/dev/null; then
        bashio::log.info "  Lovelace config merged into configuration.yaml"
    else
        bashio::log.warning "  Python YAML merge failed — trying fallback append"
        # Fallback: append only if our dashboard isn't already registered
        if ! grep -q "smartvan-io:" "$CONFIG_FILE" 2>/dev/null; then
            cat >> "$CONFIG_FILE" <<'YAMLEOF'

# SmartVan.io — added by setup app
lovelace:
  mode: yaml
  resources:
    - url: /local/smartvanio/kiosk-mode.js
      type: module
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
            bashio::log.info "  Added lovelace config (fallback append)"
        else
            bashio::log.info "  Dashboard already registered in configuration.yaml"
        fi
    fi
else
    bashio::log.warning "  configuration.yaml not found at ${CONFIG_FILE}"
fi

# ── Step 5: Configure integrations (Supervisor mode only) ────

bashio::log.info ""
bashio::log.info "Step 5/5: Configuring integrations..."

if [ "$MODE" = "supervisor" ]; then
    # Best-effort throughout Step 5: HA may still be coming up; do
    # not fail provisioning over a missed config entry registration —
    # the addon UI can still run and the user can finish manually.
    set +e

    if wait_for_ha; then
        # Register Lovelace resources via API (for storage mode users
        # — YAML-mode users get them via configure_yaml.py in Step 4).
        EXISTING=$(ha_api GET "/config/lovelace/resources" 2>/dev/null || echo "[]")

        for card_path in "smartvan-io-inclinometer.js" "smartvan-io-resistive-sensor.js"; do
            already=$(echo "$EXISTING" | jq -r --arg p "$card_path" '[.[] | select(.url | contains($p))] | length' 2>/dev/null || echo "0")
            if [ "$already" = "0" ]; then
                ha_api POST "/config/lovelace/resources" \
                    "{\"res_type\":\"module\",\"url\":\"/local/smartvanio/${card_path}\"}" >/dev/null 2>&1 || true
                bashio::log.info "  Registered ${card_path} resource"
            fi
        done

        # Configure MQTT integration
        ENTRIES=$(ha_api GET "/config/config_entries/entry" 2>/dev/null || echo "[]")
        MQTT_EXISTS=$(echo "$ENTRIES" | jq -r '[.[] | select(.domain == "mqtt")] | length' 2>/dev/null || echo "0")

        if [ "$MQTT_EXISTS" = "0" ]; then
            FLOW=$(ha_api POST "/config/config_entries/flow" \
                '{"handler":"mqtt","show_advanced_options":false}' 2>/dev/null || echo "")
            FLOW_ID=$(echo "$FLOW" | jq -r '.flow_id // empty' 2>/dev/null)
            FLOW_TYPE=$(echo "$FLOW" | jq -r '.type // empty' 2>/dev/null)
            if [ -n "$FLOW_ID" ]; then
                if [ "$FLOW_TYPE" = "menu" ]; then
                    # Mosquitto is installed — select the addon option for auto-config
                    RESULT=$(ha_api POST "/config/config_entries/flow/${FLOW_ID}" \
                        '{"next_step_id":"addon"}' 2>/dev/null)
                elif [ "$FLOW_TYPE" = "progress" ]; then
                    # HA is auto-discovering Mosquitto — wait for it
                    bashio::log.info "  Waiting for Mosquitto auto-discovery..."
                    RESULT=""
                    for i in $(seq 1 12); do
                        sleep 5
                        RESULT=$(ha_api GET "/config/config_entries/flow/${FLOW_ID}" 2>/dev/null || echo "")
                        RESULT_TYPE=$(echo "$RESULT" | jq -r '.type // empty' 2>/dev/null)
                        if [ "$RESULT_TYPE" = "create_entry" ] || [ "$RESULT_TYPE" = "form" ]; then
                            break
                        fi
                    done
                    # If it became a form, submit it
                    if [ "$RESULT_TYPE" = "form" ]; then
                        RESULT=$(ha_api POST "/config/config_entries/flow/${FLOW_ID}" \
                            '{}' 2>/dev/null)
                    fi
                else
                    # No Mosquitto — configure broker manually
                    RESULT=$(ha_api POST "/config/config_entries/flow/${FLOW_ID}" \
                        "{\"broker\":\"${MQTT_HOST}\",\"port\":1883,\"username\":\"${MQTT_USER}\",\"password\":\"${MQTT_PASSWORD}\"}" 2>/dev/null)
                fi
                RESULT_TYPE=$(echo "$RESULT" | jq -r '.type // empty' 2>/dev/null)
                if [ "$RESULT_TYPE" = "create_entry" ]; then
                    bashio::log.info "  MQTT configured"
                else
                    # Check if MQTT got auto-configured while we were waiting
                    ENTRIES=$(ha_api GET "/config/config_entries/entry" 2>/dev/null || echo "[]")
                    MQTT_NOW=$(echo "$ENTRIES" | jq -r '[.[] | select(.domain == "mqtt")] | length' 2>/dev/null || echo "0")
                    if [ "$MQTT_NOW" != "0" ]; then
                        bashio::log.info "  MQTT configured (auto-discovered)"
                    else
                        bashio::log.warning "  MQTT config flow: ${RESULT_TYPE} — configure manually"
                    fi
                fi
            fi
        else
            bashio::log.info "  MQTT already configured"
        fi

        # Configure SmartVan.io integration
        ENTRIES=$(ha_api GET "/config/config_entries/entry" 2>/dev/null || echo "[]")
        SV_HUB_EXISTS=$(echo "$ENTRIES" | jq -r '[.[] | select(.domain == "smartvanio" and .source == "user")] | length' 2>/dev/null || echo "0")
        SV_LEGACY_IDS=$(echo "$ENTRIES" | jq -r '.[] | select(.domain == "smartvanio" and .source != "user") | .entry_id' 2>/dev/null)

        # v1.0.6 created per-device entries via zeroconf (source != "user").
        # v2.x uses one hub entry created via the user flow. If we find any
        # legacy entries, remove them before bootstrapping the hub — leaving
        # them in place blocks v2's setup_entry from running cleanly and the
        # integration update entity (and others) never appear.
        if [ -n "$SV_LEGACY_IDS" ]; then
            bashio::log.info "  Removing v1 legacy smartvanio config entries..."
            for legacy_id in $SV_LEGACY_IDS; do
                ha_api DELETE "/config/config_entries/entry/${legacy_id}" >/dev/null 2>&1 || true
                bashio::log.info "    removed ${legacy_id}"
            done
        fi

        if [ "$SV_HUB_EXISTS" != "0" ]; then
            bashio::log.info "  SmartVan.io hub already configured"
        else
            # The integration files were just cloned into custom_components/ in Step 2,
            # but HA only scans custom_components/ at startup. Restart HA so the
            # smartvanio flow handler is registered before we create the config entry.
            bashio::log.info "  Restarting HA to load the freshly installed integration..."
            ha_api POST "/services/homeassistant/restart" '{}' >/dev/null 2>&1 || true
            sleep 30
            if ! wait_for_ha; then
                bashio::log.error "  HA restart timed out — re-run this app once HA is back up"
                exit 1
            fi

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
                    bashio::log.warning "  Restart HA, then re-run this app"
                fi
            else
                bashio::log.error "  Could not create SmartVan.io config flow"
                bashio::log.error "  Restart HA, then re-run this app"
            fi
        fi
    fi

    # Restore strict-mode for the marker writes below.
    set -e
else
    bashio::log.info "  Skipping API configuration (standalone mode)"
    bashio::log.info "  Restart HA to load the integration, then configure via UI:"
    bashio::log.info "    1. Settings -> Devices & Services -> Add Integration -> MQTT"
    bashio::log.info "    2. Settings -> Devices & Services -> Add Integration -> SmartVan.io"
fi

# ── Summary ──────────────────────────────────────────────────

# ── Persist provisioning markers ─────────────────────────────
# Tells run.sh on subsequent boots to skip provisioning. Versioning
# the marker (-v1) lets a future rev re-run unconditionally by bumping
# the suffix. Channel marker triggers re-provisioning on stable<->beta.

mkdir -p /data
echo "1" > /data/.provisioned-v1
CHANNEL=$(bashio::config 'channel' 2>/dev/null || echo "stable")
echo "${CHANNEL}" > /data/.provisioned-channel

bashio::log.info ""
bashio::log.info "============================================="
bashio::log.info "  SmartVan.io setup complete!"
bashio::log.info ""
bashio::log.info "  Installed:"
bashio::log.info "    Integration: /config/custom_components/smartvanio/"
bashio::log.info "    Cards:       /config/www/smartvanio/"
bashio::log.info "    Dashboard:   /config/dashboards/smartvanio.yaml"
bashio::log.info "    Channel:     ${CHANNEL}"
bashio::log.info ""
if [ "$MODE" = "standalone" ]; then
    bashio::log.info "  Restart HA to pick up the changes."
fi
bashio::log.info "============================================="

exit 0
