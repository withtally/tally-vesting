import { keccak256, encodePacked, concat, type Hex } from 'viem';
import type { Allocation, AllocationWithProof } from '../types';

/**
 * Generate a leaf hash matching Solidity: keccak256(abi.encodePacked(beneficiary, amount))
 */
export function getLeaf(beneficiary: Hex, amount: string): Hex {
  return keccak256(encodePacked(['address', 'uint256'], [beneficiary, BigInt(amount)]));
}

/**
 * Hash a pair of nodes with sorted order for OpenZeppelin MerkleProof compatibility
 */
export function hashPair(a: Hex, b: Hex): Hex {
  // Sort to ensure consistent ordering regardless of input order
  if (a.toLowerCase() < b.toLowerCase()) {
    return keccak256(concat([a, b]));
  }
  return keccak256(concat([b, a]));
}

/**
 * Compute the merkle root from an array of leaves
 * Pads to next power of 2 by duplicating the last leaf
 */
export function getRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) {
    throw new Error('Cannot compute root of empty leaves array');
  }

  // Pad to next power of 2
  const paddedLeaves = padToPowerOfTwo([...leaves]);

  // Build tree layer by layer
  let layer = paddedLeaves;
  while (layer.length > 1) {
    const nextLayer: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      nextLayer.push(hashPair(layer[i], layer[i + 1]));
    }
    layer = nextLayer;
  }

  return layer[0];
}

/**
 * Get the proof for a leaf at a given index
 */
export function getProof(leaves: Hex[], index: number): Hex[] {
  if (index >= leaves.length) {
    throw new Error(`Index ${index} out of bounds for leaves array of length ${leaves.length}`);
  }

  // Pad to next power of 2
  const paddedLeaves = padToPowerOfTwo([...leaves]);
  const proof: Hex[] = [];

  let currentIndex = index;
  let layer = paddedLeaves;

  while (layer.length > 1) {
    // Get sibling index
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    proof.push(layer[siblingIndex]);

    // Build next layer
    const nextLayer: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      nextLayer.push(hashPair(layer[i], layer[i + 1]));
    }
    layer = nextLayer;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

/**
 * Verify a merkle proof
 */
export function verifyProof(proof: Hex[], root: Hex, leaf: Hex): boolean {
  let computedHash = leaf;

  for (const proofElement of proof) {
    computedHash = hashPair(computedHash, proofElement);
  }

  return computedHash.toLowerCase() === root.toLowerCase();
}

/**
 * Build a complete merkle tree from allocations
 */
export function buildTree(allocations: Allocation[]): {
  root: Hex;
  allocations: AllocationWithProof[];
} {
  // Generate leaves for all allocations
  const leaves = allocations.map((alloc) => getLeaf(alloc.beneficiary, alloc.amount));

  // Compute root
  const root = getRoot(leaves);

  // Generate proofs for each allocation
  const allocationsWithProof: AllocationWithProof[] = allocations.map((alloc, index) => ({
    beneficiary: alloc.beneficiary,
    amount: alloc.amount,
    leaf: leaves[index],
    proof: getProof(leaves, index),
  }));

  return {
    root,
    allocations: allocationsWithProof,
  };
}

/**
 * Pad an array of leaves to the next power of 2 by duplicating the last leaf
 */
function padToPowerOfTwo(leaves: Hex[]): Hex[] {
  const targetLength = nextPowerOfTwo(leaves.length);
  const lastLeaf = leaves[leaves.length - 1];

  while (leaves.length < targetLength) {
    leaves.push(lastLeaf);
  }

  return leaves;
}

/**
 * Get the next power of 2 >= n
 */
function nextPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  let power = 1;
  while (power < n) {
    power *= 2;
  }
  return power;
}
