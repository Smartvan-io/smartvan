#!/usr/bin/env bashio

bashio::log.level "info"

BASE_PATH=$(bashio::addon.ingress_entry)

HA_HOSTNAME=$(bashio::config 'ha_host')
HA_PORT=$(bashio::config 'ha_port')
HA_HOST="${HA_HOSTNAME}:${HA_PORT}"
IS_HA="true"

export BASE_PATH
export HA_HOST
export IS_HA

/install-cards.sh

echo "Using base path: $BASE_PATH"
echo "Using host: $HA_HOST"

bashio::log.info "  Name: ${BASE_PATH}"
bashio::log.info "  Name: ${HA_HOST}"

npm run build

cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
cp server.js .next/standalone/server.js

cd .next/standalone

exec node server.js