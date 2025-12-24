import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MerkleTree } from '../src/types';
import { FilesystemBackend } from '../src/services/storage/filesystem';
import { MemoryBackend } from '../src/services/storage/memory';
import { ReplicatedStorage } from '../src/services/storage/replicated';

// Test data
const TEST_DATA_DIR = join(import.meta.dir, '../data/test-storage');

function createTestTree(id: string): MerkleTree {
  return {
    id,
    root: '0x1234567890abcdef',
    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    createdAt: new Date().toISOString(),
    allocations: [
      {
        beneficiary: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: '1000000',
        leaf: '0xleaf1',
        proof: ['0xproof1'],
      },
      {
        beneficiary: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        amount: '2000000',
        leaf: '0xleaf2',
        proof: ['0xproof2'],
      },
    ],
    buildSpec: {
      version: '1.0.0',
      leafEncoding: 'abi.encodePacked(address,uint256)',
      hashFunction: 'keccak256',
      sortPairs: true,
      sortAllocations: 'beneficiary-asc',
      duplicateHandling: 'reject',
      paddingStrategy: 'duplicate-last',
    },
    originalInput: {
      allocations: [
        {
          beneficiary: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          amount: '1000000',
        },
        {
          beneficiary: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
          amount: '2000000',
        },
      ],
    },
    inputHash: '0xinputhash',
  };
}

describe('Storage Backends', () => {
  describe('FilesystemBackend', () => {
    let backend: FilesystemBackend;

    beforeEach(async () => {
      // Clean up test directory
      await rm(TEST_DATA_DIR, { recursive: true, force: true });
      await mkdir(TEST_DATA_DIR, { recursive: true });
      backend = new FilesystemBackend(TEST_DATA_DIR);
    });

    afterEach(async () => {
      await rm(TEST_DATA_DIR, { recursive: true, force: true });
    });

    test('saves and retrieves a tree', async () => {
      const tree = createTestTree('test-tree-1');
      await backend.save(tree);

      const retrieved = await backend.get('test-tree-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('test-tree-1');
      expect(retrieved?.root).toBe(tree.root);
      expect(retrieved?.allocations.length).toBe(2);
    });

    test('returns null for non-existent tree', async () => {
      const result = await backend.get('non-existent');
      expect(result).toBeNull();
    });

    test('deletes a tree', async () => {
      const tree = createTestTree('test-tree-2');
      await backend.save(tree);

      const deleted = await backend.delete('test-tree-2');
      expect(deleted).toBe(true);

      const retrieved = await backend.get('test-tree-2');
      expect(retrieved).toBeNull();
    });

    test('delete returns false for non-existent tree', async () => {
      const deleted = await backend.delete('non-existent');
      expect(deleted).toBe(false);
    });

    test('lists all trees', async () => {
      const tree1 = createTestTree('tree-1');
      const tree2 = createTestTree('tree-2');

      await backend.save(tree1);
      await backend.save(tree2);

      const summaries = await backend.list();
      expect(summaries.length).toBe(2);
      expect(summaries.map((s) => s.id)).toContain('tree-1');
      expect(summaries.map((s) => s.id)).toContain('tree-2');
      expect(summaries[0].allocationCount).toBe(2);
      expect(summaries[0].totalAmount).toBe('3000000');
    });

    test('lists empty array when no trees exist', async () => {
      const summaries = await backend.list();
      expect(summaries.length).toBe(0);
    });

    test('health check returns healthy when dir exists', async () => {
      const health = await backend.health();
      expect(health.healthy).toBe(true);
      expect(health.error).toBeUndefined();
    });

    test('health check returns unhealthy when dir does not exist', async () => {
      await rm(TEST_DATA_DIR, { recursive: true, force: true });
      const health = await backend.health();
      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });

    test('has correct name', () => {
      expect(backend.name).toBe('filesystem');
    });
  });

  describe('MemoryBackend', () => {
    let backend: MemoryBackend;

    beforeEach(() => {
      backend = new MemoryBackend();
    });

    test('saves and retrieves a tree', async () => {
      const tree = createTestTree('memory-tree-1');
      await backend.save(tree);

      const retrieved = await backend.get('memory-tree-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('memory-tree-1');
      expect(retrieved?.root).toBe(tree.root);
    });

    test('returns null for non-existent tree', async () => {
      const result = await backend.get('non-existent');
      expect(result).toBeNull();
    });

    test('deletes a tree', async () => {
      const tree = createTestTree('memory-tree-2');
      await backend.save(tree);

      const deleted = await backend.delete('memory-tree-2');
      expect(deleted).toBe(true);

      const retrieved = await backend.get('memory-tree-2');
      expect(retrieved).toBeNull();
    });

    test('delete returns false for non-existent tree', async () => {
      const deleted = await backend.delete('non-existent');
      expect(deleted).toBe(false);
    });

    test('lists all trees', async () => {
      const tree1 = createTestTree('mem-tree-1');
      const tree2 = createTestTree('mem-tree-2');

      await backend.save(tree1);
      await backend.save(tree2);

      const summaries = await backend.list();
      expect(summaries.length).toBe(2);
      expect(summaries.map((s) => s.id)).toContain('mem-tree-1');
      expect(summaries.map((s) => s.id)).toContain('mem-tree-2');
    });

    test('clearAll clears all trees', async () => {
      const tree1 = createTestTree('mem-tree-3');
      const tree2 = createTestTree('mem-tree-4');

      await backend.save(tree1);
      await backend.save(tree2);

      backend.clearAll();

      const summaries = await backend.list();
      expect(summaries.length).toBe(0);
    });

    test('health check always returns healthy', async () => {
      const health = await backend.health();
      expect(health.healthy).toBe(true);
      expect(health.error).toBeUndefined();
    });

    test('has correct name', () => {
      expect(backend.name).toBe('memory');
    });
  });

  describe('ReplicatedStorage', () => {
    let primaryBackend: MemoryBackend;
    let replica1: MemoryBackend;
    let replica2: MemoryBackend;
    let replicatedStorage: ReplicatedStorage;

    beforeEach(() => {
      primaryBackend = new MemoryBackend();
      replica1 = new MemoryBackend();
      replica2 = new MemoryBackend();
      replicatedStorage = new ReplicatedStorage(primaryBackend, [
        replica1,
        replica2,
      ]);
    });

    test('writes to all backends on save', async () => {
      const tree = createTestTree('replicated-tree-1');
      await replicatedStorage.save(tree);

      // Verify tree exists in all backends
      const primaryTree = await primaryBackend.get('replicated-tree-1');
      const replica1Tree = await replica1.get('replicated-tree-1');
      const replica2Tree = await replica2.get('replicated-tree-1');

      expect(primaryTree).not.toBeNull();
      expect(replica1Tree).not.toBeNull();
      expect(replica2Tree).not.toBeNull();
      expect(primaryTree?.id).toBe('replicated-tree-1');
    });

    test('reads from primary first', async () => {
      const tree = createTestTree('replicated-tree-2');
      await primaryBackend.save(tree);

      const retrieved = await replicatedStorage.get('replicated-tree-2');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('replicated-tree-2');
    });

    test('falls back to replica if primary returns null', async () => {
      const tree = createTestTree('replicated-tree-3');
      await replica1.save(tree);

      const retrieved = await replicatedStorage.get('replicated-tree-3');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe('replicated-tree-3');
    });

    test('returns null if no backend has the tree', async () => {
      const retrieved = await replicatedStorage.get('non-existent');
      expect(retrieved).toBeNull();
    });

    test('requires primary write to succeed (PRIMARY_REQUIRED)', async () => {
      // Create a mock backend that always fails
      const failingPrimary: any = {
        name: 'failing-primary',
        save: async () => {
          throw new Error('Primary write failed');
        },
        get: async () => null,
        delete: async () => false,
        list: async () => [],
        health: async () => ({ healthy: false, error: 'Failing' }),
      };

      const replicatedWithFailingPrimary = new ReplicatedStorage(
        failingPrimary,
        [replica1]
      );

      const tree = createTestTree('failing-tree');

      // Should throw because primary write failed
      await expect(
        replicatedWithFailingPrimary.save(tree)
      ).rejects.toThrow();

      // Replica should not have the tree
      const replica1Tree = await replica1.get('failing-tree');
      expect(replica1Tree).toBeNull();
    });

    test('continues even if replica write fails', async () => {
      // Create a mock backend that always fails
      const failingReplica: any = {
        name: 'failing-replica',
        save: async () => {
          throw new Error('Replica write failed');
        },
        get: async () => null,
        delete: async () => false,
        list: async () => [],
        health: async () => ({ healthy: false, error: 'Failing' }),
      };

      const replicatedWithFailingReplica = new ReplicatedStorage(
        primaryBackend,
        [failingReplica, replica1]
      );

      const tree = createTestTree('partial-fail-tree');

      // Should NOT throw even though replica failed
      await replicatedWithFailingReplica.save(tree);

      // Primary and working replica should have the tree
      const primaryTree = await primaryBackend.get('partial-fail-tree');
      const replica1Tree = await replica1.get('partial-fail-tree');

      expect(primaryTree).not.toBeNull();
      expect(replica1Tree).not.toBeNull();
    });

    test('deletes from all backends', async () => {
      const tree = createTestTree('delete-tree');
      await replicatedStorage.save(tree);

      const deleted = await replicatedStorage.delete('delete-tree');
      expect(deleted).toBe(true);

      // Verify deleted from all backends
      const primaryTree = await primaryBackend.get('delete-tree');
      const replica1Tree = await replica1.get('delete-tree');
      const replica2Tree = await replica2.get('delete-tree');

      expect(primaryTree).toBeNull();
      expect(replica1Tree).toBeNull();
      expect(replica2Tree).toBeNull();
    });

    test('lists trees from primary', async () => {
      const tree1 = createTestTree('list-tree-1');
      const tree2 = createTestTree('list-tree-2');

      await primaryBackend.save(tree1);
      await primaryBackend.save(tree2);

      const summaries = await replicatedStorage.list();
      expect(summaries.length).toBe(2);
      expect(summaries.map((s) => s.id)).toContain('list-tree-1');
      expect(summaries.map((s) => s.id)).toContain('list-tree-2');
    });

    test('reconcile syncs missing data across backends', async () => {
      // Add tree only to primary
      const tree1 = createTestTree('sync-tree-1');
      await primaryBackend.save(tree1);

      // Add tree only to replica1
      const tree2 = createTestTree('sync-tree-2');
      await replica1.save(tree2);

      // Add tree only to replica2
      const tree3 = createTestTree('sync-tree-3');
      await replica2.save(tree3);

      // Run reconciliation
      const result = await replicatedStorage.reconcile();

      expect(result.synced).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);

      // Verify all trees are in all backends
      expect(await primaryBackend.get('sync-tree-1')).not.toBeNull();
      expect(await primaryBackend.get('sync-tree-2')).not.toBeNull();
      expect(await primaryBackend.get('sync-tree-3')).not.toBeNull();

      expect(await replica1.get('sync-tree-1')).not.toBeNull();
      expect(await replica1.get('sync-tree-2')).not.toBeNull();
      expect(await replica1.get('sync-tree-3')).not.toBeNull();

      expect(await replica2.get('sync-tree-1')).not.toBeNull();
      expect(await replica2.get('sync-tree-2')).not.toBeNull();
      expect(await replica2.get('sync-tree-3')).not.toBeNull();
    });

    test('health returns aggregate status', async () => {
      const health = await replicatedStorage.health();
      expect(health.healthy).toBe(true);
      expect(health.error).toBeUndefined();
    });

    test('health returns unhealthy if primary is unhealthy', async () => {
      const unhealthyPrimary: any = {
        name: 'unhealthy-primary',
        save: async () => {},
        get: async () => null,
        delete: async () => false,
        list: async () => [],
        health: async () => ({ healthy: false, error: 'Primary is down' }),
      };

      const replicatedWithUnhealthyPrimary = new ReplicatedStorage(
        unhealthyPrimary,
        [replica1]
      );

      const health = await replicatedWithUnhealthyPrimary.health();
      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Primary is down');
    });

    test('has correct name', () => {
      expect(replicatedStorage.name).toBe('replicated');
    });
  });
});
