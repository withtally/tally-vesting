import { describe, expect, it, mock } from 'bun:test';
import type { Hex } from 'viem';
import {
  serializeTreeForIpfs,
  deserializeTreeFromIpfs,
  computeContentHash,
  uploadTreeToIpfs,
  downloadTreeFromIpfs,
  verifyIpfsData,
  type IpfsClient,
} from '../src/services/ipfs';
import type { MerkleTree } from '../src/types';

describe('IPFS Service', () => {
  // Test merkle tree
  const mockTree: MerkleTree = {
    id: 'test-tree-1',
    root: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
    token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex,
    createdAt: '2024-01-01T00:00:00.000Z',
    allocations: [
      {
        beneficiary: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex,
        amount: '1000000000000000000000',
        leaf: '0xaaaa' as Hex,
        proof: ['0xbbbb' as Hex],
      },
    ],
    vesting: {
      vestingStart: 1704067200,
      vestingDuration: 31536000,
      cliffDuration: 7776000,
    },
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
          beneficiary: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex,
          amount: '1000000000000000000000',
        },
      ],
      token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex,
      vesting: {
        vestingStart: 1704067200,
        vestingDuration: 31536000,
        cliffDuration: 7776000,
      },
    },
    inputHash: '0xcccc' as Hex,
  };

  describe('serializeTreeForIpfs', () => {
    it('serializes tree to deterministic JSON', () => {
      const serialized = serializeTreeForIpfs(mockTree);

      // Should be valid JSON
      expect(() => JSON.parse(serialized)).not.toThrow();

      // Should be a string
      expect(typeof serialized).toBe('string');
    });

    it('includes buildSpec and originalInput', () => {
      const serialized = serializeTreeForIpfs(mockTree);
      const parsed = JSON.parse(serialized);

      expect(parsed.buildSpec).toEqual(mockTree.buildSpec);
      expect(parsed.originalInput).toEqual(mockTree.originalInput);
    });

    it('sorts keys for determinism', () => {
      // Serialize twice - should produce identical output
      const serialized1 = serializeTreeForIpfs(mockTree);
      const serialized2 = serializeTreeForIpfs(mockTree);

      expect(serialized1).toBe(serialized2);
    });

    it('produces same output for same data in different order', () => {
      // Create tree with same data but properties potentially in different order
      const tree1: MerkleTree = { ...mockTree };
      const tree2: MerkleTree = {
        buildSpec: mockTree.buildSpec,
        allocations: mockTree.allocations,
        root: mockTree.root,
        id: mockTree.id,
        createdAt: mockTree.createdAt,
        token: mockTree.token,
        vesting: mockTree.vesting,
        originalInput: mockTree.originalInput,
        inputHash: mockTree.inputHash,
      };

      const serialized1 = serializeTreeForIpfs(tree1);
      const serialized2 = serializeTreeForIpfs(tree2);

      expect(serialized1).toBe(serialized2);
    });
  });

  describe('deserializeTreeFromIpfs', () => {
    it('deserializes valid JSON back to MerkleTree', () => {
      const serialized = serializeTreeForIpfs(mockTree);
      const deserialized = deserializeTreeFromIpfs(serialized);

      expect(deserialized).toEqual(mockTree);
    });

    it('throws for invalid JSON', () => {
      expect(() => deserializeTreeFromIpfs('not valid json')).toThrow('Invalid JSON');
    });

    it('throws for missing required fields', () => {
      const incomplete = JSON.stringify({ root: '0x1234' });

      expect(() => deserializeTreeFromIpfs(incomplete)).toThrow('Invalid tree data');
    });

    it('validates all required fields are present', () => {
      const requiredFields = ['id', 'root', 'createdAt', 'allocations', 'buildSpec', 'originalInput', 'inputHash'];

      for (const field of requiredFields) {
        const incomplete = { ...mockTree };
        delete (incomplete as unknown as Record<string, unknown>)[field];
        const serialized = JSON.stringify(incomplete);

        expect(() => deserializeTreeFromIpfs(serialized)).toThrow('Invalid tree data');
      }
    });
  });

  describe('computeContentHash', () => {
    it('returns consistent hash for same tree', () => {
      const hash1 = computeContentHash(mockTree);
      const hash2 = computeContentHash(mockTree);

      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different trees', () => {
      const tree2 = {
        ...mockTree,
        root: '0xdifferent' as Hex,
      };

      const hash1 = computeContentHash(mockTree);
      const hash2 = computeContentHash(tree2);

      expect(hash1).not.toBe(hash2);
    });

    it('returns valid hex hash', () => {
      const hash = computeContentHash(mockTree);

      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('changes when any critical field changes', () => {
      const originalHash = computeContentHash(mockTree);

      // Change root
      const tree2 = { ...mockTree, root: '0xaaaa' as Hex };
      expect(computeContentHash(tree2)).not.toBe(originalHash);

      // Change allocations
      const tree3 = {
        ...mockTree,
        allocations: [
          ...mockTree.allocations,
          {
            beneficiary: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Hex,
            amount: '2000000000000000000000',
            leaf: '0xdddd' as Hex,
            proof: ['0xeeee' as Hex],
          },
        ],
      };
      expect(computeContentHash(tree3)).not.toBe(originalHash);
    });
  });

  describe('IpfsClient (mocked)', () => {
    it('uploadToIpfs returns CID', async () => {
      const mockClient: IpfsClient = {
        upload: mock(async () => 'QmTest123456789'),
        download: mock(async () => ''),
        pin: mock(async () => {}),
      };

      const result = await uploadTreeToIpfs(mockTree, mockClient);

      expect(result.cid).toBe('QmTest123456789');
      expect(result.contentHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(mockClient.upload).toHaveBeenCalledTimes(1);
    });

    it('downloadFromIpfs returns tree data', async () => {
      const serialized = serializeTreeForIpfs(mockTree);

      const mockClient: IpfsClient = {
        upload: mock(async () => ''),
        download: mock(async () => serialized),
        pin: mock(async () => {}),
      };

      const tree = await downloadTreeFromIpfs('QmTest', mockClient);

      expect(tree).toEqual(mockTree);
      expect(mockClient.download).toHaveBeenCalledWith('QmTest');
    });

    it('verifyIpfsData validates against expected root', async () => {
      const serialized = serializeTreeForIpfs(mockTree);

      const mockClient: IpfsClient = {
        upload: mock(async () => ''),
        download: mock(async () => serialized),
        pin: mock(async () => {}),
      };

      // Should return true for matching root
      const validResult = await verifyIpfsData('QmTest', mockTree.root, mockClient);
      expect(validResult).toBe(true);

      // Should return false for non-matching root
      const invalidResult = await verifyIpfsData('QmTest', '0xwrong' as Hex, mockClient);
      expect(invalidResult).toBe(false);
    });

    it('uploadToIpfs serializes tree before uploading', async () => {
      let uploadedData = '';

      const mockClient: IpfsClient = {
        upload: mock(async (data: string) => {
          uploadedData = data;
          return 'QmTest';
        }),
        download: mock(async () => ''),
        pin: mock(async () => {}),
      };

      await uploadTreeToIpfs(mockTree, mockClient);

      // Verify uploaded data can be deserialized back
      const deserialized = deserializeTreeFromIpfs(uploadedData);
      expect(deserialized).toEqual(mockTree);
    });
  });

  describe('createIpfsClient', () => {
    it('is exported and returns an IpfsClient interface', async () => {
      const { createIpfsClient } = await import('../src/services/ipfs');
      const client = createIpfsClient();

      expect(client).toHaveProperty('upload');
      expect(client).toHaveProperty('download');
      expect(client).toHaveProperty('pin');
    });
  });
});
