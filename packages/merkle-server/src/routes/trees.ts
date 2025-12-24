import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Hex } from 'viem';
import { buildTree } from '../services/merkle';
import { computeVestingStatus } from '../services/vesting';
import { saveTree, getTree, deleteTree, listTrees } from '../services/storage';
import { canonicalizeAllocations, computeInputHash, BUILD_SPEC } from '../services/canonicalize';
import { rebuildTree, rebuildFromStoredInput } from '../services/rebuild';
import { generateProofPackage, generateBatchProofPackage } from '../services/proofPackage';
import { serializeTreeForIpfs, computeContentHash } from '../services/ipfs';
import type { CreateTreeRequest, MerkleTree, ProofResponse, VestingStatus } from '../types';

const trees = new Hono();

// DoS protection limits
const MAX_ALLOCATIONS = 10000;
const MAX_UINT256_DIGITS = 78; // 2^256-1 has 78 digits

// Validation schemas
const hexSchema = z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex string');
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address');
const uint256Schema = z.string()
  .regex(/^\d+$/, 'Invalid uint256 string')
  .max(MAX_UINT256_DIGITS, `Amount exceeds max ${MAX_UINT256_DIGITS} digits`);

const allocationSchema = z.object({
  beneficiary: addressSchema,
  amount: uint256Schema,
});

const vestingSchema = z.object({
  vestingStart: z.number().int().positive('vestingStart must be a positive integer'),
  vestingDuration: z.number().int().positive('vestingDuration must be a positive integer'),
  cliffDuration: z.number().int().min(0, 'cliffDuration must be non-negative'),
}).refine((data) => data.cliffDuration <= data.vestingDuration, {
  message: 'cliffDuration cannot exceed vestingDuration',
});

const createTreeRequestSchema = z.object({
  allocations: z.array(allocationSchema)
    .min(1, 'At least one allocation required')
    .max(MAX_ALLOCATIONS, `Maximum ${MAX_ALLOCATIONS} allocations allowed`),
  token: addressSchema.optional(),
  vesting: vestingSchema.optional(),
});

/**
 * GET /trees - List all trees
 */
trees.get('/', async (c) => {
  const summaries = await listTrees();
  return c.json(summaries);
});

/**
 * POST /trees - Create a new tree
 */
trees.post('/', async (c) => {
  const body = await c.req.json();
  const result = createTreeRequestSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.error.issues }, 400);
  }

  const request: CreateTreeRequest = result.data as CreateTreeRequest;

  try {
    // Canonicalize allocations (normalize and sort)
    const canonicalAllocations = canonicalizeAllocations(request.allocations);

    // Compute input hash for deterministic tree building
    const inputHash = computeInputHash(
      canonicalAllocations,
      request.token as Hex | undefined,
      request.vesting
    );

    // Build the merkle tree with canonicalized allocations
    const { root, allocations } = buildTree(canonicalAllocations);

    // Create the tree object
    const tree: MerkleTree = {
      id: uuidv4(),
      root,
      token: request.token as Hex | undefined,
      createdAt: new Date().toISOString(),
      allocations,
      vesting: request.vesting,
      buildSpec: BUILD_SPEC,
      originalInput: {
        allocations: request.allocations,
        token: request.token as Hex | undefined,
        vesting: request.vesting,
      },
      inputHash,
    };

    // Save to storage
    await saveTree(tree);

    return c.json(tree, 201);
  } catch (error) {
    // Handle canonicalization errors (e.g., duplicates, invalid data)
    return c.json({ error: error instanceof Error ? error.message : 'Failed to create tree' }, 400);
  }
});

/**
 * GET /trees/:id - Get a tree by ID
 */
trees.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tree = await getTree(id);

  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  return c.json(tree);
});

/**
 * GET /trees/:id/proof/:address - Get proof for an address
 */
trees.get('/:id/proof/:address', async (c) => {
  const id = c.req.param('id');
  const address = c.req.param('address').toLowerCase();

  const tree = await getTree(id);
  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  // Find the allocation for this address
  const allocation = tree.allocations.find(
    (a) => a.beneficiary.toLowerCase() === address
  );

  if (!allocation) {
    return c.json({ error: 'Address not found in tree' }, 404);
  }

  const response: ProofResponse = {
    beneficiary: allocation.beneficiary,
    amount: allocation.amount,
    leaf: allocation.leaf,
    proof: allocation.proof,
    root: tree.root,
  };

  return c.json(response);
});

/**
 * GET /trees/:id/vesting/:address - Get vesting status for an address
 */
trees.get('/:id/vesting/:address', async (c) => {
  const id = c.req.param('id');
  const address = c.req.param('address').toLowerCase();

  const tree = await getTree(id);
  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  if (!tree.vesting) {
    return c.json({ error: 'Tree does not have vesting parameters' }, 400);
  }

  // Find the allocation for this address
  const allocation = tree.allocations.find(
    (a) => a.beneficiary.toLowerCase() === address
  );

  if (!allocation) {
    return c.json({ error: 'Address not found in tree' }, 404);
  }

  // Compute vesting status
  const currentTime = Math.floor(Date.now() / 1000);
  const status = computeVestingStatus(allocation.amount, tree.vesting, currentTime);

  const response: VestingStatus = {
    beneficiary: allocation.beneficiary,
    totalAmount: allocation.amount,
    ...status,
    leaf: allocation.leaf,
    proof: allocation.proof,
    root: tree.root,
  };

  return c.json(response);
});

/**
 * DELETE /trees/:id - Delete a tree
 */
trees.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await deleteTree(id);

  if (!deleted) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  return c.json({ success: true });
});

/**
 * POST /trees/:id/rebuild - Rebuild from stored input, verify match
 */
trees.post('/:id/rebuild', async (c) => {
  const id = c.req.param('id');
  const tree = await getTree(id);

  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  try {
    const result = rebuildFromStoredInput(tree);

    return c.json({
      success: result.matchesOriginal,
      originalRoot: tree.root,
      rebuiltRoot: result.tree.root,
      inputHash: result.tree.inputHash,
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to rebuild tree'
    }, 400);
  }
});

/**
 * POST /trees/rebuild-from-input - Rebuild from provided allocations
 */
trees.post('/rebuild-from-input', async (c) => {
  const body = await c.req.json();
  const result = createTreeRequestSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Validation failed', details: result.error.issues }, 400);
  }

  const request: CreateTreeRequest = result.data as CreateTreeRequest;

  try {
    const rebuilt = rebuildTree({
      allocations: request.allocations,
      token: request.token as Hex | undefined,
      vesting: request.vesting,
    });

    return c.json(rebuilt);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Failed to rebuild tree'
    }, 400);
  }
});

/**
 * GET /trees/:id/input - Get original allocations
 */
trees.get('/:id/input', async (c) => {
  const id = c.req.param('id');
  const tree = await getTree(id);

  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  if (!tree.originalInput) {
    return c.json({ error: 'No stored input' }, 400);
  }

  return c.json({
    allocations: tree.originalInput.allocations,
    token: tree.originalInput.token,
    vesting: tree.originalInput.vesting,
    inputHash: tree.inputHash,
    buildSpec: tree.buildSpec,
  });
});

/**
 * GET /trees/:id/download/:address - Download individual proof package
 */
trees.get('/:id/download/:address', async (c) => {
  const id = c.req.param('id');
  const address = c.req.param('address') as Hex;

  const tree = await getTree(id);
  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  try {
    // Generate proof package
    const pkg = generateProofPackage(tree, address);

    // Set download headers
    c.header('Content-Disposition', `attachment; filename="proof-${address.toLowerCase()}.json"`);
    c.header('Content-Type', 'application/json');

    return c.json(pkg);
  } catch (error) {
    // Handle beneficiary not found error
    if (error instanceof Error && error.message.includes('Beneficiary not found')) {
      return c.json({ error: 'Beneficiary not found in tree' }, 404);
    }
    throw error;
  }
});

/**
 * GET /trees/:id/download - Download batch proof package (all beneficiaries)
 */
trees.get('/:id/download', async (c) => {
  const id = c.req.param('id');

  const tree = await getTree(id);
  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  // Generate batch proof package
  const pkg = generateBatchProofPackage(tree);

  // Set download headers
  c.header('Content-Disposition', `attachment; filename="batch-proof-${id}.json"`);
  c.header('Content-Type', 'application/json');

  return c.json(pkg);
});

/**
 * POST /trees/:id/backup - Backup to IPFS (registry registration optional)
 * Query params: ?register=true&chainId=1&distributor=0x...
 */
trees.post('/:id/backup', async (c) => {
  const id = c.req.param('id');
  const tree = await getTree(id);

  if (!tree) {
    return c.json({ error: 'Tree not found' }, 404);
  }

  // For now, just compute what WOULD be uploaded
  // Real IPFS requires running node
  const serialized = serializeTreeForIpfs(tree);
  const contentHash = computeContentHash(tree);

  return c.json({
    treeId: id,
    contentHash,
    size: serialized.length,
    // cid: would be returned from real IPFS
    message: 'IPFS backup prepared (connect IPFS node to upload)',
  });
});

/**
 * GET /trees/:id/recovery - Recovery info
 */
trees.get('/:id/recovery', async (c) => {
  const id = c.req.param('id');
  const tree = await getTree(id);

  if (tree) {
    return c.json({
      source: 'local',
      available: true,
      root: tree.root,
      inputHash: tree.inputHash,
    });
  }

  return c.json({
    source: 'local',
    available: false,
    message: 'Tree not found locally. Use IPFS CID to recover.',
  }, 404);
});

/**
 * POST /trees/recover - Recover from IPFS CID or input
 */
trees.post('/recover', async (c) => {
  const body = await c.req.json();

  if (body.input) {
    // Validate input
    const result = createTreeRequestSchema.safeParse(body.input);

    if (!result.success) {
      return c.json({
        error: 'Validation failed',
        details: result.error.issues
      }, 400);
    }

    // Rebuild from input
    const tree = rebuildTree(body.input);
    return c.json({ source: 'rebuild', tree });
  }

  // CID recovery would need IPFS client
  return c.json({
    error: 'Recovery from IPFS CID requires IPFS node connection',
    hint: 'Provide input.allocations to rebuild from allocations'
  }, 400);
});

export { trees };
