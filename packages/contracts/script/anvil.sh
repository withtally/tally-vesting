#!/bin/bash
# Start Anvil with indexer-friendly configuration
set -e

# Allow overriding the port via ANVIL_PORT (default 8545)
ANVIL_PORT=${ANVIL_PORT:-8545}

# Kill any existing Anvil process
if pgrep -x "anvil" > /dev/null; then
    echo "Killing existing Anvil process..."
    pkill -x anvil
    sleep 1
fi

echo "Starting Anvil on port ${ANVIL_PORT}..."
anvil --block-time 1 --auto-impersonate --host 0.0.0.0 --port "${ANVIL_PORT}"
