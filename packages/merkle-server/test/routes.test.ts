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

    it('rejects missing allocations', async () => {
      const res = await app.request('/trees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
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

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.request('/unknown/route');
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBe('Not found');
    });
  });
});
