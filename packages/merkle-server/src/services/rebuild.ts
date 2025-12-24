import type { MerkleTree, Allocation, VestingParams } from '../types';
import type { Hex } from 'viem';
import { v4 as uuidv4 } from 'uuid';
import { buildTree } from './merkle';
import { canonicalizeAllocations, computeInputHash, BUILD_SPEC } from './canonicalize';

/**
 * Input for rebuilding a merkle tree
 */
export interface RebuildInput {
  allocations: Allocation[];
  token?: Hex;
  vesting?: VestingParams;
}

/**
 * Result of rebuilding a tree, with optional verification
 */
export interface RebuildResult {
  tree: MerkleTree;
  matchesOriginal?: boolean;
}

/**
 * Rebuild a merkle tree from allocations
 * This function canonicalizes the input and builds a complete MerkleTree object
 *
 * @param input - Allocations and optional token/vesting parameters
 * @returns Complete MerkleTree with buildSpec, originalInput, and inputHash
 */
export function rebuildTree(input: RebuildInput): MerkleTree {
  const { allocations, token, vesting } = input;

  // Canonicalize allocations (normalize and sort)
  const canonicalAllocations = canonicalizeAllocations(allocations);

  // Compute input hash for deterministic verification
  const inputHash = computeInputHash(canonicalAllocations, token, vesting);

  // Build the merkle tree with canonicalized allocations
  const { root, allocations: allocationsWithProof } = buildTree(canonicalAllocations);

  // Create the complete tree object with a new unique ID
  const tree: MerkleTree = {
    id: uuidv4(),
    root,
    token,
    createdAt: new Date().toISOString(),
    allocations: allocationsWithProof,
    vesting,
    buildSpec: BUILD_SPEC,
    originalInput: {
      allocations,
      token,
      vesting,
    },
    inputHash,
  };

  return tree;
}

/**
 * Verify that a rebuilt tree matches the original
 *
 * @param original - The original tree
 * @param rebuilt - The rebuilt tree to verify
 * @returns true if roots, inputHash, and all proofs match
 */
export function verifyRebuild(original: MerkleTree, rebuilt: MerkleTree): boolean {
  // Check roots match
  if (original.root !== rebuilt.root) {
    return false;
  }

  // Check inputHash matches
  if (original.inputHash !== rebuilt.inputHash) {
    return false;
  }

  // Check same number of allocations
  if (original.allocations.length !== rebuilt.allocations.length) {
    return false;
  }

  // Check each allocation and proof matches
  for (let i = 0; i < original.allocations.length; i++) {
    const origAlloc = original.allocations[i];
    const rebuildAlloc = rebuilt.allocations[i];

    // Check beneficiary, amount, and leaf match
    if (
      origAlloc.beneficiary !== rebuildAlloc.beneficiary ||
      origAlloc.amount !== rebuildAlloc.amount ||
      origAlloc.leaf !== rebuildAlloc.leaf
    ) {
      return false;
    }

    // Check proofs match
    if (origAlloc.proof.length !== rebuildAlloc.proof.length) {
      return false;
    }

    for (let j = 0; j < origAlloc.proof.length; j++) {
      if (origAlloc.proof[j] !== rebuildAlloc.proof[j]) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Rebuild a tree from its stored originalInput
 * This verifies that the tree can be reconstructed from stored data
 *
 * @param tree - Tree with originalInput stored
 * @returns RebuildResult with the rebuilt tree and verification status
 * @throws Error if tree has no originalInput
 */
export function rebuildFromStoredInput(tree: MerkleTree): RebuildResult {
  if (!tree.originalInput) {
    throw new Error('No stored input found in tree - cannot rebuild');
  }

  // Rebuild the tree from stored input
  const rebuilt = rebuildTree({
    allocations: tree.originalInput.allocations,
    token: tree.originalInput.token,
    vesting: tree.originalInput.vesting,
  });

  // Verify the rebuild matches the original
  const matchesOriginal = verifyRebuild(tree, rebuilt);

  return {
    tree: rebuilt,
    matchesOriginal,
  };
}
