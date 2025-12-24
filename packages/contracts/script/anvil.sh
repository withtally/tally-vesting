#!/bin/bash
# Start Anvil with indexer-friendly configuration
set -e

# Kill any existing Anvil process
if pgrep -x "anvil" > /dev/null; then
    echo "Killing existing Anvil process..."
    pkill -x anvil
    sleep 1
fi

echo "Starting Anvil on port 8545..."
anvil --block-time 1 --auto-impersonate --host 0.0.0.0 --port 8545
