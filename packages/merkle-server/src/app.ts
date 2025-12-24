import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { trees } from './routes/trees';
import { validateProofPackage, verifyProofPackageAgainstRoot } from './services/proofPackage';
import type { ProofPackage } from './types';

export function createApp(options: { logging?: boolean } = {}): Hono {
  const app = new Hono();

  // Middleware
  if (options.logging !== false) {
    app.use('*', logger());
  }
  app.use('*', cors());

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount routes
  app.route('/trees', trees);

  // Verify proof package endpoint
  app.post('/verify-package', async (c) => {
    const body = await c.req.json();

    // First validate the package structure
    const validation = validateProofPackage(body);
    if (!validation.valid) {
      return c.json({ valid: false, errors: validation.errors }, 400);
    }

    // If valid structure, verify the cryptographic proof
    const pkg = body as ProofPackage;
    const verified = verifyProofPackageAgainstRoot(pkg, pkg.merkleRoot);

    return c.json({ valid: verified });
  });

  // 404 handler
  app.notFound((c) => {
    return c.json({ error: 'Not found' }, 404);
  });

  // Error handler
  app.onError((err, c) => {
    console.error('Server error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
