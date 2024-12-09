#!/usr/bin/with-contenv bashio

# Variables
WWW_PATH="/config/www/smartvanio-cards"
RESOURCE_URL_BASE="/local/smartvanio-cards"

# Create the local card directory if it doesn't exist
mkdir -p "$WWW_PATH"

# Get the Supervisor token
ADDON_TOKEN=$SUPERVISOR_TOKEN

LOVELACE_FILE="/config/.storage/lovelace_resources"

# Define the cards internally
CARDS=(
  '{"url": "https://cdn.jsdelivr.net/gh/Smartvan-io/inclinometer-card@v2.0.0/index.js", "name": "inclinometer"}'
)

# Function to generate a UUID
generate_uuid() {
  # If uuidgen is available
  if command -v uuidgen > /dev/null; then
    uuidgen
  else
    # Generate a UUID manually (fallback)
    cat /proc/sys/kernel/random/uuid
  fi
}


# Process each card
bashio::log.info "Processing custom cards..."
bashio::log.info "$ADDON_TOKEN"

for CARD in "${CARDS[@]}"; do
    CARD_URL=$(echo "$CARD" | jq -r '.url')
    CARD_NAME=$(echo "$CARD" | jq -r '.name')
    CARD_FILE_NAME=$(basename "$CARD_URL")
    CARD_LOCAL_PATH="$WWW_PATH/$CARD_NAME/$CARD_FILE_NAME"
    CARD_LOCAL_DIR="$WWW_PATH/$CARD_NAME"
    RESOURCE_DIR="$RESOURCE_URL_BASE/$CARD_NAME/$CARD_FILE_NAME"
    CARD_UUID=$(generate_uuid) 

    # bashio::log.info "CARD_URL $CARD_URL"
    # bashio::log.info "CARD_NAME $CARD_NAME"
    # bashio::log.info "CARD_FILENAME $CARD_FILE_NAME"
    # bashio::log.info "CARD_LOCAL_PATH $CARD_LOCAL_PATH"
    # bashio::log.info "RESOURCE URL $RESOURCE_DIR"
    # Download the card
    bashio::log.info "Downloading $CARD_NAME from $CARD_URL... to $CARD_LOCAL_PATH"
    mkdir -p "$CARD_LOCAL_DIR"
    curl --output "$CARD_LOCAL_PATH" "$CARD_URL"
    if [ $? -ne 0 ]; then
        bashio::log.error "Failed to download $CARD_NAME from $CARD_URL!"
        continue
    fi

    bashio::log.info "$CARD_NAME downloaded successfully."

    # Add the card as a resource in Home Assistant
    bashio::log.info "Adding $CARD_NAME to Home Assistant resources..."

    # Check if the resource already exists
    if jq -e --arg url "$RESOURCE_DIR" '.data.items[] | select(.url == $url)' "$LOVELACE_FILE" > /dev/null; then
        echo "Resource $RESOURCE_DIR already exists in Lovelace configuration."
    else
        # Add the resource to the file
        jq --arg url "$RESOURCE_DIR" --arg type "module" --arg id "$CARD_UUID" \
        '.data.items += [{"type": $type, "url": $url, "id": $id }]' "$LOVELACE_FILE" > "$LOVELACE_FILE.tmp" && mv "$LOVELACE_FILE.tmp" "$LOVELACE_FILE"

        echo "Resource $RESOURCE_DIR added successfully."
    fi
done

bashio::log.info "All custom cards processed successfully."

curl -s -X POST \
    -H "Authorization: Bearer $ADDON_TOKEN" \
    http://supervisor/core/restart


