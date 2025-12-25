// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {VestingWalletCliffConcrete} from "./VestingWalletCliffConcrete.sol";

/// @title VestingWalletFeeWrapper
/// @notice Wraps an OZ VestingWalletCliff to apply an optional platform fee on release
contract VestingWalletFeeWrapper {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error InvalidPlatformFee();
    error InvalidFrontEndFee();
    error ZeroAddress();

    // ============ Events ============

    event ERC20Released(
        address indexed token,
        uint256 amount,
        uint256 platformFeeAmount,
        address indexed platformFeeRecipient,
        uint256 frontEndFeeAmount,
        address indexed frontEndFeeRecipient
    );
    event EtherReleased(
        uint256 amount,
        uint256 platformFeeAmount,
        address indexed platformFeeRecipient,
        uint256 frontEndFeeAmount,
        address indexed frontEndFeeRecipient
    );

    // ============ Immutables ============

    address public immutable beneficiary;
    address public immutable token;
    address public immutable platformFeeRecipient;
    uint16 public immutable platformFeeBps;
    address public immutable frontEndFeeRecipient;
    uint16 public immutable frontEndFeeBps;
    VestingWalletCliffConcrete private immutable _vestingWallet;
    address public immutable vestingWallet;

    // ============ Constructor ============

    constructor(
        address beneficiary_,
        address token_,
        uint64 vestingStart,
        uint64 vestingDuration,
        uint64 cliffDuration,
        address platformFeeRecipient_,
        uint16 platformFeeBps_,
        address frontEndFeeRecipient_,
        uint16 frontEndFeeBps_
    ) {
        if (beneficiary_ == address(0) || token_ == address(0)) revert ZeroAddress();
        if (platformFeeBps_ > 10_000) revert InvalidPlatformFee();
        if (platformFeeBps_ > 0 && platformFeeRecipient_ == address(0)) revert InvalidPlatformFee();
        if (frontEndFeeBps_ > platformFeeBps_) revert InvalidFrontEndFee();
        if (frontEndFeeBps_ > 0 && frontEndFeeRecipient_ == address(0)) revert InvalidFrontEndFee();

        beneficiary = beneficiary_;
        token = token_;
        platformFeeRecipient = platformFeeRecipient_;
        platformFeeBps = platformFeeBps_;
        frontEndFeeRecipient = frontEndFeeRecipient_;
        frontEndFeeBps = frontEndFeeBps_;

        VestingWalletCliffConcrete wallet =
            new VestingWalletCliffConcrete(address(this), vestingStart, vestingDuration, cliffDuration);
        _vestingWallet = wallet;
        vestingWallet = address(wallet);
    }

    // ============ State-Changing Functions ============

    function release(address tokenAddress) external {
        uint256 balanceBefore = IERC20(tokenAddress).balanceOf(address(this));
        _vestingWallet.release(tokenAddress);
        uint256 received = IERC20(tokenAddress).balanceOf(address(this)) - balanceBefore;

        _distributeERC20(tokenAddress, received);
    }

    function release() external {
        uint256 balanceBefore = address(this).balance;
        _vestingWallet.release();
        uint256 received = address(this).balance - balanceBefore;

        _distributeEther(received);
    }

    // ============ View Functions ============

    function vestedAmount(address tokenAddress, uint64 timestamp) external view returns (uint256) {
        return _vestingWallet.vestedAmount(tokenAddress, timestamp);
    }

    function vestedAmount(uint64 timestamp) external view returns (uint256) {
        return _vestingWallet.vestedAmount(timestamp);
    }

    function releasable(address tokenAddress) external view returns (uint256) {
        return _vestingWallet.releasable(tokenAddress);
    }

    function releasable() external view returns (uint256) {
        return _vestingWallet.releasable();
    }

    function released(address tokenAddress) external view returns (uint256) {
        return _vestingWallet.released(tokenAddress);
    }

    function released() external view returns (uint256) {
        return _vestingWallet.released();
    }

    function start() external view returns (uint256) {
        return _vestingWallet.start();
    }

    function duration() external view returns (uint256) {
        return _vestingWallet.duration();
    }

    function cliff() external view returns (uint256) {
        return _vestingWallet.cliff();
    }

    // ============ Internal Functions ============

    function _distributeERC20(address tokenAddress, uint256 amount) internal {
        uint256 totalFeeAmount = _calculateFee(amount);
        uint256 frontEndFeeAmount = _calculateFrontEndFee(amount);
        uint256 platformFeeAmount = totalFeeAmount - frontEndFeeAmount;

        if (platformFeeAmount > 0) {
            IERC20(tokenAddress).safeTransfer(platformFeeRecipient, platformFeeAmount);
        }

        if (frontEndFeeAmount > 0) {
            IERC20(tokenAddress).safeTransfer(frontEndFeeRecipient, frontEndFeeAmount);
        }

        IERC20(tokenAddress).safeTransfer(beneficiary, amount - totalFeeAmount);
        emit ERC20Released(
            tokenAddress,
            amount,
            platformFeeAmount,
            platformFeeRecipient,
            frontEndFeeAmount,
            frontEndFeeRecipient
        );
    }

    function _distributeEther(uint256 amount) internal {
        uint256 totalFeeAmount = _calculateFee(amount);
        uint256 frontEndFeeAmount = _calculateFrontEndFee(amount);
        uint256 platformFeeAmount = totalFeeAmount - frontEndFeeAmount;

        if (platformFeeAmount > 0) {
            Address.sendValue(payable(platformFeeRecipient), platformFeeAmount);
        }

        if (frontEndFeeAmount > 0) {
            Address.sendValue(payable(frontEndFeeRecipient), frontEndFeeAmount);
        }

        Address.sendValue(payable(beneficiary), amount - totalFeeAmount);
        emit EtherReleased(
            amount,
            platformFeeAmount,
            platformFeeRecipient,
            frontEndFeeAmount,
            frontEndFeeRecipient
        );
    }

    function _calculateFee(uint256 amount) internal view returns (uint256) {
        if (platformFeeBps == 0) {
            return 0;
        }
        return (amount * platformFeeBps) / 10_000;
    }

    function _calculateFrontEndFee(uint256 amount) internal view returns (uint256) {
        if (frontEndFeeBps == 0) {
            return 0;
        }
        return (amount * frontEndFeeBps) / 10_000;
    }
}
