import { keccak256, encodePacked, concatHex, type Hex } from 'viem';
import type { Allocation, CanonicalAllocation, BuildSpec, VestingParams, PlatformFeeParams } from '../types';

/**
 * The BuildSpec constant that defines how merkle trees are built
 */
export const BUILD_SPEC: BuildSpec = {
  version: '1.0.0',
  leafEncoding: 'abi.encodePacked(address,uint256)',
  hashFunction: 'keccak256',
  sortPairs: true,
  sortAllocations: 'beneficiary-asc',
  duplicateHandling: 'reject',
  paddingStrategy: 'duplicate-last',
};

/**
 * Normalize an address to lowercase hex format
 * @param address - The address to normalize
 * @returns Lowercase hex address
 * @throws Error if address is invalid
 */
export function normalizeAddress(address: string): Hex {
  // Validate format
  if (!address || typeof address !== 'string') {
    throw new Error('Address must be a non-empty string');
  }

  const normalized = address.toLowerCase();

  // Check hex format: 0x followed by exactly 40 hex characters
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error(`Invalid address format: ${address}`);
  }

  return normalized as Hex;
}

/**
 * Normalize an amount by removing leading zeros
 * @param amount - The amount string to normalize
 * @returns Normalized amount string
 * @throws Error if amount is invalid
 */
export function normalizeAmount(amount: string): string {
  // Validate format
  if (!amount || typeof amount !== 'string') {
    throw new Error('Amount must be a non-empty string');
  }

  // Check if it's a valid unsigned integer string
  if (!/^\d+$/.test(amount)) {
    throw new Error(`Invalid amount format: ${amount} (must be non-negative integer string)`);
  }

  // Remove leading zeros, but keep at least one digit
  const normalized = amount.replace(/^0+/, '') || '0';

  return normalized;
}

/**
 * Canonicalize allocations by normalizing and sorting
 * @param allocations - The allocations to canonicalize
 * @returns Sorted and normalized allocations
 * @throws Error if allocations are invalid or contain duplicates
 */
export function canonicalizeAllocations(allocations: Allocation[]): CanonicalAllocation[] {
  if (!allocations || allocations.length === 0) {
    throw new Error('Allocations array must not be empty');
  }

  // Normalize all allocations
  const normalized = allocations.map((alloc) => ({
    beneficiary: normalizeAddress(alloc.beneficiary),
    amount: normalizeAmount(alloc.amount),
  }));

  // Sort by beneficiary ascending (already lowercase from normalization)
  const sorted = [...normalized].sort((a, b) => {
    return a.beneficiary.localeCompare(b.beneficiary);
  });

  // Check for duplicates
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].beneficiary === sorted[i + 1].beneficiary) {
      throw new Error(`Duplicate beneficiary found: ${sorted[i].beneficiary}`);
    }
  }

  return sorted;
}

/**
 * Compute a hash of the input data for deterministic tree building
 * @param allocations - Canonicalized allocations
 * @param token - Optional token address
 * @param vesting - Optional vesting parameters
 * @returns Hash of the input data
 */
export function computeInputHash(
  allocations: CanonicalAllocation[],
  token?: Hex,
  vesting?: VestingParams,
  platformFee?: PlatformFeeParams
): Hex {
  // Start with empty hex
  let data: Hex = '0x';

  // Concatenate each allocation's beneficiary + amount
  for (const alloc of allocations) {
    data = concatHex([
      data,
      encodePacked(['address', 'uint256'], [alloc.beneficiary, BigInt(alloc.amount)])
    ]);
  }

  // Include token if provided
  if (token) {
    data = concatHex([data, normalizeAddress(token)]);
  }

  // Include vesting params if provided
  if (vesting) {
    data = concatHex([
      data,
      encodePacked(
        ['uint256', 'uint256', 'uint256'],
        [BigInt(vesting.vestingStart), BigInt(vesting.vestingDuration), BigInt(vesting.cliffDuration)]
      )
    ]);
  }

  if (platformFee) {
    data = concatHex([
      data,
      normalizeAddress(platformFee.feeRecipient),
      encodePacked(['uint256'], [BigInt(platformFee.feeBps)])
    ]);
  }

  // Hash the combined data
  return keccak256(data);
}
