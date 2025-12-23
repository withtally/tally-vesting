#!/bin/bash
# Start Anvil with indexer-friendly configuration
set -e

echo "Starting Anvil on port 8545..."
anvil --block-time 1 --auto-impersonate --host 0.0.0.0 --port 8545
