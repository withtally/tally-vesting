import { LRUCache } from 'lru-cache';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { MerkleTree, MerkleTreeSummary } from '../types';

const DATA_DIR = join(import.meta.dir, '../../data/trees');

// LRU cache with max 100 trees, TTL of 1 hour
const cache = new LRUCache<string, MerkleTree>({
  max: 100,
  ttl: 1000 * 60 * 60, // 1 hour
});

/**
 * Ensure the data directory exists
 */
async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

/**
 * Get the file path for a tree
 */
function getTreePath(id: string): string {
  return join(DATA_DIR, `${id}.json`);
}

/**
 * Save a merkle tree to storage
 */
export async function saveTree(tree: MerkleTree): Promise<void> {
  await ensureDataDir();
  const path = getTreePath(tree.id);
  await writeFile(path, JSON.stringify(tree, null, 2));
  cache.set(tree.id, tree);
}

/**
 * Get a merkle tree by ID
 */
export async function getTree(id: string): Promise<MerkleTree | null> {
  // Check cache first
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }

  // Load from file
  try {
    const path = getTreePath(id);
    const data = await readFile(path, 'utf-8');
    const tree = JSON.parse(data) as MerkleTree;
    cache.set(id, tree);
    return tree;
  } catch {
    return null;
  }
}

/**
 * Delete a merkle tree
 */
export async function deleteTree(id: string): Promise<boolean> {
  cache.delete(id);

  try {
    const path = getTreePath(id);
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * List all merkle trees (summaries only)
 */
export async function listTrees(): Promise<MerkleTreeSummary[]> {
  await ensureDataDir();

  const files = await readdir(DATA_DIR);
  const summaries: MerkleTreeSummary[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const id = file.replace('.json', '');
    const tree = await getTree(id);

    if (tree) {
      const totalAmount = tree.allocations.reduce(
        (sum, alloc) => sum + BigInt(alloc.amount),
        0n
      );

      summaries.push({
        id: tree.id,
        root: tree.root,
        token: tree.token,
        createdAt: tree.createdAt,
        allocationCount: tree.allocations.length,
        totalAmount: totalAmount.toString(),
      });
    }
  }

  return summaries;
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Clear all data - cache and files (useful for testing)
 */
export async function clearAll(): Promise<void> {
  cache.clear();

  try {
    const files = await readdir(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await unlink(join(DATA_DIR, file));
      }
    }
  } catch {
    // Directory may not exist yet
  }
}

/**
 * Get the data directory path (useful for testing)
 */
export function getDataDir(): string {
  return DATA_DIR;
}
