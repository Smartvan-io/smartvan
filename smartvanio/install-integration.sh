#!/bin/bash

# install-integration.sh



INTEGRATION_URL="https://github.com/Smartvan-io/smartvanio-integration"
INTEGRATION_NAME="smartvanio"
if [ "$IS_HA" = "true" ]; then
  ROOT=""
else
  ROOT="$(pwd)"
fi

echo "ROOT ${ROOT}"

DEST_DIR="${ROOT}/config/custom_components/${INTEGRATION_NAME}"
TMP_DIR=$(mktemp -d)

echo "[INFO] Installing integration '${INTEGRATION_NAME}' from ${INTEGRATION_URL}..."

mkdir -p "$DEST_DIR"

if [ "$1" ]; then
  TAG="$1"
  else
  TAG=$(git ls-remote --tags --sort="v:refname" "$INTEGRATION_URL" \
    | grep -o 'refs/tags/.*' \
    | grep -v '{}' \
    | sed 's|refs/tags/||' \
    | tail -n 1)
fi;

# Clone shallow copy
git clone "$INTEGRATION_URL" "$TMP_DIR" 

rm -rf "$DEST_DIR"
mkdir -p "$DEST_DIR"
mv "$TMP_DIR/custom_components/$INTEGRATION_NAME/"* "$DEST_DIR"

cd "$DEST_DIR" 

git checkout "$TAG"

echo "[INFO] Installed to $DEST_DIR"
echo "[INFO] Installed tag $TAG"
echo "[DEBUG] Listing /config/custom_components:"
ls -la "$DEST_DIR" || echo "[DEBUG] custom_components does not exist"

echo "[TEMP] Listing $TMP_DIR"
ls -ls "$TMP_DIR"

