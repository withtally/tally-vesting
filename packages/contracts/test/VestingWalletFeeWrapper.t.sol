// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {VestingWalletFeeWrapper} from "../src/VestingWalletFeeWrapper.sol";

/// @notice Mock ERC20 for testing
contract MockERC20FeeWrapper is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title VestingWalletFeeWrapperTest
/// @notice Unit tests for VestingWalletFeeWrapper
contract VestingWalletFeeWrapperTest is Test {
    MockERC20FeeWrapper public token;

    address public beneficiary = makeAddr("beneficiary");
    address public feeRecipient = makeAddr("feeRecipient");
    address public frontEndRecipient = makeAddr("frontEnd");

    uint64 public constant VESTING_DURATION = 365 days;

    function setUp() public {
        token = new MockERC20FeeWrapper();
    }

    function test_releaseSplitsFeeToRecipient() public {
        uint64 vestingStart = uint64(block.timestamp);
        uint16 feeBps = 500; // 5%

        VestingWalletFeeWrapper wrapper = new VestingWalletFeeWrapper(
            beneficiary,
            address(token),
            vestingStart,
            VESTING_DURATION,
            0,
            feeRecipient,
            feeBps,
            address(0),
            0
        );

        uint256 amount = 1000 ether;
        token.mint(wrapper.vestingWallet(), amount);

        vm.warp(vestingStart + VESTING_DURATION);
        wrapper.release(address(token));

        uint256 expectedFee = amount * feeBps / 10_000;
        assertEq(token.balanceOf(feeRecipient), expectedFee);
        assertEq(token.balanceOf(beneficiary), amount - expectedFee);
        assertEq(token.balanceOf(address(wrapper)), 0);
    }

    function test_releaseWithoutFeeSendsAllToBeneficiary() public {
        uint64 vestingStart = uint64(block.timestamp);

        VestingWalletFeeWrapper wrapper = new VestingWalletFeeWrapper(
            beneficiary,
            address(token),
            vestingStart,
            VESTING_DURATION,
            0,
            address(0),
            0,
            address(0),
            0
        );

        uint256 amount = 500 ether;
        token.mint(wrapper.vestingWallet(), amount);

        vm.warp(vestingStart + VESTING_DURATION);
        wrapper.release(address(token));

        assertEq(token.balanceOf(beneficiary), amount);
        assertEq(token.balanceOf(address(wrapper)), 0);
    }

    function test_constructorRevertsWhenFeeRecipientMissing() public {
        uint64 vestingStart = uint64(block.timestamp);

        vm.expectRevert(VestingWalletFeeWrapper.InvalidPlatformFee.selector);
        new VestingWalletFeeWrapper(
            beneficiary,
            address(token),
            vestingStart,
            VESTING_DURATION,
            0,
            address(0),
            1,
            address(0),
            0
        );
    }

    function test_constructorRevertsWhenFeeBpsTooHigh() public {
        uint64 vestingStart = uint64(block.timestamp);

        vm.expectRevert(VestingWalletFeeWrapper.InvalidPlatformFee.selector);
        new VestingWalletFeeWrapper(
            beneficiary,
            address(token),
            vestingStart,
            VESTING_DURATION,
            0,
            feeRecipient,
            10_001,
            address(0),
            0
        );
    }

    function test_releaseAllocatesFrontEndShare() public {
        uint64 vestingStart = uint64(block.timestamp);
        uint16 platformFeeBps = 500; // 5%
        uint16 frontEndFeeBps = 200; // 2%

        VestingWalletFeeWrapper wrapper = new VestingWalletFeeWrapper(
            beneficiary,
            address(token),
            vestingStart,
            VESTING_DURATION,
            0,
            feeRecipient,
            platformFeeBps,
            frontEndRecipient,
            frontEndFeeBps
        );

        uint256 amount = 1000 ether;
        token.mint(wrapper.vestingWallet(), amount);

        vm.warp(vestingStart + VESTING_DURATION);
        wrapper.release(address(token));

        uint256 totalFee = (amount * platformFeeBps) / 10_000;
        uint256 expectedFrontEnd = (amount * frontEndFeeBps) / 10_000;
        uint256 expectedPlatform = totalFee - expectedFrontEnd;

        assertEq(token.balanceOf(frontEndRecipient), expectedFrontEnd);
        assertEq(token.balanceOf(feeRecipient), expectedPlatform);
        assertEq(token.balanceOf(beneficiary), amount - totalFee);
        assertEq(token.balanceOf(address(wrapper)), 0);
    }
}
