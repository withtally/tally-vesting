# Tally Vesting

A gas-efficient, merkle-based vesting system using OpenZeppelin's VestingWallet contracts.

## Overview

Instead of deploying all vesting contracts upfront (expensive for large allocations), this system:

1. **Setup**: Store a merkle root of all vesting allocations + total tokens
2. **Claim**: Users provide merkle proof to claim their allocation
3. **Deploy**: Each claim deploys an OpenZeppelin `VestingWalletCliff` via CREATE2
4. **Vest**: Users call `release()` on their wallet to withdraw vested tokens

## Benefits

- **Gas Efficient**: Issuer pays constant cost regardless of recipient count
- **Scalable**: Supports unlimited recipients (limited only by merkle tree depth)
- **Standard**: Uses battle-tested OpenZeppelin contracts
- **Predictable**: CREATE2 enables pre-computing wallet addresses
- **Flexible**: Support for cliff + linear vesting schedules

## Packages

| Package | Description |
|---------|-------------|
| [`packages/contracts`](./packages/contracts) | Solidity smart contracts (Foundry) |
| [`packages/indexer`](./packages/indexer) | Ponder-based blockchain indexer |
| [`packages/merkle-server`](./packages/merkle-server) | Merkle tree API server with safety features |

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm 9.x
- Foundry (for contracts)

### Installation

```bash
# Install dependencies
pnpm install

# Install Foundry dependencies
cd packages/contracts && forge install
```

### Development

```bash
# Build contracts
pnpm contracts:build

# Test contracts
pnpm contracts:test

# Start local Anvil node
pnpm anvil

# Seed local deployment
pnpm seed

# Seed a deployment that exercises the platform fee wrapper
pnpm seed:fee

# Run indexer (development)
pnpm indexer:dev
```

## Architecture

```
MerkleVestingFactory
└── creates MerkleVestingDeployer (one per vesting campaign)
    └── deploys VestingWalletCliff (one per recipient on claim)
```

## Documentation

See [`docs/`](./docs) for detailed documentation:

- [Plans](./docs/plans/) - Implementation plans and roadmaps
- [Learnings](./docs/learnings/) - Development insights and logs
- [Reference](./docs/reference/) - Technical reference materials
- [Platform Fee](./docs/reference/platform-fee.md) - Guidance on the optional fee wrapper
- [Architecture](./docs/architecture/) - System design docs
- [Decisions](./docs/decisions/) - Architecture decision records

## Security

- Double-claim prevention via claimed mapping
- Merkle proof validation using OpenZeppelin MerkleProof
- CREATE2 determinism with beneficiary in salt
- Claim deadline with sweep for unclaimed tokens
- Reentrancy protection

## Author

**Dennison Bertram** <dennison@tally.xyz>

Built for [Tally](https://tally.xyz) - Onchain Governance

## License

MIT
