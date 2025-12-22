// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IMerkleVestingDeployer } from "./interfaces/IMerkleVestingDeployer.sol";
import { VestingWalletCliffConcrete } from "./VestingWalletCliffConcrete.sol";

/// @title MerkleVestingDeployer
/// @notice Merkle-based vesting deployment using OpenZeppelin's VestingWalletCliff
/// @dev Users claim vesting allocations by providing merkle proofs
contract MerkleVestingDeployer is IMerkleVestingDeployer {
    using SafeERC20 for IERC20;

    // ============ Immutables ============

    /// @inheritdoc IMerkleVestingDeployer
    address public immutable token;

    /// @inheritdoc IMerkleVestingDeployer
    bytes32 public immutable merkleRoot;

    /// @inheritdoc IMerkleVestingDeployer
    uint64 public immutable vestingStart;

    /// @inheritdoc IMerkleVestingDeployer
    uint64 public immutable vestingDuration;

    /// @inheritdoc IMerkleVestingDeployer
    uint64 public immutable cliffDuration;

    /// @inheritdoc IMerkleVestingDeployer
    uint64 public immutable claimDeadline;

    // ============ Storage ============

    /// @dev Mapping of beneficiary => claimed status
    mapping(address => bool) private _claimed;

    // ============ Constructor ============

    constructor(
        address _token,
        bytes32 _merkleRoot,
        uint64 _vestingStart,
        uint64 _vestingDuration,
        uint64 _cliffDuration,
        uint64 _claimDeadline
    ) {
        if (_token == address(0)) revert ZeroAddress();
        if (_merkleRoot == bytes32(0)) revert ZeroAmount(); // Reusing error for zero root
        if (_vestingDuration == 0) revert ZeroAmount();
        if (_cliffDuration > _vestingDuration) revert ZeroAmount(); // Cliff can't exceed duration

        token = _token;
        merkleRoot = _merkleRoot;
        vestingStart = _vestingStart;
        vestingDuration = _vestingDuration;
        cliffDuration = _cliffDuration;
        claimDeadline = _claimDeadline;
    }

    // ============ View Functions ============

    /// @inheritdoc IMerkleVestingDeployer
    function hasClaimed(address beneficiary) external view returns (bool) {
        return _claimed[beneficiary];
    }

    /// @inheritdoc IMerkleVestingDeployer
    function getVestingWallet(address beneficiary) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(beneficiary));
        bytes memory bytecode = _getVestingWalletBytecode(beneficiary);
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    /// @inheritdoc IMerkleVestingDeployer
    function verifyProof(address beneficiary, uint256 amount, bytes32[] calldata proof)
        public
        view
        returns (bool)
    {
        bytes32 leaf = _getLeaf(beneficiary, amount);
        return MerkleProof.verify(proof, merkleRoot, leaf);
    }

    // ============ State-Changing Functions ============

    /// @inheritdoc IMerkleVestingDeployer
    function claim(bytes32[] calldata proof, uint256 amount) external returns (address wallet) {
        return _claim(msg.sender, proof, amount);
    }

    /// @inheritdoc IMerkleVestingDeployer
    function claimFor(address beneficiary, bytes32[] calldata proof, uint256 amount)
        external
        returns (address wallet)
    {
        if (beneficiary == address(0)) revert ZeroAddress();
        return _claim(beneficiary, proof, amount);
    }

    /// @inheritdoc IMerkleVestingDeployer
    function sweep(address recipient) external {
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp <= claimDeadline) revert ClaimDeadlineNotPassed();

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) revert NothingToSweep();

        IERC20(token).safeTransfer(recipient, balance);
        emit Swept(recipient, balance);
    }

    // ============ Internal Functions ============

    function _claim(address beneficiary, bytes32[] calldata proof, uint256 amount)
        internal
        returns (address wallet)
    {
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp > claimDeadline) revert ClaimDeadlinePassed();
        if (_claimed[beneficiary]) revert AlreadyClaimed();

        // Verify proof
        if (!verifyProof(beneficiary, amount, proof)) revert InvalidProof();

        // Mark as claimed
        _claimed[beneficiary] = true;

        // Deploy VestingWallet via CREATE2
        bytes32 salt = keccak256(abi.encodePacked(beneficiary));
        bytes memory bytecode = _getVestingWalletBytecode(beneficiary);
        wallet = Create2.deploy(0, salt, bytecode);

        // Transfer tokens to the VestingWallet
        IERC20(token).safeTransfer(wallet, amount);

        emit VestingClaimed(beneficiary, wallet, amount);
    }

    function _getVestingWalletBytecode(address beneficiary) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(VestingWalletCliffConcrete).creationCode,
            abi.encode(beneficiary, vestingStart, vestingDuration, cliffDuration)
        );
    }

    function _getLeaf(address beneficiary, uint256 amount) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(beneficiary, amount));
    }
}
