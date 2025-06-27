#!/bin/bash

set -e

echo "[INFO] Installing custom Lovelace cards..."

declare -A CARDS=(
  ["smartvanio-inclinometer-card"]="https://raw.githubusercontent.com/Smartvan-io/inclinometer-card/refs/tags/v2.1.5/index.js"
  ["smartvanio-resistive-sensor-card"]="https://raw.githubusercontent.com/Smartvan-io/resistive-sensor-card/refs/tags/v1.0.3/index.js"
)

mkdir -p /config/www/smartvanio

for name in "${!CARDS[@]}"; do
  url="${CARDS[$name]}"
  local_path="/config/www/smartvanio/${name}.js"
  echo "[INFO] Downloading $name..."
  curl -sL "$url" -o "$local_path"

  # Register with Lovelace
  echo "[INFO] Finished downloading $name"
done

echo "[DEBUG] Listing /config/www/smartvanio"
ls -la /config/www/smartvanio
