import { Hono } from 'hono';
import { get, all } from '../db.js';
import { logger } from '../logger.js';

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
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success
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
  } catch (err) {
    logger.error('Dashboard stats query failed', { error: String(err) });
    return c.json({
      error: 'Failed to compute dashboard stats',
      stats: { totalAgents: 0, running: 0, successRate: null, costToday: 0 },
    }, 500);
  }

  return c.json({
    totalAgents,
    runningNow,
    successRate24h,
    costToday: costTodayCents / 100,
  });
});

// GET /api/dashboard/costs?days=7
healthRouter.get('/api/dashboard/costs', (c) => {
  const days = Math.min(Math.max(parseInt(c.req.query('days') ?? '7', 10), 1), 90);

  try {
    interface CostRow {
      date: string;
      agent_id: string;
      agent_name: string;
      model: string;
      cost_cents: number;
    }

    const rows = all<CostRow>(
      `SELECT
         date(r.started_at) as date,
         r.agent_id,
         a.name as agent_name,
         r.model,
         SUM(r.cost_cents) as cost_cents
       FROM runs r
       LEFT JOIN agents a ON a.id = r.agent_id
       WHERE r.started_at IS NOT NULL
         AND r.started_at > datetime('now', '-' || ? || ' days')
         AND r.cost_cents IS NOT NULL
         AND r.cost_cents > 0
       GROUP BY date(r.started_at), r.agent_id
       ORDER BY date ASC`,
      [days]
    );

    const costs = rows.map((row) => ({
      date: row.date,
      agentId: row.agent_id,
      agentName: row.agent_name ?? 'Unknown',
      model: row.model ?? '',
      costCents: row.cost_cents ?? 0,
    }));

    return c.json({ costs });
  } catch (err) {
    logger.error('Dashboard costs query failed', { error: String(err) });
    return c.json({ costs: [] });
  }
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
