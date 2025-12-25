// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MerkleVestingFactory} from "../src/MerkleVestingFactory.sol";
import {IMerkleVestingDeployer} from "../src/interfaces/IMerkleVestingDeployer.sol";
import {SeedHelper} from "./helpers/SeedHelper.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {VestingWalletFeeWrapper} from "../src/VestingWalletFeeWrapper.sol";

/// @notice Mock ERC20 for seeding
contract MockToken is ERC20 {
    constructor() ERC20("Vesting Token", "VEST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SeedWithFee is Script {
    using SeedHelper for SeedHelper.Allocation[];
    MockToken public tokenInstance;

    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 constant FACTORY_SALT = keccak256("tally-vesting-factory-v1");
    address constant DETERMINISTIC_FACTORY = 0x6B51bD91c3FF15e34C56D62F7c77892DE7bA3786;
    address constant PLATFORM_FEE_RECIPIENT = 0xFd8Fa0dD1FB34b47138BF04EA89d38462A828A46;
    uint16 constant PLATFORM_FEE_BPS = 250;
    address constant FRONTEND_FEE_RECIPIENT = 0xC6FF3d41E94379Fae0614D1d805C5e3DBa4f3cD6;
    uint16 constant FRONTEND_FEE_BPS = 100;

    uint256[] public amounts;
    SeedHelper.Allocation[] private _loggedAllocations;
    bytes32[] private _loggedLeaves;
    address[] private _loggedWallets;

    function setUp() public {
        amounts.push(500 ether);
        amounts.push(1000 ether);
        amounts.push(1500 ether);
        amounts.push(2000 ether);
        amounts.push(2500 ether);
        amounts.push(3000 ether);
    }

    function run() external {
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

        for (uint256 i = 0; i < 6; i++) {
            vm.deal(vm.addr(i + 1), 10 ether);
        }

        vm.startBroadcast(deployerPrivateKey);

        MockToken token = new MockToken();
        tokenInstance = token;
        address tokenAddress = address(token);

        if (CREATE2_DEPLOYER.code.length == 0) {
            vm.etch(CREATE2_DEPLOYER, hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3");
        }

        address factoryAddress;
        if (DETERMINISTIC_FACTORY.code.length == 0) {
            bytes memory bytecode = type(MerkleVestingFactory).creationCode;
            bytes memory payload = abi.encodePacked(FACTORY_SALT, bytecode);
            (bool success,) = CREATE2_DEPLOYER.call(payload);
            require(success, "CREATE2 deployment failed");
            vm.etch(DETERMINISTIC_FACTORY, type(MerkleVestingFactory).runtimeCode);
            factoryAddress = DETERMINISTIC_FACTORY;
        } else {
            factoryAddress = DETERMINISTIC_FACTORY;
        }

        MerkleVestingFactory factory = MerkleVestingFactory(factoryAddress);

        SeedHelper.Allocation[] memory allocations = new SeedHelper.Allocation[](6);
        uint256 totalAllocation = 0;

        for (uint256 i = 0; i < 6; i++) {
            address beneficiary = vm.addr(i + 1);
            allocations[i] = SeedHelper.Allocation({beneficiary: beneficiary, amount: amounts[i]});
            totalAllocation += amounts[i];
        }

        (bytes32 merkleRoot, bytes32[] memory leaves) = allocations.buildTree();

        uint64 vestingStart = uint64(block.timestamp);
        uint64 vestingDuration = 365 days;
        uint64 cliffDuration = 90 days;
        uint64 claimDeadline = vestingStart + vestingDuration + 180 days;

        address vestingDeployer = factory.deploy(
            tokenAddress,
            merkleRoot,
            vestingStart,
            vestingDuration,
            cliffDuration,
            claimDeadline,
            PLATFORM_FEE_RECIPIENT,
            PLATFORM_FEE_BPS,
            bytes32("fee-seed")
        );

        token.mint(vestingDeployer, totalAllocation);

        for (uint256 i = 0; i < 6; i++) {
            vm.deal(vm.addr(i + 1), 10 ether);
        }

        IMerkleVestingDeployer vesting = IMerkleVestingDeployer(vestingDeployer);

        address[] memory wallets = new address[](6);
        vm.stopBroadcast();

        for (uint256 i = 0; i < 6; i++) {
            uint256 userKey = i + 1;
            bytes32[] memory proof = SeedHelper.getProof(leaves, i);

            vm.deal(vm.addr(userKey), 10 ether);
            vm.broadcast(userKey);
            if (i == 0) {
                wallets[i] = vesting.claim(proof, amounts[i], FRONTEND_FEE_RECIPIENT, FRONTEND_FEE_BPS);
            } else {
                wallets[i] = vesting.claim(proof, amounts[i]);
            }
        }

        for (uint256 i = 0; i < 6; i++) {
            vm.deal(vm.addr(i + 1), 10 ether);
        }

        vm.warp(vestingStart + vestingDuration);

        for (uint256 i = 0; i < 3; i++) {
            uint256 userKey = i + 1;
            vm.deal(vm.addr(userKey), 10 ether);
            vm.broadcast(userKey);
            _releaseFromWrapper(wallets[i]);
        }

        _cacheSeedData(allocations, leaves, wallets);
        _logSeedData(
            factoryAddress,
            vestingDeployer,
            vestingStart,
            vestingDuration,
            cliffDuration,
            claimDeadline,
            merkleRoot
        );
    }

    function _releaseFromWrapper(address wallet) internal {
        VestingWalletFeeWrapper(payable(wallet)).release(address(tokenInstance));
    }

    function _cacheSeedData(
        SeedHelper.Allocation[] memory allocations,
        bytes32[] memory leaves,
        address[] memory wallets
    ) internal {
        delete _loggedAllocations;
        delete _loggedLeaves;
        delete _loggedWallets;

        for (uint256 i = 0; i < allocations.length; i++) {
            _loggedAllocations.push(allocations[i]);
            _loggedLeaves.push(leaves[i]);
            _loggedWallets.push(wallets[i]);
        }
    }

    function _logSeedData(
        address factoryAddress,
        address vestingDeployer,
        uint64 vestingStart,
        uint64 vestingDuration,
        uint64 cliffDuration,
        uint64 claimDeadline,
        bytes32 merkleRoot
    ) internal view {
        console2.log("");
        console2.log("=== FEE SEED DATA ===");
        console2.log("{");
        console2.log('  "chainId": 31337,');
        console2.log('  "contracts": {');
        console2.log('    "token": "%s",', vm.toString(address(tokenInstance)));
        console2.log('    "factory": "%s",', vm.toString(factoryAddress));
        console2.log('    "deployer": "%s"', vm.toString(vestingDeployer));
        console2.log("  },");
        console2.log('  "vestingParams": {');
        console2.log('    "vestingStart": %d,', vestingStart);
        console2.log('    "vestingDuration": %d,', vestingDuration);
        console2.log('    "cliffDuration": %d,', cliffDuration);
        console2.log('    "claimDeadline": %d,', claimDeadline);
        console2.log('    "platformFeeRecipient": "%s",', vm.toString(PLATFORM_FEE_RECIPIENT));
        console2.log('    "platformFeeBps": %d,', PLATFORM_FEE_BPS);
        console2.log('    "frontEndFeeRecipient": "%s",', vm.toString(FRONTEND_FEE_RECIPIENT));
        console2.log('    "frontEndFeeBps": %d,', FRONTEND_FEE_BPS);
        console2.log('    "merkleRoot": "%s"', vm.toString(merkleRoot));
        console2.log("  },");
        console2.log('  "allocations": [');

        for (uint256 i = 0; i < _loggedAllocations.length; i++) {
            address beneficiary = _loggedAllocations[i].beneficiary;
            uint256 amount = _loggedAllocations[i].amount;
            bytes32[] memory proof = SeedHelper.getProof(_loggedLeaves, i);

            console2.log("    {");
            console2.log('      "index": %d,', i);
            console2.log('      "beneficiary": "%s",', vm.toString(beneficiary));
            console2.log('      "amount": "%d",', amount);
            console2.log('      "wallet": "%s",', vm.toString(_loggedWallets[i]));
            console2.log('      "proof": [');

            for (uint256 j = 0; j < proof.length; j++) {
                if (j < proof.length - 1) {
                    console2.log('        "%s",', vm.toString(proof[j]));
                } else {
                    console2.log('        "%s"', vm.toString(proof[j]));
                }
            }

            console2.log("      ]");

            if (i < _loggedAllocations.length - 1) {
                console2.log("    },");
            } else {
                console2.log("    }");
            }
        }

        console2.log("  ]");
        console2.log("}");
        console2.log("=== END FEE SEED DATA ===");
    }
}
