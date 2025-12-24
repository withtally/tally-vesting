import type { MerkleTree, MerkleTreeSummary, StorageBackend } from '../../types';

/**
 * In-memory storage backend (primarily for testing)
 */
export class MemoryBackend implements StorageBackend {
  readonly name = 'memory';
  private trees = new Map<string, MerkleTree>();

  /**
   * Save a merkle tree to memory
   */
  async save(tree: MerkleTree): Promise<void> {
    this.trees.set(tree.id, tree);
  }

  /**
   * Get a merkle tree by ID
   */
  async get(id: string): Promise<MerkleTree | null> {
    return this.trees.get(id) ?? null;
  }

  /**
   * Delete a merkle tree
   */
  async delete(id: string): Promise<boolean> {
    return this.trees.delete(id);
  }

  /**
   * List all merkle trees (summaries only)
   */
  async list(): Promise<MerkleTreeSummary[]> {
    const summaries: MerkleTreeSummary[] = [];

    for (const tree of this.trees.values()) {
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

    return summaries;
  }

  /**
   * Health check - memory backend is always healthy
   */
  async health(): Promise<{ healthy: boolean; error?: string }> {
    return { healthy: true };
  }

  /**
   * Clear all trees (for test cleanup)
   */
  clearAll(): void {
    this.trees.clear();
  }
}
