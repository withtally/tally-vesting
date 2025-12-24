import { describe, expect, it } from 'bun:test';
import type { Hex } from 'viem';
import {
  createRegistryKey,
  parseRegistryKey,
  type RegistryKey,
  type RegistryEntry,
  type RegistrationAuthorization,
} from '../src/services/registry';

describe('Registry Service', () => {
  const testKey: RegistryKey = {
    chainId: 1,
    distributorAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex,
    merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
  };

  describe('createRegistryKey', () => {
    it('creates key from chainId, distributor, merkleRoot', () => {
      const key = createRegistryKey(testKey);

      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('produces consistent key format', () => {
      const key1 = createRegistryKey(testKey);
      const key2 = createRegistryKey(testKey);

      expect(key1).toBe(key2);
    });

    it('produces different keys for different chainIds', () => {
      const key1 = createRegistryKey(testKey);
      const key2 = createRegistryKey({ ...testKey, chainId: 137 });

      expect(key1).not.toBe(key2);
    });

    it('produces different keys for different distributors', () => {
      const key1 = createRegistryKey(testKey);
      const key2 = createRegistryKey({
        ...testKey,
        distributorAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Hex,
      });

      expect(key1).not.toBe(key2);
    });

    it('produces different keys for different merkle roots', () => {
      const key1 = createRegistryKey(testKey);
      const key2 = createRegistryKey({
        ...testKey,
        merkleRoot: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex,
      });

      expect(key1).not.toBe(key2);
    });

    it('normalizes addresses to lowercase', () => {
      const key1 = createRegistryKey(testKey);
      const key2 = createRegistryKey({
        ...testKey,
        distributorAddress: testKey.distributorAddress.toUpperCase() as Hex,
      });

      expect(key1).toBe(key2);
    });
  });

  describe('parseRegistryKey', () => {
    it('parses key back to RegistryKey components', () => {
      const key = createRegistryKey(testKey);
      const parsed = parseRegistryKey(key);

      expect(parsed.chainId).toBe(testKey.chainId);
      expect(parsed.distributorAddress.toLowerCase()).toBe(testKey.distributorAddress.toLowerCase());
      expect(parsed.merkleRoot.toLowerCase()).toBe(testKey.merkleRoot.toLowerCase());
    });

    it('round-trips correctly', () => {
      const key = createRegistryKey(testKey);
      const parsed = parseRegistryKey(key);
      const reconstructed = createRegistryKey(parsed);

      expect(reconstructed).toBe(key);
    });

    it('throws for invalid key format', () => {
      expect(() => parseRegistryKey('invalid')).toThrow();
    });

    it('throws for malformed components', () => {
      // Missing components
      expect(() => parseRegistryKey('1:')).toThrow();
      expect(() => parseRegistryKey(':0x1234:0x5678')).toThrow();
    });
  });

  describe('RegistryEntry type', () => {
    it('validates registration data structure', () => {
      const entry: RegistryEntry = {
        chainId: 1,
        distributorAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex,
        merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
        ipfsCid: 'QmTest123456789',
        registeredAt: 1704067200,
        registrant: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex,
      };

      // Verify all required fields are present
      expect(entry.chainId).toBeDefined();
      expect(entry.distributorAddress).toBeDefined();
      expect(entry.merkleRoot).toBeDefined();
      expect(entry.ipfsCid).toBeDefined();
      expect(entry.registeredAt).toBeDefined();
      expect(entry.registrant).toBeDefined();
    });
  });

  describe('RegistrationAuthorization type', () => {
    it('validates authorization signature structure', () => {
      const auth: RegistrationAuthorization = {
        owner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex,
        merkleRoot: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex,
        ipfsCid: 'QmTest123456789',
        deadline: 1704067200,
        signature: '0xabcd' as Hex,
      };

      // Verify all required fields for EIP-712 signature
      expect(auth.owner).toBeDefined();
      expect(auth.merkleRoot).toBeDefined();
      expect(auth.ipfsCid).toBeDefined();
      expect(auth.deadline).toBeDefined();
      expect(auth.signature).toBeDefined();
    });
  });

  describe('Registry key uniqueness', () => {
    it('ensures different combinations produce unique keys', () => {
      const keys = new Set<string>();

      // Test various combinations
      const testCases: RegistryKey[] = [
        { chainId: 1, distributorAddress: '0x1111' as Hex, merkleRoot: '0xaaaa' as Hex },
        { chainId: 1, distributorAddress: '0x1111' as Hex, merkleRoot: '0xbbbb' as Hex },
        { chainId: 1, distributorAddress: '0x2222' as Hex, merkleRoot: '0xaaaa' as Hex },
        { chainId: 137, distributorAddress: '0x1111' as Hex, merkleRoot: '0xaaaa' as Hex },
      ];

      for (const testCase of testCases) {
        const key = createRegistryKey(testCase);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }

      expect(keys.size).toBe(testCases.length);
    });
  });
});
