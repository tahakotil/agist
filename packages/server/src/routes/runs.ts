import { Hono } from 'hono';
import { all, get } from '../db.js';
import { getPaginationParams, paginatedResponse } from '../utils/pagination.js';

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
  // Structured output fields (added in v1.7)
  output_raw: string | null;
  output_structured: string | null;
  output_summary: string | null;
  output_confidence: number | null;
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
    // Structured output (populated when agent has output_schema)
    outputRaw: row.output_raw ?? null,
    outputStructured: (() => {
      try {
        return row.output_structured ? (JSON.parse(row.output_structured) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    })(),
    outputSummary: row.output_summary ?? null,
    outputConfidence: row.output_confidence ?? null,
  };
}

const RUN_BASE_SQL = `
  FROM runs r
  LEFT JOIN agents a ON a.id = r.agent_id
  LEFT JOIN companies c ON c.id = r.company_id
`;

const RUN_SELECT_SQL = `SELECT r.*, a.name as agent_name, c.name as company_name`;

const VALID_RUN_SORT: Record<string, string> = {
  startedAt: 'r.started_at',
  cost: 'r.cost_cents',
  durationMs: '(CASE WHEN r.started_at IS NOT NULL AND r.finished_at IS NOT NULL THEN (julianday(r.finished_at) - julianday(r.started_at)) * 86400000 ELSE NULL END)',
  createdAt: 'r.created_at',
};

function buildRunWhere(params: {
  agentId?: string;
  status?: string;
  source?: string;
  from?: string;
  to?: string;
  /** When false (default), excludes runs with source='system' */
  includeSystem?: boolean;
}): { where: string; queryParams: unknown[] } {
  const clauses: string[] = [];
  const queryParams: unknown[] = [];

  if (params.agentId) {
    clauses.push('r.agent_id = ?');
    queryParams.push(params.agentId);
  }
  if (params.status) {
    clauses.push('r.status = ?');
    queryParams.push(params.status);
  }
  if (params.source) {
    clauses.push('r.source = ?');
    queryParams.push(params.source);
  } else if (!params.includeSystem) {
    // Hide system runs by default unless explicitly included or a specific source is requested
    clauses.push(`r.source != 'system'`);
  }
  if (params.from) {
    clauses.push('r.started_at >= ?');
    queryParams.push(params.from);
  }
  if (params.to) {
    clauses.push('r.started_at <= ?');
    queryParams.push(params.to);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, queryParams };
}

// GET /api/runs — paginated, filterable run list
runsRouter.get('/api/runs', (c) => {
  const { page, limit, offset } = getPaginationParams(c);
  const status = c.req.query('status');
  const source = c.req.query('source');
  const agentId = c.req.query('agentId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const sortParam = c.req.query('sort') ?? 'startedAt';
  const sortCol = VALID_RUN_SORT[sortParam] ?? 'r.created_at';
  // By default, hide system runs (source='system') to keep the list focused on agent runs.
  // Pass ?include_system=true to include them.
  const includeSystem = c.req.query('include_system') === 'true';

  const { where, queryParams } = buildRunWhere({ agentId, status, source, from, to, includeSystem });

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total ${RUN_BASE_SQL} ${where}`,
    queryParams
  );
  const total = countRow?.total ?? 0;

  const rows = all<RunRow>(
    `${RUN_SELECT_SQL} ${RUN_BASE_SQL} ${where} ORDER BY ${sortCol} DESC LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({ runs: rows.map(rowToRun), pagination });
});

// GET /api/runs/system — list system runs only (source='system')
runsRouter.get('/api/runs/system', (c) => {
  const { page, limit, offset } = getPaginationParams(c);
  const status = c.req.query('status');
  const agentId = c.req.query('agentId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const sortParam = c.req.query('sort') ?? 'startedAt';
  const sortCol = VALID_RUN_SORT[sortParam] ?? 'r.created_at';

  // Force source='system' filter
  const { where, queryParams } = buildRunWhere({ agentId, status, source: 'system', from, to, includeSystem: true });

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total ${RUN_BASE_SQL} ${where}`,
    queryParams
  );
  const total = countRow?.total ?? 0;

  const rows = all<RunRow>(
    `${RUN_SELECT_SQL} ${RUN_BASE_SQL} ${where} ORDER BY ${sortCol} DESC LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({ runs: rows.map(rowToRun), pagination });
});

// GET /api/runs/recent — must be declared BEFORE /api/runs/:id
runsRouter.get('/api/runs/recent', (c) => {
  const limitParam = c.req.query('limit');
  const limit = Math.min(
    100,
    Math.max(1, parseInt(limitParam ?? '20', 10) || 20)
  );

  const rows = all<RunRow>(
    `${RUN_SELECT_SQL} ${RUN_BASE_SQL} ORDER BY r.created_at DESC LIMIT ?`,
    [limit]
  );

  return c.json({ runs: rows.map(rowToRun) });
});

// GET /api/runs/:id
runsRouter.get('/api/runs/:id', (c) => {
  const id = c.req.param('id');

  const rows = all<RunRow>(`${RUN_SELECT_SQL} ${RUN_BASE_SQL} WHERE r.id = ?`, [id]);
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

  const { page, limit, offset } = getPaginationParams(c);
  const status = c.req.query('status');
  const source = c.req.query('source');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const sortParam = c.req.query('sort') ?? 'startedAt';
  const sortCol = VALID_RUN_SORT[sortParam] ?? 'r.created_at';
  const includeSystem = c.req.query('include_system') === 'true';

  const { where, queryParams } = buildRunWhere({ agentId, status, source, from, to, includeSystem });

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total ${RUN_BASE_SQL} ${where}`,
    queryParams
  );
  const total = countRow?.total ?? 0;

  const rows = all<RunRow>(
    `${RUN_SELECT_SQL} ${RUN_BASE_SQL} ${where} ORDER BY ${sortCol} DESC LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({ runs: rows.map(rowToRun), pagination });
});
