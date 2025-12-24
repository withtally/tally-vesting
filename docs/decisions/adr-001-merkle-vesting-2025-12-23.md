---
title: ADR-001: Merkle-Based Vesting
category: decision
date: 2025-12-23
status: accepted
deciders: Claude + User
---

# ADR-001: Merkle-Based Vesting

## Status

**Accepted** - 2025-12-23

## Context

Token vesting is a common requirement for DAOs, companies, and protocols distributing tokens to team members, investors, and community. Traditional approaches deploy individual vesting contracts upfront for each recipient.

**Problem**: For large allocations (100+ recipients), deploying all contracts upfront is:
- **Expensive**: ~200k gas per contract = 20M+ gas for 100 recipients
- **Slow**: Many transactions required
- **Wasteful**: Some recipients may never claim

## Decision

Use a **merkle tree** to store allocations off-chain, with only the root stored on-chain. Recipients claim by providing a merkle proof of their allocation.

### Implementation

```solidity
// Store only the merkle root (32 bytes)
bytes32 public immutable merkleRoot;

// Claim with proof
function claim(bytes32[] calldata proof, uint256 amount) external {
    bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
    require(MerkleProof.verify(proof, merkleRoot, leaf), "Invalid proof");
    // Deploy wallet and transfer tokens
}
```

### Leaf Format

```
leaf = keccak256(abi.encodePacked(beneficiary, amount))
```

Simple format since vesting schedule is global per deployer.

## Consequences

### Positive

- **O(1) Storage**: Single merkle root regardless of recipient count
- **O(log n) Verification**: Efficient proof verification
- **Pay-per-claim**: Gas cost only when recipients actually claim
- **Transparent**: Merkle tree can be published for verification
- **Scalable**: Supports unlimited recipients (limited by tree depth)

### Negative

- **Off-chain Dependency**: Merkle tree must be stored and served off-chain
- **Proof Generation**: Requires infrastructure to generate/serve proofs
- **No On-chain Enumeration**: Cannot list all recipients on-chain

### Neutral

- Recipients must actively claim (vs automatic vesting)
- Claim deadline required to handle unclaimed allocations

## Alternatives Considered

### Alternative 1: Deploy All Contracts Upfront

**Description**: Deploy individual VestingWallet for each recipient at setup time.

**Pros**:
- No claim step required
- All data on-chain

**Cons**:
- ~200k gas per recipient
- 100 recipients = 20M+ gas = expensive
- Wastes gas for non-claimers

**Why not chosen**: Cost prohibitive for large allocations.

### Alternative 2: Single Pool Contract

**Description**: One contract holds all tokens, tracks individual balances internally.

**Pros**:
- Single deployment
- All data on-chain

**Cons**:
- Custom implementation (not battle-tested)
- Complex accounting
- Withdrawal accounting vulnerable to bugs

**Why not chosen**: Higher risk, reinventing proven patterns.

### Alternative 3: Airdrop + Separate Vesting

**Description**: Airdrop tokens directly, rely on wallet-level vesting.

**Pros**:
- Simple token distribution
- Recipients control vesting

**Cons**:
- No enforcement of vesting schedule
- Recipients could sell immediately
- Defeats purpose of vesting

**Why not chosen**: Doesn't enforce vesting compliance.

## Implementation

See:
- `MerkleVestingDeployer.sol` - Core claim logic
- `MerkleVestingFactory.sol` - Campaign deployment
- [System Overview](../architecture/system-overview-2025-12-23.md) - Full architecture

## Related Documents

- [ADR-002: CREATE2 Determinism](./adr-002-create2-determinism-2025-12-23.md)
- [ADR-003: Permissionless Sweep](./adr-003-permissionless-sweep-2025-12-23.md)
