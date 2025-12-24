import { describe, expect, it } from 'bun:test';
import type { Hex } from 'viem';
import { buildTree } from '../src/services/merkle';
import {
  generateProofPackage,
  generateBatchProofPackage,
  validateProofPackage,
  verifyProofPackageAgainstRoot,
} from '../src/services/proofPackage';
import type { MerkleTree, VestingParams, PlatformFeeParams } from '../src/types';
import { BUILD_SPEC } from '../src/services/canonicalize';

// Test data
const alice = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
const bob = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Hex;
const carol = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Hex;
const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex;

const aliceAmount = '1000000000000000000000';
const bobAmount = '2000000000000000000000';
const carolAmount = '500000000000000000000';

const ONE_DAY = 86400;
const ONE_YEAR = 365 * ONE_DAY;
const vestingParams: VestingParams = {
  vestingStart: Math.floor(Date.now() / 1000),
  vestingDuration: ONE_YEAR,
  cliffDuration: 90 * ONE_DAY,
};
const platformFee: PlatformFeeParams = {
  feeRecipient: '0x1234567890123456789012345678901234567890' as Hex,
  feeBps: 250,
};

describe('ProofPackage Service', () => {
  describe('generateProofPackage', () => {
    it('generates valid package with all required fields', () => {
      const allocations = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-1',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);

      expect(pkg.version).toBe('1.0');
      expect(pkg.generatedAt).toBeDefined();
      expect(pkg.treeId).toBe('test-tree-1');
      expect(pkg.merkleRoot).toBe(root);
      expect(pkg.beneficiary).toBe(alice);
      expect(pkg.amount).toBe(aliceAmount);
      expect(pkg.leaf).toMatch(/^0x[a-f0-9]{64}$/);
      expect(pkg.proof).toBeInstanceOf(Array);
      expect(pkg.proof.length).toBeGreaterThan(0);
      expect(pkg.buildSpec).toEqual(BUILD_SPEC);
    });

    it('includes vesting params when tree has vesting', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-2',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        vesting: vestingParams,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations, vesting: vestingParams },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);

      expect(pkg.vesting).toEqual(vestingParams);
    });

    it('includes platform fee when tree has platform fee', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-2b',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        platformFee,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations, platformFee },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);

      expect(pkg.platformFee).toEqual(platformFee);
    });

    it('includes contract info when provided', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-3',
        root,
        token,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations, token },
        inputHash: '0x1234' as Hex,
      };

      const contractInfo = {
        chainId: 1,
        deployerAddress: '0x1234567890123456789012345678901234567890' as Hex,
        token,
      };

      const pkg = generateProofPackage(tree, alice, contractInfo);

      expect(pkg.contract).toEqual(contractInfo);
    });

    it('includes buildSpec from tree', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-4',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);

      expect(pkg.buildSpec).toEqual(BUILD_SPEC);
      expect(pkg.buildSpec.version).toBe('1.0.0');
      expect(pkg.buildSpec.leafEncoding).toBe('abi.encodePacked(address,uint256)');
    });

    it('sets version to 1.0', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-5',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);

      expect(pkg.version).toBe('1.0');
    });

    it('throws for non-existent beneficiary', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-6',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      expect(() => generateProofPackage(tree, bob)).toThrow('Beneficiary not found in tree');
    });
  });

  describe('generateBatchProofPackage', () => {
    it('includes all allocations', () => {
      const allocations = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
        { beneficiary: carol, amount: carolAmount },
      ];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-7',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateBatchProofPackage(tree);

      expect(pkg.allocations).toHaveLength(3);
    });

    it('each allocation has beneficiary, amount, leaf, proof', () => {
      const allocations = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-8',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateBatchProofPackage(tree);

      for (const alloc of pkg.allocations) {
        expect(alloc.beneficiary).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(alloc.amount).toMatch(/^\d+$/);
        expect(alloc.leaf).toMatch(/^0x[a-f0-9]{64}$/);
        expect(alloc.proof).toBeInstanceOf(Array);
        expect(alloc.proof.length).toBeGreaterThan(0);
      }
    });

    it('includes shared tree metadata', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-9',
        root,
        token,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        vesting: vestingParams,
        platformFee,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations, token, vesting: vestingParams, platformFee },
        inputHash: '0x1234' as Hex,
      };

      const contractInfo = {
        chainId: 1,
        deployerAddress: '0x1234567890123456789012345678901234567890' as Hex,
        token,
      };

      const pkg = generateBatchProofPackage(tree, contractInfo);

      expect(pkg.version).toBe('1.0');
      expect(pkg.treeId).toBe('test-tree-9');
      expect(pkg.merkleRoot).toBe(root);
      expect(pkg.vesting).toEqual(vestingParams);
      expect(pkg.platformFee).toEqual(platformFee);
      expect(pkg.contract).toEqual(contractInfo);
      expect(pkg.buildSpec).toEqual(BUILD_SPEC);
    });
  });

  describe('validateProofPackage', () => {
    it('returns valid for well-formed package', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-10',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);
      const validation = validateProofPackage(pkg);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('returns errors for missing required fields', () => {
      const invalidPkg = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        // Missing treeId, merkleRoot, beneficiary, etc.
      };

      const validation = validateProofPackage(invalidPkg);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some((e) => e.includes('treeId'))).toBe(true);
    });

    it('returns errors for invalid address format', () => {
      const invalidPkg = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        treeId: 'test-tree',
        merkleRoot: '0x1234567890123456789012345678901234567890123456789012345678901234',
        beneficiary: 'invalid-address',
        amount: '1000',
        leaf: '0x1234567890123456789012345678901234567890123456789012345678901234',
        proof: [],
        buildSpec: BUILD_SPEC,
      };

      const validation = validateProofPackage(invalidPkg);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('beneficiary'))).toBe(true);
    });

    it('returns errors for invalid proof format', () => {
      const invalidPkg = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        treeId: 'test-tree',
        merkleRoot: '0x1234567890123456789012345678901234567890123456789012345678901234',
        beneficiary: alice,
        amount: '1000',
        leaf: '0x1234567890123456789012345678901234567890123456789012345678901234',
        proof: ['invalid-proof'],
        buildSpec: BUILD_SPEC,
      };

      const validation = validateProofPackage(invalidPkg);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('proof'))).toBe(true);
    });

    it('returns errors for version mismatch', () => {
      const invalidPkg = {
        version: '2.0', // Wrong version
        generatedAt: new Date().toISOString(),
        treeId: 'test-tree',
        merkleRoot: '0x1234567890123456789012345678901234567890123456789012345678901234',
        beneficiary: alice,
        amount: '1000',
        leaf: '0x1234567890123456789012345678901234567890123456789012345678901234',
        proof: [],
        buildSpec: BUILD_SPEC,
      };

      const validation = validateProofPackage(invalidPkg);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes('version'))).toBe(true);
    });
  });

  describe('verifyProofPackageAgainstRoot', () => {
    it('returns true for valid proof', () => {
      const allocations = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-11',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);
      const verified = verifyProofPackageAgainstRoot(pkg, root);

      expect(verified).toBe(true);
    });

    it('returns false for tampered amount', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-12',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);

      // Tamper with amount
      const tamperedPkg = { ...pkg, amount: '9999999999999999999999' };
      const verified = verifyProofPackageAgainstRoot(tamperedPkg, root);

      expect(verified).toBe(false);
    });

    it('returns false for tampered proof', () => {
      const allocations = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-13',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);

      // Tamper with proof
      const tamperedPkg = {
        ...pkg,
        proof: ['0x1234567890123456789012345678901234567890123456789012345678901234' as Hex],
      };
      const verified = verifyProofPackageAgainstRoot(tamperedPkg, root);

      expect(verified).toBe(false);
    });

    it('returns false for wrong root', () => {
      const allocations = [{ beneficiary: alice, amount: aliceAmount }];
      const { root, allocations: allocsWithProof } = buildTree(allocations);

      const tree: MerkleTree = {
        id: 'test-tree-14',
        root,
        createdAt: new Date().toISOString(),
        allocations: allocsWithProof,
        buildSpec: BUILD_SPEC,
        originalInput: { allocations },
        inputHash: '0x1234' as Hex,
      };

      const pkg = generateProofPackage(tree, alice);
      const wrongRoot = '0x9999999999999999999999999999999999999999999999999999999999999999' as Hex;
      const verified = verifyProofPackageAgainstRoot(pkg, wrongRoot);

      expect(verified).toBe(false);
    });
  });
});
