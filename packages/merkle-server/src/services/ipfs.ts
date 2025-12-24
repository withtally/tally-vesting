import { keccak256, type Hex } from 'viem';
import { z } from 'zod';
import type { MerkleTree } from '../types';

/**
 * Serialize a MerkleTree to deterministic JSON for IPFS storage
 * Keys are sorted alphabetically to ensure determinism
 */
export function serializeTreeForIpfs(tree: MerkleTree): string {
  // Deep sort all object keys for determinism
  const sortedTree = sortObjectKeys(tree);
  return JSON.stringify(sortedTree);
}

// Validation schemas for IPFS deserialization
const hexSchema = z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex string');
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address');
const uint256StringSchema = z.string().regex(/^\d+$/, 'Invalid uint256 string');

const merkleTreeSchema = z.object({
  id: z.string(),
  root: hexSchema,
  token: addressSchema.optional(),
  createdAt: z.string(),
  allocations: z.array(z.object({
    beneficiary: addressSchema,
    amount: uint256StringSchema,
    leaf: hexSchema,
    proof: z.array(hexSchema),
  })),
  vesting: z.object({
    vestingStart: z.number().int().positive(),
    vestingDuration: z.number().int().positive(),
    cliffDuration: z.number().int().min(0),
  }).optional(),
  buildSpec: z.object({
    version: z.string(),
    leafEncoding: z.string(),
    hashFunction: z.string(),
    sortPairs: z.boolean(),
    sortAllocations: z.string(),
    duplicateHandling: z.string(),
    paddingStrategy: z.string(),
  }),
  originalInput: z.object({
    allocations: z.array(z.object({
      beneficiary: addressSchema,
      amount: uint256StringSchema,
    })),
    token: addressSchema.optional(),
    vesting: z.object({
      vestingStart: z.number(),
      vestingDuration: z.number(),
      cliffDuration: z.number(),
    }).optional(),
  }),
  inputHash: hexSchema,
});

/**
 * Deserialize JSON from IPFS back to MerkleTree
 * Validates all required fields are present and properly formatted
 */
export function deserializeTreeFromIpfs(data: string): MerkleTree {
  let parsed: unknown;

  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('Invalid JSON: Failed to parse data');
  }

  // Validate against schema
  const result = merkleTreeSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid tree data: ${result.error.message}`);
  }

  return result.data as MerkleTree;
}

/**
 * Compute a content hash for a merkle tree
 * Uses keccak256 of the serialized tree data for consistency
 */
export function computeContentHash(tree: MerkleTree): Hex {
  const serialized = serializeTreeForIpfs(tree);
  // Convert string to bytes for hashing
  const encoder = new TextEncoder();
  const bytes = encoder.encode(serialized);

  // Convert to hex string for keccak256
  const hexString = '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('') as Hex;

  return keccak256(hexString);
}

/**
 * IPFS client interface for uploading, downloading, and pinning data
 */
export interface IpfsClient {
  upload(data: string): Promise<string>; // Returns CID
  download(cid: string): Promise<string>;
  pin(cid: string): Promise<void>;
}

/**
 * Upload a merkle tree to IPFS
 * Returns the CID and content hash
 */
export async function uploadTreeToIpfs(
  tree: MerkleTree,
  client: IpfsClient
): Promise<{ cid: string; contentHash: Hex }> {
  const serialized = serializeTreeForIpfs(tree);
  const contentHash = computeContentHash(tree);
  const cid = await client.upload(serialized);

  return { cid, contentHash };
}

/**
 * Download a merkle tree from IPFS by CID
 */
export async function downloadTreeFromIpfs(
  cid: string,
  client: IpfsClient
): Promise<MerkleTree> {
  const data = await client.download(cid);
  return deserializeTreeFromIpfs(data);
}

/**
 * Verify that data at a CID matches an expected merkle root
 */
export async function verifyIpfsData(
  cid: string,
  expectedRoot: Hex,
  client: IpfsClient
): Promise<boolean> {
  try {
    const tree = await downloadTreeFromIpfs(cid, client);
    return tree.root.toLowerCase() === expectedRoot.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Create an IPFS client (stub implementation)
 * In production, this would connect to an IPFS node via HTTP API
 */
export function createIpfsClient(config?: { apiUrl?: string }): IpfsClient {
  const apiUrl = config?.apiUrl || process.env.IPFS_API_URL || 'http://127.0.0.1:5001';

  return {
    async upload(data: string): Promise<string> {
      // Stub: In production, would POST to /api/v0/add
      throw new Error(`IPFS client not implemented. Configure IPFS_API_URL (current: ${apiUrl})`);
    },

    async download(cid: string): Promise<string> {
      // Stub: In production, would GET from /api/v0/cat
      throw new Error(`IPFS client not implemented. Configure IPFS_API_URL (current: ${apiUrl})`);
    },

    async pin(cid: string): Promise<void> {
      // Stub: In production, would POST to /api/v0/pin/add
      throw new Error(`IPFS client not implemented. Configure IPFS_API_URL (current: ${apiUrl})`);
    },
  };
}

/**
 * Recursively sort object keys for deterministic serialization
 */
function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }

    return sorted;
  }

  return obj;
}
