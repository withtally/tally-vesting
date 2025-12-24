import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { trees } from './routes/trees';

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
