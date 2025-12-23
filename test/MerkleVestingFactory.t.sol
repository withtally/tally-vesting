// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MerkleVestingFactory} from "../src/MerkleVestingFactory.sol";
import {IMerkleVestingFactory} from "../src/interfaces/IMerkleVestingFactory.sol";
import {IMerkleVestingDeployer} from "../src/interfaces/IMerkleVestingDeployer.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mock ERC20 for testing
contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MerkleVestingFactoryTest is Test {
    MerkleVestingFactory public factory;
    MockERC20 public token;

    address public alice = address(0xA11CE);
    bytes32 public merkleRoot = bytes32(uint256(1));
    uint64 public vestingStart = uint64(block.timestamp);
    uint64 public vestingDuration = 365 days;
    uint64 public cliffDuration = 90 days;
    uint64 public claimDeadline = uint64(block.timestamp + 400 days);
    bytes32 public salt = bytes32(uint256(42));

    event DeployerCreated(address indexed deployer, address indexed token, bytes32 indexed merkleRoot, address creator);

    function setUp() public {
        factory = new MerkleVestingFactory();
        token = new MockERC20("Test Token", "TEST", 18);
    }

    // ============ Basic Deployment Tests ============

    function test_deployCreatesDeployer() public {
        address deployer = factory.deploy(
            address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        // Should return non-zero address
        assertTrue(deployer != address(0), "Deployer address should not be zero");

        // Should be a valid MerkleVestingDeployer
        IMerkleVestingDeployer deployerContract = IMerkleVestingDeployer(deployer);
        assertEq(deployerContract.token(), address(token), "Token mismatch");
        assertEq(deployerContract.merkleRoot(), merkleRoot, "MerkleRoot mismatch");
        assertEq(deployerContract.vestingStart(), vestingStart, "VestingStart mismatch");
        assertEq(deployerContract.vestingDuration(), vestingDuration, "VestingDuration mismatch");
        assertEq(deployerContract.cliffDuration(), cliffDuration, "CliffDuration mismatch");
        assertEq(deployerContract.claimDeadline(), claimDeadline, "ClaimDeadline mismatch");
    }

    // ============ Deterministic Address Tests ============

    function test_deployAddressIsDeterministic() public {
        // Pre-compute address
        address predictedAddress = factory.getDeployerAddress(
            address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        // Deploy
        address actualAddress = factory.deploy(
            address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        // Addresses should match
        assertEq(actualAddress, predictedAddress, "Predicted and actual addresses should match");
    }

    function test_deployWithSameSaltRevertsOnSecondCall() public {
        // First deployment succeeds
        factory.deploy(address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt);

        // Second deployment with same parameters should revert
        vm.expectRevert();
        factory.deploy(address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt);
    }

    function test_deployWithDifferentSaltSucceeds() public {
        // First deployment
        address deployer1 = factory.deploy(
            address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        // Second deployment with different salt
        bytes32 salt2 = bytes32(uint256(43));
        address deployer2 = factory.deploy(
            address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt2
        );

        // Should be different addresses
        assertTrue(deployer1 != deployer2, "Different salts should produce different addresses");
    }

    function test_deployWithDifferentParametersAndSameSaltSucceeds() public {
        // First deployment
        address deployer1 = factory.deploy(
            address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        // Second deployment with different merkle root but same salt
        bytes32 merkleRoot2 = bytes32(uint256(2));
        address deployer2 = factory.deploy(
            address(token), merkleRoot2, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        // Should be different addresses (because salt includes merkleRoot)
        assertTrue(deployer1 != deployer2, "Different parameters should produce different addresses");
    }

    // ============ Input Validation Tests ============

    function test_deployRevertsOnZeroTokenAddress() public {
        vm.expectRevert(IMerkleVestingFactory.ZeroAddress.selector);
        factory.deploy(address(0), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt);
    }

    function test_deployRevertsOnZeroMerkleRoot() public {
        vm.expectRevert(IMerkleVestingFactory.ZeroMerkleRoot.selector);
        factory.deploy(address(token), bytes32(0), vestingStart, vestingDuration, cliffDuration, claimDeadline, salt);
    }

    function test_deployRevertsOnZeroVestingDuration() public {
        vm.expectRevert(IMerkleVestingFactory.ZeroVestingDuration.selector);
        factory.deploy(address(token), merkleRoot, vestingStart, 0, cliffDuration, claimDeadline, salt);
    }

    function test_deployRevertsOnCliffExceedsDuration() public {
        uint64 invalidCliff = vestingDuration + 1;
        vm.expectRevert(IMerkleVestingFactory.CliffExceedsDuration.selector);
        factory.deploy(address(token), merkleRoot, vestingStart, vestingDuration, invalidCliff, claimDeadline, salt);
    }

    function test_deployRevertsOnClaimDeadlineBeforeVestingEnds() public {
        uint64 vestingEnd = vestingStart + vestingDuration;
        uint64 invalidDeadline = vestingEnd - 1;
        vm.expectRevert(IMerkleVestingFactory.InvalidClaimDeadline.selector);
        factory.deploy(address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, invalidDeadline, salt);
    }

    function test_deployAllowsClaimDeadlineEqualToVestingEnd() public {
        uint64 vestingEnd = vestingStart + vestingDuration;
        address deployer =
            factory.deploy(address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, vestingEnd, salt);
        assertTrue(deployer != address(0), "Should allow claim deadline equal to vesting end");
    }

    // ============ Event Tests ============

    function test_deployEmitsEvent() public {
        vm.expectEmit(true, true, true, true);

        // Pre-compute the deployer address for the event
        address expectedDeployer = factory.getDeployerAddress(
            address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );

        emit DeployerCreated(expectedDeployer, address(token), merkleRoot, address(this));

        factory.deploy(address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt);
    }

    // ============ Edge Case Tests ============

    function test_deployWithCliffEqualToDuration() public {
        address deployer = factory.deploy(
            address(token), merkleRoot, vestingStart, vestingDuration, vestingDuration, claimDeadline, salt
        );
        assertTrue(deployer != address(0), "Should allow cliff equal to duration");
    }

    function test_deployWithZeroCliff() public {
        address deployer =
            factory.deploy(address(token), merkleRoot, vestingStart, vestingDuration, 0, claimDeadline, salt);
        assertTrue(deployer != address(0), "Should allow zero cliff");
    }

    function test_getDeployerAddressIsView() public view {
        // Should be callable as a view function
        factory.getDeployerAddress(
            address(token), merkleRoot, vestingStart, vestingDuration, cliffDuration, claimDeadline, salt
        );
    }
}
