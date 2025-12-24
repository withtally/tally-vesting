import { LRUCache } from 'lru-cache';
import { mkdir, readdir, readFile, writeFile, unlink, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { MerkleTree, MerkleTreeSummary, StorageBackend } from '../../types';

/**
 * Filesystem-based storage backend with LRU cache
 */
export class FilesystemBackend implements StorageBackend {
  readonly name = 'filesystem';
  private cache: LRUCache<string, MerkleTree>;

  constructor(private dataDir: string) {
    // LRU cache with max 100 trees, TTL of 1 hour
    this.cache = new LRUCache<string, MerkleTree>({
      max: 100,
      ttl: 1000 * 60 * 60, // 1 hour
    });
  }

  /**
   * Validate tree ID to prevent path traversal attacks
   * @param id - The tree ID to validate
   * @throws Error if ID is invalid or attempts path traversal
   */
  private validateId(id: string): void {
    // Only allow UUID-like IDs (alphanumeric + hyphens)
    if (!/^[a-zA-Z0-9-]+$/.test(id)) {
      throw new Error('Invalid tree ID format');
    }

    // Double-check path doesn't escape data directory
    const fullPath = resolve(this.dataDir, `${id}.json`);
    if (!fullPath.startsWith(resolve(this.dataDir) + sep)) {
      throw new Error('Invalid tree ID');
    }
  }

  /**
   * Ensure the data directory exists
   */
  private async ensureDataDir(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
  }

  /**
   * Get the file path for a tree
   */
  private getTreePath(id: string): string {
    return join(this.dataDir, `${id}.json`);
  }

  /**
   * Save a merkle tree to storage
   */
  async save(tree: MerkleTree): Promise<void> {
    this.validateId(tree.id);
    await this.ensureDataDir();
    const path = this.getTreePath(tree.id);
    await writeFile(path, JSON.stringify(tree, null, 2));
    this.cache.set(tree.id, tree);
  }

  /**
   * Get a merkle tree by ID
   */
  async get(id: string): Promise<MerkleTree | null> {
    this.validateId(id);

    // Check cache first
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    // Load from file
    try {
      const path = this.getTreePath(id);
      const data = await readFile(path, 'utf-8');
      const tree = JSON.parse(data) as MerkleTree;
      this.cache.set(id, tree);
      return tree;
    } catch {
      return null;
    }
  }

  /**
   * Delete a merkle tree
   */
  async delete(id: string): Promise<boolean> {
    this.validateId(id);
    this.cache.delete(id);

    try {
      const path = this.getTreePath(id);
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all merkle trees (summaries only)
   */
  async list(): Promise<MerkleTreeSummary[]> {
    await this.ensureDataDir();

    const files = await readdir(this.dataDir);
    const summaries: MerkleTreeSummary[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const id = file.replace('.json', '');
      const tree = await this.get(id);

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
   * Health check
   */
  async health(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await access(this.dataDir);
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
