---
title: ADR-002: CREATE2 Determinism
category: decision
date: 2025-12-23
status: accepted
deciders: Claude + User
---

# ADR-002: CREATE2 Determinism

## Status

**Accepted** - 2025-12-23

## Context

When a beneficiary claims their vesting allocation, a new VestingWallet contract is deployed. The address of this wallet needs to be:

1. **Predictable**: UIs and indexers should know the address before claim
2. **Unique**: Each beneficiary gets exactly one wallet per deployer
3. **Collision-resistant**: Cannot be manipulated by attackers

## Decision

Use **CREATE2** with the beneficiary address as the salt to deploy VestingWallet contracts.

### Implementation

```solidity
function claim(bytes32[] calldata proof, uint256 amount) external {
    // Salt = hash of beneficiary address
    bytes32 salt = keccak256(abi.encodePacked(msg.sender));

    // Bytecode includes beneficiary in constructor args
    bytes memory bytecode = abi.encodePacked(
        type(VestingWalletCliffConcrete).creationCode,
        abi.encode(beneficiary, vestingStart, vestingDuration, cliffDuration)
    );

    // Deploy with CREATE2
    wallet = Create2.deploy(0, salt, bytecode);
}

function getVestingWallet(address beneficiary) public view returns (address) {
    bytes32 salt = keccak256(abi.encodePacked(beneficiary));
    bytes memory bytecode = _getVestingWalletBytecode(beneficiary);
    return Create2.computeAddress(salt, keccak256(bytecode));
}
```

### Address Computation

```
address = keccak256(0xff ++ deployer ++ salt ++ keccak256(bytecode))[12:]

where:
  deployer = MerkleVestingDeployer address
  salt = keccak256(beneficiary)
  bytecode = VestingWalletCliffConcrete creation code + constructor args
```

## Consequences

### Positive

- **Pre-computable Addresses**: Know wallet address before claim
- **Deterministic**: Same inputs always produce same address
- **One Wallet Per Beneficiary**: Salt ensures uniqueness
- **Frontrunning Resistant**: Beneficiary is baked into bytecode
- **Indexer-Friendly**: Can pre-index expected addresses

### Negative

- **Slightly Higher Gas**: CREATE2 costs ~32k vs CREATE ~21k
- **Bytecode Dependency**: Address changes if contract code changes

### Neutral

- Beneficiary cannot choose their wallet address
- Wallet cannot be redeployed after destruction (not applicable - no selfdestruct)

## Alternatives Considered

### Alternative 1: Regular CREATE

**Description**: Use standard CREATE opcode, track addresses in mapping.

**Pros**:
- Simpler implementation
- Lower gas cost

**Cons**:
- Address not predictable before deployment
- Requires on-chain storage of wallet addresses
- UIs must wait for claim transaction

**Why not chosen**: Predictability is important for UX and indexing.

### Alternative 2: Counterfactual Wallets (CREATE2 + Lazy Deploy)

**Description**: Compute addresses but don't deploy until first release.

**Pros**:
- Even more gas efficient (no deploy on claim)
- Tokens sent to counterfactual address

**Cons**:
- Complex token custody model
- Harder to verify wallet exists
- Edge cases with pre-deployment transfers

**Why not chosen**: Added complexity not worth marginal gas savings.

### Alternative 3: Pre-deployed Wallet Registry

**Description**: Deploy all wallets upfront, store in registry.

**Pros**:
- All addresses known immediately
- No CREATE2 complexity

**Cons**:
- Back to expensive upfront deployment
- Defeats merkle-based lazy deployment

**Why not chosen**: Conflicts with merkle-based design goal.

## Security Considerations

### Frontrunning Protection

The salt includes only the beneficiary address, but the **bytecode includes the beneficiary as a constructor argument**. This means:

1. Attacker cannot claim on behalf of victim to wrong wallet
2. Wallet is always owned by the intended beneficiary
3. Even if attacker deploys first, wallet ownership is correct

### Collision Attacks

- Salt is deterministic per beneficiary
- Same beneficiary + same deployer = same wallet
- No ability to create colliding wallets

## Implementation

See:
- `MerkleVestingDeployer.sol:_claim()` - CREATE2 deployment
- `MerkleVestingDeployer.sol:getVestingWallet()` - Address computation
- `MerkleVestingFactory.sol:getDeployerAddress()` - Factory-level CREATE2

## Related Documents

- [ADR-001: Merkle-Based Vesting](./adr-001-merkle-vesting-2025-12-23.md)
- [System Overview](../architecture/system-overview-2025-12-23.md)
