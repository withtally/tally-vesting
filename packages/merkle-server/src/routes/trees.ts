import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Hex } from 'viem';
import { buildTree } from '../services/merkle';
import { saveTree, getTree, deleteTree, listTrees } from '../services/storage';
import type { CreateTreeRequest, MerkleTree, ProofResponse } from '../types';

const trees = new Hono();

// Validation schemas
const hexSchema = z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid hex string');
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address');
const uint256Schema = z.string().regex(/^\d+$/, 'Invalid uint256 string');

const allocationSchema = z.object({
  beneficiary: addressSchema,
  amount: uint256Schema,
});

const createTreeRequestSchema = z.object({
  allocations: z.array(allocationSchema).min(1, 'At least one allocation required'),
  token: addressSchema.optional(),
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

  // Build the merkle tree
  const { root, allocations } = buildTree(request.allocations);

  // Create the tree object
  const tree: MerkleTree = {
    id: uuidv4(),
    root,
    token: request.token as Hex | undefined,
    createdAt: new Date().toISOString(),
    allocations,
  };

  // Save to storage
  await saveTree(tree);

  return c.json(tree, 201);
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

export { trees };
