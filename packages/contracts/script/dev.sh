#!/bin/bash
# Start Anvil and seed with test data for indexer development
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Kill any existing Anvil process
if pgrep -x "anvil" > /dev/null; then
    echo "Killing existing Anvil process..."
    pkill -x anvil
    sleep 1
fi

echo "Starting Anvil on port 8545..."
anvil --block-time 1 --auto-impersonate --host 0.0.0.0 --port 8545 &
ANVIL_PID=$!

# Wait for Anvil to be ready
echo "Waiting for Anvil to start..."
for i in {1..30}; do
    if curl -s http://localhost:8545 -X POST -H "Content-Type: application/json" \
        --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
        echo "Anvil is ready!"
        break
    fi
    sleep 0.5
done

echo ""
echo "Deploying contracts and seeding data..."
forge script script/Seed.s.sol:Seed --rpc-url http://localhost:8545 --broadcast

echo ""
echo "=========================================="
echo "  Anvil running with seed data!"
echo "=========================================="
echo ""
echo "Factory:  0x6B51bD91c3FF15e34C56D62F7c77892DE7bA3786"
echo "Chain ID: 31337"
echo "RPC URL:  http://localhost:8545"
echo ""
echo "Press Ctrl+C to stop Anvil"
echo ""

# Keep script running and forward Ctrl+C to Anvil
trap "kill $ANVIL_PID 2>/dev/null" EXIT
wait $ANVIL_PID
