import type { Hex } from 'viem';

/**
 * Vesting schedule parameters (matches on-chain MerkleVestingDeployer)
 */
export interface VestingParams {
  vestingStart: number; // Unix timestamp when vesting begins
  vestingDuration: number; // Duration in seconds
  cliffDuration: number; // Cliff period in seconds (no tokens vest until cliff passes)
}

/**
 * Optional platform fee configuration for a vesting campaign
 */
export interface PlatformFeeParams {
  feeRecipient: Hex;
  feeBps: number; // 0-10,000
}

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
 * BuildSpec tracks the exact algorithm used to build a merkle tree
 * This allows future rebuilds to match the original exactly
 */
export interface BuildSpec {
  version: '1.0.0';
  leafEncoding: 'abi.encodePacked(address,uint256)';
  hashFunction: 'keccak256';
  sortPairs: true;
  sortAllocations: 'beneficiary-asc';
  duplicateHandling: 'reject';
  paddingStrategy: 'duplicate-last';
}

/**
 * Canonicalized allocation with normalized address
 */
export interface CanonicalAllocation {
  beneficiary: Hex; // checksummed address
  amount: string;   // decimal string, no leading zeros
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
  vesting?: VestingParams; // Optional vesting schedule
  platformFee?: PlatformFeeParams;
  buildSpec: BuildSpec;
  originalInput: {
    allocations: Allocation[];
    token?: Hex;
    vesting?: VestingParams;
    platformFee?: PlatformFeeParams;
  };
  inputHash: Hex;
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
  vesting?: VestingParams;
  platformFee?: PlatformFeeParams;
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

/**
 * Vesting status for a specific beneficiary
 */
export interface VestingStatus {
  beneficiary: Hex;
  totalAmount: string;
  vestedAmount: string;
  unvestedAmount: string;
  releasableAmount: string; // Same as vestedAmount (assuming nothing released yet off-chain)
  percentVested: number; // 0-100
  cliffPassed: boolean;
  fullyVested: boolean;
  vestingStart: number;
  vestingEnd: number;
  cliffEnd: number;
  currentTime: number;
  // Proof data for claiming
  leaf: Hex;
  proof: Hex[];
  root: Hex;
}

/**
 * Storage backend interface for merkle trees
 */
export interface StorageBackend {
  readonly name: string;
  save(tree: MerkleTree): Promise<void>;
  get(id: string): Promise<MerkleTree | null>;
  delete(id: string): Promise<boolean>;
  list(): Promise<MerkleTreeSummary[]>;
  health(): Promise<{ healthy: boolean; error?: string }>;
}

/**
 * Replication write result
 */
export interface ReplicationResult {
  success: boolean;
  primary: { success: boolean; error?: string };
  replicas: Array<{ name: string; success: boolean; error?: string }>;
}

/**
 * Self-custody proof package for a single beneficiary
 */
export interface ProofPackage {
  version: '1.0';
  generatedAt: string; // ISO timestamp
  treeId: string;
  merkleRoot: Hex;
  beneficiary: Hex;
  amount: string;
  leaf: Hex;
  proof: Hex[];
  vesting?: VestingParams;
  platformFee?: PlatformFeeParams;
  contract?: {
    chainId: number;
    deployerAddress: Hex;
    token?: Hex;
  };
  buildSpec: BuildSpec;
}

/**
 * Batch proof package for all beneficiaries
 */
export interface BatchProofPackage {
  version: '1.0';
  generatedAt: string;
  treeId: string;
  merkleRoot: Hex;
  allocations: Array<{
    beneficiary: Hex;
    amount: string;
    leaf: Hex;
    proof: Hex[];
  }>;
  vesting?: VestingParams;
  platformFee?: PlatformFeeParams;
  contract?: {
    chainId: number;
    deployerAddress: Hex;
    token?: Hex;
  };
  buildSpec: BuildSpec;
}

/**
 * Result of validating a proof package
 */
export interface ProofPackageValidation {
  valid: boolean;
  errors: string[];
}

/**
 * IPFS backup result
 */
export interface IpfsBackupResult {
  cid: string;
  contentHash: Hex;
  registryTxHash?: Hex;
}

/**
 * Recovery result from various sources
 */
export interface RecoveryResult {
  success: boolean;
  source: 'local' | 'ipfs' | 'registry';
  tree: MerkleTree;
}
