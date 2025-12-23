// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MerkleVestingFactory} from "../src/MerkleVestingFactory.sol";
import {IMerkleVestingDeployer} from "../src/interfaces/IMerkleVestingDeployer.sol";
import {SeedHelper} from "./helpers/SeedHelper.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mock ERC20 for seeding
contract MockToken is ERC20 {
    constructor() ERC20("Vesting Token", "VEST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title Seed
/// @notice Seeds local Anvil with test vesting data for indexer development
contract Seed is Script {
    using SeedHelper for SeedHelper.Allocation[];

    // Vesting parameters
    uint64 public constant VESTING_DURATION = 365 days;
    uint64 public constant CLIFF_DURATION = 90 days;

    // Test user amounts
    uint256[] public amounts;

    function setUp() public {
        // 10 test users with varying amounts
        amounts.push(1000 ether); // user 1
        amounts.push(2000 ether); // user 2
        amounts.push(500 ether); // user 3
        amounts.push(1500 ether); // user 4
        amounts.push(3000 ether); // user 5
        amounts.push(750 ether); // user 6
        amounts.push(2500 ether); // user 7
        amounts.push(1000 ether); // user 8
        amounts.push(4000 ether); // user 9
        amounts.push(500 ether); // user 10
    }

    function run() external {
        // Use first Anvil account as deployer
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockToken
        MockToken token = new MockToken();
        console2.log("Token deployed at:", address(token));

        // 2. Deploy MerkleVestingFactory
        MerkleVestingFactory factory = new MerkleVestingFactory();
        console2.log("Factory deployed at:", address(factory));

        // 3. Build allocations for 10 test users
        SeedHelper.Allocation[] memory allocations = new SeedHelper.Allocation[](10);
        uint256 totalAllocation = 0;

        for (uint256 i = 0; i < 10; i++) {
            address beneficiary = vm.addr(i + 1); // Users 1-10
            allocations[i] = SeedHelper.Allocation({beneficiary: beneficiary, amount: amounts[i]});
            totalAllocation += amounts[i];
        }

        // 4. Build merkle tree
        (bytes32 merkleRoot, bytes32[] memory leaves) = allocations.buildTree();
        console2.log("Merkle root:", uint256(merkleRoot));

        // 5. Deploy MerkleVestingDeployer via factory
        uint64 vestingStart = uint64(block.timestamp);
        uint64 claimDeadline = vestingStart + VESTING_DURATION + 180 days;

        address vestingDeployer = factory.deploy(
            address(token), merkleRoot, vestingStart, VESTING_DURATION, CLIFF_DURATION, claimDeadline, bytes32("seed")
        );
        console2.log("MerkleVestingDeployer deployed at:", vestingDeployer);

        // 6. Mint tokens to deployer
        token.mint(vestingDeployer, totalAllocation);
        console2.log("Minted", totalAllocation / 1e18, "tokens to deployer");

        // 7. Fund test users with ETH for gas (using deployer funds)
        for (uint256 i = 0; i < 6; i++) {
            address user = vm.addr(i + 1);
            payable(user).transfer(1 ether);
        }
        console2.log("Funded users 1-6 with 1 ETH each");

        vm.stopBroadcast();

        // 8. Execute claims for users 1-6 (using their private keys)
        IMerkleVestingDeployer vesting = IMerkleVestingDeployer(vestingDeployer);

        for (uint256 i = 0; i < 6; i++) {
            uint256 userPrivateKey = i + 1;
            bytes32[] memory proof = SeedHelper.getProof(leaves, i);

            vm.broadcast(userPrivateKey);
            address wallet = vesting.claim(proof, amounts[i]);

            console2.log("User", i + 1, "claimed. Wallet:", wallet);
        }

        // 9. Output JSON for indexer
        _outputJson(address(token), address(factory), vestingDeployer, vestingStart, merkleRoot, allocations, leaves);
    }

    function _outputJson(
        address token,
        address factory,
        address vestingDeployer,
        uint64 vestingStart,
        bytes32 merkleRoot,
        SeedHelper.Allocation[] memory allocations,
        bytes32[] memory leaves
    ) internal view {
        console2.log("");
        console2.log("=== SEED DATA JSON ===");
        console2.log("{");
        console2.log('  "chainId": 31337,');
        console2.log('  "contracts": {');
        console2.log('    "token": "%s",', vm.toString(token));
        console2.log('    "factory": "%s",', vm.toString(factory));
        console2.log('    "deployer": "%s"', vm.toString(vestingDeployer));
        console2.log("  },");
        console2.log('  "vestingParams": {');
        console2.log('    "vestingStart": %d,', vestingStart);
        console2.log('    "vestingDuration": %d,', VESTING_DURATION);
        console2.log('    "cliffDuration": %d,', CLIFF_DURATION);
        console2.log('    "claimDeadline": %d,', vestingStart + VESTING_DURATION + 180 days);
        console2.log('    "merkleRoot": "%s"', vm.toString(merkleRoot));
        console2.log("  },");
        console2.log('  "allocations": [');

        IMerkleVestingDeployer vesting = IMerkleVestingDeployer(vestingDeployer);

        for (uint256 i = 0; i < allocations.length; i++) {
            address beneficiary = allocations[i].beneficiary;
            uint256 amount = allocations[i].amount;
            bool claimed = vesting.hasClaimed(beneficiary);
            address wallet = vesting.getVestingWallet(beneficiary);
            bytes32[] memory proof = SeedHelper.getProof(leaves, i);

            console2.log("    {");
            console2.log('      "index": %d,', i);
            console2.log('      "beneficiary": "%s",', vm.toString(beneficiary));
            console2.log('      "amount": "%d",', amount);
            console2.log('      "claimed": %s,', claimed ? "true" : "false");
            console2.log('      "wallet": "%s",', vm.toString(wallet));
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
        console2.log("=== END SEED DATA ===");
    }
}
