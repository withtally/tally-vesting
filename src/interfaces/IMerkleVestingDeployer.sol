// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IMerkleVestingDeployer
/// @notice Interface for merkle-based vesting deployment
/// @dev Users claim vesting allocations by providing merkle proofs.
///      Each claim deploys an OpenZeppelin VestingWalletCliff for that user.
interface IMerkleVestingDeployer {
    // ============ Events ============

    /// @notice Emitted when a user claims their vesting allocation
    /// @param beneficiary The user who claimed
    /// @param wallet The deployed VestingWalletCliff address
    /// @param amount The amount of tokens allocated
    event VestingClaimed(address indexed beneficiary, address indexed wallet, uint256 amount);

    /// @notice Emitted when unclaimed tokens are swept after deadline
    /// @param recipient The address receiving the swept tokens
    /// @param amount The amount of tokens swept
    event Swept(address indexed recipient, uint256 amount);

    // ============ Errors ============

    /// @notice Thrown when merkle proof is invalid
    error InvalidProof();

    /// @notice Thrown when user has already claimed
    error AlreadyClaimed();

    /// @notice Thrown when claim is attempted after deadline
    error ClaimDeadlinePassed();

    /// @notice Thrown when sweep is attempted before deadline
    error ClaimDeadlineNotPassed();

    /// @notice Thrown when a zero address is provided
    error ZeroAddress();

    /// @notice Thrown when a zero amount is provided
    error ZeroAmount();

    /// @notice Thrown when a zero merkle root is provided
    error ZeroMerkleRoot();

    /// @notice Thrown when vesting duration is zero
    error ZeroVestingDuration();

    /// @notice Thrown when cliff duration exceeds vesting duration
    error CliffExceedsDuration();

    /// @notice Thrown when claim deadline is invalid (must be >= vestingStart + vestingDuration)
    error InvalidClaimDeadline();

    /// @notice Thrown when there are no tokens to sweep
    error NothingToSweep();

    // ============ View Functions ============

    /// @notice The ERC20 token being vested
    function token() external view returns (address);

    /// @notice The merkle root of all vesting allocations
    function merkleRoot() external view returns (bytes32);

    /// @notice When vesting starts (Unix timestamp)
    function vestingStart() external view returns (uint64);

    /// @notice Total vesting duration in seconds
    function vestingDuration() external view returns (uint64);

    /// @notice Cliff duration in seconds (no tokens vest until cliff passes)
    function cliffDuration() external view returns (uint64);

    /// @notice Deadline for claiming (Unix timestamp). After this, unclaimed tokens can be swept.
    function claimDeadline() external view returns (uint64);

    /// @notice Check if a beneficiary has already claimed
    /// @param beneficiary The address to check
    /// @return True if already claimed
    function hasClaimed(address beneficiary) external view returns (bool);

    /// @notice Get the deterministic VestingWallet address for a beneficiary
    /// @dev Uses CREATE2, so address is known before deployment
    /// @param beneficiary The beneficiary address
    /// @return The VestingWallet address (may not be deployed yet)
    function getVestingWallet(address beneficiary) external view returns (address);

    /// @notice Verify a merkle proof without claiming
    /// @param beneficiary The beneficiary in the leaf
    /// @param amount The amount in the leaf
    /// @param proof The merkle proof
    /// @return True if proof is valid
    function verifyProof(address beneficiary, uint256 amount, bytes32[] calldata proof) external view returns (bool);

    // ============ State-Changing Functions ============

    /// @notice Claim vesting allocation for msg.sender
    /// @dev Deploys a VestingWalletCliff via CREATE2 and funds it
    /// @param proof The merkle proof for the claim
    /// @param amount The token amount being claimed (must match leaf)
    /// @return wallet The deployed VestingWallet address
    function claim(bytes32[] calldata proof, uint256 amount) external returns (address wallet);

    /// @notice Claim vesting allocation on behalf of a beneficiary
    /// @dev Useful for relayers or batch claiming. Wallet is still owned by beneficiary.
    /// @param beneficiary The beneficiary address
    /// @param proof The merkle proof for the claim
    /// @param amount The token amount being claimed
    /// @return wallet The deployed VestingWallet address
    function claimFor(address beneficiary, bytes32[] calldata proof, uint256 amount)
        external
        returns (address wallet);

    /// @notice Sweep unclaimed tokens after deadline
    /// @dev Permissionless by design - anyone can call this function after claimDeadline.
    ///      This ensures unclaimed tokens are never permanently locked in the contract.
    /// @param recipient Address to receive the unclaimed tokens
    function sweep(address recipient) external;
}
