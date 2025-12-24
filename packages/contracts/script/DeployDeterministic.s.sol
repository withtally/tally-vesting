// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MerkleVestingFactory} from "../src/MerkleVestingFactory.sol";

/// @title DeployDeterministic
/// @notice Deploy MerkleVestingFactory to a deterministic address across all EVM chains
/// @dev Uses the canonical CREATE2 deployer at 0x4e59b44847b379578588920cA78FbF26c0B4956C
///
/// The factory will be deployed to the same address on ALL networks:
/// - Mainnet, Arbitrum, Base, Optimism, Sepolia, Anvil, etc.
///
/// Usage:
///   forge script script/DeployDeterministic.s.sol:DeployDeterministic --rpc-url $RPC_URL --broadcast
///
/// To compute address without deploying:
///   forge script script/DeployDeterministic.s.sol:ComputeFactoryAddress
contract DeployDeterministic is Script {
    // Canonical CREATE2 deployer - exists on all EVM chains
    // See: https://github.com/Arachnid/deterministic-deployment-proxy
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Fixed salt for deterministic deployment
    // Using a descriptive salt that includes project name
    bytes32 constant FACTORY_SALT = keccak256("tally-vesting-factory-v1");

    function run() external {
        // Compute expected address first
        bytes memory bytecode = type(MerkleVestingFactory).creationCode;
        bytes32 bytecodeHash = keccak256(bytecode);
        address expectedAddress = _computeAddress(FACTORY_SALT, bytecodeHash, CREATE2_DEPLOYER);

        console2.log("=== Deterministic Factory Deployment ===");
        console2.log("CREATE2 Deployer:", CREATE2_DEPLOYER);
        console2.log("Salt:", vm.toString(FACTORY_SALT));
        console2.log("Bytecode Hash:", vm.toString(bytecodeHash));
        console2.log("Expected Factory Address:", expectedAddress);
        console2.log("");

        // Check if already deployed
        if (expectedAddress.code.length > 0) {
            console2.log("Factory already deployed at this address!");
            console2.log("Skipping deployment.");
            return;
        }

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // Deploy via CREATE2 deployer
        // The deployer expects: salt (32 bytes) + bytecode
        bytes memory payload = abi.encodePacked(FACTORY_SALT, bytecode);

        (bool success,) = CREATE2_DEPLOYER.call(payload);
        require(success, "CREATE2 deployment failed");

        // Verify deployment
        require(expectedAddress.code.length > 0, "Factory not deployed at expected address");

        console2.log("");
        console2.log("SUCCESS! Factory deployed at:", expectedAddress);

        vm.stopBroadcast();
    }

    /// @notice Compute the CREATE2 address without deploying
    function _computeAddress(bytes32 salt, bytes32 bytecodeHash, address deployer)
        internal
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, bytecodeHash)))));
    }
}

/// @title ComputeFactoryAddress
/// @notice Compute the deterministic factory address without deploying
/// @dev Useful for updating Ponder config or verifying addresses
contract ComputeFactoryAddress is Script {
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 constant FACTORY_SALT = keccak256("tally-vesting-factory-v1");

    function run() external view {
        bytes memory bytecode = type(MerkleVestingFactory).creationCode;
        bytes32 bytecodeHash = keccak256(bytecode);

        address factoryAddress = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, FACTORY_SALT, bytecodeHash))))
        );

        console2.log("=== Deterministic Factory Address ===");
        console2.log("");
        console2.log("CREATE2 Deployer:", CREATE2_DEPLOYER);
        console2.log("Salt:", vm.toString(FACTORY_SALT));
        console2.log("Bytecode Hash:", vm.toString(bytecodeHash));
        console2.log("");
        console2.log("Factory Address:", factoryAddress);
        console2.log("");
        console2.log("This address will be the same on ALL EVM chains:");
        console2.log("  - Mainnet, Arbitrum, Base, Optimism, Sepolia, etc.");
        console2.log("");
        console2.log("Use this address in ponder.config.ts:");
        console2.log("  address:", vm.toString(abi.encodePacked(factoryAddress)));
    }
}

/// @title DeployAndSeed
/// @notice Deploy factory deterministically and seed with test data (for Anvil)
/// @dev Combines deterministic deployment with seeding for local development
contract DeployAndSeed is Script {
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 constant FACTORY_SALT = keccak256("tally-vesting-factory-v1");

    function run() external {
        // First, ensure CREATE2 deployer exists (it should on Anvil)
        if (CREATE2_DEPLOYER.code.length == 0) {
            console2.log("CREATE2 deployer not found. Deploying it first...");
            _deployCreate2Deployer();
        }

        // Compute expected factory address
        bytes memory bytecode = type(MerkleVestingFactory).creationCode;
        bytes32 bytecodeHash = keccak256(bytecode);
        address factoryAddress = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, FACTORY_SALT, bytecodeHash))))
        );

        console2.log("=== Deploy and Seed ===");
        console2.log("Expected Factory Address:", factoryAddress);

        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)); // Anvil default key

        vm.startBroadcast(deployerPrivateKey);

        // Deploy factory if not already deployed
        if (factoryAddress.code.length == 0) {
            bytes memory payload = abi.encodePacked(FACTORY_SALT, bytecode);
            (bool success,) = CREATE2_DEPLOYER.call(payload);
            require(success, "CREATE2 deployment failed");
            console2.log("Factory deployed!");
        } else {
            console2.log("Factory already deployed, skipping...");
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("Factory Address:", factoryAddress);
        console2.log("");
        console2.log("Next: Run the Seed script to create test vesting campaigns");
        console2.log("  forge script script/Seed.s.sol:Seed --rpc-url http://localhost:8545 --broadcast");
    }

    /// @notice Deploy the CREATE2 deployer on Anvil (it's not there by default)
    function _deployCreate2Deployer() internal {
        // The CREATE2 deployer bytecode
        bytes
            memory deployerBytecode = hex"604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

        // Deploy using the pre-signed transaction method
        // First fund the deployer address
        address deployer = 0x3fAB184622Dc19b6109349B94811493BF2a45362;
        vm.deal(deployer, 1 ether);

        // Broadcast the raw signed transaction
        // This is the pre-signed transaction that deploys the CREATE2 deployer
        bytes memory rawTx =
            hex"f8a58085174876e800830186a08080b853604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf31ba02222222222222222222222222222222222222222222222222222222222222222a02222222222222222222222222222222222222222222222222222222222222222";

        (bool success,) = address(0).call(rawTx);
        require(success || CREATE2_DEPLOYER.code.length > 0, "Failed to deploy CREATE2 deployer");
    }
}
