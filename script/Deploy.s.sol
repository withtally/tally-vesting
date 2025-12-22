// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console2 } from "forge-std/Script.sol";
import { MerkleVestingFactory } from "../src/MerkleVestingFactory.sol";

/// @title Deploy
/// @notice Deployment script for MerkleVestingFactory
contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy the factory
        MerkleVestingFactory factory = new MerkleVestingFactory();

        console2.log("MerkleVestingFactory deployed at:", address(factory));

        vm.stopBroadcast();
    }
}

/// @title DeployVesting
/// @notice Deploy a specific vesting campaign via the factory
/// @dev Set environment variables before running:
///      - PRIVATE_KEY: Deployer private key
///      - FACTORY_ADDRESS: MerkleVestingFactory address
///      - TOKEN_ADDRESS: ERC20 token to vest
///      - MERKLE_ROOT: Root of the allocation merkle tree
///      - VESTING_START: Unix timestamp for vesting start
///      - VESTING_DURATION: Duration in seconds
///      - CLIFF_DURATION: Cliff in seconds
///      - CLAIM_DEADLINE: Unix timestamp for claim deadline
contract DeployVesting is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");
        address tokenAddress = vm.envAddress("TOKEN_ADDRESS");
        bytes32 merkleRoot = vm.envBytes32("MERKLE_ROOT");
        uint64 vestingStart = uint64(vm.envUint("VESTING_START"));
        uint64 vestingDuration = uint64(vm.envUint("VESTING_DURATION"));
        uint64 cliffDuration = uint64(vm.envUint("CLIFF_DURATION"));
        uint64 claimDeadline = uint64(vm.envUint("CLAIM_DEADLINE"));

        MerkleVestingFactory factory = MerkleVestingFactory(factoryAddress);

        // Generate a unique salt based on current timestamp
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, msg.sender));

        vm.startBroadcast(deployerPrivateKey);

        address deployer = factory.deploy(
            tokenAddress,
            merkleRoot,
            vestingStart,
            vestingDuration,
            cliffDuration,
            claimDeadline,
            salt
        );

        console2.log("MerkleVestingDeployer deployed at:", deployer);
        console2.log("Token:", tokenAddress);
        console2.log("Merkle Root:", uint256(merkleRoot));
        console2.log("Vesting Start:", vestingStart);
        console2.log("Vesting Duration:", vestingDuration);
        console2.log("Cliff Duration:", cliffDuration);
        console2.log("Claim Deadline:", claimDeadline);

        vm.stopBroadcast();

        console2.log("");
        console2.log("IMPORTANT: Transfer tokens to the deployer contract!");
        console2.log("Run: token.transfer(deployer, totalAllocation)");
    }
}
