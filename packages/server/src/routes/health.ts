import { Hono } from 'hono';
import { get } from '../db.js';

export const healthRouter = new Hono();

healthRouter.get('/api/dashboard/stats', (c) => {
  let totalAgents = 0;
  let runningNow = 0;
  let successRate24h: number | null = null;
  let costTodayCents = 0;

  try {
    const agentStats = get<{ total: number; running: number }>(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running FROM agents`
    );
    totalAgents = agentStats?.total ?? 0;
    runningNow = agentStats?.running ?? 0;

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const runStats = get<{ total: number; success: number }>(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
       FROM runs WHERE created_at > ?`,
      [since24h]
    );
    successRate24h = runStats && runStats.total > 0
      ? Math.round((runStats.success / runStats.total) * 1000) / 10
      : null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const costRow = get<{ total: number }>(
      `SELECT SUM(cost_cents) as total FROM runs WHERE created_at >= ?`,
      [today.toISOString()]
    );
    costTodayCents = costRow?.total ?? 0;
  } catch {
    // Return nulls/zeros on error
  }

  return c.json({
    totalAgents,
    runningNow,
    successRate24h,
    costToday: costTodayCents / 100,
  });
});

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
