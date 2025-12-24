import type { MerkleTree, MerkleTreeSummary, StorageBackend } from '../../types';

/**
 * Replicated storage coordinator
 * Writes to all backends, reads from primary with replica fallback
 */
export class ReplicatedStorage implements StorageBackend {
  readonly name = 'replicated';

  constructor(
    private primary: StorageBackend,
    private replicas: StorageBackend[] = []
  ) {}

  /**
   * Save a merkle tree to all backends
   * PRIMARY_REQUIRED: If primary write fails, the overall save fails
   * Replica failures are logged but don't fail the operation
   */
  async save(tree: MerkleTree): Promise<void> {
    // Primary write must succeed
    try {
      await this.primary.save(tree);
    } catch (error) {
      throw new Error(
        `Primary storage write failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Write to replicas, log failures but continue
    for (const replica of this.replicas) {
      try {
        await replica.save(tree);
      } catch (error) {
        console.warn(
          `Replica ${replica.name} write failed:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }
  }

  /**
   * Get a merkle tree by ID
   * Reads from primary first, falls back to replicas if not found
   */
  async get(id: string): Promise<MerkleTree | null> {
    // Try primary first
    const primaryTree = await this.primary.get(id);
    if (primaryTree) {
      return primaryTree;
    }

    // Try replicas
    for (const replica of this.replicas) {
      const replicaTree = await replica.get(id);
      if (replicaTree) {
        return replicaTree;
      }
    }

    return null;
  }

  /**
   * Delete a merkle tree from all backends
   */
  async delete(id: string): Promise<boolean> {
    let anyDeleted = false;

    // Delete from primary
    const primaryDeleted = await this.primary.delete(id);
    if (primaryDeleted) {
      anyDeleted = true;
    }

    // Delete from replicas
    for (const replica of this.replicas) {
      try {
        const replicaDeleted = await replica.delete(id);
        if (replicaDeleted) {
          anyDeleted = true;
        }
      } catch (error) {
        console.warn(
          `Replica ${replica.name} delete failed:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    return anyDeleted;
  }

  /**
   * List all merkle trees (from primary)
   */
  async list(): Promise<MerkleTreeSummary[]> {
    return this.primary.list();
  }

  /**
   * Health check - returns aggregate status
   * Unhealthy if primary is unhealthy
   */
  async health(): Promise<{ healthy: boolean; error?: string }> {
    const primaryHealth = await this.primary.health();

    if (!primaryHealth.healthy) {
      return {
        healthy: false,
        error: `Primary backend unhealthy: ${primaryHealth.error}`,
      };
    }

    // Check replicas
    const replicaIssues: string[] = [];
    for (const replica of this.replicas) {
      const replicaHealth = await replica.health();
      if (!replicaHealth.healthy) {
        replicaIssues.push(`${replica.name}: ${replicaHealth.error}`);
      }
    }

    if (replicaIssues.length > 0) {
      return {
        healthy: false,
        error: `Replica issues: ${replicaIssues.join(', ')}`,
      };
    }

    return { healthy: true };
  }

  /**
   * Reconcile data across all backends
   * Syncs missing data from any backend to all others
   */
  async reconcile(): Promise<{ synced: number; errors: string[] }> {
    const allBackends = [this.primary, ...this.replicas];
    const errors: string[] = [];
    let synced = 0;

    // Get all unique tree IDs across all backends
    const allTreeIds = new Set<string>();
    for (const backend of allBackends) {
      try {
        const summaries = await backend.list();
        for (const summary of summaries) {
          allTreeIds.add(summary.id);
        }
      } catch (error) {
        errors.push(
          `Failed to list trees from ${backend.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // For each tree ID, ensure it exists in all backends
    for (const treeId of allTreeIds) {
      // Find a backend that has this tree
      let sourceTree: MerkleTree | null = null;
      for (const backend of allBackends) {
        try {
          sourceTree = await backend.get(treeId);
          if (sourceTree) break;
        } catch (error) {
          errors.push(
            `Failed to get tree ${treeId} from ${backend.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      if (!sourceTree) {
        errors.push(`Tree ${treeId} not found in any backend`);
        continue;
      }

      // Copy to backends that don't have it
      for (const backend of allBackends) {
        try {
          const existingTree = await backend.get(treeId);
          if (!existingTree) {
            await backend.save(sourceTree);
            synced++;
          }
        } catch (error) {
          errors.push(
            `Failed to sync tree ${treeId} to ${backend.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    return { synced, errors };
  }
}
