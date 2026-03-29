import { Hono } from 'hono';
import { all, get } from '../db.js';

export const runsRouter = new Hono();

interface RunRow {
  id: string;
  agent_id: string;
  company_id: string;
  routine_id: string | null;
  status: string;
  model: string;
  source: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
  token_input: number;
  token_output: number;
  cost_cents: number;
  log_excerpt: string;
  created_at: string;
}

function rowToRun(row: RunRow) {
  return {
    id: row.id,
    agentId: row.agent_id,
    companyId: row.company_id,
    routineId: row.routine_id,
    status: row.status,
    model: row.model,
    source: row.source,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
    error: row.error,
    tokenInput: row.token_input,
    tokenOutput: row.token_output,
    costCents: row.cost_cents,
    logExcerpt: row.log_excerpt,
    createdAt: row.created_at,
  };
}

// GET /api/runs/recent — must be declared BEFORE /api/runs/:id
runsRouter.get('/api/runs/recent', (c) => {
  const limitParam = c.req.query('limit');
  const limit = Math.min(
    100,
    Math.max(1, parseInt(limitParam ?? '20', 10) || 20)
  );

  const rows = all<RunRow>(
    `SELECT * FROM runs ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );

  return c.json({ runs: rows.map(rowToRun) });
});

// GET /api/runs/:id
runsRouter.get('/api/runs/:id', (c) => {
  const id = c.req.param('id');

  const row = get<RunRow>(`SELECT * FROM runs WHERE id = ?`, [id]);

  if (!row) {
    return c.json({ error: 'Run not found' }, 404);
  }

  return c.json({ run: rowToRun(row) });
});

// GET /api/agents/:agentId/runs
runsRouter.get('/api/agents/:agentId/runs', (c) => {
  const agentId = c.req.param('agentId');

  const agent = get(`SELECT id FROM agents WHERE id = ?`, [agentId]);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const limitParam = c.req.query('limit');
  const limit = Math.min(
    200,
    Math.max(1, parseInt(limitParam ?? '50', 10) || 50)
  );

  const rows = all<RunRow>(
    `SELECT * FROM runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`,
    [agentId, limit]
  );

  return c.json({ runs: rows.map(rowToRun) });
});
