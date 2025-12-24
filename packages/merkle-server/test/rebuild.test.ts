import { describe, expect, it } from 'bun:test';
import { rebuildTree, verifyRebuild, rebuildFromStoredInput } from '../src/services/rebuild';
import { buildTree } from '../src/services/merkle';
import { canonicalizeAllocations, computeInputHash, BUILD_SPEC } from '../src/services/canonicalize';
import type { Hex } from 'viem';
import type { MerkleTree, Allocation, VestingParams, PlatformFeeParams } from '../src/types';

describe('Rebuild Service', () => {
  // Test data
  const alice = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
  const bob = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Hex;
  const carol = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Hex;
  const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex;

  const aliceAmount = '1000000000000000000000';
  const bobAmount = '2000000000000000000000';
  const carolAmount = '500000000000000000000';

  const allocations: Allocation[] = [
    { beneficiary: alice, amount: aliceAmount },
    { beneficiary: bob, amount: bobAmount },
    { beneficiary: carol, amount: carolAmount },
  ];

  const vestingParams: VestingParams = {
    vestingStart: 1000000,
    vestingDuration: 31536000, // 1 year
    cliffDuration: 7776000, // 90 days
  };
  const platformFee: PlatformFeeParams = {
    feeRecipient: '0x2222222222222222222222222222222222222222' as Hex,
    feeBps: 250,
  };

  describe('rebuildTree', () => {
    it('rebuilds tree with identical root from same allocations', () => {
      const rebuilt = rebuildTree({ allocations });
      const original = buildTree(canonicalizeAllocations(allocations));

      expect(rebuilt.root).toBe(original.root);
    });

    it('rebuilds tree with identical proofs for each beneficiary', () => {
      const rebuilt = rebuildTree({ allocations });
      const original = buildTree(canonicalizeAllocations(allocations));

      // Check each allocation has matching proofs
      for (let i = 0; i < allocations.length; i++) {
        expect(rebuilt.allocations[i].beneficiary).toBe(original.allocations[i].beneficiary);
        expect(rebuilt.allocations[i].amount).toBe(original.allocations[i].amount);
        expect(rebuilt.allocations[i].leaf).toBe(original.allocations[i].leaf);
        expect(rebuilt.allocations[i].proof).toEqual(original.allocations[i].proof);
      }
    });

    it('produces different root for different allocations', () => {
      const tree1 = rebuildTree({ allocations });
      const tree2 = rebuildTree({
        allocations: [
          { beneficiary: alice, amount: aliceAmount },
          { beneficiary: bob, amount: carolAmount }, // Different amount
        ],
      });

      expect(tree1.root).not.toBe(tree2.root);
    });

    it('produces different root for different order (pre-canonicalization)', () => {
      // When allocations are in different order but not canonicalized
      const ordered = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];
      const reversed = [
        { beneficiary: bob, amount: bobAmount },
        { beneficiary: alice, amount: aliceAmount },
      ];

      // The rebuild function SHOULD canonicalize, so same root expected
      const tree1 = rebuildTree({ allocations: ordered });
      const tree2 = rebuildTree({ allocations: reversed });

      // After canonicalization, should be same root
      expect(tree1.root).toBe(tree2.root);
    });

    it('produces same root regardless of input order after canonicalization', () => {
      const shuffled1 = [
        { beneficiary: carol, amount: carolAmount },
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];

      const shuffled2 = [
        { beneficiary: bob, amount: bobAmount },
        { beneficiary: carol, amount: carolAmount },
        { beneficiary: alice, amount: aliceAmount },
      ];

      const tree1 = rebuildTree({ allocations: shuffled1 });
      const tree2 = rebuildTree({ allocations: shuffled2 });

      expect(tree1.root).toBe(tree2.root);
    });

    it('includes buildSpec in rebuilt tree', () => {
      const rebuilt = rebuildTree({ allocations });

      expect(rebuilt.buildSpec).toEqual(BUILD_SPEC);
    });

    it('includes inputHash in rebuilt tree', () => {
      const rebuilt = rebuildTree({ allocations });

      expect(rebuilt.inputHash).toMatch(/^0x[a-f0-9]{64}$/);

      // Verify inputHash is computed correctly
      const canonicalAllocations = canonicalizeAllocations(allocations);
      const expectedHash = computeInputHash(canonicalAllocations);
      expect(rebuilt.inputHash).toBe(expectedHash);
    });

    it('includes originalInput in rebuilt tree', () => {
      const rebuilt = rebuildTree({ allocations, token, vesting: vestingParams, platformFee });

      expect(rebuilt.originalInput).toBeDefined();
      expect(rebuilt.originalInput.allocations).toEqual(allocations);
      expect(rebuilt.originalInput.token).toBe(token);
      expect(rebuilt.originalInput.vesting).toEqual(vestingParams);
      expect(rebuilt.originalInput.platformFee).toEqual(platformFee);
    });

    it('stores token in rebuilt tree', () => {
      const rebuilt = rebuildTree({ allocations, token });

      expect(rebuilt.token).toBe(token);
    });

    it('stores vesting params in rebuilt tree', () => {
      const rebuilt = rebuildTree({ allocations, vesting: vestingParams });

      expect(rebuilt.vesting).toEqual(vestingParams);
    });

    it('computes different inputHash when token is included', () => {
      const tree1 = rebuildTree({ allocations });
      const tree2 = rebuildTree({ allocations, token });

      expect(tree1.inputHash).not.toBe(tree2.inputHash);
    });

    it('computes different inputHash when vesting is included', () => {
      const tree1 = rebuildTree({ allocations });
      const tree2 = rebuildTree({ allocations, vesting: vestingParams });

      expect(tree1.inputHash).not.toBe(tree2.inputHash);
    });

    it('computes different inputHash when platform fee is included', () => {
      const tree1 = rebuildTree({ allocations });
      const tree2 = rebuildTree({ allocations, platformFee });

      expect(tree1.inputHash).not.toBe(tree2.inputHash);
    });
  });

  describe('verifyRebuild', () => {
    it('returns true when rebuilt tree matches original', () => {
      const original = rebuildTree({ allocations });
      const rebuilt = rebuildTree({ allocations });

      const matches = verifyRebuild(original, rebuilt);

      expect(matches).toBe(true);
    });

    it('returns false when roots differ', () => {
      const original = rebuildTree({ allocations });
      const different = rebuildTree({
        allocations: [
          { beneficiary: alice, amount: aliceAmount },
          { beneficiary: bob, amount: carolAmount },
        ],
      });

      const matches = verifyRebuild(original, different);

      expect(matches).toBe(false);
    });

    it('returns false when proofs differ', () => {
      const original = rebuildTree({ allocations });

      // Create a tree with modified proofs
      const modified = { ...original };
      modified.allocations = [...original.allocations];
      modified.allocations[0] = {
        ...original.allocations[0],
        proof: ['0x0000000000000000000000000000000000000000000000000000000000000000' as Hex],
      };

      const matches = verifyRebuild(original, modified);

      expect(matches).toBe(false);
    });

    it('returns true for trees with vesting params', () => {
      const original = rebuildTree({ allocations, vesting: vestingParams });
      const rebuilt = rebuildTree({ allocations, vesting: vestingParams });

      const matches = verifyRebuild(original, rebuilt);

      expect(matches).toBe(true);
    });

    it('returns true for trees with token', () => {
      const original = rebuildTree({ allocations, token });
      const rebuilt = rebuildTree({ allocations, token });

      const matches = verifyRebuild(original, rebuilt);

      expect(matches).toBe(true);
    });

    it('returns false when inputHash differs', () => {
      const original = rebuildTree({ allocations });
      const different = rebuildTree({ allocations, token });

      const matches = verifyRebuild(original, different);

      expect(matches).toBe(false);
    });

    it('returns true for trees with platform fee', () => {
      const original = rebuildTree({ allocations, platformFee });
      const rebuilt = rebuildTree({ allocations, platformFee });

      const matches = verifyRebuild(original, rebuilt);

      expect(matches).toBe(true);
    });
  });

  describe('rebuildFromStoredInput', () => {
    it('rebuilds using stored originalInput from tree', () => {
      // Create an original tree with stored input
      const originalTree = rebuildTree({ allocations, token, vesting: vestingParams, platformFee });

      // Rebuild from stored input
      const result = rebuildFromStoredInput(originalTree);

      expect(result.tree.root).toBe(originalTree.root);
      expect(result.tree.inputHash).toBe(originalTree.inputHash);
      expect(result.matchesOriginal).toBe(true);
    });

    it('throws if tree has no originalInput', () => {
      // Create a tree without originalInput (simulating old format)
      const treeWithoutInput: MerkleTree = {
        id: 'test-id',
        root: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        createdAt: new Date().toISOString(),
        allocations: [],
        buildSpec: BUILD_SPEC,
        originalInput: undefined as any, // Simulate missing originalInput
        inputHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
      };

      expect(() => rebuildFromStoredInput(treeWithoutInput)).toThrow('No stored input');
    });

    it('verifies inputHash matches after rebuild', () => {
      const originalTree = rebuildTree({ allocations });

      const result = rebuildFromStoredInput(originalTree);

      expect(result.tree.inputHash).toBe(originalTree.inputHash);
    });

    it('rebuilds tree with all allocations and proofs matching', () => {
      const originalTree = rebuildTree({ allocations });

      const result = rebuildFromStoredInput(originalTree);

      expect(result.tree.allocations).toHaveLength(originalTree.allocations.length);

      for (let i = 0; i < originalTree.allocations.length; i++) {
        expect(result.tree.allocations[i].beneficiary).toBe(originalTree.allocations[i].beneficiary);
        expect(result.tree.allocations[i].amount).toBe(originalTree.allocations[i].amount);
        expect(result.tree.allocations[i].leaf).toBe(originalTree.allocations[i].leaf);
        expect(result.tree.allocations[i].proof).toEqual(originalTree.allocations[i].proof);
      }
    });

    it('preserves token in rebuilt tree', () => {
      const originalTree = rebuildTree({ allocations, token });

      const result = rebuildFromStoredInput(originalTree);

      expect(result.tree.token).toBe(token);
    });

    it('preserves vesting params in rebuilt tree', () => {
      const originalTree = rebuildTree({ allocations, vesting: vestingParams });

      const result = rebuildFromStoredInput(originalTree);

      expect(result.tree.vesting).toEqual(vestingParams);
    });

    it('preserves platform fee in rebuilt tree', () => {
      const originalTree = rebuildTree({ allocations, platformFee });

      const result = rebuildFromStoredInput(originalTree);

      expect(result.tree.platformFee).toEqual(platformFee);
    });
  });
});
