import type { Hex } from 'viem';

/**
 * Input allocation for creating a merkle tree
 */
export interface Allocation {
  beneficiary: Hex;
  amount: string; // BigInt as string for JSON serialization
}

/**
 * Allocation with pre-computed leaf and proof
 */
export interface AllocationWithProof extends Allocation {
  leaf: Hex;
  proof: Hex[];
}

/**
 * Stored merkle tree with all allocations and proofs
 */
export interface MerkleTree {
  id: string;
  root: Hex;
  token?: Hex;
  createdAt: string;
  allocations: AllocationWithProof[];
}

/**
 * Summary of a merkle tree (for listing)
 */
export interface MerkleTreeSummary {
  id: string;
  root: Hex;
  token?: Hex;
  createdAt: string;
  allocationCount: number;
  totalAmount: string;
}

/**
 * Request to create a new merkle tree
 */
export interface CreateTreeRequest {
  allocations: Allocation[];
  token?: Hex;
}

/**
 * Proof response for a specific address
 */
export interface ProofResponse {
  beneficiary: Hex;
  amount: string;
  leaf: Hex;
  proof: Hex[];
  root: Hex;
}
