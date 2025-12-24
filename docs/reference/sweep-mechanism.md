---
title: Sweep Mechanism
category: reference
date: 2025-12-23
---

# Sweep Mechanism

Technical reference for the `sweep(address recipient)` function in `MerkleVestingDeployer`.

## Overview

The sweep function is designed to be **permissionless** to ensure unclaimed tokens can always be recovered after the claim period expires.

## Purpose

To ensure that unclaimed tokens can always be recovered from the contract after the claim period has expired. If the function were restricted (e.g., `onlyOwner`), and the owner's key was lost, the tokens would be permanently locked.

## Function Signature

```solidity
function sweep(address recipient) external;
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `recipient` | `address` | The address to receive unclaimed tokens |

## Enforcement

### Timing
- Can only be called after `claimDeadline` has passed
- Reverts with `ClaimDeadlineNotPassed()` if called early

### Access Control
- **None** - Anyone can call this function
- Caller specifies the `recipient` address

### Behavior
- Transfers the **entire** remaining token balance to the specified recipient
- Safe to call multiple times (will transfer 0 on subsequent calls)

## Security Considerations

1. **Time-locked**: Cannot interfere with valid claims since it only works after deadline
2. **Flexible recovery**: Any address can trigger recovery to any recipient
3. **No admin dependency**: Works even if original deployer/owner keys are lost

## Example Usage

```solidity
// After claim deadline has passed
merkleVestingDeployer.sweep(treasuryAddress);
```

## Related

- [Development Log](../learnings/development-log-2025-12-23.md) - Context on why this design was chosen
- [MerkleVestingDeployer Contract](../../packages/contracts/src/MerkleVestingDeployer.sol)
