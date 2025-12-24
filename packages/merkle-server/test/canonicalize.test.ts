import { describe, expect, it } from 'bun:test';
import type { Hex } from 'viem';
import {
  normalizeAddress,
  normalizeAmount,
  canonicalizeAllocations,
  computeInputHash,
  BUILD_SPEC,
} from '../src/services/canonicalize';
import type { Allocation } from '../src/types';

describe('Canonicalization Service', () => {
  describe('normalizeAddress', () => {
    it('lowercases valid hex addresses', () => {
      const input = '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
      const result = normalizeAddress(input);

      expect(result).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
      expect(result).toMatch(/^0x[a-f0-9]{40}$/);
    });

    it('validates hex address format', () => {
      expect(() => normalizeAddress('invalid')).toThrow();
      expect(() => normalizeAddress('0x123')).toThrow(); // too short
      expect(() => normalizeAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG')).toThrow(); // invalid hex
    });

    it('rejects empty or non-hex strings', () => {
      expect(() => normalizeAddress('')).toThrow();
      expect(() => normalizeAddress('not-hex')).toThrow();
    });

    it('handles already lowercase addresses', () => {
      const input = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
      const result = normalizeAddress(input);

      expect(result).toBe(input);
    });
  });

  describe('normalizeAmount', () => {
    it('removes leading zeros from valid amounts', () => {
      expect(normalizeAmount('0001000')).toBe('1000');
      expect(normalizeAmount('00000')).toBe('0');
      expect(normalizeAmount('0')).toBe('0');
    });

    it('keeps amounts without leading zeros unchanged', () => {
      expect(normalizeAmount('1000')).toBe('1000');
      expect(normalizeAmount('123456789')).toBe('123456789');
    });

    it('rejects negative amounts', () => {
      expect(() => normalizeAmount('-100')).toThrow();
      expect(() => normalizeAmount('-1')).toThrow();
    });

    it('rejects invalid amount formats', () => {
      expect(() => normalizeAmount('abc')).toThrow();
      expect(() => normalizeAmount('12.34')).toThrow(); // decimals not allowed
      expect(() => normalizeAmount('')).toThrow();
      expect(() => normalizeAmount('1e10')).toThrow(); // scientific notation
    });

    it('handles zero correctly', () => {
      expect(normalizeAmount('0')).toBe('0');
      expect(normalizeAmount('00')).toBe('0');
      expect(normalizeAmount('0000')).toBe('0');
    });

    it('handles large numbers', () => {
      const largeNum = '1000000000000000000000'; // 1000 ether in wei
      expect(normalizeAmount(largeNum)).toBe(largeNum);
    });
  });

  describe('canonicalizeAllocations', () => {
    const alice = '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
    const bob = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Hex;
    const carol = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Hex;

    it('sorts allocations by beneficiary ascending (case-insensitive)', () => {
      const allocations: Allocation[] = [
        { beneficiary: alice, amount: '1000' },
        { beneficiary: carol, amount: '500' },
        { beneficiary: bob, amount: '2000' },
      ];

      const result = canonicalizeAllocations(allocations);

      // After normalization (lowercase), check if sorted
      // Sorted order: carol (0x3c...), bob (0x70...), alice (0xf3...)
      expect(result[0].beneficiary.toLowerCase()).toBe(carol.toLowerCase());
      expect(result[1].beneficiary.toLowerCase()).toBe(bob.toLowerCase());
      expect(result[2].beneficiary.toLowerCase()).toBe(alice.toLowerCase());
    });

    it('normalizes addresses to lowercase', () => {
      const allocations: Allocation[] = [
        { beneficiary: alice, amount: '1000' },
      ];

      const result = canonicalizeAllocations(allocations);

      expect(result[0].beneficiary.toLowerCase()).toBe(alice.toLowerCase());
      expect(result[0].beneficiary).toMatch(/^0x[a-f0-9]{40}$/);
    });

    it('normalizes amounts by removing leading zeros', () => {
      const allocations: Allocation[] = [
        { beneficiary: alice, amount: '0001000' },
        { beneficiary: bob, amount: '00002000' },
      ];

      const result = canonicalizeAllocations(allocations);

      // Sorted order: bob (0x70...), alice (0xf3...)
      expect(result[0].amount).toBe('2000'); // bob
      expect(result[1].amount).toBe('1000'); // alice
    });

    it('rejects duplicate beneficiaries', () => {
      const allocations: Allocation[] = [
        { beneficiary: alice, amount: '1000' },
        { beneficiary: alice, amount: '2000' }, // duplicate
      ];

      expect(() => canonicalizeAllocations(allocations)).toThrow(/duplicate/i);
    });

    it('rejects duplicate beneficiaries with different case', () => {
      const allocations: Allocation[] = [
        { beneficiary: '0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex, amount: '1000' },
        { beneficiary: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Hex, amount: '2000' },
      ];

      expect(() => canonicalizeAllocations(allocations)).toThrow(/duplicate/i);
    });

    it('validates all addresses', () => {
      const allocations: Allocation[] = [
        { beneficiary: 'invalid' as Hex, amount: '1000' },
      ];

      expect(() => canonicalizeAllocations(allocations)).toThrow();
    });

    it('validates all amounts', () => {
      const allocations: Allocation[] = [
        { beneficiary: alice, amount: '-100' },
      ];

      expect(() => canonicalizeAllocations(allocations)).toThrow();
    });

    it('handles empty allocations array', () => {
      expect(() => canonicalizeAllocations([])).toThrow();
    });

    it('preserves order stability for same addresses (if normalized)', () => {
      const allocations: Allocation[] = [
        { beneficiary: alice, amount: '1000' },
      ];

      const result1 = canonicalizeAllocations(allocations);
      const result2 = canonicalizeAllocations(allocations);

      expect(result1).toEqual(result2);
    });
  });

  describe('computeInputHash', () => {
    const alice = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266' as Hex;
    const bob = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' as Hex;

    it('produces consistent hash for same input', () => {
      const allocations = [
        { beneficiary: alice, amount: '1000' },
        { beneficiary: bob, amount: '2000' },
      ];

      const hash1 = computeInputHash(allocations);
      const hash2 = computeInputHash(allocations);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('produces different hash for different allocations', () => {
      const allocations1 = [
        { beneficiary: alice, amount: '1000' },
      ];
      const allocations2 = [
        { beneficiary: bob, amount: '2000' },
      ];

      const hash1 = computeInputHash(allocations1);
      const hash2 = computeInputHash(allocations2);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hash for different amounts', () => {
      const allocations1 = [
        { beneficiary: alice, amount: '1000' },
      ];
      const allocations2 = [
        { beneficiary: alice, amount: '2000' },
      ];

      const hash1 = computeInputHash(allocations1);
      const hash2 = computeInputHash(allocations2);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hash when token is included', () => {
      const allocations = [
        { beneficiary: alice, amount: '1000' },
      ];
      const token = '0x1111111111111111111111111111111111111111' as Hex;

      const hash1 = computeInputHash(allocations);
      const hash2 = computeInputHash(allocations, token);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hash when vesting params are included', () => {
      const allocations = [
        { beneficiary: alice, amount: '1000' },
      ];
      const vesting = {
        vestingStart: 1000000,
        vestingDuration: 86400,
        cliffDuration: 0,
      };

      const hash1 = computeInputHash(allocations);
      const hash2 = computeInputHash(allocations, undefined, vesting);

      expect(hash1).not.toBe(hash2);
    });

    it('produces same hash with same token and vesting params', () => {
      const allocations = [
        { beneficiary: alice, amount: '1000' },
      ];
      const token = '0x1111111111111111111111111111111111111111' as Hex;
      const vesting = {
        vestingStart: 1000000,
        vestingDuration: 86400,
        cliffDuration: 0,
      };

      const hash1 = computeInputHash(allocations, token, vesting);
      const hash2 = computeInputHash(allocations, token, vesting);

      expect(hash1).toBe(hash2);
    });

    it('is sensitive to allocation order', () => {
      const allocations1 = [
        { beneficiary: alice, amount: '1000' },
        { beneficiary: bob, amount: '2000' },
      ];
      const allocations2 = [
        { beneficiary: bob, amount: '2000' },
        { beneficiary: alice, amount: '1000' },
      ];

      const hash1 = computeInputHash(allocations1);
      const hash2 = computeInputHash(allocations2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('BUILD_SPEC', () => {
    it('has correct version', () => {
      expect(BUILD_SPEC.version).toBe('1.0.0');
    });

    it('has correct leaf encoding', () => {
      expect(BUILD_SPEC.leafEncoding).toBe('abi.encodePacked(address,uint256)');
    });

    it('has correct hash function', () => {
      expect(BUILD_SPEC.hashFunction).toBe('keccak256');
    });

    it('has sortPairs enabled', () => {
      expect(BUILD_SPEC.sortPairs).toBe(true);
    });

    it('has correct sort allocations strategy', () => {
      expect(BUILD_SPEC.sortAllocations).toBe('beneficiary-asc');
    });

    it('has correct duplicate handling', () => {
      expect(BUILD_SPEC.duplicateHandling).toBe('reject');
    });

    it('has correct padding strategy', () => {
      expect(BUILD_SPEC.paddingStrategy).toBe('duplicate-last');
    });
  });
});
