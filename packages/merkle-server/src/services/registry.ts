import type { Hex } from 'viem';

/**
 * Registry entry stored on-chain
 */
export interface RegistryEntry {
  chainId: number;
  distributorAddress: Hex;
  merkleRoot: Hex;
  ipfsCid: string;
  registeredAt: number; // block timestamp
  registrant: Hex;
}

/**
 * Key components for registry lookups
 */
export interface RegistryKey {
  chainId: number;
  distributorAddress: Hex;
  merkleRoot: Hex;
}

/**
 * EIP-712 signature for authorized registration
 */
export interface RegistrationAuthorization {
  owner: Hex;
  merkleRoot: Hex;
  ipfsCid: string;
  deadline: number;
  signature: Hex;
}

/**
 * Registry client interface for on-chain interactions
 */
export interface RegistryClient {
  register(entry: Omit<RegistryEntry, 'registeredAt' | 'registrant'>): Promise<{ txHash: Hex }>;
  lookup(key: RegistryKey): Promise<RegistryEntry | null>;
  lookupByCid(cid: string): Promise<RegistryEntry[]>;
}

/**
 * Create a deterministic registry key from components
 * Format: chainId:distributorAddress:merkleRoot
 */
export function createRegistryKey(key: RegistryKey): string {
  const { chainId, distributorAddress, merkleRoot } = key;

  // Normalize addresses to lowercase for consistency
  const normalizedDistributor = distributorAddress.toLowerCase();
  const normalizedRoot = merkleRoot.toLowerCase();

  return `${chainId}:${normalizedDistributor}:${normalizedRoot}`;
}

/**
 * Parse a registry key back to its components
 */
export function parseRegistryKey(key: string): RegistryKey {
  const parts = key.split(':');

  if (parts.length !== 3) {
    throw new Error(`Invalid registry key format: expected 3 parts separated by colons, got ${parts.length}`);
  }

  const [chainIdStr, distributorAddress, merkleRoot] = parts;

  // Parse chainId
  const chainId = parseInt(chainIdStr, 10);
  if (isNaN(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId in registry key: ${chainIdStr}`);
  }

  // Validate addresses are present and look like hex
  if (!distributorAddress || !distributorAddress.startsWith('0x')) {
    throw new Error(`Invalid distributor address in registry key: ${distributorAddress}`);
  }

  if (!merkleRoot || !merkleRoot.startsWith('0x')) {
    throw new Error(`Invalid merkle root in registry key: ${merkleRoot}`);
  }

  return {
    chainId,
    distributorAddress: distributorAddress as Hex,
    merkleRoot: merkleRoot as Hex,
  };
}
