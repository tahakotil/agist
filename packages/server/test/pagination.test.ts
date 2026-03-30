/**
 * Integration tests for:
 * - Pagination (page/limit params, pagination metadata in responses)
 * - Filtering (?status=, ?search=, ?priority=, ?enabled=)
 * - Sorting (?sort=name, ?sort=createdAt)
 * - Bulk run delete (DELETE /api/agents/:id/runs?olderThan=Nd)
 * - OpenAPI spec endpoint (/api/openapi.json returns valid JSON)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, setActiveDb, createDbMock, getActiveDb } from './db-mock.js';
import type { Database } from 'sql.js';

vi.mock('../src/db.js', () => createDbMock());
vi.mock('../src/sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {}, sseRouter: { get: () => {} } }));
vi.mock('../src/ws.js', () => ({ pushToAgent: () => {}, initWebSocketServer: () => {}, handleUpgrade: () => {} }));
vi.mock('../src/adapter.js', () => ({ spawnClaudeLocal: async () => {} }));
vi.mock('../src/logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

// ─── App builders ────────────────────────────────────────────────────────────

// Shared admin role injector so RBAC middleware passes in all test apps
function withAdmin(app: Hono): Hono {
  app.use('*', async (c, next) => { c.set('role', 'admin'); c.set('apiKeyId', 'test-key'); return next(); });
  return app;
}

async function buildCompaniesApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const app = withAdmin(new Hono());
  app.route('/', companiesRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

async function buildAgentsApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const app = withAdmin(new Hono());
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

async function buildRunsApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const { runsRouter } = await import('../src/routes/runs.js');
  const app = withAdmin(new Hono());
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', runsRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

async function buildRoutinesApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const { routinesRouter } = await import('../src/routes/routines.js');
  const app = withAdmin(new Hono());
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', routinesRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

async function buildIssuesApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const { issuesRouter } = await import('../src/routes/issues.js');
  const app = withAdmin(new Hono());
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', issuesRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

async function buildOpenApiApp() {
  const { openapiRouter } = await import('../src/routes/openapi.js');
  const app = new Hono();
  app.route('/', openapiRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

async function createCompany(app: Hono, name = 'Test Co') {
  const res = await app.request('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ name }),
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await json(res) as { company: { id: string } };
  return body.company.id;
}

async function createAgent(app: Hono, companyId: string, name: string, model = 'claude-sonnet-4-6') {
  const res = await app.request(`/api/companies/${companyId}/agents`, {
    method: 'POST',
    body: JSON.stringify({ name, model, role: 'worker' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await json(res) as { agent: { id: string } };
  return body.agent.id;
}

function seedRun(
  db: Database,
  id: string,
  agentId: string,
  companyId: string,
  opts: {
    status?: string;
    createdAt?: string;
    costCents?: number;
    model?: string;
  } = {}
) {
  const {
    status = 'completed',
    createdAt = new Date().toISOString(),
    costCents = 100,
    model = 'claude-sonnet-4-6',
  } = opts;
  db.run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source,
       token_input, token_output, cost_cents, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, 'manual', 100, 50, ?, ?)`,
    [id, agentId, companyId, status, model, costCents, createdAt]
  );
}

// ─── Pagination: Companies ───────────────────────────────────────────────────

describe('Companies pagination', () => {
  let app: Hono;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildCompaniesApp();
  });

  it('GET /api/companies returns pagination metadata', async () => {
    const res = await app.request('/api/companies');
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body).toHaveProperty('pagination');
    const pg = body.pagination as Record<string, unknown>;
    expect(pg).toHaveProperty('page');
    expect(pg).toHaveProperty('limit');
    expect(pg).toHaveProperty('total');
    expect(pg).toHaveProperty('totalPages');
    expect(pg.page).toBe(1);
  });

  it('GET /api/companies?page=1&limit=2 returns at most 2 companies', async () => {
    // Create 5 companies
    for (let i = 0; i < 5; i++) {
      await createCompany(app, `Company ${i}`);
    }

    const res = await app.request('/api/companies?page=1&limit=2');
    expect(res.status).toBe(200);
    const body = await json(res) as { companies: unknown[]; pagination: Record<string, unknown> };
    expect(body.companies).toHaveLength(2);
    expect(body.pagination.total).toBe(5);
    expect(body.pagination.totalPages).toBe(3);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(2);
  });

  it('GET /api/companies?page=2&limit=2 returns second page', async () => {
    for (let i = 0; i < 5; i++) {
      await createCompany(app, `Company ${i}`);
    }

    const resPage1 = await app.request('/api/companies?page=1&limit=2');
    const resPage2 = await app.request('/api/companies?page=2&limit=2');
    expect(resPage1.status).toBe(200);
    expect(resPage2.status).toBe(200);

    const p1 = await json(resPage1) as { companies: Array<{ id: string }> };
    const p2 = await json(resPage2) as { companies: Array<{ id: string }> };

    // Pages should not overlap
    const p1Ids = p1.companies.map((c) => c.id);
    const p2Ids = p2.companies.map((c) => c.id);
    const overlap = p1Ids.filter((id) => p2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('GET /api/companies?search=alpha filters by name', async () => {
    await createCompany(app, 'Alpha Corp');
    await createCompany(app, 'Beta Ltd');
    await createCompany(app, 'Alpha Labs');

    const res = await app.request('/api/companies?search=alpha');
    expect(res.status).toBe(200);
    const body = await json(res) as { companies: Array<{ name: string }> };
    expect(body.companies.length).toBe(2);
    body.companies.forEach((c) => {
      expect(c.name.toLowerCase()).toContain('alpha');
    });
  });

  it('GET /api/companies?sort=name returns companies sorted by name', async () => {
    await createCompany(app, 'Zebra Co');
    await createCompany(app, 'Alpha Co');
    await createCompany(app, 'Mango Co');

    const res = await app.request('/api/companies?sort=name');
    expect(res.status).toBe(200);
    const body = await json(res) as { companies: Array<{ name: string }> };
    const names = body.companies.map((c) => c.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('limit is capped at 100', async () => {
    const res = await app.request('/api/companies?limit=9999');
    expect(res.status).toBe(200);
    const body = await json(res) as { pagination: { limit: number } };
    expect(body.pagination.limit).toBeLessThanOrEqual(100);
  });
});

// ─── Pagination: Agents ──────────────────────────────────────────────────────

describe('Agents pagination and filtering', () => {
  let app: Hono;
  let companyId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildAgentsApp();
    companyId = await createCompany(app, 'Test Co');
  });

  it('GET /api/agents returns pagination metadata', async () => {
    const res = await app.request('/api/agents');
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body).toHaveProperty('pagination');
    const pg = body.pagination as Record<string, unknown>;
    expect(pg.page).toBe(1);
    expect(pg.total).toBe(0);
  });

  it('GET /api/agents?limit=2 paginates agent list', async () => {
    for (let i = 0; i < 5; i++) {
      await createAgent(app, companyId, `Agent ${i}`);
    }

    const res = await app.request('/api/agents?limit=2');
    expect(res.status).toBe(200);
    const body = await json(res) as { agents: unknown[]; pagination: Record<string, unknown> };
    expect(body.agents).toHaveLength(2);
    expect(body.pagination.total).toBe(5);
  });

  it('GET /api/agents?status=idle filters by status', async () => {
    await createAgent(app, companyId, 'Idle Agent');
    // Manually set one agent to running via DB
    const db = getActiveDb();
    db.run(`UPDATE agents SET status = 'running' WHERE name = 'Idle Agent'`);
    await createAgent(app, companyId, 'Another Idle');

    const res = await app.request('/api/agents?status=idle');
    expect(res.status).toBe(200);
    const body = await json(res) as { agents: Array<{ status: string }> };
    body.agents.forEach((a) => expect(a.status).toBe('idle'));
  });

  it('GET /api/agents?model=claude-haiku-4-5-20251001 filters by model', async () => {
    // Create agent with specific model via DB
    const db = getActiveDb();
    db.run(
      `INSERT INTO agents (id, company_id, name, role, title, model, capabilities, status,
         reports_to, adapter_type, adapter_config, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
       VALUES ('haiku-agent', ?, 'Haiku Bot', 'worker', '', 'claude-haiku-4-5-20251001', '[]', 'idle', NULL,
         'claude_local', '{}', 0, 0, datetime('now'), datetime('now'))`,
      [companyId]
    );
    await createAgent(app, companyId, 'Sonnet Agent');

    const res = await app.request('/api/agents?model=claude-haiku-4-5-20251001');
    expect(res.status).toBe(200);
    const body = await json(res) as { agents: Array<{ model: string }> };
    expect(body.agents.length).toBeGreaterThanOrEqual(1);
    body.agents.forEach((a) => expect(a.model).toBe('claude-haiku-4-5-20251001'));
  });

  it('GET /api/companies/:id/agents returns pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await createAgent(app, companyId, `Agent ${i}`);
    }

    const res = await app.request(`/api/companies/${companyId}/agents?limit=2`);
    expect(res.status).toBe(200);
    const body = await json(res) as { agents: unknown[]; pagination: Record<string, unknown> };
    expect(body.agents).toHaveLength(2);
    expect(body.pagination.total).toBe(3);
  });
});

// ─── Pagination: Runs ────────────────────────────────────────────────────────

describe('Runs pagination and bulk delete', () => {
  let app: Hono;
  let companyId: string;
  let agentId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildRunsApp();
    companyId = await createCompany(app, 'Test Co');
    agentId = await createAgent(app, companyId, 'Test Agent');
  });

  it('GET /api/runs returns pagination metadata', async () => {
    const res = await app.request('/api/runs');
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body).toHaveProperty('pagination');
    expect(body).toHaveProperty('runs');
  });

  it('GET /api/agents/:id/runs returns pagination metadata', async () => {
    const res = await app.request(`/api/agents/${agentId}/runs`);
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body).toHaveProperty('pagination');
    expect(body).toHaveProperty('runs');
  });

  it('GET /api/agents/:id/runs?limit=2 returns 2 runs', async () => {
    const db = getActiveDb();
    for (let i = 0; i < 5; i++) {
      seedRun(db, `run-${i}`, agentId, companyId);
    }

    const res = await app.request(`/api/agents/${agentId}/runs?limit=2`);
    expect(res.status).toBe(200);
    const body = await json(res) as { runs: unknown[]; pagination: Record<string, unknown> };
    expect(body.runs).toHaveLength(2);
    expect(body.pagination.total).toBe(5);
  });

  it('GET /api/runs?status=failed filters by status', async () => {
    const db = getActiveDb();
    seedRun(db, 'run-fail-1', agentId, companyId, { status: 'failed' });
    seedRun(db, 'run-fail-2', agentId, companyId, { status: 'failed' });
    seedRun(db, 'run-ok', agentId, companyId, { status: 'completed' });

    const res = await app.request('/api/runs?status=failed');
    expect(res.status).toBe(200);
    const body = await json(res) as { runs: Array<{ status: string }> };
    expect(body.runs.length).toBe(2);
    body.runs.forEach((r) => expect(r.status).toBe('failed'));
  });

  it('DELETE /api/agents/:id/runs?olderThan=0d deletes all runs', async () => {
    const db = getActiveDb();
    const pastTs = new Date(Date.now() - 2000).toISOString();
    seedRun(db, 'run-old-1', agentId, companyId, { createdAt: pastTs });
    seedRun(db, 'run-old-2', agentId, companyId, { createdAt: pastTs });

    const res = await app.request(`/api/agents/${agentId}/runs?olderThan=0d`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const body = await json(res) as { deleted: number };
    expect(body.deleted).toBe(2);

    // Verify runs are gone
    const listRes = await app.request(`/api/agents/${agentId}/runs`);
    const listBody = await json(listRes) as { runs: unknown[] };
    expect(listBody.runs).toHaveLength(0);
  });

  it('DELETE /api/agents/:id/runs?olderThan=30d keeps recent runs', async () => {
    const db = getActiveDb();
    // Old run (40 days ago)
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    seedRun(db, 'run-old', agentId, companyId, { createdAt: oldDate });
    // Recent run (now)
    seedRun(db, 'run-new', agentId, companyId);

    const res = await app.request(`/api/agents/${agentId}/runs?olderThan=30d`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const body = await json(res) as { deleted: number };
    expect(body.deleted).toBe(1); // Only old run deleted

    // Recent run still there
    const listRes = await app.request(`/api/agents/${agentId}/runs`);
    const listBody = await json(listRes) as { runs: Array<{ id: string }> };
    expect(listBody.runs).toHaveLength(1);
    expect(listBody.runs[0].id).toBe('run-new');
  });

  it('DELETE /api/agents/:id/runs?status=failed deletes only failed runs', async () => {
    const db = getActiveDb();
    const pastTs = new Date(Date.now() - 2000).toISOString();
    seedRun(db, 'run-fail', agentId, companyId, { status: 'failed', createdAt: pastTs });
    seedRun(db, 'run-ok', agentId, companyId, { status: 'completed', createdAt: pastTs });

    const res = await app.request(`/api/agents/${agentId}/runs?olderThan=0d&status=failed`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const body = await json(res) as { deleted: number };
    expect(body.deleted).toBe(1);

    const listRes = await app.request(`/api/agents/${agentId}/runs`);
    const listBody = await json(listRes) as { runs: Array<{ status: string }> };
    expect(listBody.runs).toHaveLength(1);
    expect(listBody.runs[0].status).toBe('completed');
  });
});

// ─── Pagination: Routines ────────────────────────────────────────────────────

describe('Routines pagination and global list', () => {
  let app: Hono;
  let companyId: string;
  let agentId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildRoutinesApp();
    companyId = await createCompany(app, 'Test Co');
    agentId = await createAgent(app, companyId, 'Test Agent');
  });

  async function createRoutine(title: string, enabled = true) {
    const res = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        title,
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        enabled,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    return res;
  }

  it('GET /api/routines returns global routine list with pagination', async () => {
    await createRoutine('Daily Health Check');
    await createRoutine('Weekly Report');

    const res = await app.request('/api/routines');
    expect(res.status).toBe(200);
    const body = await json(res) as { routines: unknown[]; pagination: Record<string, unknown> };
    expect(Array.isArray(body.routines)).toBe(true);
    expect(body).toHaveProperty('pagination');
    expect(body.pagination.total).toBe(2);
  });

  it('GET /api/routines?enabled=true returns only enabled routines', async () => {
    await createRoutine('Enabled Routine', true);
    await createRoutine('Disabled Routine', false);

    const res = await app.request('/api/routines?enabled=true');
    expect(res.status).toBe(200);
    const body = await json(res) as { routines: Array<{ enabled: boolean }> };
    expect(body.routines.length).toBe(1);
    expect(body.routines[0].enabled).toBe(true);
  });

  it('GET /api/companies/:id/routines returns pagination', async () => {
    for (let i = 0; i < 4; i++) {
      await createRoutine(`Routine ${i}`);
    }

    const res = await app.request(`/api/companies/${companyId}/routines?limit=2`);
    expect(res.status).toBe(200);
    const body = await json(res) as { routines: unknown[]; pagination: Record<string, unknown> };
    expect(body.routines).toHaveLength(2);
    expect(body.pagination.total).toBe(4);
  });

  it('GET /api/routines?agentId=X filters by agent', async () => {
    const companyId2 = await createCompany(app, 'Other Co');
    const agentId2 = await createAgent(app, companyId2, 'Other Agent');

    await createRoutine('Routine for Agent 1');

    // Create routine for other agent
    await app.request(`/api/companies/${companyId2}/routines`, {
      method: 'POST',
      body: JSON.stringify({
        agentId: agentId2,
        title: 'Routine for Agent 2',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
        enabled: true,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await app.request(`/api/routines?agentId=${agentId}`);
    expect(res.status).toBe(200);
    const body = await json(res) as { routines: Array<{ agentId: string }> };
    expect(body.routines.length).toBe(1);
    expect(body.routines[0].agentId).toBe(agentId);
  });
});

// ─── Pagination: Issues ──────────────────────────────────────────────────────

describe('Issues pagination and filtering', () => {
  let app: Hono;
  let companyId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildIssuesApp();
    companyId = await createCompany(app, 'Test Co');
  });

  async function createIssue(title: string, priority = 'medium', status = 'open') {
    return app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, priority, status }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('GET /api/companies/:id/issues returns pagination', async () => {
    const res = await app.request(`/api/companies/${companyId}/issues`);
    expect(res.status).toBe(200);
    const body = await json(res) as Record<string, unknown>;
    expect(body).toHaveProperty('pagination');
    expect(body).toHaveProperty('issues');
  });

  it('GET /api/companies/:id/issues?limit=2 returns 2 issues', async () => {
    for (let i = 0; i < 5; i++) {
      await createIssue(`Issue ${i}`);
    }

    const res = await app.request(`/api/companies/${companyId}/issues?limit=2`);
    expect(res.status).toBe(200);
    const body = await json(res) as { issues: unknown[]; pagination: Record<string, unknown> };
    expect(body.issues).toHaveLength(2);
    expect(body.pagination.total).toBe(5);
  });

  it('GET /api/companies/:id/issues?priority=critical filters by priority', async () => {
    await createIssue('Critical Issue', 'critical');
    await createIssue('Low Issue', 'low');
    await createIssue('Another Critical', 'critical');

    const res = await app.request(`/api/companies/${companyId}/issues?priority=critical`);
    expect(res.status).toBe(200);
    const body = await json(res) as { issues: Array<{ priority: string }> };
    expect(body.issues.length).toBe(2);
    body.issues.forEach((issue) => expect(issue.priority).toBe('critical'));
  });

  it('GET /api/companies/:id/issues?sort=priority sorts by priority (critical first)', async () => {
    await createIssue('Low Priority', 'low');
    await createIssue('Critical Issue', 'critical');
    await createIssue('Medium Issue', 'medium');

    const res = await app.request(`/api/companies/${companyId}/issues?sort=priority`);
    expect(res.status).toBe(200);
    const body = await json(res) as { issues: Array<{ priority: string }> };
    expect(body.issues[0].priority).toBe('critical');
  });

  it('GET /api/companies/:id/issues?status=open filters by status', async () => {
    await createIssue('Open Issue', 'medium', 'open');
    await createIssue('Resolved Issue', 'medium', 'resolved');

    const res = await app.request(`/api/companies/${companyId}/issues?status=open`);
    expect(res.status).toBe(200);
    const body = await json(res) as { issues: Array<{ status: string }> };
    expect(body.issues.length).toBe(1);
    expect(body.issues[0].status).toBe('open');
  });
});

// ─── OpenAPI spec endpoint ───────────────────────────────────────────────────

describe('OpenAPI spec endpoint', () => {
  let app: Hono;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildOpenApiApp();
  });

  it('GET /api/openapi.json returns 200 with valid JSON', async () => {
    const res = await app.request('/api/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('openapi');
    expect(body.openapi).toMatch(/^3\./);
  });

  it('GET /api/openapi.json returns correct content-type', async () => {
    const res = await app.request('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('GET /api/openapi.json has info.title and paths', async () => {
    const res = await app.request('/api/openapi.json');
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('info');
    expect(body).toHaveProperty('paths');
    const info = body.info as Record<string, unknown>;
    expect(typeof info.title).toBe('string');
    expect(typeof info.version).toBe('string');
  });

  it('GET /api/docs returns 200 with Swagger UI HTML', async () => {
    const res = await app.request('/api/docs');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('swagger');
  });
});
