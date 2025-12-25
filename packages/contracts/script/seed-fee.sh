#!/bin/bash
# Seed the local Anvil instance with a fee-enabled vesting campaign
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Ensure Anvil is running
ANVIL_PORT=${ANVIL_PORT:-8545}
RPC_URL=${SEED_RPC_URL:-${ANVIL_RPC_URL:-http://localhost:${ANVIL_PORT}}}

if ! curl -s "${RPC_URL}" -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
    echo "Error: Anvil is not running on ${RPC_URL}"
    echo "Start Anvil first: ANVIL_PORT=${ANVIL_PORT} ./script/anvil.sh"
    exit 1
fi

echo "Anvil is running. Deploying fee-enabled vesting campaign..."

mkdir -p "$PROJECT_DIR/seed-output"

pushd "$SCRIPT_DIR" > /dev/null
forge script SeedWithFee.s.sol:SeedWithFee --via-ir --rpc-url "${RPC_URL}" --non-interactive --broadcast
popd > /dev/null

echo ""
echo "Fee seed complete! Check seed-output/ for JSON data."
