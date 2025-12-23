// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {VestingWalletCliff} from "@openzeppelin/contracts/finance/VestingWalletCliff.sol";
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

/// @title VestingWalletCliffConcrete
/// @notice Concrete implementation of VestingWalletCliff for CREATE2 deployment
/// @dev This is a minimal concrete implementation that can be deployed via CREATE2
contract VestingWalletCliffConcrete is VestingWalletCliff {
    constructor(address beneficiary, uint64 startTimestamp, uint64 durationSeconds, uint64 cliffSeconds)
        VestingWallet(beneficiary, startTimestamp, durationSeconds)
        VestingWalletCliff(cliffSeconds)
    {}
}
