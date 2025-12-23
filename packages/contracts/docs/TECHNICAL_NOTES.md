# Technical Notes

## Sweep Mechanism

The `sweep(address recipient)` function in `MerkleVestingDeployer` is designed to be permissionless.

### Purpose
To ensure that unclaimed tokens can always be recovered from the contract after the claim period has expired. If the function were restricted (e.g., `onlyOwner`), and the owner's key was lost, the tokens would be permanently locked.

### Enforcement
- **Timing**: Can only be called after `claimDeadline` has passed.
- **Access Control**: None. Anyone can call this function.
- **Recipient**: The caller specifies the `recipient` address. This provides flexibility for the treasury or any designated recovery address.

### Security
Since the function can only be called after the deadline, it does not interfere with valid claims. Any address can trigger the transfer of the *entire* remaining balance of the contract to the specified recipient.
