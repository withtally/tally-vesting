// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { IMerkleVestingFactory } from "./interfaces/IMerkleVestingFactory.sol";
import { MerkleVestingDeployer } from "./MerkleVestingDeployer.sol";

/// @title MerkleVestingFactory
/// @notice Factory for deploying MerkleVestingDeployer contracts with CREATE2
/// @dev Uses CREATE2 to enable deterministic deployment addresses
contract MerkleVestingFactory is IMerkleVestingFactory {
    // ============ View Functions ============

    /// @inheritdoc IMerkleVestingFactory
    function getDeployerAddress(
        address token,
        bytes32 merkleRoot,
        uint64 vestingStart,
        uint64 vestingDuration,
        uint64 cliffDuration,
        uint64 claimDeadline,
        bytes32 salt
    ) public view returns (address) {
        // Compute the full salt including all parameters
        bytes32 fullSalt = _computeSalt(
            token, merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        // Get the creation bytecode
        bytes memory bytecode = _getDeployerBytecode(
            token, merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline
        );

        // Compute CREATE2 address
        return Create2.computeAddress(fullSalt, keccak256(bytecode));
    }

    // ============ State-Changing Functions ============

    /// @inheritdoc IMerkleVestingFactory
    function deploy(
        address token,
        bytes32 merkleRoot,
        uint64 vestingStart,
        uint64 vestingDuration,
        uint64 cliffDuration,
        uint64 claimDeadline,
        bytes32 salt
    ) external returns (address deployer) {
        // Validate inputs
        if (token == address(0)) revert ZeroAddress();
        if (merkleRoot == bytes32(0)) revert ZeroMerkleRoot();
        if (vestingDuration == 0) revert ZeroVestingDuration();
        if (cliffDuration > vestingDuration) revert CliffExceedsDuration();
        
        // Calculate vesting end timestamp
        uint64 vestingEnd = vestingStart + vestingDuration;
        if (claimDeadline < vestingEnd) revert InvalidClaimDeadline();

        // Compute the full salt including all parameters
        bytes32 fullSalt = _computeSalt(
            token, merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        // Get the creation bytecode
        bytes memory bytecode = _getDeployerBytecode(
            token, merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline
        );

        // Deploy via CREATE2
        deployer = Create2.deploy(0, fullSalt, bytecode);

        // Emit event
        emit DeployerCreated(deployer, token, merkleRoot, msg.sender);
    }

    // ============ Internal Functions ============

    /// @dev Compute the full salt by hashing all parameters plus user salt
    function _computeSalt(
        address token,
        bytes32 merkleRoot,
        uint64 vestingStart,
        uint64 vestingDuration,
        uint64 cliffDuration,
        uint64 claimDeadline,
        bytes32 salt
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                token, merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
            )
        );
    }

    /// @dev Get the creation bytecode for MerkleVestingDeployer
    function _getDeployerBytecode(
        address token,
        bytes32 merkleRoot,
        uint64 vestingStart,
        uint64 vestingDuration,
        uint64 cliffDuration,
        uint64 claimDeadline
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            type(MerkleVestingDeployer).creationCode,
            abi.encode(token, merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline)
        );
    }
}
