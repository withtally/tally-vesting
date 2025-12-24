import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { MerkleTree, MerkleTreeSummary } from '../types';
import { FilesystemBackend } from './storage/filesystem';

const DATA_DIR = join(import.meta.dir, '../../data/trees');

// Create the filesystem backend instance
const backend = new FilesystemBackend(DATA_DIR);

/**
 * Save a merkle tree to storage
 */
export async function saveTree(tree: MerkleTree): Promise<void> {
  return backend.save(tree);
}

/**
 * Get a merkle tree by ID
 */
export async function getTree(id: string): Promise<MerkleTree | null> {
  return backend.get(id);
}

/**
 * Delete a merkle tree
 */
export async function deleteTree(id: string): Promise<boolean> {
  return backend.delete(id);
}

/**
 * List all merkle trees (summaries only)
 */
export async function listTrees(): Promise<MerkleTreeSummary[]> {
  return backend.list();
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  backend.clearCache();
}

/**
 * Clear all data - cache and files (useful for testing)
 */
export async function clearAll(): Promise<void> {
  backend.clearCache();

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

/**
 * Export the backend for direct access
 */
export { backend };
