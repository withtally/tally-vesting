# Development Log

## 2025-12-23

### Changes
- **MerkleVestingDeployer**:
    - Added `InvalidClaimDeadline` error to `IMerkleVestingDeployer` and `MerkleVestingDeployer`.
    - Added validation in `MerkleVestingDeployer` constructor to ensure `claimDeadline >= vestingStart + vestingDuration`.
- **Tests**:
    - Added constructor validation tests in `MerkleVestingDeployer.t.sol`:
        - `test_constructorRevertsOnZeroMerkleRoot`
        - `test_constructorRevertsOnZeroVestingDuration`
        - `test_constructorRevertsOnCliffExceedsDuration`
        - `test_constructorRevertsOnInvalidClaimDeadline`
    - Fixed fuzz test `testFuzz_claimWithInvalidProof` by adding `vm.assume(proof.length > 0)` to prevent underflow.
- Updated `IMerkleVestingDeployer.sol` NatSpec for `sweep()` function.
- Clarified that `sweep()` is permissionless by design to prevent permanent token lockup.
- Added `test_sweepPermissionless()` in `MerkleVestingDeployer.t.sol` to verify that any address can trigger the sweep after the claim deadline.

### Learnings
- The `sweep()` function is a critical safety mechanism to ensure that tokens are not orphaned if beneficiaries fail to claim before the deadline.
- Making it permissionless allows any interested party (or automated bot) to return tokens to the treasury/recipient, increasing system robustness.