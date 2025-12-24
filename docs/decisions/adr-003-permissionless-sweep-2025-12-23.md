---
title: ADR-003: Permissionless Sweep
category: decision
date: 2025-12-23
status: accepted
deciders: Claude + User
---

# ADR-003: Permissionless Sweep

## Status

**Accepted** - 2025-12-23

## Context

After a vesting campaign is created, tokens are held in the MerkleVestingDeployer contract until beneficiaries claim. Some beneficiaries may never claim, leaving tokens stranded.

**Questions to resolve**:
1. What happens to unclaimed tokens?
2. Who can recover them?
3. When can recovery happen?

## Decision

Implement a **permissionless sweep function** that:
- Can only be called **after the claim deadline**
- Can be called by **anyone**
- Sends tokens to a **caller-specified recipient**

### Implementation

```solidity
function sweep(address recipient) external {
    if (recipient == address(0)) revert ZeroAddress();
    if (block.timestamp <= claimDeadline) revert ClaimDeadlineNotPassed();

    uint256 balance = IERC20(token).balanceOf(address(this));
    if (balance == 0) revert NothingToSweep();

    IERC20(token).safeTransfer(recipient, balance);
    emit Swept(recipient, balance);
}
```

### Time Constraint

```
claimDeadline >= vestingStart + vestingDuration
```

This ensures:
- Beneficiaries have the full vesting period to claim
- Sweep cannot interfere with valid claims
- Clear cutoff for token recovery

## Consequences

### Positive

- **No Admin Dependency**: Works even if deployer keys are lost
- **Bot-Compatible**: Automated systems can trigger recovery
- **Flexible Recovery**: Caller specifies recipient (treasury, multisig, etc.)
- **Guaranteed Recovery**: Tokens can always be recovered after deadline
- **Simple Implementation**: No access control complexity

### Negative

- **Anyone Can Trigger**: Could be called by griefers (but only after deadline)
- **No Partial Sweep**: All-or-nothing transfer

### Neutral

- Recipient is specified at sweep time, not deployment time
- Multiple sweep calls are safe (subsequent calls transfer 0)

## Alternatives Considered

### Alternative 1: Owner-Only Sweep

**Description**: Only contract owner/deployer can call sweep.

**Pros**:
- Clear accountability
- Prevents unauthorized sweeps

**Cons**:
- **Key loss risk**: If owner key is lost, tokens are stuck forever
- Requires access control infrastructure
- Single point of failure

**Why not chosen**: Key loss risk is unacceptable for potentially large token amounts.

### Alternative 2: Pre-Set Recipient

**Description**: Sweep recipient set at deployment, anyone can trigger.

**Pros**:
- Recipient known upfront
- Still permissionless trigger

**Cons**:
- Inflexible if treasury address changes
- Extra constructor parameter
- Storage cost for recipient address

**Why not chosen**: Caller-specified recipient is more flexible with minimal downside.

### Alternative 3: No Sweep (Burn)

**Description**: Unclaimed tokens are effectively burned/locked forever.

**Pros**:
- Simplest implementation
- No sweep attack surface

**Cons**:
- Permanent value destruction
- Bad for token economics
- Punishes late-claimers disproportionately

**Why not chosen**: Destroying value is not acceptable.

### Alternative 4: Time-Extended Claims

**Description**: Allow claims forever, no sweep.

**Pros**:
- Beneficiaries can always claim
- No deadline pressure

**Cons**:
- Tokens locked indefinitely if beneficiaries never claim
- Cannot reclaim for reallocation
- Protocol cannot clean up old campaigns

**Why not chosen**: Need ability to recover unclaimed tokens.

## Security Considerations

### Time Lock

The `claimDeadline` parameter ensures:
- Sweep cannot front-run legitimate claims
- Beneficiaries have guaranteed claim window
- Clear temporal boundary for recovery

### Recipient Validation

- Zero address check prevents accidental burns
- Caller responsible for specifying correct recipient
- No on-chain validation of recipient "correctness"

### Reentrancy

- Uses OpenZeppelin's SafeERC20
- No callbacks that could be exploited
- Balance checked after deadline check

## Implementation

See:
- `MerkleVestingDeployer.sol:sweep()`
- [Sweep Mechanism Reference](../reference/sweep-mechanism.md)

## Related Documents

- [ADR-001: Merkle-Based Vesting](./adr-001-merkle-vesting-2025-12-23.md)
- [Development Log](../learnings/development-log-2025-12-23.md) - Context on design decision
