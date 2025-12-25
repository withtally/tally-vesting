import { describe, expect, it, beforeEach } from 'bun:test';
import { createApp } from '../src/app';
import { clearAll } from '../src/services/storage';
import type { Hex } from 'viem';

const app = createApp({ logging: false });

// Test data
const alice = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
const bob = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Hex;
const carol = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Hex;
const token = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Hex;

const aliceAmount = '1000000000000000000000';
const bobAmount = '2000000000000000000000';
const carolAmount = '500000000000000000000';
const platformFee = {
  feeRecipient: '0x1234567890123456789012345678901234567890' as Hex,
  feeBps: 250,
};
const frontEndFeeRecipient = '0x5b38da6a701c568545dcfcb03fcb875f56beddc4' as Hex;
const frontEndFeeBps = 100;

describe('API Routes', () => {
  beforeEach(async () => {
    await clearAll();
  });

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /trees', () => {
    it('returns empty array when no trees exist', async () => {
      const res = await app.request('/trees');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('returns tree summaries after creation', async () => {
      // Create a tree first
      await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
        }),
      });

      const res = await app.request('/trees');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].allocationCount).toBe(2);
      expect(body[0].totalAmount).toBe('3000000000000000000000');
    });
  });

  describe('POST /trees', () => {
    it('creates a tree with valid allocations', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(body.allocations).toHaveLength(2);
      expect(body.createdAt).toBeDefined();
    });

    it('creates a tree with optional token', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          token,
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.token).toBe(token);
    });

    it('creates a tree with optional platform fee', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          platformFee,
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.platformFee).toEqual(platformFee);
      expect(body.originalInput.platformFee).toEqual(platformFee);
    });

    it('includes leaf and proof for each allocation', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
            { beneficiary: carol, amount: carolAmount },
          ],
        }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      for (const alloc of body.allocations) {
        expect(alloc.leaf).toMatch(/^0x[a-f0-9]{64}$/);
        expect(alloc.proof).toBeInstanceOf(Array);
        expect(alloc.proof.length).toBeGreaterThan(0);
      }
    });

    it('includes buildSpec, originalInput, and inputHash', async () => {
      const requestData = {
        allocations: [
          { beneficiary: alice, amount: aliceAmount },
          { beneficiary: bob, amount: bobAmount },
        ],
        token,
      };

      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      expect(res.status).toBe(201);

      const body = await res.json();

      // Check buildSpec
      expect(body.buildSpec).toBeDefined();
      expect(body.buildSpec.version).toBe('1.0.0');
      expect(body.buildSpec.leafEncoding).toBe('abi.encodePacked(address,uint256)');
      expect(body.buildSpec.hashFunction).toBe('keccak256');
      expect(body.buildSpec.sortPairs).toBe(true);
      expect(body.buildSpec.sortAllocations).toBe('beneficiary-asc');
      expect(body.buildSpec.duplicateHandling).toBe('reject');
      expect(body.buildSpec.paddingStrategy).toBe('duplicate-last');

      // Check originalInput
      expect(body.originalInput).toBeDefined();
      expect(body.originalInput.allocations).toEqual(requestData.allocations);
      expect(body.originalInput.token).toBe(token);

      // Check inputHash
      expect(body.inputHash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('produces same inputHash for same canonical input', async () => {
      // First request with mixed case addresses
      const res1 = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
        }),
      });

      // Second request with different case but same addresses
      const res2 = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice.toLowerCase() as Hex, amount: aliceAmount },
            { beneficiary: bob.toLowerCase() as Hex, amount: bobAmount },
          ],
        }),
      });

      const body1 = await res1.json();
      const body2 = await res2.json();

      // Should have same inputHash (canonicalized to same form)
      expect(body1.inputHash).toBe(body2.inputHash);
    });

    it('rejects empty allocations', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocations: [] }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects invalid address', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: '0xinvalid', amount: aliceAmount }],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects invalid amount', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: 'not-a-number' }],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects platform fee without recipient', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          platformFee: {
            feeRecipient: '0x0000000000000000000000000000000000000000',
            feeBps: 1,
          },
        }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects platform fee above 10000 bps', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          platformFee: {
            feeRecipient: platformFee.feeRecipient,
            feeBps: 10001,
          },
        }),
      });

      expect(res.status).toBe(400);
    });

    it('rejects missing allocations', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('rejects duplicate beneficiaries', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: alice, amount: bobAmount }, // duplicate
          ],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Duplicate beneficiary');
    });
  });

  describe('GET /trees/:id', () => {
    it('returns a tree by ID', async () => {
      // Create tree first
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(created.id);
      expect(body.root).toBe(created.root);
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request('/trees/non-existent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /trees/:id/proof/:address', () => {
    it('returns proof for an address in the tree', async () => {
      // Create tree first
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/proof/${alice}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.beneficiary.toLowerCase()).toBe(alice.toLowerCase());
      expect(body.amount).toBe(aliceAmount);
      expect(body.leaf).toMatch(/^0x[a-f0-9]{64}$/);
      expect(body.proof).toBeInstanceOf(Array);
      expect(body.root).toBe(created.root);
    });

    it('is case-insensitive for address lookup', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });
      const created = await createRes.json();

      // Query with lowercase
      const res = await app.request(
        `/trees/${created.id}/proof/${alice.toLowerCase()}`
      );
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request(`/trees/non-existent/proof/${alice}`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Tree not found');
    });

    it('returns 404 for address not in tree', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/proof/${bob}`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Address not found in tree');
    });
  });

  describe('GET /trees/:id/vesting/:address', () => {
    const ONE_DAY = 86400;
    const ONE_YEAR = 365 * ONE_DAY;
    const vestingStart = Math.floor(Date.now() / 1000) - 180 * ONE_DAY; // Started 6 months ago
    const vestingDuration = ONE_YEAR;
    const cliffDuration = 90 * ONE_DAY; // 3 months

    it('returns vesting status for an address', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          vesting: { vestingStart, vestingDuration, cliffDuration },
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/vesting/${alice}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.beneficiary.toLowerCase()).toBe(alice.toLowerCase());
      expect(body.totalAmount).toBe(aliceAmount);
      expect(body.vestedAmount).toBeDefined();
      expect(body.unvestedAmount).toBeDefined();
      expect(body.percentVested).toBeGreaterThan(0);
      expect(body.cliffPassed).toBe(true); // 6 months > 3 month cliff
      expect(body.fullyVested).toBe(false); // 6 months < 1 year
      expect(body.leaf).toMatch(/^0x[a-f0-9]{64}$/);
      expect(body.proof).toBeInstanceOf(Array);
      expect(body.root).toBe(created.root);
    });

    it('returns 400 if tree has no vesting params', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          // No vesting params
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/vesting/${alice}`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Tree does not have vesting parameters');
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request(`/trees/non-existent/vesting/${alice}`);
      expect(res.status).toBe(404);
    });

    it('returns 404 for address not in tree', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          vesting: { vestingStart, vestingDuration, cliffDuration },
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/vesting/${bob}`);
      expect(res.status).toBe(404);
    });

    it('shows 0% vested during cliff period', async () => {
      const recentStart = Math.floor(Date.now() / 1000) - 30 * ONE_DAY; // Started 1 month ago
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          vesting: {
            vestingStart: recentStart,
            vestingDuration: ONE_YEAR,
            cliffDuration: 90 * ONE_DAY, // 3 month cliff
          },
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/vesting/${alice}`);
      const body = await res.json();

      expect(body.cliffPassed).toBe(false);
      expect(body.vestedAmount).toBe('0');
      expect(body.percentVested).toBe(0);
    });

    it('shows 100% vested after vesting ends', async () => {
      const oldStart = Math.floor(Date.now() / 1000) - 400 * ONE_DAY; // Started 400 days ago
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          vesting: {
            vestingStart: oldStart,
            vestingDuration: ONE_YEAR,
            cliffDuration: 90 * ONE_DAY,
          },
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/vesting/${alice}`);
      const body = await res.json();

      expect(body.fullyVested).toBe(true);
      expect(body.vestedAmount).toBe(aliceAmount);
      expect(body.percentVested).toBe(100);
    });
  });

  describe('DELETE /trees/:id', () => {
    it('deletes an existing tree', async () => {
      // Create tree first
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify it's gone
      const getRes = await app.request(`/trees/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request('/trees/non-existent-id', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /trees/:id/rebuild', () => {
    it('rebuilds tree and verifies match', async () => {
      // Create a tree first
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
          token,
        }),
      });
      const created = await createRes.json();

      // Rebuild it
      const res = await app.request(`/trees/${created.id}/rebuild`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.originalRoot).toBe(created.root);
      expect(body.rebuiltRoot).toBe(created.root);
      expect(body.inputHash).toBe(created.inputHash);
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request('/trees/non-existent-id/rebuild', {
        method: 'POST',
      });
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Tree not found');
    });

    it('rebuilds tree with vesting parameters', async () => {
      const vestingStart = Math.floor(Date.now() / 1000);
      const vestingDuration = 31536000; // 1 year
      const cliffDuration = 7776000; // 90 days

      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          vesting: { vestingStart, vestingDuration, cliffDuration },
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/rebuild`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.rebuiltRoot).toBe(created.root);
    });
  });

  describe('POST /trees/rebuild-from-input', () => {
    it('rebuilds tree from provided allocations', async () => {
      const res = await app.request('/trees/rebuild-from-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
        }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(body.allocations).toHaveLength(2);
      expect(body.inputHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(body.buildSpec).toBeDefined();
    });

    it('returns same root for same allocations', async () => {
      const input = {
        allocations: [
          { beneficiary: alice, amount: aliceAmount },
          { beneficiary: bob, amount: bobAmount },
        ],
      };

      const res1 = await app.request('/trees/rebuild-from-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body1 = await res1.json();

      const res2 = await app.request('/trees/rebuild-from-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body2 = await res2.json();

      expect(body1.root).toBe(body2.root);
      expect(body1.inputHash).toBe(body2.inputHash);
    });

    it('validates allocations', async () => {
      const res = await app.request('/trees/rebuild-from-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: 'invalid', amount: aliceAmount },
          ],
        }),
      });
      expect(res.status).toBe(400);
    });

    it('rebuilds tree with token', async () => {
      const res = await app.request('/trees/rebuild-from-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          token,
        }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.token).toBe(token);
    });

    it('rebuilds tree with vesting', async () => {
      const vestingStart = Math.floor(Date.now() / 1000);
      const vestingDuration = 31536000;
      const cliffDuration = 7776000;

      const res = await app.request('/trees/rebuild-from-input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
          vesting: { vestingStart, vestingDuration, cliffDuration },
        }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.vesting).toEqual({ vestingStart, vestingDuration, cliffDuration });
    });
  });

  describe('GET /trees/:id/input', () => {
    it('returns original input', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
          token,
          platformFee,
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/input`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.allocations).toHaveLength(2);
      expect(body.token).toBe(token);
      expect(body.platformFee).toEqual(platformFee);
      expect(body.inputHash).toBe(created.inputHash);
      expect(body.buildSpec).toBeDefined();
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request('/trees/non-existent-id/input');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Tree not found');
    });

    it('returns original allocations in their input order', async () => {
      // Create tree with specific order
      const inputAllocations = [
        { beneficiary: carol, amount: carolAmount },
        { beneficiary: alice, amount: aliceAmount },
        { beneficiary: bob, amount: bobAmount },
      ];

      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: inputAllocations,
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/input`);
      const body = await res.json();

      // Should return in original input order, not canonical order
      expect(body.allocations).toEqual(inputAllocations);
    });
  });

  describe('GET /trees/:id/download/:address', () => {
    it('returns downloadable JSON with Content-Disposition', async () => {
      // Create tree first
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/download/${alice}`);
      expect(res.status).toBe(200);

      const contentDisposition = res.headers.get('Content-Disposition');
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain(`proof-${alice.toLowerCase()}.json`);
      expect(res.headers.get('Content-Type')).toBe('application/json');
    });

    it('includes all proof package fields', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
          token,
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/download/${alice}`);
      expect(res.status).toBe(200);

      const pkg = await res.json();
      expect(pkg.version).toBe('1.0');
      expect(pkg.generatedAt).toBeDefined();
      expect(pkg.treeId).toBe(created.id);
      expect(pkg.merkleRoot).toBe(created.root);
      expect(pkg.beneficiary.toLowerCase()).toBe(alice.toLowerCase());
      expect(pkg.amount).toBe(aliceAmount);
      expect(pkg.leaf).toMatch(/^0x[a-f0-9]{64}$/);
      expect(pkg.proof).toBeInstanceOf(Array);
      expect(pkg.buildSpec).toBeDefined();
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request(`/trees/non-existent/download/${alice}`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Tree not found');
    });

    it('returns 404 for address not in tree', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/download/${bob}`);
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Beneficiary not found in tree');
    });

    it('includes front-end fee metadata when requested', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
          platformFee,
        }),
      });
      const created = await createRes.json();

      const res = await app.request(
        `/trees/${created.id}/download/${alice}?frontEndFeeRecipient=${frontEndFeeRecipient}&frontEndFeeBps=${frontEndFeeBps}`
      );
      expect(res.status).toBe(200);

      const pkg = await res.json();
      expect(pkg.frontEndFee).toEqual({
        feeRecipient: frontEndFeeRecipient,
        feeBps: frontEndFeeBps,
      });
    });

    it('rejects front-end fee when platform fee is missing', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(
        `/trees/${created.id}/download/${alice}?frontEndFeeRecipient=${frontEndFeeRecipient}&frontEndFeeBps=${frontEndFeeBps}`
      );
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('platform fee');
    });

    it('rejects front-end fee when BPS exceeds platform limit', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
          platformFee: { ...platformFee, feeBps: 150 },
        }),
      });
      const created = await createRes.json();

      const res = await app.request(
        `/trees/${created.id}/download/${alice}?frontEndFeeRecipient=${frontEndFeeRecipient}&frontEndFeeBps=200`
      );
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('cannot exceed');
    });
  });

  describe('GET /trees/:id/download', () => {
    it('returns batch package with all allocations', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
            { beneficiary: carol, amount: carolAmount },
          ],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/download`);
      expect(res.status).toBe(200);

      const pkg = await res.json();
      expect(pkg.version).toBe('1.0');
      expect(pkg.treeId).toBe(created.id);
      expect(pkg.merkleRoot).toBe(created.root);
      expect(pkg.allocations).toHaveLength(3);

      // Check each allocation has required fields
      for (const alloc of pkg.allocations) {
        expect(alloc.beneficiary).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(alloc.amount).toMatch(/^\d+$/);
        expect(alloc.leaf).toMatch(/^0x[a-f0-9]{64}$/);
        expect(alloc.proof).toBeInstanceOf(Array);
      }
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request('/trees/non-existent/download');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Tree not found');
    });

    it('includes Content-Disposition header', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.id}/download`);
      expect(res.status).toBe(200);

      const contentDisposition = res.headers.get('Content-Disposition');
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain('batch-proof');
    });

    it('includes front-end fee metadata when requested', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
          platformFee,
        }),
      });
      const created = await createRes.json();

      const res = await app.request(
        `/trees/${created.id}/download?frontEndFeeRecipient=${frontEndFeeRecipient}&frontEndFeeBps=${frontEndFeeBps}`
      );
      expect(res.status).toBe(200);

      const pkg = await res.json();
      expect(pkg.frontEndFee).toEqual({
        feeRecipient: frontEndFeeRecipient,
        feeBps: frontEndFeeBps,
      });
    });
  });

  describe('POST /verify-package', () => {
    it('verifies valid package', async () => {
      // Create a tree and get a proof package
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
        }),
      });
      const created = await createRes.json();

      const downloadRes = await app.request(`/trees/${created.id}/download/${alice}`);
      const pkg = await downloadRes.json();

      // Verify the package
      const res = await app.request('/verify-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pkg),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(true);
    });

    it('rejects tampered package', async () => {
      // Create a tree and get a proof package
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });
      const created = await createRes.json();

      const downloadRes = await app.request(`/trees/${created.id}/download/${alice}`);
      const pkg = await downloadRes.json();

      // Tamper with the amount
      pkg.amount = '9999999999999999999999';

      // Verify the tampered package
      const res = await app.request('/verify-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pkg),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(false);
    });

    it('returns validation errors for malformed package', async () => {
      const malformedPkg = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        // Missing required fields
      };

      const res = await app.request('/verify-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(malformedPkg),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.valid).toBe(false);
      expect(body.errors).toBeInstanceOf(Array);
      expect(body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /trees/:id/backup', () => {
    it('returns backup info for existing tree', async () => {
      // Create a tree first
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [
            { beneficiary: alice, amount: aliceAmount },
            { beneficiary: bob, amount: bobAmount },
          ],
          token,
        }),
      });

      const tree = await createRes.json();

      // Request backup
      const res = await app.request(`/trees/${tree.id}/backup`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.treeId).toBe(tree.id);
      expect(body.contentHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(body.size).toBeGreaterThan(0);
      expect(body.message).toContain('IPFS');
    });

    it('includes contentHash and size', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });

      const tree = await createRes.json();

      const res = await app.request(`/trees/${tree.id}/backup`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.contentHash).toBeDefined();
      expect(body.size).toBeDefined();
      expect(typeof body.size).toBe('number');
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request('/trees/non-existent-id/backup', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Tree not found');
    });
  });

  describe('GET /trees/:id/recovery', () => {
    it('returns local source when tree exists', async () => {
      const createRes = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocations: [{ beneficiary: alice, amount: aliceAmount }],
        }),
      });

      const tree = await createRes.json();

      const res = await app.request(`/trees/${tree.id}/recovery`);

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.source).toBe('local');
      expect(body.available).toBe(true);
      expect(body.root).toBe(tree.root);
      expect(body.inputHash).toBe(tree.inputHash);
    });

    it('returns 404 with recovery hints when tree missing', async () => {
      const res = await app.request('/trees/non-existent-id/recovery');

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.source).toBe('local');
      expect(body.available).toBe(false);
      expect(body.message).toContain('IPFS CID');
    });
  });

  describe('POST /trees/recover', () => {
    it('rebuilds tree from provided input', async () => {
      const res = await app.request('/trees/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            allocations: [
              { beneficiary: alice, amount: aliceAmount },
              { beneficiary: bob, amount: bobAmount },
            ],
            token,
          },
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.source).toBe('rebuild');
      expect(body.tree).toBeDefined();
      expect(body.tree.root).toMatch(/^0x[a-f0-9]{64}$/);
      expect(body.tree.allocations).toHaveLength(2);
    });

    it('validates input before rebuild', async () => {
      const res = await app.request('/trees/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            // Missing allocations
            token,
          },
        }),
      });

      expect(res.status).toBe(400);
    });

    it('returns error for CID recovery without IPFS', async () => {
      const res = await app.request('/trees/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid: 'QmTest123',
        }),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('IPFS');
      expect(body.hint).toContain('input.allocations');
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.request('/unknown/route');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Not found');
    });
  });
});
