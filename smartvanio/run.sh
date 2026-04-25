#!/usr/bin/with-contenv bashio
# SmartVan.io Add-on entrypoint.
#
# Two phases per boot:
#   1. Run /opt/smartvanio/provision.sh once (gated by /data/.provisioned-v1).
#      Re-runs if the channel option changed since last run, or if the user
#      sets force_reprovision: true in addon options.
#   2. Hand off to the long-running Flask + flask-sock UI under waitress.

PROVISION_MARKER="/data/.provisioned-v1"
CHANNEL_MARKER="/data/.provisioned-channel"

CHANNEL=$(bashio::config 'channel' 2>/dev/null || echo "stable")
FORCE_REPROVISION=$(bashio::config 'force_reprovision' 2>/dev/null || echo "false")

PREV_CHANNEL=""
if [ -f "$CHANNEL_MARKER" ]; then
    PREV_CHANNEL=$(cat "$CHANNEL_MARKER" 2>/dev/null || echo "")
fi

NEED_PROVISION="false"
if [ ! -f "$PROVISION_MARKER" ]; then
    bashio::log.info "Provisioning marker missing — first-run provisioning."
    NEED_PROVISION="true"
elif [ "$FORCE_REPROVISION" = "true" ]; then
    bashio::log.info "force_reprovision=true — re-running provisioning."
    NEED_PROVISION="true"
elif [ -n "$PREV_CHANNEL" ] && [ "$PREV_CHANNEL" != "$CHANNEL" ]; then
    bashio::log.info "Channel changed (${PREV_CHANNEL} -> ${CHANNEL}) — re-running provisioning."
    NEED_PROVISION="true"
fi

if [ "$NEED_PROVISION" = "true" ]; then
    if ! /opt/smartvanio/provision.sh; then
        bashio::log.error "Provisioning failed. Check the log above. The addon will not start the UI."
        bashio::log.error "Fix the underlying issue, then restart the addon (force_reprovision can be left at default)."
        exit 1
    fi
fi

bashio::log.info "Starting SmartVan.io UI on port 8099..."
exec python3 -m ui
