---
title: Development Log
category: learning
date: 2025-12-23
tags: [testing, contracts, vesting]
---

# Development Log: 2025-12-23

## Context

Development work on the Tally Vesting merkle-based vesting system contracts.

## Changes Made

### MerkleVestingDeployer

- Added `InvalidClaimDeadline` error to `IMerkleVestingDeployer` and `MerkleVestingDeployer`
- Added validation in `MerkleVestingDeployer` constructor to ensure `claimDeadline >= vestingStart + vestingDuration`
- Updated `IMerkleVestingDeployer.sol` NatSpec for `sweep()` function
- Clarified that `sweep()` is permissionless by design to prevent permanent token lockup

### Tests Added

**Constructor Validation Tests** (`MerkleVestingDeployer.t.sol`):
- `test_constructorRevertsOnZeroMerkleRoot`
- `test_constructorRevertsOnZeroVestingDuration`
- `test_constructorRevertsOnCliffExceedsDuration`
- `test_constructorRevertsOnInvalidClaimDeadline`

**Claim Function Tests** (`MerkleVestingDeployer.t.sol`):
- `test_claimForDeploysVestingWalletForBeneficiary` - Verified `claimFor` correctly deploys wallet for beneficiary
- `test_claimForRevertsWithZeroAddressBeneficiary` - Verified `claimFor` reverts with zero address
- `test_claimForRevertsWithInvalidProof` - Verified `claimFor` reverts with invalid proof

**Sweep Tests** (`MerkleVestingDeployer.t.sol`):
- `test_sweepPermissionless()` - Verified that any address can trigger the sweep after the claim deadline

**Integration Tests** (`Integration.t.sol`):
- Created end-to-end integration test covering:
  - Factory deployment
  - Multi-user claims (self and relayer)
  - Vesting schedule verification
  - Sweeping unclaimed tokens

**Fuzz Test Fixes**:
- Fixed `testFuzz_claimWithInvalidProof` by adding `vm.assume(proof.length > 0)` to prevent underflow

## Key Learnings

### Sweep Mechanism Design

The `sweep()` function is a critical safety mechanism to ensure tokens are not orphaned if beneficiaries fail to claim before the deadline.

**Why Permissionless?**
- Allows any interested party (or automated bot) to return tokens to the treasury/recipient
- Increases system robustness
- Prevents permanent token lockup if owner key is lost

**Enforcement**:
- Timing: Can only be called after `claimDeadline` has passed
- Access Control: None - anyone can call
- Recipient: Caller specifies the recipient address

**Security**: Since the function can only be called after the deadline, it does not interfere with valid claims.

## How to Apply This

1. Always consider token recovery mechanisms in vesting contracts
2. Permissionless sweeps with time-locks provide good balance between security and usability
3. Comprehensive constructor validation prevents invalid contract states

## Related Documents

- [Sweep Mechanism Reference](../reference/sweep-mechanism.md)
- [Contracts README](../../packages/contracts/README.md)
