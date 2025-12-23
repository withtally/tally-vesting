# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Tally Vesting** - A merkle-based vesting system using OpenZeppelin's VestingWallet contracts. Enables gas-efficient token vesting where users claim their vesting allocations by providing merkle proofs, deploying individual VestingWallet contracts on demand.

## Core Concept

Instead of deploying all vesting contracts upfront (expensive for large allocations), this system:
1. Stores a merkle root of all vesting allocations
2. Users claim by providing merkle proof + their allocation amount
3. Each claim deploys an OpenZeppelin VestingWalletCliff via CREATE2
4. Tokens are transferred from the deployer to the user's wallet
5. Users can then call `release()` on their wallet to withdraw vested tokens

## Architecture

```
MerkleVestingDeployer
├── Stores: token, merkleRoot, totalAllocation, vestingStart, vestingDuration, cliffDuration, claimDeadline
├── claim(proof, amount) → deploys VestingWalletCliff via CREATE2 → funds it
├── getVestingWallet(beneficiary) → predictable address before deployment
└── sweep(recipient) → return unclaimed tokens after deadline

VestingWalletCliff (OpenZeppelin)
├── Owner: beneficiary
├── Linear vesting with cliff
└── release(token) → withdraw vested tokens
```

## Dependencies

- **OpenZeppelin Contracts v5.x** - VestingWalletCliff, MerkleProof, Create2, SafeERC20
- **Foundry** - Development framework

## Development Commands

```bash
# Build
forge build

# Run all tests
forge test

# Run specific test
forge test --match-test "test_claimDeploysVestingWallet" -vvv

# Run with gas report
forge test --gas-report

# Deploy (when ready)
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

## TDD Approach

All development follows strict TDD:
1. **RED**: Write failing test first
2. **GREEN**: Minimal implementation to pass
3. **REFACTOR**: Clean up while tests stay green

## Key Design Decisions

1. **Per-user VestingWallet**: Each user gets their own OZ VestingWallet (vs shared pool)
   - Pros: Battle-tested OZ code, transferable ownership, standard interface
   - Cons: ~200k gas per claim (acceptable for this use case)

2. **CREATE2 Determinism**: Wallet addresses predictable before deployment
   - Salt = keccak256(beneficiary address)
   - Enables pre-computing addresses for UI/indexing

3. **Global Vesting Schedule**: All users share same cliff/duration/start
   - Simplifies merkle leaf structure
   - Can create multiple deployers for different schedules if needed

4. **Claim Deadline**: Users must claim before deadline
   - Unclaimed tokens can be swept to treasury
   - Prevents permanent token lockup

## File Structure

```
src/
├── MerkleVestingDeployer.sol       # Main contract
├── MerkleVestingFactory.sol        # Factory for deterministic deploys
└── interfaces/
    ├── IMerkleVestingDeployer.sol
    └── IMerkleVestingFactory.sol
test/
├── MerkleVestingDeployer.t.sol     # Unit tests
├── MerkleVestingFactory.t.sol      # Factory tests
├── Integration.t.sol               # E2E tests
└── helpers/
    └── MerkleTreeHelper.sol        # Merkle tree generation for tests
script/
└── Deploy.s.sol                    # Deployment script
```

## Merkle Leaf Format

```solidity
// Simple leaf: just beneficiary + amount
// Global vesting params stored in contract
leaf = keccak256(abi.encodePacked(beneficiary, amount))
```

## Security Considerations

1. **Double-claim prevention**: Track claimed[beneficiary] mapping
2. **Proof validation**: Use OZ MerkleProof.verify()
3. **CREATE2 safety**: Salt includes beneficiary to prevent frontrunning
4. **Reentrancy**: claim() uses checks-effects-interactions + nonReentrant
5. **Token custody**: Tokens held in deployer until claimed
6. **Deadline enforcement**: sweep() only works after claimDeadline

## Gas Estimates

| Operation | Estimated Gas |
|-----------|---------------|
| Deploy MerkleVestingDeployer | ~500k |
| claim() (first time) | ~200-250k |
| release() on VestingWallet | ~50k |
| sweep() | ~30k + 21k per transfer |

## Testing Checklist

- [ ] Claim with valid proof deploys wallet
- [ ] Claim with invalid proof reverts
- [ ] Double claim reverts
- [ ] Claim after deadline reverts
- [ ] Sweep before deadline reverts
- [ ] Sweep after deadline works
- [ ] Vesting math is correct (cliff, linear release)
- [ ] CREATE2 addresses are deterministic
- [ ] Fuzz testing for various amounts/beneficiaries
