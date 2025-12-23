# Development Log

## 2025-12-23

### Tests Added
- Added `test_claimForDeploysVestingWalletForBeneficiary` to `test/MerkleVestingDeployer.t.sol`: Verified `claimFor` correctly deploys wallet for beneficiary.
- Added `test_claimForRevertsWithZeroAddressBeneficiary` to `test/MerkleVestingDeployer.t.sol`: Verified `claimFor` reverts with zero address.
- Added `test_claimForRevertsWithInvalidProof` to `test/MerkleVestingDeployer.t.sol`: Verified `claimFor` reverts with invalid proof.
- Created `test/Integration.t.sol`: Added end-to-end integration test covering factory deployment, multi-user claims (self and relayer), vesting schedule verification, and sweeping.
