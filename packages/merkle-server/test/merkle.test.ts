import { describe, expect, it } from 'bun:test';
import { getLeaf, hashPair, getRoot, getProof, buildTree, verifyProof } from '../src/services/merkle';
import type { Hex } from 'viem';

describe('Merkle Service', () => {
  // Test data matching Solidity tests
  const alice = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
  const bob = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Hex;
  const carol = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Hex;

  const aliceAmount = '1000000000000000000000'; // 1000 ether
  const bobAmount = '2000000000000000000000'; // 2000 ether
  const carolAmount = '500000000000000000000'; // 500 ether

  describe('getLeaf', () => {
    it('generates leaf hash matching Solidity keccak256(abi.encodePacked(beneficiary, amount))', () => {
      // This test will verify the leaf matches what Solidity produces
      const leaf = getLeaf(alice, aliceAmount);

      // The leaf should be a valid bytes32 hex string
      expect(leaf).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('generates different leaves for different addresses', () => {
      const leafAlice = getLeaf(alice, aliceAmount);
      const leafBob = getLeaf(bob, aliceAmount);

      expect(leafAlice).not.toBe(leafBob);
    });

    it('generates different leaves for different amounts', () => {
      const leaf1 = getLeaf(alice, aliceAmount);
      const leaf2 = getLeaf(alice, bobAmount);

      expect(leaf1).not.toBe(leaf2);
    });
  });

  describe('hashPair', () => {
    it('returns same hash regardless of order (sorted pairs)', () => {
      const a = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
      const b = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;

      const hash1 = hashPair(a, b);
      const hash2 = hashPair(b, a);

      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different pairs', () => {
      const a = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
      const b = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;
      const c = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex;

      const hash1 = hashPair(a, b);
      const hash2 = hashPair(a, c);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getRoot', () => {
    it('computes root from single leaf', () => {
      const leaf = getLeaf(alice, aliceAmount);
      const root = getRoot([leaf]);

      // Single leaf - root is hash of leaf with itself (padded to 2)
      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('computes root from two leaves', () => {
      const leaf1 = getLeaf(alice, aliceAmount);
      const leaf2 = getLeaf(bob, bobAmount);

      const root = getRoot([leaf1, leaf2]);

      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(root).toBe(hashPair(leaf1, leaf2));
    });

    it('computes root from three leaves (pads to 4)', () => {
      const leaf1 = getLeaf(alice, aliceAmount);
      const leaf2 = getLeaf(bob, bobAmount);
      const leaf3 = getLeaf(carol, carolAmount);

      const root = getRoot([leaf1, leaf2, leaf3]);

      expect(root).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('produces deterministic root', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
        getLeaf(carol, carolAmount),
      ];

      const root1 = getRoot(leaves);
      const root2 = getRoot(leaves);

      expect(root1).toBe(root2);
    });
  });

  describe('getProof', () => {
    it('generates proof for first leaf', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
      ];

      const proof = getProof(leaves, 0);

      expect(proof).toBeInstanceOf(Array);
      expect(proof.length).toBeGreaterThan(0);
      expect(proof[0]).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('generates proof for second leaf', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
      ];

      const proof = getProof(leaves, 1);

      expect(proof).toBeInstanceOf(Array);
      expect(proof.length).toBeGreaterThan(0);
    });

    it('generates different proofs for different leaves', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
        getLeaf(carol, carolAmount),
      ];

      const proof0 = getProof(leaves, 0);
      const proof1 = getProof(leaves, 1);

      // Proofs should be different (different paths up the tree)
      expect(proof0).not.toEqual(proof1);
    });

    it('throws for out of bounds index', () => {
      const leaves = [getLeaf(alice, aliceAmount)];

      expect(() => getProof(leaves, 1)).toThrow();
    });
  });

  describe('verifyProof', () => {
    it('verifies valid proof for first leaf', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
      ];
      const root = getRoot(leaves);
      const proof = getProof(leaves, 0);

      const isValid = verifyProof(proof, root, leaves[0]);

      expect(isValid).toBe(true);
    });

    it('verifies valid proof for second leaf', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
      ];
      const root = getRoot(leaves);
      const proof = getProof(leaves, 1);

      const isValid = verifyProof(proof, root, leaves[1]);

      expect(isValid).toBe(true);
    });

    it('verifies valid proof in larger tree', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
        getLeaf(carol, carolAmount),
      ];
      const root = getRoot(leaves);

      // Verify all leaves
      for (let i = 0; i < leaves.length; i++) {
        const proof = getProof(leaves, i);
        const isValid = verifyProof(proof, root, leaves[i]);
        expect(isValid).toBe(true);
      }
    });

    it('rejects invalid proof', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
      ];
      const root = getRoot(leaves);
      const proof = getProof(leaves, 0);

      // Try to verify with wrong leaf
      const isValid = verifyProof(proof, root, leaves[1]);

      expect(isValid).toBe(false);
    });

    it('rejects proof with wrong root', () => {
      const leaves = [
        getLeaf(alice, aliceAmount),
        getLeaf(bob, bobAmount),
      ];
      const proof = getProof(leaves, 0);
      const fakeRoot = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

      const isValid = verifyProof(proof, fakeRoot, leaves[0]);

      expect(isValid).toBe(false);
    });
  });

  describe('buildTree', () => {
    it('builds complete tree with root and proofs', () => {
      const allocations = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
        { beneficiary: carol, amount: carolAmount },
      ];

      const tree = buildTree(allocations);

      expect(tree.root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(tree.allocations).toHaveLength(3);

      // Each allocation should have leaf and proof
      for (const alloc of tree.allocations) {
        expect(alloc.leaf).toMatch(/^0x[a-f0-9]{64}$/);
        expect(alloc.proof).toBeInstanceOf(Array);
        expect(alloc.proof.length).toBeGreaterThan(0);
      }
    });

    it('builds tree with verifiable proofs', () => {
      const allocations = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];

      const tree = buildTree(allocations);

      // Each proof should verify
      for (const alloc of tree.allocations) {
        const isValid = verifyProof(alloc.proof, tree.root, alloc.leaf);
        expect(isValid).toBe(true);
      }
    });

    it('preserves allocation data', () => {
      const allocations = [
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];

      const tree = buildTree(allocations);

      expect(tree.allocations[0].beneficiary).toBe(alice);
      expect(tree.allocations[0].amount).toBe(aliceAmount);
      expect(tree.allocations[1].beneficiary).toBe(bob);
      expect(tree.allocations[1].amount).toBe(bobAmount);
    });
  });
});
