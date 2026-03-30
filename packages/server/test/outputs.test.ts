import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { createTestDb, setActiveDb, createDbMock, getActiveDb } from './db-mock.js';

vi.mock('../src/db.js', () => createDbMock());
vi.mock('../src/sse.js', () => ({
  broadcast: () => {},
  subscribe: () => () => {},
}));
vi.mock('../src/ws.js', () => ({
  pushToAgent: () => {},
  initWebSocketServer: () => {},
  handleUpgrade: () => {},
}));
vi.mock('../src/adapter.js', () => ({ spawnClaudeLocal: async () => {} }));

async function buildApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const { outputsRouter } = await import('../src/routes/outputs.js');
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('role', 'admin');
    c.set('apiKeyId', 'test-key');
    return next();
  });
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', outputsRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

async function createCompany(app: Hono, name = 'Test Corp') {
  const res = await app.request('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ name }),
    headers: { 'Content-Type': 'application/json' },
  });
  return ((await json(res)).company as Record<string, unknown>).id as string;
}

async function createAgent(app: Hono, companyId: string, name = 'TestAgent') {
  const res = await app.request(`/api/companies/${companyId}/agents`, {
    method: 'POST',
    body: JSON.stringify({ name, role: 'worker' }),
    headers: { 'Content-Type': 'application/json' },
  });
  return (await json(res)).agent as Record<string, unknown>;
}

function seedRun(agentId: string, companyId: string, status = 'completed') {
  const db = getActiveDb();
  const id = nanoid();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source,
     started_at, finished_at, token_input, token_output, cost_cents, log_excerpt, created_at)
     VALUES (?, ?, ?, NULL, ?, 'claude-sonnet-4-6', 'manual', ?, ?, 0, 0, 0, '', ?)`,
    [id, agentId, companyId, status, now, now, now]
  );
  return id;
}

describe('Outputs API', () => {
  let app: Hono;
  let companyId: string;
  let agentId: string;
  let runId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildApp();
    companyId = await createCompany(app);
    const agent = await createAgent(app, companyId);
    agentId = agent.id as string;
    runId = seedRun(agentId, companyId);
  });

  // ── POST /api/runs/:runId/outputs ──────────────────────────────────────────

  it('POST /api/runs/:runId/outputs → 201 with output', async () => {
    const res = await app.request(`/api/runs/${runId}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ output_type: 'health', data: { status: 'PASS', checks: [] } }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const output = body.output as Record<string, unknown>;
    expect(output.id).toBeDefined();
    expect(output.runId).toBe(runId);
    expect(output.agentId).toBe(agentId);
    expect(output.outputType).toBe('health');
    expect((output.data as Record<string, unknown>).status).toBe('PASS');
    expect(output.createdAt).toBeDefined();
  });

  it('POST outputs defaults output_type to "report"', async () => {
    const res = await app.request(`/api/runs/${runId}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ data: { summary: 'done', timestamp: '2024-01-01' } }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const output = (await json(res)).output as Record<string, unknown>;
    expect(output.outputType).toBe('report');
  });

  it('POST outputs to nonexistent run → 404', async () => {
    const res = await app.request(`/api/runs/ghost-run/outputs`, {
      method: 'POST',
      body: JSON.stringify({ data: { status: 'ok', summary: 'x' } }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('POST outputs missing data field → 400', async () => {
    const res = await app.request(`/api/runs/${runId}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ output_type: 'health' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST multiple outputs for same run → all stored', async () => {
    for (const type of ['health', 'analytics']) {
      await app.request(`/api/runs/${runId}/outputs`, {
        method: 'POST',
        body: JSON.stringify({ output_type: type, data: { timestamp: '2024-01-01', summary: type } }),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await app.request(`/api/runs/${runId}/outputs`);
    const outputs = (await json(res)).outputs as unknown[];
    expect(outputs).toHaveLength(2);
  });

  // ── GET /api/runs/:runId/outputs ───────────────────────────────────────────

  it('GET /api/runs/:runId/outputs → empty list initially', async () => {
    const res = await app.request(`/api/runs/${runId}/outputs`);
    expect(res.status).toBe(200);
    const outputs = (await json(res)).outputs as unknown[];
    expect(outputs).toEqual([]);
  });

  it('GET /api/runs/:runId/outputs → returns created outputs', async () => {
    await app.request(`/api/runs/${runId}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ output_type: 'analytics', data: { metrics: { views: 100 }, timestamp: '2024-01-01' } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await app.request(`/api/runs/${runId}/outputs`);
    expect(res.status).toBe(200);
    const outputs = (await json(res)).outputs as Array<Record<string, unknown>>;
    expect(outputs).toHaveLength(1);
    expect(outputs[0].outputType).toBe('analytics');
  });

  it('GET outputs for nonexistent run → 404', async () => {
    const res = await app.request(`/api/runs/ghost-run/outputs`);
    expect(res.status).toBe(404);
  });

  it('GET multiple outputs preserves creation order (ASC)', async () => {
    for (const type of ['health', 'analytics', 'seo']) {
      await app.request(`/api/runs/${runId}/outputs`, {
        method: 'POST',
        body: JSON.stringify({ output_type: type, data: { timestamp: '2024-01-01', summary: type } }),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await app.request(`/api/runs/${runId}/outputs`);
    const outputs = (await json(res)).outputs as Array<Record<string, unknown>>;
    expect(outputs).toHaveLength(3);
    expect(outputs[0].outputType).toBe('health');
    expect(outputs[2].outputType).toBe('seo');
  });

  // ── GET /api/agents/:agentId/outputs ──────────────────────────────────────

  it('GET /api/agents/:agentId/outputs → empty list initially', async () => {
    const res = await app.request(`/api/agents/${agentId}/outputs`);
    expect(res.status).toBe(200);
    const outputs = (await json(res)).outputs as unknown[];
    expect(outputs).toEqual([]);
  });

  it('GET /api/agents/:agentId/outputs → returns outputs for agent', async () => {
    await app.request(`/api/runs/${runId}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ output_type: 'health', data: { status: 'PASS', checks: [], timestamp: '2024-01-01' } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await app.request(`/api/agents/${agentId}/outputs`);
    expect(res.status).toBe(200);
    const outputs = (await json(res)).outputs as Array<Record<string, unknown>>;
    expect(outputs).toHaveLength(1);
    expect(outputs[0].agentId).toBe(agentId);
  });

  it('GET outputs for nonexistent agent → 404', async () => {
    const res = await app.request(`/api/agents/ghost-agent/outputs`);
    expect(res.status).toBe(404);
  });

  it('GET /api/agents/:agentId/outputs respects limit query param', async () => {
    for (let i = 0; i < 5; i++) {
      await app.request(`/api/runs/${runId}/outputs`, {
        method: 'POST',
        body: JSON.stringify({ output_type: 'report', data: { summary: `report ${i}`, timestamp: '2024-01-01' } }),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await app.request(`/api/agents/${agentId}/outputs?limit=2`);
    const outputs = (await json(res)).outputs as unknown[];
    expect(outputs).toHaveLength(2);
  });

  it('GET /api/agents/:agentId/outputs returns newest first (DESC)', async () => {
    for (const type of ['health', 'analytics', 'seo']) {
      await app.request(`/api/runs/${runId}/outputs`, {
        method: 'POST',
        body: JSON.stringify({ output_type: type, data: { timestamp: '2024-01-01', summary: type } }),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await app.request(`/api/agents/${agentId}/outputs`);
    const outputs = (await json(res)).outputs as Array<Record<string, unknown>>;
    // newest-first: seo was inserted last
    expect(outputs[0].outputType).toBe('seo');
  });

  // ── GET /api/agents/:agentId/outputs/latest ───────────────────────────────

  it('GET /api/agents/:agentId/outputs/latest → null when no outputs', async () => {
    const res = await app.request(`/api/agents/${agentId}/outputs/latest`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.output).toBeNull();
  });

  it('GET /api/agents/:agentId/outputs/latest → returns most recent output', async () => {
    await app.request(`/api/runs/${runId}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ output_type: 'health', data: { status: 'PASS', checks: [], timestamp: '2024-01-01' } }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request(`/api/runs/${runId}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ output_type: 'analytics', data: { metrics: { views: 200 }, timestamp: '2024-01-02' } }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await app.request(`/api/agents/${agentId}/outputs/latest`);
    expect(res.status).toBe(200);
    const output = (await json(res)).output as Record<string, unknown>;
    expect(output).not.toBeNull();
    expect(output.outputType).toBe('analytics');
  });

  it('GET latest output for nonexistent agent → 404', async () => {
    const res = await app.request(`/api/agents/ghost-agent/outputs/latest`);
    expect(res.status).toBe(404);
  });

  // ── GET /api/companies/:cid/outputs/summary ────────────────────────────────

  it('GET /api/companies/:cid/outputs/summary → empty summary initially', async () => {
    const res = await app.request(`/api/companies/${companyId}/outputs/summary`);
    expect(res.status).toBe(200);
    const summary = (await json(res)).summary as unknown[];
    expect(summary).toEqual([]);
  });

  it('GET /api/companies/:cid/outputs/summary → returns latest output per agent', async () => {
    const company2Id = await createCompany(app, 'Second Corp');
    const agent2 = await createAgent(app, company2Id, 'Agent2');
    const agent2Id = agent2.id as string;
    const run2Id = seedRun(agent2Id, company2Id);

    // Add outputs to both agents
    await app.request(`/api/runs/${runId}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ output_type: 'health', data: { status: 'PASS', timestamp: '2024-01-01' } }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request(`/api/runs/${run2Id}/outputs`, {
      method: 'POST',
      body: JSON.stringify({ output_type: 'health', data: { status: 'FAIL', timestamp: '2024-01-02' } }),
      headers: { 'Content-Type': 'application/json' },
    });

    // Summary for company 2 should only show agent2's output
    const res = await app.request(`/api/companies/${company2Id}/outputs/summary`);
    expect(res.status).toBe(200);
    const summary = (await json(res)).summary as Array<Record<string, unknown>>;
    expect(summary).toHaveLength(1);
    expect(summary[0].agentId).toBe(agent2Id);
    expect(summary[0].agentName).toBe('Agent2');
    expect(summary[0].status).toBe('FAIL');
  });

  it('GET outputs summary for nonexistent company → 404', async () => {
    const res = await app.request(`/api/companies/ghost-company/outputs/summary`);
    expect(res.status).toBe(404);
  });
});
