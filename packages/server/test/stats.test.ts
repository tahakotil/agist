import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, setActiveDb, createDbMock, getActiveDb } from './db-mock.js';
import { nanoid } from 'nanoid';

vi.mock('../src/db.js', () => createDbMock());
vi.mock('../src/sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {} }));
vi.mock('../src/ws.js', () => ({ pushToAgent: () => {}, initWebSocketServer: () => {}, handleUpgrade: () => {} }));
vi.mock('../src/adapter.js', () => ({ spawnClaudeLocal: async () => {} }));

async function buildApp() {
  const { healthRouter } = await import('../src/routes/health.js');
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const app = new Hono();
  app.route('/', healthRouter);
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

function insertRun(agentId: string, companyId: string, status: string, costCents: number, createdAt: string) {
  const db = getActiveDb();
  const id = nanoid();
  db.run(
    `INSERT INTO runs (id, agent_id, company_id, status, model, source, token_input,
     token_output, cost_cents, log_excerpt, created_at)
     VALUES (?, ?, ?, ?, 'claude-sonnet-4-6', 'manual', 0, 0, ?, '', ?)`,
    [id, agentId, companyId, status, costCents, createdAt]
  );
  return id;
}

describe('Dashboard Stats', () => {
  let app: Hono;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildApp();
  });

  it('GET /api/dashboard/stats on empty DB → all zeros/nulls', async () => {
    const res = await app.request('/api/dashboard/stats');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.totalAgents).toBe(0);
    expect(body.runningNow).toBe(0);
    expect(body.successRate24h).toBeNull();
    expect(body.costToday).toBe(0);
  });

  it('GET /api/dashboard/stats counts agents correctly', async () => {
    // Create company
    const companyRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Stats Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const companyId = ((await json(companyRes)).company as Record<string, unknown>).id as string;

    // Create 3 agents
    for (const name of ['Agent1', 'Agent2', 'Agent3']) {
      await app.request(`/api/companies/${companyId}/agents`, {
        method: 'POST',
        body: JSON.stringify({ name }),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await app.request('/api/dashboard/stats');
    const body = await json(res);
    expect(body.totalAgents).toBe(3);
    expect(body.runningNow).toBe(0);
  });

  it('GET /api/dashboard/stats counts running agents', async () => {
    const companyRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Running Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const companyId = ((await json(companyRes)).company as Record<string, unknown>).id as string;

    // Create 2 agents, set one to running
    const a1Res = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Agent1', status: 'running' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const a1Id = ((await json(a1Res)).agent as Record<string, unknown>).id as string;

    await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Agent2', status: 'idle' }),
      headers: { 'Content-Type': 'application/json' },
    });

    // Directly set agent1 status to 'running' in DB to bypass API status validation
    const db = getActiveDb();
    db.run(`UPDATE agents SET status = 'running' WHERE id = ?`, [a1Id]);

    const res = await app.request('/api/dashboard/stats');
    const body = await json(res);
    expect(body.totalAgents).toBe(2);
    expect(body.runningNow).toBe(1);
  });

  it('GET /api/dashboard/stats calculates success rate from 24h runs', async () => {
    const companyRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Rate Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const companyId = ((await json(companyRes)).company as Record<string, unknown>).id as string;

    const agentRes = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'RateAgent' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const agentId = ((await json(agentRes)).agent as Record<string, unknown>).id as string;

    // Insert 4 runs in last 24h: 3 success, 1 failed
    const recentTs = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
    insertRun(agentId, companyId, 'completed', 0, recentTs);
    insertRun(agentId, companyId, 'completed', 0, recentTs);
    insertRun(agentId, companyId, 'completed', 0, recentTs);
    insertRun(agentId, companyId, 'failed', 0, recentTs);

    const res = await app.request('/api/dashboard/stats');
    const body = await json(res);
    expect(body.successRate24h).toBe(75); // 3/4 = 75%
  });

  it('GET /api/dashboard/stats does not count runs older than 24h in rate', async () => {
    const companyRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Old Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const companyId = ((await json(companyRes)).company as Record<string, unknown>).id as string;

    const agentRes = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'OldAgent' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const agentId = ((await json(agentRes)).agent as Record<string, unknown>).id as string;

    // Insert run older than 24h
    const oldTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    insertRun(agentId, companyId, 'failed', 0, oldTs);

    const res = await app.request('/api/dashboard/stats');
    const body = await json(res);
    // No runs in last 24h → successRate24h should be null
    expect(body.successRate24h).toBeNull();
  });

  it('GET /api/dashboard/stats calculates costToday correctly', async () => {
    const companyRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Cost Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const companyId = ((await json(companyRes)).company as Record<string, unknown>).id as string;

    const agentRes = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'CostAgent' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const agentId = ((await json(agentRes)).agent as Record<string, unknown>).id as string;

    const todayTs = new Date().toISOString();
    insertRun(agentId, companyId, 'completed', 150, todayTs); // $1.50
    insertRun(agentId, companyId, 'completed', 200, todayTs); // $2.00

    const res = await app.request('/api/dashboard/stats');
    const body = await json(res);
    expect(body.costToday).toBe(3.5); // (150 + 200) / 100
  });
});
