// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MerkleVestingFactory} from "../src/MerkleVestingFactory.sol";
import {IMerkleVestingDeployer} from "../src/interfaces/IMerkleVestingDeployer.sol";
import {MerkleTreeHelper} from "./helpers/MerkleTreeHelper.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {VestingWalletFeeWrapper} from "../src/VestingWalletFeeWrapper.sol";

/// @notice Mock ERC20 for testing
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title IntegrationTest
/// @notice End-to-end integration tests for the Tally Vesting system
contract IntegrationTest is Test {
    using MerkleTreeHelper for MerkleTreeHelper.Allocation[];

    MerkleVestingFactory public factory;
    MockERC20 public token;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public carol = makeAddr("carol");
    address public dave = makeAddr("dave"); // Does not claim
    address public treasury = makeAddr("treasury");
    address public feeRecipient = makeAddr("feeRecipient");

    uint256 public constant ALICE_AMOUNT = 1000 ether;
    uint256 public constant BOB_AMOUNT = 2000 ether;
    uint256 public constant CAROL_AMOUNT = 500 ether;
    uint256 public constant DAVE_AMOUNT = 100 ether;
    uint256 public constant TOTAL_ALLOCATION = ALICE_AMOUNT + BOB_AMOUNT + CAROL_AMOUNT + DAVE_AMOUNT;

    uint64 public vestingStart;
    uint64 public constant VESTING_DURATION = 365 days;
    uint64 public constant CLIFF_DURATION = 90 days;
    uint64 public claimDeadline;

    bytes32 public merkleRoot;
    bytes32[] public leaves;

    uint16 public constant PLATFORM_FEE_BPS = 500;

    function setUp() public {
        factory = new MerkleVestingFactory();
        token = new MockERC20();

        vestingStart = uint64(block.timestamp) + 1 days; // Starts tomorrow
        claimDeadline = vestingStart + VESTING_DURATION + 60 days;

        // Build merkle tree
        MerkleTreeHelper.Allocation[] memory allocations = new MerkleTreeHelper.Allocation[](4);
        allocations[0] = MerkleTreeHelper.Allocation({beneficiary: alice, amount: ALICE_AMOUNT});
        allocations[1] = MerkleTreeHelper.Allocation({beneficiary: bob, amount: BOB_AMOUNT});
        allocations[2] = MerkleTreeHelper.Allocation({beneficiary: carol, amount: CAROL_AMOUNT});
        allocations[3] = MerkleTreeHelper.Allocation({beneficiary: dave, amount: DAVE_AMOUNT});

        (merkleRoot, leaves) = allocations.buildTree();
    }

    function test_endToEndFlow() public {
        // 1. Factory deploys MerkleVestingDeployer
        bytes32 salt = keccak256("test_salt");
        address deployerAddr = factory.deploy(
            address(token),
            merkleRoot,
            vestingStart,
            VESTING_DURATION,
            CLIFF_DURATION,
            claimDeadline,
            feeRecipient,
            PLATFORM_FEE_BPS,
            salt
        );
        IMerkleVestingDeployer deployer = IMerkleVestingDeployer(deployerAddr);

        // Fund the deployer
        token.mint(address(deployer), TOTAL_ALLOCATION);

        // 2. Alice claims (Self Claim)
        bytes32[] memory aliceProof = MerkleTreeHelper.getProof(leaves, 0);
        vm.prank(alice);
        address aliceWallet = deployer.claim(aliceProof, ALICE_AMOUNT);
        assertTrue(aliceWallet != address(0));
        address aliceUnderlying = VestingWalletFeeWrapper(payable(aliceWallet)).vestingWallet();
        assertEq(token.balanceOf(aliceUnderlying), ALICE_AMOUNT);

        // 3. Bob claims for Carol (Relayer Claim)
        bytes32[] memory carolProof = MerkleTreeHelper.getProof(leaves, 2);
        vm.prank(bob);
        address carolWallet = deployer.claimFor(carol, carolProof, CAROL_AMOUNT);
        assertTrue(carolWallet != address(0));
        address carolUnderlying = VestingWalletFeeWrapper(payable(carolWallet)).vestingWallet();
        assertEq(token.balanceOf(carolUnderlying), CAROL_AMOUNT);

        // 4. Bob claims for himself
        bytes32[] memory bobProof = MerkleTreeHelper.getProof(leaves, 1);
        vm.prank(bob);
        address bobWallet = deployer.claim(bobProof, BOB_AMOUNT);
        assertTrue(bobWallet != address(0));

        // Dave does NOT claim

        // 5. Check vesting
        // Move to inside cliff (no vesting yet)
        vm.warp(vestingStart + CLIFF_DURATION / 2);
        assertEq(
            VestingWalletFeeWrapper(payable(aliceWallet)).vestedAmount(address(token), uint64(block.timestamp)), 0
        );

        // Move to just past cliff
        vm.warp(vestingStart + CLIFF_DURATION + 1);
        uint256 vested =
            VestingWalletFeeWrapper(payable(aliceWallet)).vestedAmount(address(token), uint64(block.timestamp));
        assertTrue(vested > 0);
        assertTrue(vested < ALICE_AMOUNT);

        // Release some tokens for Alice
        vm.prank(alice);
        VestingWalletFeeWrapper(payable(aliceWallet)).release(address(token));
        uint256 aliceFee = vested * PLATFORM_FEE_BPS / 10_000;
        assertEq(token.balanceOf(alice), vested - aliceFee);
        assertEq(token.balanceOf(feeRecipient), aliceFee);

        // Move to end of vesting
        vm.warp(vestingStart + VESTING_DURATION);

        // Release all for Carol
        vm.prank(carol);
        VestingWalletFeeWrapper(payable(carolWallet)).release(address(token));
        uint256 carolFee = CAROL_AMOUNT * PLATFORM_FEE_BPS / 10_000;
        assertEq(token.balanceOf(carol), CAROL_AMOUNT - carolFee);
        assertEq(token.balanceOf(feeRecipient), aliceFee + carolFee);

        // 6. Sweep unclaimed tokens (Dave's portion)
        // Try sweep before deadline (should fail)
        vm.expectRevert(IMerkleVestingDeployer.ClaimDeadlineNotPassed.selector);
        deployer.sweep(treasury);

        // Move past deadline
        vm.warp(claimDeadline + 1);

        // Sweep
        deployer.sweep(treasury);
        assertEq(token.balanceOf(treasury), DAVE_AMOUNT);

        // Ensure deployer is empty
        assertEq(token.balanceOf(address(deployer)), 0);
    }
}
