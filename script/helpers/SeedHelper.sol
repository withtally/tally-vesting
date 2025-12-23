// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title SeedHelper
/// @notice Helper library for generating merkle trees in tests
/// @dev Implements standard merkle tree construction matching OpenZeppelin's MerkleProof
library SeedHelper {
    /// @notice Allocation data for a single beneficiary
    struct Allocation {
        address beneficiary;
        uint256 amount;
    }

    /// @notice Generate leaf hash from beneficiary and amount
    /// @dev Uses abi.encodePacked for compact encoding
    function getLeaf(address beneficiary, uint256 amount) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(beneficiary, amount));
    }

    /// @notice Generate leaf hash from Allocation struct
    function getLeaf(Allocation memory allocation) internal pure returns (bytes32) {
        return getLeaf(allocation.beneficiary, allocation.amount);
    }

    /// @notice Hash two nodes together (sorted for consistency)
    /// @dev OpenZeppelin MerkleProof uses sorted pairs
    function hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @notice Build merkle tree from leaves and return root
    /// @dev Leaves must be power of 2. Pads with zero hashes if needed.
    /// @param leaves Array of leaf hashes
    /// @return root The merkle root
    function getRoot(bytes32[] memory leaves) internal pure returns (bytes32 root) {
        require(leaves.length > 0, "Empty leaves");

        // Pad to power of 2
        uint256 n = leaves.length;
        uint256 paddedLength = 1;
        while (paddedLength < n) {
            paddedLength *= 2;
        }

        bytes32[] memory tree = new bytes32[](paddedLength);
        for (uint256 i = 0; i < n; i++) {
            tree[i] = leaves[i];
        }
        // Pad remaining with duplicates of last leaf (standard practice)
        for (uint256 i = n; i < paddedLength; i++) {
            tree[i] = leaves[n - 1];
        }

        // Build tree bottom-up
        while (paddedLength > 1) {
            for (uint256 i = 0; i < paddedLength / 2; i++) {
                tree[i] = hashPair(tree[2 * i], tree[2 * i + 1]);
            }
            paddedLength /= 2;
        }

        return tree[0];
    }

    /// @notice Get merkle proof for a leaf at given index
    /// @dev Returns array of sibling hashes from leaf to root
    /// @param leaves All leaves in the tree
    /// @param index Index of the leaf to prove
    /// @return proof Array of proof elements
    function getProof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory proof) {
        require(leaves.length > 0, "Empty leaves");
        require(index < leaves.length, "Index out of bounds");

        // Pad to power of 2
        uint256 n = leaves.length;
        uint256 paddedLength = 1;
        while (paddedLength < n) {
            paddedLength *= 2;
        }

        bytes32[] memory tree = new bytes32[](paddedLength);
        for (uint256 i = 0; i < n; i++) {
            tree[i] = leaves[i];
        }
        for (uint256 i = n; i < paddedLength; i++) {
            tree[i] = leaves[n - 1];
        }

        // Calculate proof depth
        uint256 depth = 0;
        uint256 temp = paddedLength;
        while (temp > 1) {
            depth++;
            temp /= 2;
        }

        proof = new bytes32[](depth);
        uint256 proofIndex = 0;
        uint256 currentIndex = index;

        // Build proof from bottom up
        while (paddedLength > 1) {
            // Get sibling
            uint256 siblingIndex = currentIndex % 2 == 0 ? currentIndex + 1 : currentIndex - 1;
            if (siblingIndex < paddedLength) {
                proof[proofIndex++] = tree[siblingIndex];
            }

            // Move up the tree
            for (uint256 i = 0; i < paddedLength / 2; i++) {
                tree[i] = hashPair(tree[2 * i], tree[2 * i + 1]);
            }
            paddedLength /= 2;
            currentIndex /= 2;
        }

        // Trim proof to actual size
        bytes32[] memory trimmedProof = new bytes32[](proofIndex);
        for (uint256 i = 0; i < proofIndex; i++) {
            trimmedProof[i] = proof[i];
        }
        return trimmedProof;
    }

    /// @notice Helper to build tree from allocations
    function buildTree(Allocation[] memory allocations) internal pure returns (bytes32 root, bytes32[] memory leaves) {
        leaves = new bytes32[](allocations.length);
        for (uint256 i = 0; i < allocations.length; i++) {
            leaves[i] = getLeaf(allocations[i]);
        }
        root = getRoot(leaves);
    }
}
