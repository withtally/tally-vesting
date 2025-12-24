---
title: System Overview
category: architecture
date: 2025-12-23
status: active
authors: Claude + User
---

# System Overview

## Architecture Diagram

```
                                    ┌─────────────────────────────────────┐
                                    │         Token Issuer                │
                                    │  (DAO, Company, Protocol)           │
                                    └─────────────────┬───────────────────┘
                                                      │
                                         1. Generate merkle tree
                                            of allocations
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MerkleVestingFactory                                   │
│                         (Singleton per chain)                                    │
│                                                                                  │
│  • deploy(token, merkleRoot, schedule, salt) → MerkleVestingDeployer            │
│  • getDeployerAddress(...) → predictable address via CREATE2                    │
│                                                                                  │
│  Events: DeployerCreated(deployer, token, merkleRoot, creator)                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                    2. Deploy campaign with
                                       merkle root + tokens
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        MerkleVestingDeployer                                     │
│                    (One per vesting campaign)                                    │
│                                                                                  │
│  Immutables:                                                                     │
│  • token           - ERC20 token being vested                                   │
│  • merkleRoot      - Root of beneficiary allocations                            │
│  • vestingStart    - Unix timestamp when vesting begins                         │
│  • vestingDuration - Length of vesting period in seconds                        │
│  • cliffDuration   - Cliff period before any tokens vest                        │
│  • claimDeadline   - Deadline after which sweep() is enabled                    │
│                                                                                  │
│  Functions:                                                                      │
│  • claim(proof, amount) → deploys VestingWallet, transfers tokens               │
│  • claimFor(beneficiary, proof, amount) → claim on behalf of user               │
│  • sweep(recipient) → return unclaimed tokens after deadline                    │
│  • getVestingWallet(beneficiary) → predictable wallet address                   │
│  • verifyProof(beneficiary, amount, proof) → check merkle proof                 │
│                                                                                  │
│  Events: VestingClaimed(beneficiary, wallet, amount), Swept(recipient, amount)  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                    3. Beneficiaries claim
                                       with merkle proof
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      VestingWalletCliffConcrete                                  │
│                    (One per beneficiary, OpenZeppelin)                           │
│                                                                                  │
│  Inherits: VestingWallet + VestingWalletCliff (OpenZeppelin v5)                 │
│                                                                                  │
│  Properties:                                                                     │
│  • beneficiary    - Owner of vested tokens                                      │
│  • startTimestamp - When vesting begins                                         │
│  • durationSeconds- Total vesting period                                        │
│  • cliffSeconds   - Cliff before any release                                    │
│                                                                                  │
│  Functions:                                                                      │
│  • release(token) → withdraw vested tokens to beneficiary                       │
│  • vestedAmount(token, timestamp) → calculate vested amount                     │
│  • releasable(token) → amount available to release now                          │
│                                                                                  │
│  Events: ERC20Released(token, amount)                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                    4. Beneficiaries call
                                       release() over time
                                                      │
                                                      ▼
                                    ┌─────────────────────────────────────┐
                                    │           Beneficiary               │
                                    │      (Receives vested tokens)       │
                                    └─────────────────────────────────────┘
```

## Data Flow

### Setup Phase (Token Issuer)

1. **Generate Allocations**: Create list of `(address, amount)` pairs
2. **Build Merkle Tree**: Compute merkle root from allocations
3. **Deploy Campaign**: Call `factory.deploy(token, merkleRoot, schedule, salt)`
4. **Fund Campaign**: Transfer total allocation to the MerkleVestingDeployer

### Claim Phase (Beneficiaries)

1. **Get Proof**: Obtain merkle proof for your allocation (off-chain)
2. **Claim**: Call `deployer.claim(proof, amount)` or `deployer.claimFor(beneficiary, proof, amount)`
3. **Wallet Created**: VestingWalletCliffConcrete deployed via CREATE2
4. **Tokens Transferred**: Allocation moved from deployer to vesting wallet

### Vesting Phase (Beneficiaries)

1. **Wait for Cliff**: No tokens available until cliff period passes
2. **Linear Vesting**: After cliff, tokens vest linearly over remaining duration
3. **Release**: Call `wallet.release(token)` to withdraw vested tokens
4. **Repeat**: Call release periodically to collect newly vested tokens

### Cleanup Phase (Anyone)

1. **After Deadline**: Once `claimDeadline` passes
2. **Sweep**: Anyone can call `deployer.sweep(recipient)` to return unclaimed tokens

## Contract Relationships

```
┌──────────────────────┐         ┌──────────────────────┐
│ MerkleVestingFactory │ creates │ MerkleVestingDeployer│
│                      │────────>│                      │
│ - CREATE2 deployer   │   1:N   │ - Holds tokens       │
│ - Deterministic addr │         │ - Verifies proofs    │
└──────────────────────┘         └──────────┬───────────┘
                                            │
                                            │ creates
                                            │ 1:N
                                            ▼
                                 ┌──────────────────────┐
                                 │VestingWalletCliff    │
                                 │Concrete              │
                                 │                      │
                                 │ - Holds allocation   │
                                 │ - Linear + cliff     │
                                 │ - OpenZeppelin v5    │
                                 └──────────────────────┘
```

## Key Design Patterns

### CREATE2 Determinism

All contracts use CREATE2 for deterministic addresses:

```solidity
// Wallet address can be computed before claim
bytes32 salt = keccak256(abi.encodePacked(beneficiary));
address wallet = Create2.computeAddress(salt, keccak256(bytecode));
```

**Benefits**:
- Pre-compute wallet addresses for UI/indexing
- Prevent address collision attacks
- Enable trustless verification

### Merkle Proof Verification

Allocations stored as merkle tree, not on-chain:

```solidity
// Leaf format: hash(beneficiary, amount)
bytes32 leaf = keccak256(abi.encodePacked(beneficiary, amount));
bool valid = MerkleProof.verify(proof, merkleRoot, leaf);
```

**Benefits**:
- O(1) storage regardless of recipient count
- O(log n) verification per claim
- Transparent, verifiable allocations

### Checks-Effects-Interactions

All state changes follow CEI pattern:

```solidity
function _claim(...) internal {
    // CHECKS
    if (_claimed[beneficiary]) revert AlreadyClaimed();
    if (!verifyProof(...)) revert InvalidProof();

    // EFFECTS
    _claimed[beneficiary] = true;

    // INTERACTIONS
    wallet = Create2.deploy(...);
    token.safeTransfer(wallet, amount);
}
```

## Gas Estimates

| Operation | Estimated Gas | Notes |
|-----------|---------------|-------|
| Factory.deploy() | ~500,000 | Create MerkleVestingDeployer |
| Deployer.claim() | ~200,000-250,000 | Deploy wallet + transfer |
| Deployer.claimFor() | ~200,000-250,000 | Same as claim() |
| Wallet.release() | ~50,000 | Withdraw vested tokens |
| Deployer.sweep() | ~30,000 | Return unclaimed tokens |

## Security Model

1. **No Admin Keys**: Deployer has no owner, sweep is permissionless after deadline
2. **Immutable Config**: All vesting parameters are immutable after deployment
3. **Battle-Tested**: Uses OpenZeppelin's audited VestingWallet contracts
4. **Reentrancy Safe**: SafeERC20 + CEI pattern throughout
5. **Time-Locked Sweep**: Cannot sweep until after claim deadline

## Related Documents

- [ADR-001: Merkle-Based Vesting](../decisions/adr-001-merkle-vesting-2025-12-23.md)
- [ADR-002: CREATE2 Determinism](../decisions/adr-002-create2-determinism-2025-12-23.md)
- [ADR-003: Permissionless Sweep](../decisions/adr-003-permissionless-sweep-2025-12-23.md)
- [Sweep Mechanism Reference](../reference/sweep-mechanism.md)
