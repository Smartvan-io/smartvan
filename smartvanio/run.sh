#!/usr/bin/with-contenv bashio
# SmartVan.io Add-on entrypoint.
#
# Two phases per boot:
#   1. Run /opt/smartvanio/provision.sh on first boot, when the addon
#      ships with a newer INTEGRATION_TAG / CARD_TAG than was last
#      provisioned, or when the user sets force_reprovision: true.
#      Updating the addon container is the ONLY supported path for
#      shipping a new integration / cards version — the addon pins
#      both tags in provision.sh.
#   2. Hand off to the long-running Flask + flask-sock UI under waitress.

PROVISION_MARKER="/data/.provisioned-tags"

# Match what provision.sh pins. Keep these two `grep` lines exactly in
# sync with the equivalent assignments in provision.sh — they're the
# pinned versions the addon ships against, and run.sh uses them to
# decide whether the persistent /config install is stale vs the bundled
# tags. (Single source of truth lives in provision.sh; we read it back
# here rather than duplicate.)
INTEGRATION_TAG=$(grep -E '^INTEGRATION_TAG=' /opt/smartvanio/provision.sh | head -1 | cut -d'"' -f2)
CARD_TAG=$(grep -E '^CARD_TAG=' /opt/smartvanio/provision.sh | head -1 | cut -d'"' -f2)
BUNDLED_TAGS="${INTEGRATION_TAG}|${CARD_TAG}"

FORCE_REPROVISION=$(bashio::config 'force_reprovision' 2>/dev/null || echo "false")

PROVISIONED_TAGS=""
if [ -f "$PROVISION_MARKER" ]; then
    PROVISIONED_TAGS=$(cat "$PROVISION_MARKER" 2>/dev/null || echo "")
fi

NEED_PROVISION="false"
if [ -z "$PROVISIONED_TAGS" ]; then
    bashio::log.info "No provisioning marker — first-run provisioning."
    NEED_PROVISION="true"
elif [ "$PROVISIONED_TAGS" != "$BUNDLED_TAGS" ]; then
    bashio::log.info "Bundled tags differ from last provision (${PROVISIONED_TAGS} -> ${BUNDLED_TAGS}) — re-provisioning."
    NEED_PROVISION="true"
elif [ "$FORCE_REPROVISION" = "true" ]; then
    bashio::log.info "force_reprovision=true — re-running provisioning."
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
