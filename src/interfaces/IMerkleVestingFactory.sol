// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IMerkleVestingFactory
/// @notice Factory for deploying MerkleVestingDeployer contracts
/// @dev Uses CREATE2 for deterministic deployment addresses
interface IMerkleVestingFactory {
    // ============ Events ============

    /// @notice Emitted when a new MerkleVestingDeployer is created
    /// @param deployer The deployed MerkleVestingDeployer address
    /// @param token The token being vested
    /// @param merkleRoot The merkle root of allocations
    /// @param creator The address that created the deployer
    event DeployerCreated(
        address indexed deployer, address indexed token, bytes32 indexed merkleRoot, address creator
    );

    // ============ Errors ============

    /// @notice Thrown when a zero address is provided
    error ZeroAddress();

    /// @notice Thrown when merkle root is zero
    error ZeroMerkleRoot();

    /// @notice Thrown when vesting duration is zero
    error ZeroVestingDuration();

    /// @notice Thrown when cliff exceeds duration
    error CliffExceedsDuration();

    /// @notice Thrown when claim deadline is before vesting ends
    error InvalidClaimDeadline();

    // ============ View Functions ============

    /// @notice Compute the deterministic address of a MerkleVestingDeployer
    /// @param token The token to be vested
    /// @param merkleRoot The merkle root of allocations
    /// @param vestingStart When vesting starts
    /// @param vestingDuration Total vesting duration
    /// @param cliffDuration Cliff period
    /// @param claimDeadline Deadline for claiming
    /// @param salt Additional salt for uniqueness
    /// @return The address where the deployer will be created
    function getDeployerAddress(
        address token,
        bytes32 merkleRoot,
        uint64 vestingStart,
        uint64 vestingDuration,
        uint64 cliffDuration,
        uint64 claimDeadline,
        bytes32 salt
    ) external view returns (address);

    // ============ State-Changing Functions ============

    /// @notice Deploy a new MerkleVestingDeployer
    /// @dev Caller must transfer tokens to the deployer after creation
    /// @param token The token to be vested
    /// @param merkleRoot The merkle root of allocations
    /// @param vestingStart When vesting starts (Unix timestamp)
    /// @param vestingDuration Total vesting duration in seconds
    /// @param cliffDuration Cliff period in seconds
    /// @param claimDeadline Deadline for claiming (Unix timestamp)
    /// @param salt Additional salt for CREATE2 uniqueness
    /// @return deployer The deployed MerkleVestingDeployer address
    function deploy(
        address token,
        bytes32 merkleRoot,
        uint64 vestingStart,
        uint64 vestingDuration,
        uint64 cliffDuration,
        uint64 claimDeadline,
        bytes32 salt
    ) external returns (address deployer);
}
