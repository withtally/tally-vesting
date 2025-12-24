---
title: Development Setup Guide
category: guide
date: 2025-12-23
difficulty: beginner
estimated_time: 15 minutes
---

# Development Setup Guide

Complete guide to setting up your local development environment for the Tally Vesting project.

## Prerequisites

### Required Software

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 18.0.0 | JavaScript runtime |
| pnpm | 9.x | Package manager |
| Foundry | Latest | Solidity development framework |
| Git | Latest | Version control |

### Install Prerequisites

**Node.js** (via nvm recommended):
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js 18+
nvm install 18
nvm use 18
```

**pnpm**:
```bash
# Install pnpm
npm install -g pnpm@9

# Verify installation
pnpm --version
```

**Foundry**:
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash

# Run foundryup to install/update
foundryup

# Verify installation
forge --version
anvil --version
cast --version
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/tally-vesting.git
cd tally-vesting
```

### 2. Install Node Dependencies

```bash
# Install all workspace dependencies
pnpm install
```

### 3. Install Foundry Dependencies

```bash
# Navigate to contracts package
cd packages/contracts

# Install Solidity dependencies (OpenZeppelin, forge-std)
forge install

# Return to root
cd ../..
```

### 4. Verify Installation

```bash
# Build contracts
pnpm contracts:build

# Run tests
pnpm contracts:test
```

**Expected output**: All tests should pass.

## Development Workflow

### Contracts Development

```bash
# Build contracts
pnpm contracts:build

# Run all tests
pnpm contracts:test

# Run tests with verbosity
cd packages/contracts && forge test -vvv

# Run specific test
cd packages/contracts && forge test --match-test "test_claim" -vvv

# Gas report
cd packages/contracts && forge test --gas-report

# Format code
cd packages/contracts && forge fmt
```

### Local Blockchain

```bash
# Start local Anvil node (in terminal 1)
pnpm anvil

# Seed with test data (in terminal 2)
pnpm seed
```

**Anvil default accounts** (for testing):
- Account 0: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

### Indexer Development

```bash
# Configure environment
cp packages/indexer/.env.example packages/indexer/.env
# Edit .env and add your RPC URL

# Run indexer in development mode
pnpm indexer:dev

# Production mode
pnpm indexer:start
```

**GraphQL API** available at `http://localhost:42069` when indexer is running.

## Project Structure

```
tally-vesting/
├── docs/                    # Documentation (you are here)
├── packages/
│   ├── contracts/           # Solidity smart contracts
│   │   ├── src/             # Contract source files
│   │   ├── test/            # Foundry tests
│   │   ├── script/          # Deployment scripts
│   │   └── lib/             # Foundry dependencies
│   └── indexer/             # Ponder blockchain indexer
│       ├── src/             # Event handlers
│       ├── generated/       # Auto-generated types
│       └── ponder.config.ts # Indexer configuration
├── package.json             # Root workspace config
└── pnpm-workspace.yaml      # Workspace definition
```

## Common Tasks

### Adding a New Contract

1. Create contract in `packages/contracts/src/`
2. Create test in `packages/contracts/test/`
3. Run tests: `pnpm contracts:test`
4. Export ABI: `forge build && cp out/YourContract.sol/YourContract.json abi/`

### Adding a New Test

```solidity
// packages/contracts/test/YourContract.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {YourContract} from "../src/YourContract.sol";

contract YourContractTest is Test {
    YourContract public yourContract;

    function setUp() public {
        yourContract = new YourContract();
    }

    function test_something() public {
        // Test logic
    }
}
```

### Deploying to Testnet

```bash
# Set environment variables
export RPC_URL="https://sepolia.infura.io/v3/YOUR_KEY"
export PRIVATE_KEY="your-private-key"

# Deploy
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

## Troubleshooting

### Problem: `forge: command not found`

**Solution**: Run `foundryup` to install Foundry, then restart your terminal.

### Problem: `pnpm install` fails

**Solution**: Ensure you're using pnpm 9.x:
```bash
npm install -g pnpm@9
pnpm install
```

### Problem: Tests fail with "out of gas"

**Solution**: Increase gas limit in `foundry.toml`:
```toml
[profile.default]
gas_limit = 30000000
```

### Problem: Anvil port already in use

**Solution**: Kill existing process or use different port:
```bash
# Find process
lsof -i :8545

# Kill it
kill -9 <PID>

# Or use different port
anvil --port 8546
```

## Next Steps

- Read the [System Overview](../architecture/system-overview-2025-12-23.md)
- Understand [Merkle-Based Vesting](../decisions/adr-001-merkle-vesting-2025-12-23.md)
- Explore the [contracts README](../../packages/contracts/README.md)

## Related Documents

- [System Overview](../architecture/system-overview-2025-12-23.md)
- [ADR-001: Merkle-Based Vesting](../decisions/adr-001-merkle-vesting-2025-12-23.md)
- [Contracts Package README](../../packages/contracts/README.md)
