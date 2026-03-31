import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, setActiveDb, createDbMock, getActiveDb } from './db-mock.js';
import { nanoid } from 'nanoid';

vi.mock('../src/db.js', () => createDbMock());
vi.mock('../src/sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {} }));
vi.mock('../src/ws.js', () => ({ pushToAgent: () => {}, initWebSocketServer: () => {}, handleUpgrade: () => {} }));
vi.mock('../src/adapter.js', () => ({ spawnClaudeLocal: async () => {}, checkAgentBudget: () => null }));

async function buildApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const { runsRouter } = await import('../src/routes/runs.js');
  const app = new Hono();
  // Inject admin role so RBAC middleware passes in tests
  app.use('*', async (c, next) => { c.set('role', 'admin'); c.set('apiKeyId', 'test-key'); return next(); });
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', runsRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

/** Directly insert a run row into the test DB */
function seedRun(agentId: string, companyId: string, status = 'completed') {
  const db = getActiveDb();
  const id = nanoid();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source,
     started_at, finished_at, token_input, token_output, cost_cents, log_excerpt, created_at)
     VALUES (?, ?, ?, NULL, ?, 'claude-sonnet-4-6', 'manual', ?, ?, 100, 200, 5, 'log', ?)`,
    [id, agentId, companyId, status, now, now, now]
  );
  return id;
}

describe('Runs', () => {
  let app: Hono;
  let companyId: string;
  let agentId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildApp();

    // Create company and agent
    const companyRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Run Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    companyId = ((await json(companyRes)).company as Record<string, unknown>).id as string;

    const agentRes = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'RunAgent', role: 'worker' }),
      headers: { 'Content-Type': 'application/json' },
    });
    agentId = ((await json(agentRes)).agent as Record<string, unknown>).id as string;
  });

  // ── RECENT RUNS ──────────────────────────────────────────────────────────────

  it('GET /api/runs/recent → 200 empty list when no runs', async () => {
    const res = await app.request('/api/runs/recent');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.runs)).toBe(true);
    expect((body.runs as unknown[]).length).toBe(0);
  });

  it('GET /api/runs/recent → 200 with seeded runs', async () => {
    seedRun(agentId, companyId, 'completed');
    seedRun(agentId, companyId, 'failed');

    const res = await app.request('/api/runs/recent');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.runs as unknown[]).length).toBe(2);
  });

  it('GET /api/runs/recent?limit=1 → returns max 1 run', async () => {
    for (let i = 0; i < 5; i++) seedRun(agentId, companyId);

    const res = await app.request('/api/runs/recent?limit=1');
    expect(res.status).toBe(200);
    expect(((await json(res)).runs as unknown[]).length).toBe(1);
  });

  // ── RUNS BY AGENT ─────────────────────────────────────────────────────────────

  it('GET /api/agents/:agentId/runs → 200 with runs', async () => {
    seedRun(agentId, companyId);
    seedRun(agentId, companyId);

    const res = await app.request(`/api/agents/${agentId}/runs`);
    expect(res.status).toBe(200);
    const body = await json(res);
    const runs = body.runs as Array<Record<string, unknown>>;
    expect(runs.length).toBe(2);
    for (const r of runs) {
      expect(r.agentId).toBe(agentId);
    }
  });

  it('GET /api/agents/:agentId/runs → 404 for nonexistent agent', async () => {
    const res = await app.request('/api/agents/ghost-id/runs');
    expect(res.status).toBe(404);
  });

  it('GET /api/agents/:agentId/runs only returns own runs', async () => {
    // Create a second agent
    const agentRes2 = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'OtherAgent', role: 'worker' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const agentId2 = ((await json(agentRes2)).agent as Record<string, unknown>).id as string;

    seedRun(agentId, companyId);
    seedRun(agentId2, companyId);

    const res = await app.request(`/api/agents/${agentId}/runs`);
    const runs = ((await json(res)).runs as Array<Record<string, unknown>>);
    expect(runs.length).toBe(1);
    expect(runs[0].agentId).toBe(agentId);
  });

  // ── GET BY ID ─────────────────────────────────────────────────────────────────

  it('GET /api/runs/:id → 200 for existing run', async () => {
    const runId = seedRun(agentId, companyId);

    const res = await app.request(`/api/runs/${runId}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    const run = body.run as Record<string, unknown>;
    expect(run.id).toBe(runId);
    expect(run.agentId).toBe(agentId);
    expect(run.status).toBe('completed');
    expect(typeof run.cost).toBe('number');
  });

  it('GET /api/runs/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/runs/nonexistent-run-id');
    expect(res.status).toBe(404);
  });

  // ── RUN FIELDS ───────────────────────────────────────────────────────────────

  it('GET /api/runs/:id returns proper fields', async () => {
    const runId = seedRun(agentId, companyId, 'failed');
    const res = await app.request(`/api/runs/${runId}`);
    const run = (await json(res)).run as Record<string, unknown>;

    expect(run).toHaveProperty('id');
    expect(run).toHaveProperty('agentId');
    expect(run).toHaveProperty('companyId');
    expect(run).toHaveProperty('status');
    expect(run).toHaveProperty('model');
    expect(run).toHaveProperty('source');
    expect(run).toHaveProperty('tokenInput');
    expect(run).toHaveProperty('tokenOutput');
    expect(run).toHaveProperty('cost');
    expect(run).toHaveProperty('costCents');
    expect(run).toHaveProperty('createdAt');
    expect(run.status).toBe('failed');
  });

  // ── /wake creates run ────────────────────────────────────────────────────────

  it('POST /api/agents/:id/wake then GET /api/runs/recent includes the queued run', async () => {
    const wakeRes = await app.request(`/api/agents/${agentId}/wake`, {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Do work' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(wakeRes.status).toBe(202);
    const wakeBody = await json(wakeRes);
    const runId = (wakeBody.run as Record<string, unknown>).id as string;

    const recentRes = await app.request('/api/runs/recent');
    const runs = ((await json(recentRes)).runs as Array<Record<string, unknown>>);
    const created = runs.find((r) => r.id === runId);
    expect(created).toBeDefined();
    expect(created?.status).toBe('queued');
  });
});
