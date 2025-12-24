import type { Hex } from 'viem';
import { getLeaf } from './merkle';
import { verifyProof } from './merkle';
import type {
  MerkleTree,
  ProofPackage,
  BatchProofPackage,
  ProofPackageValidation,
} from '../types';

/**
 * Generate a self-custody proof package for a single beneficiary
 */
export function generateProofPackage(
  tree: MerkleTree,
  beneficiary: Hex,
  contractInfo?: { chainId: number; deployerAddress: Hex; token?: Hex }
): ProofPackage {
  // Find the allocation for this beneficiary (case-insensitive)
  const allocation = tree.allocations.find(
    (a) => a.beneficiary.toLowerCase() === beneficiary.toLowerCase()
  );

  if (!allocation) {
    throw new Error('Beneficiary not found in tree');
  }

  const pkg: ProofPackage = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    treeId: tree.id,
    merkleRoot: tree.root,
    beneficiary: allocation.beneficiary,
    amount: allocation.amount,
    leaf: allocation.leaf,
    proof: allocation.proof,
    buildSpec: tree.buildSpec,
  };

  // Add optional fields
  if (tree.vesting) {
    pkg.vesting = tree.vesting;
  }

  if (tree.platformFee) {
    pkg.platformFee = tree.platformFee;
  }

  if (contractInfo) {
    pkg.contract = contractInfo;
  }

  return pkg;
}

/**
 * Generate a batch proof package for all beneficiaries
 */
export function generateBatchProofPackage(
  tree: MerkleTree,
  contractInfo?: { chainId: number; deployerAddress: Hex; token?: Hex }
): BatchProofPackage {
  const pkg: BatchProofPackage = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    treeId: tree.id,
    merkleRoot: tree.root,
    allocations: tree.allocations.map((alloc) => ({
      beneficiary: alloc.beneficiary,
      amount: alloc.amount,
      leaf: alloc.leaf,
      proof: alloc.proof,
    })),
    buildSpec: tree.buildSpec,
  };

  // Add optional fields
  if (tree.vesting) {
    pkg.vesting = tree.vesting;
  }

  if (tree.platformFee) {
    pkg.platformFee = tree.platformFee;
  }

  if (contractInfo) {
    pkg.contract = contractInfo;
  }

  return pkg;
}

/**
 * Validate the structure and format of a proof package
 */
export function validateProofPackage(pkg: unknown): ProofPackageValidation {
  const errors: string[] = [];

  // Check if pkg is an object
  if (typeof pkg !== 'object' || pkg === null) {
    return { valid: false, errors: ['Package must be an object'] };
  }

  const p = pkg as Record<string, unknown>;

  // Validate version
  if (p.version !== '1.0') {
    errors.push('version must be "1.0"');
  }

  // Validate required string fields
  if (typeof p.generatedAt !== 'string') {
    errors.push('generatedAt must be a string');
  }

  if (typeof p.treeId !== 'string') {
    errors.push('treeId must be a string');
  }

  if (typeof p.amount !== 'string' || !/^\d+$/.test(p.amount as string)) {
    errors.push('amount must be a numeric string');
  }

  // Validate merkleRoot (64 hex chars)
  if (typeof p.merkleRoot !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(p.merkleRoot as string)) {
    errors.push('merkleRoot must be a valid 32-byte hex string');
  }

  // Validate beneficiary (40 hex chars - address)
  if (typeof p.beneficiary !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(p.beneficiary as string)) {
    errors.push('beneficiary must be a valid address');
  }

  // Validate leaf (64 hex chars)
  if (typeof p.leaf !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(p.leaf as string)) {
    errors.push('leaf must be a valid 32-byte hex string');
  }

  // Validate proof array
  if (!Array.isArray(p.proof)) {
    errors.push('proof must be an array');
  } else {
    for (let i = 0; i < p.proof.length; i++) {
      const proofElement = p.proof[i];
      if (typeof proofElement !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(proofElement)) {
        errors.push(`proof[${i}] must be a valid 32-byte hex string`);
      }
    }
  }

  // Validate buildSpec
  if (typeof p.buildSpec !== 'object' || p.buildSpec === null) {
    errors.push('buildSpec must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify a proof package against a merkle root
 * This recomputes the leaf from beneficiary + amount and verifies the proof
 */
export function verifyProofPackageAgainstRoot(pkg: ProofPackage, root: Hex): boolean {
  // Recompute the leaf from beneficiary and amount
  const computedLeaf = getLeaf(pkg.beneficiary, pkg.amount);

  // Verify the proof using the computed leaf
  return verifyProof(pkg.proof, root, computedLeaf);
}
