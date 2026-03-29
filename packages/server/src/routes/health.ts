import { Hono } from 'hono';
import { get } from '../db.js';

export const healthRouter = new Hono();

healthRouter.get('/api/health', (c) => {
  let dbOk = false;
  try {
    get('SELECT 1');
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const status = dbOk ? 'ok' : 'degraded';
  const code = dbOk ? 200 : 503;

  return c.json(
    {
      status,
      version: '0.1.0',
      ts: new Date().toISOString(),
      db: dbOk ? 'ok' : 'error',
    },
    code
  );
});
