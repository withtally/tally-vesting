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

## Installation

```bash
forge install
```

## Usage

### For Token Issuers

1. Generate allocations list: `[(address, amount), ...]`
2. Build merkle tree and get root
3. Deploy `MerkleVestingDeployer` with:
   - Token address
   - Merkle root
   - Vesting schedule (start, duration, cliff)
   - Claim deadline
4. Transfer total allocation to the deployer

### For Recipients

1. Get merkle proof for your allocation
2. Call `claim(proof, amount)` on the deployer
3. Receive your VestingWallet address
4. Call `release(token)` on your wallet to withdraw vested tokens

## Development

```bash
# Build
forge build

# Test
forge test

# Test with verbosity
forge test -vvv

# Gas report
forge test --gas-report
```

## Architecture

```
MerkleVestingFactory
└── creates MerkleVestingDeployer (one per vesting campaign)
    └── deploys VestingWalletCliff (one per recipient on claim)
```

## Security

- Double-claim prevention via claimed mapping
- Merkle proof validation using OpenZeppelin MerkleProof
- CREATE2 determinism with beneficiary in salt
- Claim deadline with sweep for unclaimed tokens
- Reentrancy protection

## License

MIT
