import { describe, expect, it } from 'bun:test';
import { computeVestedAmount, computeVestingStatus } from '../src/services/vesting';
import type { VestingParams } from '../src/types';

describe('Vesting Service', () => {
  // Test vesting schedule: 1 year duration, 3 month cliff
  const ONE_DAY = 86400;
  const ONE_MONTH = 30 * ONE_DAY;
  const ONE_YEAR = 365 * ONE_DAY;

  const vestingStart = 1704067200; // Jan 1, 2024 00:00:00 UTC
  const vestingDuration = ONE_YEAR;
  const cliffDuration = 3 * ONE_MONTH; // 90 days

  const vestingParams: VestingParams = {
    vestingStart,
    vestingDuration,
    cliffDuration,
  };

  const totalAmount = '1000000000000000000000'; // 1000 tokens

  describe('computeVestedAmount', () => {
    it('returns 0 before vesting starts', () => {
      const beforeStart = vestingStart - ONE_DAY;
      const vested = computeVestedAmount(totalAmount, vestingParams, beforeStart);
      expect(vested).toBe('0');
    });

    it('returns 0 during cliff period', () => {
      // 1 month into vesting (still in cliff)
      const duringCliff = vestingStart + ONE_MONTH;
      const vested = computeVestedAmount(totalAmount, vestingParams, duringCliff);
      expect(vested).toBe('0');
    });

    it('returns 0 at cliff boundary (not yet passed)', () => {
      // Exactly at cliff end - 1 second
      const justBeforeCliff = vestingStart + cliffDuration - 1;
      const vested = computeVestedAmount(totalAmount, vestingParams, justBeforeCliff);
      expect(vested).toBe('0');
    });

    it('returns proportional amount after cliff passes', () => {
      // Exactly at cliff end
      const atCliffEnd = vestingStart + cliffDuration;
      const vested = computeVestedAmount(totalAmount, vestingParams, atCliffEnd);

      // 90 days / 365 days = ~24.66% vested
      const expectedPercent = cliffDuration / vestingDuration;
      const expectedAmount = (BigInt(totalAmount) * BigInt(cliffDuration)) / BigInt(vestingDuration);

      expect(vested).toBe(expectedAmount.toString());
    });

    it('returns proportional amount mid-vesting', () => {
      // 6 months into vesting
      const sixMonths = vestingStart + 6 * ONE_MONTH;
      const vested = computeVestedAmount(totalAmount, vestingParams, sixMonths);

      const elapsed = 6 * ONE_MONTH;
      const expectedAmount = (BigInt(totalAmount) * BigInt(elapsed)) / BigInt(vestingDuration);

      expect(vested).toBe(expectedAmount.toString());
    });

    it('returns full amount after vesting ends', () => {
      const afterEnd = vestingStart + vestingDuration + ONE_DAY;
      const vested = computeVestedAmount(totalAmount, vestingParams, afterEnd);
      expect(vested).toBe(totalAmount);
    });

    it('returns full amount exactly at vesting end', () => {
      const atEnd = vestingStart + vestingDuration;
      const vested = computeVestedAmount(totalAmount, vestingParams, atEnd);
      expect(vested).toBe(totalAmount);
    });

    it('handles zero cliff (immediate vesting start)', () => {
      const noCliffParams: VestingParams = {
        vestingStart,
        vestingDuration,
        cliffDuration: 0,
      };

      // 1 day in should vest ~0.27%
      const oneDay = vestingStart + ONE_DAY;
      const vested = computeVestedAmount(totalAmount, noCliffParams, oneDay);

      const expectedAmount = (BigInt(totalAmount) * BigInt(ONE_DAY)) / BigInt(vestingDuration);
      expect(vested).toBe(expectedAmount.toString());
    });
  });

  describe('computeVestingStatus', () => {
    it('returns complete status before vesting starts', () => {
      const beforeStart = vestingStart - ONE_DAY;
      const status = computeVestingStatus(totalAmount, vestingParams, beforeStart);

      expect(status.vestedAmount).toBe('0');
      expect(status.unvestedAmount).toBe(totalAmount);
      expect(status.percentVested).toBe(0);
      expect(status.cliffPassed).toBe(false);
      expect(status.fullyVested).toBe(false);
      expect(status.vestingStart).toBe(vestingStart);
      expect(status.vestingEnd).toBe(vestingStart + vestingDuration);
      expect(status.cliffEnd).toBe(vestingStart + cliffDuration);
    });

    it('returns complete status during cliff', () => {
      const duringCliff = vestingStart + ONE_MONTH;
      const status = computeVestingStatus(totalAmount, vestingParams, duringCliff);

      expect(status.vestedAmount).toBe('0');
      expect(status.cliffPassed).toBe(false);
      expect(status.fullyVested).toBe(false);
      expect(status.percentVested).toBe(0);
    });

    it('returns complete status after cliff', () => {
      const afterCliff = vestingStart + cliffDuration + ONE_MONTH;
      const status = computeVestingStatus(totalAmount, vestingParams, afterCliff);

      expect(status.cliffPassed).toBe(true);
      expect(status.fullyVested).toBe(false);
      expect(Number(status.vestedAmount)).toBeGreaterThan(0);
      expect(status.percentVested).toBeGreaterThan(0);
      expect(status.percentVested).toBeLessThan(100);
    });

    it('returns complete status when fully vested', () => {
      const afterEnd = vestingStart + vestingDuration + ONE_DAY;
      const status = computeVestingStatus(totalAmount, vestingParams, afterEnd);

      expect(status.vestedAmount).toBe(totalAmount);
      expect(status.unvestedAmount).toBe('0');
      expect(status.percentVested).toBe(100);
      expect(status.cliffPassed).toBe(true);
      expect(status.fullyVested).toBe(true);
    });

    it('calculates correct percentVested at 50%', () => {
      // Exactly halfway through vesting
      const halfway = vestingStart + vestingDuration / 2;
      const status = computeVestingStatus(totalAmount, vestingParams, halfway);

      expect(status.percentVested).toBeCloseTo(50, 0);
    });

    it('includes currentTime in response', () => {
      const now = vestingStart + ONE_MONTH;
      const status = computeVestingStatus(totalAmount, vestingParams, now);

      expect(status.currentTime).toBe(now);
    });

    it('releasableAmount equals vestedAmount', () => {
      const afterCliff = vestingStart + cliffDuration + ONE_MONTH;
      const status = computeVestingStatus(totalAmount, vestingParams, afterCliff);

      expect(status.releasableAmount).toBe(status.vestedAmount);
    });
  });
});
