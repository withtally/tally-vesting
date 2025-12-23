// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IMerkleVestingDeployer} from "../src/interfaces/IMerkleVestingDeployer.sol";
import {MerkleVestingDeployer} from "../src/MerkleVestingDeployer.sol";
import {MerkleTreeHelper} from "./helpers/MerkleTreeHelper.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

/// @notice Mock ERC20 for testing
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title MerkleVestingDeployerTest
/// @notice Unit tests for MerkleVestingDeployer
contract MerkleVestingDeployerTest is Test {
    using MerkleTreeHelper for MerkleTreeHelper.Allocation[];

    // Test contracts
    IMerkleVestingDeployer public deployer;
    MockERC20 public token;

    // Test data
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");
    address public treasury = makeAddr("treasury");

    uint256 public constant ALICE_AMOUNT = 1000 ether;
    uint256 public constant BOB_AMOUNT = 2000 ether;
    uint256 public constant CAROL_AMOUNT = 500 ether;
    uint256 public constant TOTAL_ALLOCATION = ALICE_AMOUNT + BOB_AMOUNT + CAROL_AMOUNT;

    // Vesting params
    uint64 public vestingStart;
    uint64 public constant VESTING_DURATION = 365 days;
    uint64 public constant CLIFF_DURATION = 90 days;
    uint64 public claimDeadline;

    // Merkle data
    bytes32 public merkleRoot;
    bytes32[] public leaves;

    function setUp() public {
        // Deploy mock token
        token = new MockERC20();

        // Set up timing
        vestingStart = uint64(block.timestamp);
        claimDeadline = vestingStart + VESTING_DURATION + 180 days; // 6 months after vesting ends

        // Build merkle tree
        MerkleTreeHelper.Allocation[] memory allocations = new MerkleTreeHelper.Allocation[](3);
        allocations[0] = MerkleTreeHelper.Allocation({beneficiary: alice, amount: ALICE_AMOUNT});
        allocations[1] = MerkleTreeHelper.Allocation({beneficiary: bob, amount: BOB_AMOUNT});
        allocations[2] = MerkleTreeHelper.Allocation({beneficiary: carol, amount: CAROL_AMOUNT});

        (merkleRoot, leaves) = allocations.buildTree();

        // Deploy MerkleVestingDeployer and fund it
        deployer = new MerkleVestingDeployer(
            address(token), merkleRoot, vestingStart, VESTING_DURATION, CLIFF_DURATION, claimDeadline
        );
        token.mint(address(deployer), TOTAL_ALLOCATION);
    }

    // ============ Constructor Tests ============

    function test_constructorRevertsOnZeroMerkleRoot() public {
        vm.expectRevert(IMerkleVestingDeployer.ZeroMerkleRoot.selector);
        new MerkleVestingDeployer(
            address(token), bytes32(0), vestingStart, VESTING_DURATION, CLIFF_DURATION, claimDeadline
        );
    }

    function test_constructorRevertsOnZeroVestingDuration() public {
        vm.expectRevert(IMerkleVestingDeployer.ZeroVestingDuration.selector);
        new MerkleVestingDeployer(address(token), merkleRoot, vestingStart, 0, CLIFF_DURATION, claimDeadline);
    }

    function test_constructorRevertsOnCliffExceedsDuration() public {
        vm.expectRevert(IMerkleVestingDeployer.CliffExceedsDuration.selector);
        new MerkleVestingDeployer(
            address(token), merkleRoot, vestingStart, VESTING_DURATION, VESTING_DURATION + 1, claimDeadline
        );
    }

    function test_constructorRevertsOnInvalidClaimDeadline() public {
        // Deadline must be >= vestingStart + vestingDuration
        uint64 invalidDeadline = vestingStart + VESTING_DURATION - 1;

        vm.expectRevert(IMerkleVestingDeployer.InvalidClaimDeadline.selector);
        new MerkleVestingDeployer(
            address(token), merkleRoot, vestingStart, VESTING_DURATION, CLIFF_DURATION, invalidDeadline
        );
    }

    // ============ Merkle Tree Helper Tests ============

    function test_merkleLeafGeneration() public pure {
        address beneficiary = address(0x1234);
        uint256 amount = 1000 ether;

        bytes32 leaf = MerkleTreeHelper.getLeaf(beneficiary, amount);

        // Verify it matches expected encoding
        bytes32 expected = keccak256(abi.encodePacked(beneficiary, amount));
        assertEq(leaf, expected);
    }

    function test_merkleRootGeneration() public view {
        // Root should be deterministic
        assertNotEq(merkleRoot, bytes32(0));

        // Leaves should be correct count
        assertEq(leaves.length, 3);

        console2.log("Merkle Root:", uint256(merkleRoot));
    }

    function test_merkleProofGeneration() public view {
        // Get proof for alice (index 0)
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);

        // Proof should have elements (log2 of leaf count, rounded up)
        assertTrue(proof.length > 0);

        console2.log("Proof length for alice:", proof.length);
    }

    function test_merkleProofVerification() public view {
        // Get proof for alice
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);
        bytes32 aliceLeaf = MerkleTreeHelper.getLeaf(alice, ALICE_AMOUNT);

        // Manually verify the proof leads to root
        bytes32 computedHash = aliceLeaf;
        for (uint256 i = 0; i < proof.length; i++) {
            computedHash = MerkleTreeHelper.hashPair(computedHash, proof[i]);
        }

        assertEq(computedHash, merkleRoot);
    }

    // ============ Claim Tests ============

    function test_claimDeploysVestingWallet() public {
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);

        vm.prank(alice);
        address wallet = deployer.claim(proof, ALICE_AMOUNT);

        // Wallet should be deployed
        assertTrue(wallet.code.length > 0);

        // Alice should be marked as claimed
        assertTrue(deployer.hasClaimed(alice));
    }

    function test_claimWithInvalidProofReverts() public {
        bytes32[] memory fakeProof = new bytes32[](1);
        fakeProof[0] = bytes32(uint256(1));

        vm.prank(alice);
        vm.expectRevert(IMerkleVestingDeployer.InvalidProof.selector);
        deployer.claim(fakeProof, ALICE_AMOUNT);
    }

    function test_doubleClaimReverts() public {
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);

        vm.startPrank(alice);
        deployer.claim(proof, ALICE_AMOUNT);

        vm.expectRevert(IMerkleVestingDeployer.AlreadyClaimed.selector);
        deployer.claim(proof, ALICE_AMOUNT);
        vm.stopPrank();
    }

    function test_claimAfterDeadlineReverts() public {
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);

        // Warp past deadline
        vm.warp(claimDeadline + 1);

        vm.prank(alice);
        vm.expectRevert(IMerkleVestingDeployer.ClaimDeadlinePassed.selector);
        deployer.claim(proof, ALICE_AMOUNT);
    }

    function test_sweepBeforeDeadlineReverts() public {
        vm.expectRevert(IMerkleVestingDeployer.ClaimDeadlineNotPassed.selector);
        deployer.sweep(treasury);
    }

    function test_sweepAfterDeadline() public {
        // Warp past deadline
        vm.warp(claimDeadline + 1);

        uint256 balanceBefore = token.balanceOf(treasury);
        deployer.sweep(treasury);
        uint256 balanceAfter = token.balanceOf(treasury);

        assertEq(balanceAfter - balanceBefore, TOTAL_ALLOCATION);
    }

    function test_sweepPermissionless() public {
        // Warp past deadline
        vm.warp(claimDeadline + 1);

        address randomUser = makeAddr("randomUser");
        uint256 balanceBefore = token.balanceOf(treasury);

        // Call sweep as a random user
        vm.prank(randomUser);
        deployer.sweep(treasury);

        uint256 balanceAfter = token.balanceOf(treasury);
        assertEq(balanceAfter - balanceBefore, TOTAL_ALLOCATION);
    }

    function test_getVestingWalletIsDeterministic() public view {
        address predicted = deployer.getVestingWallet(alice);

        // Address should be non-zero and deterministic
        assertTrue(predicted != address(0));
        assertEq(predicted, deployer.getVestingWallet(alice)); // Same result
    }

    function test_vestingScheduleIsCorrect() public {
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);

        vm.prank(alice);
        address wallet = deployer.claim(proof, ALICE_AMOUNT);

        // Check wallet has tokens
        assertEq(token.balanceOf(wallet), ALICE_AMOUNT);

        // Nothing vested before cliff
        vm.warp(vestingStart + CLIFF_DURATION - 1);
        // VestingWallet would return 0 vested here

        // After full duration, all tokens vested
        vm.warp(vestingStart + VESTING_DURATION);
        // VestingWallet would return ALICE_AMOUNT vested here
    }

    function test_claimForDeploysVestingWalletForBeneficiary() public {
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);

        vm.prank(bob);
        address wallet = deployer.claimFor(alice, proof, ALICE_AMOUNT);

        // Wallet should be deployed
        assertTrue(wallet.code.length > 0);

        // Alice should be marked as claimed
        assertTrue(deployer.hasClaimed(alice));
        assertFalse(deployer.hasClaimed(bob));

        // Address should match predicted
        assertEq(wallet, deployer.getVestingWallet(alice));
    }

    function test_claimForRevertsWithZeroAddressBeneficiary() public {
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);

        vm.expectRevert(IMerkleVestingDeployer.ZeroAddress.selector);
        deployer.claimFor(address(0), proof, ALICE_AMOUNT);
    }

    function test_claimForRevertsWithInvalidProof() public {
        bytes32[] memory wrongProof = MerkleTreeHelper.getProof(leaves, 1);

        vm.prank(bob);
        vm.expectRevert(IMerkleVestingDeployer.InvalidProof.selector);
        deployer.claimFor(alice, wrongProof, ALICE_AMOUNT);
    }

    // ============ Fuzz Tests ============

    function testFuzz_vestingSchedule(uint64 timestamp) public {
        // Bound timestamp to reasonable range to avoid overflow/underflow in test logic
        // but covering all phases: before start, before cliff, inside vesting, after vesting
        uint64 lowerBound = vestingStart > 100 days ? vestingStart - 100 days : 0;
        timestamp = uint64(bound(timestamp, lowerBound, vestingStart + VESTING_DURATION + 100 days));

        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);
        vm.prank(alice);
        address wallet = deployer.claim(proof, ALICE_AMOUNT);

        vm.warp(timestamp);
        uint256 vested = VestingWallet(payable(wallet)).vestedAmount(address(token), timestamp);

        if (timestamp < vestingStart + CLIFF_DURATION) {
            assertEq(vested, 0, "Should be 0 before cliff");
        } else if (timestamp >= vestingStart + VESTING_DURATION) {
            assertEq(vested, ALICE_AMOUNT, "Should be full amount after duration");
        } else {
            // Linear vesting
            // OpenZeppelin VestingWallet linear formula: totalAllocation * (timestamp - start) / duration
            uint256 expected = ALICE_AMOUNT * (timestamp - vestingStart) / VESTING_DURATION;
            assertEq(vested, expected, "Should match linear vesting");
        }
    }

    function testFuzz_claimWithInvalidProof(bytes32 fakeElement, uint256 index) public {
        // Ensure we don't accidentally generate a valid proof element (extremely unlikely)
        vm.assume(fakeElement != bytes32(0));

        // Modifying the proof
        bytes32[] memory proof = MerkleTreeHelper.getProof(leaves, 0);

        // Ensure proof has length to avoid underflow
        vm.assume(proof.length > 0);

        // Bound index to proof length
        index = bound(index, 0, proof.length - 1);

        // Tamper with proof
        proof[index] = fakeElement;

        vm.prank(alice);
        vm.expectRevert(IMerkleVestingDeployer.InvalidProof.selector);
        deployer.claim(proof, ALICE_AMOUNT);
    }
}
