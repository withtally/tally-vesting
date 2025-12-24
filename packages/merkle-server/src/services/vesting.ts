import type { VestingParams } from '../types';

/**
 * Compute the vested amount based on OpenZeppelin VestingWallet logic
 *
 * Matches Solidity:
 * - Before start: 0
 * - During cliff: 0
 * - After cliff: (totalAllocation * elapsed) / duration
 * - After end: totalAllocation
 */
export function computeVestedAmount(
  totalAmount: string,
  params: VestingParams,
  currentTime: number
): string {
  const { vestingStart, vestingDuration, cliffDuration } = params;
  const vestingEnd = vestingStart + vestingDuration;
  const cliffEnd = vestingStart + cliffDuration;

  // Before vesting starts
  if (currentTime < vestingStart) {
    return '0';
  }

  // During cliff period (cliff not yet passed)
  if (currentTime < cliffEnd) {
    return '0';
  }

  // After vesting ends - fully vested
  if (currentTime >= vestingEnd) {
    return totalAmount;
  }

  // Linear vesting: (totalAmount * elapsed) / duration
  const elapsed = BigInt(currentTime - vestingStart);
  const duration = BigInt(vestingDuration);
  const total = BigInt(totalAmount);

  const vested = (total * elapsed) / duration;
  return vested.toString();
}

/**
 * Compute complete vesting status for a beneficiary
 */
export function computeVestingStatus(
  totalAmount: string,
  params: VestingParams,
  currentTime: number
): {
  vestedAmount: string;
  unvestedAmount: string;
  releasableAmount: string;
  percentVested: number;
  cliffPassed: boolean;
  fullyVested: boolean;
  vestingStart: number;
  vestingEnd: number;
  cliffEnd: number;
  currentTime: number;
} {
  const { vestingStart, vestingDuration, cliffDuration } = params;
  const vestingEnd = vestingStart + vestingDuration;
  const cliffEnd = vestingStart + cliffDuration;

  const vestedAmount = computeVestedAmount(totalAmount, params, currentTime);
  const total = BigInt(totalAmount);
  const vested = BigInt(vestedAmount);
  const unvested = total - vested;

  // Calculate percentage (0-100)
  let percentVested: number;
  if (total === 0n) {
    percentVested = 0;
  } else {
    percentVested = Number((vested * 10000n) / total) / 100;
  }

  return {
    vestedAmount,
    unvestedAmount: unvested.toString(),
    releasableAmount: vestedAmount, // Same as vested (assuming nothing released yet)
    percentVested,
    cliffPassed: currentTime >= cliffEnd,
    fullyVested: currentTime >= vestingEnd,
    vestingStart,
    vestingEnd,
    cliffEnd,
    currentTime,
  };
}
