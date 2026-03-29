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
  agent_name?: string;
  company_name?: string;
}

function rowToRun(row: RunRow) {
  const startedAt = row.started_at ?? row.created_at;
  const durationMs =
    row.started_at && row.finished_at
      ? new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()
      : undefined;

  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name ?? row.agent_id,
    companyId: row.company_id,
    companyName: row.company_name ?? row.company_id,
    routineId: row.routine_id,
    status: row.status,
    model: row.model,
    source: row.source,
    startedAt,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
    error: row.error,
    tokenInput: row.token_input,
    tokenOutput: row.token_output,
    cost: row.cost_cents / 100,
    costCents: row.cost_cents,
    durationMs,
    logExcerpt: row.log_excerpt,
    createdAt: row.created_at,
  };
}

const RUN_JOIN_SQL = `
  SELECT r.*, a.name as agent_name, c.name as company_name
  FROM runs r
  LEFT JOIN agents a ON a.id = r.agent_id
  LEFT JOIN companies c ON c.id = r.company_id
`;

// GET /api/runs/recent — must be declared BEFORE /api/runs/:id
runsRouter.get('/api/runs/recent', (c) => {
  const limitParam = c.req.query('limit');
  const limit = Math.min(
    100,
    Math.max(1, parseInt(limitParam ?? '20', 10) || 20)
  );

  const rows = all<RunRow>(
    `${RUN_JOIN_SQL} ORDER BY r.created_at DESC LIMIT ?`,
    [limit]
  );

  return c.json({ runs: rows.map(rowToRun) });
});

// GET /api/runs/:id
runsRouter.get('/api/runs/:id', (c) => {
  const id = c.req.param('id');

  const rows = all<RunRow>(`${RUN_JOIN_SQL} WHERE r.id = ?`, [id]);
  const row = rows[0];

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
    `${RUN_JOIN_SQL} WHERE r.agent_id = ? ORDER BY r.created_at DESC LIMIT ?`,
    [agentId, limit]
  );

  return c.json({ runs: rows.map(rowToRun) });
});
