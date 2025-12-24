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

    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    bytes32 constant FACTORY_SALT = keccak256("tally-vesting-factory-v1");
    address constant DETERMINISTIC_FACTORY = 0x6B51bD91c3FF15e34C56D62F7c77892DE7bA3786;
    address constant PLATFORM_FEE_RECIPIENT = 0xFD8Fa0DD1fB34b47138bF04eA89D38462A828A46;
    uint16 constant PLATFORM_FEE_BPS = 250;

    uint256[] public amounts;

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

        vm.startBroadcast(deployerPrivateKey);

        MockToken token = new MockToken();

        if (CREATE2_DEPLOYER.code.length == 0) {
            vm.etch(CREATE2_DEPLOYER, hex"7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3");
        }

        address factoryAddress;
        if (DETERMINISTIC_FACTORY.code.length == 0) {
            bytes memory bytecode = type(MerkleVestingFactory).creationCode;
            bytes memory payload = abi.encodePacked(FACTORY_SALT, bytecode);
            (bool success,) = CREATE2_DEPLOYER.call(payload);
            require(success, "CREATE2 deployment failed");
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
            address(token),
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

        IMerkleVestingDeployer vesting = IMerkleVestingDeployer(vestingDeployer);

        address[] memory wallets = new address[](6);

        for (uint256 i = 0; i < 6; i++) {
            uint256 userKey = i + 1;
            bytes32[] memory proof = SeedHelper.getProof(leaves, i);

            vm.broadcast(userKey);
            wallets[i] = vesting.claim(proof, amounts[i]);
        }

        vm.stopBroadcast();

        vm.warp(vestingStart + vestingDuration);

        for (uint256 i = 0; i < 3; i++) {
            uint256 userKey = i + 1;
            vm.broadcast(userKey);
            VestingWalletFeeWrapper(payable(wallets[i])).release(address(token));
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== FEE SEED DATA ===");
        console2.log("{");
        console2.log('  "chainId": 31337,');
        console2.log('  "contracts": {');
        console2.log('    "token": "%s",', vm.toString(address(token)));
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
        console2.log('    "merkleRoot": "%s"', vm.toString(merkleRoot));
        console2.log("  },");
        console2.log('  "allocations": [');

        for (uint256 i = 0; i < allocations.length; i++) {
            address beneficiary = allocations[i].beneficiary;
            uint256 amount = allocations[i].amount;
            bytes32[] memory proof = SeedHelper.getProof(leaves, i);

            console2.log("    {");
            console2.log('      "index": %d,', i);
            console2.log('      "beneficiary": "%s",', vm.toString(beneficiary));
            console2.log('      "amount": "%d",', amount);
            console2.log('      "wallet": "%s",', vm.toString(wallets[i]));
            console2.log('      "proof": [');

            for (uint256 j = 0; j < proof.length; j++) {
                if (j < proof.length - 1) {
                    console2.log('        "%s",', vm.toString(proof[j]));
                } else {
                    console2.log('        "%s"', vm.toString(proof[j]));
                }
            }

            console2.log("      ]");

            if (i < allocations.length - 1) {
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
