import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js';

vi.mock('../src/db.js', () => createDbMock());
vi.mock('../src/sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {} }));
vi.mock('../src/ws.js', () => ({ pushToAgent: () => {}, initWebSocketServer: () => {}, handleUpgrade: () => {} }));
vi.mock('../src/adapter.js', () => ({ spawnClaudeLocal: async () => {} }));

async function buildApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const { routinesRouter } = await import('../src/routes/routines.js');
  const app = new Hono();
  // Inject admin role so RBAC middleware passes in tests
  app.use('*', async (c, next) => { c.set('role', 'admin'); c.set('apiKeyId', 'test-key'); return next(); });
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', routinesRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

async function createCompany(app: Hono, name = 'Routine Corp') {
  const res = await app.request('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ name }),
    headers: { 'Content-Type': 'application/json' },
  });
  return ((await json(res)).company as Record<string, unknown>).id as string;
}

async function createAgent(app: Hono, companyId: string) {
  const res = await app.request(`/api/companies/${companyId}/agents`, {
    method: 'POST',
    body: JSON.stringify({ name: 'RoutineAgent', role: 'worker' }),
    headers: { 'Content-Type': 'application/json' },
  });
  return ((await json(res)).agent as Record<string, unknown>).id as string;
}

describe('Routines CRUD', () => {
  let app: Hono;
  let companyId: string;
  let agentId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildApp();
    companyId = await createCompany(app);
    agentId = await createAgent(app, companyId);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────────

  it('POST /api/companies/:companyId/routines → 201', async () => {
    const res = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        title: 'Daily Healthcheck',
        cronExpression: '0 9 * * *',
        timezone: 'UTC',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const routine = body.routine as Record<string, unknown>;
    expect(routine.title).toBe('Daily Healthcheck');
    expect(routine.cronExpression).toBe('0 9 * * *');
    expect(routine.agentId).toBe(agentId);
    expect(routine.enabled).toBe(true);
    expect(typeof routine.nextRunAt).toBe('string');
  });

  it('POST routine with invalid cron → 422', async () => {
    const res = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        title: 'Bad Cron',
        cronExpression: 'not-a-valid-cron',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(422);
  });

  it('POST routine without title → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({ agentId, cronExpression: '0 9 * * *' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST routine without agentId → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({ title: 'No Agent', cronExpression: '0 9 * * *' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST routine with agent from different company → 404', async () => {
    const otherCompanyId = await createCompany(app, 'Other Corp');
    const res = await app.request(`/api/companies/${otherCompanyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({
        agentId, // belongs to first company
        title: 'Cross-company',
        cronExpression: '0 9 * * *',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('POST routine to nonexistent company → 404', async () => {
    const res = await app.request('/api/companies/ghost/routines', {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Ghost', cronExpression: '0 9 * * *' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('POST routine with enabled=false → nextRunAt is null', async () => {
    const res = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        title: 'Disabled Routine',
        cronExpression: '0 9 * * *',
        enabled: false,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const routine = body.routine as Record<string, unknown>;
    expect(routine.enabled).toBe(false);
    expect(routine.nextRunAt).toBeNull();
  });

  // ── LIST ────────────────────────────────────────────────────────────────────

  it('GET /api/companies/:companyId/routines → 200 list', async () => {
    // Create two routines
    for (const title of ['Morning', 'Evening']) {
      await app.request(`/api/companies/${companyId}/routines`, {
        method: 'POST',
        body: JSON.stringify({ agentId, title, cronExpression: '0 9 * * *' }),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await app.request(`/api/companies/${companyId}/routines`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.routines as unknown[]).length).toBe(2);
  });

  it('GET routines for nonexistent company → 404', async () => {
    const res = await app.request('/api/companies/ghost/routines');
    expect(res.status).toBe(404);
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────────

  it('PATCH /api/routines/:id → 200 toggle enabled', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Toggle Me', cronExpression: '0 9 * * *' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).routine as Record<string, unknown>).id as string;

    const res = await app.request(`/api/routines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    const routine = body.routine as Record<string, unknown>;
    expect(routine.enabled).toBe(false);
    expect(routine.nextRunAt).toBeNull();
  });

  it('PATCH /api/routines/:id → 200 update title', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Old Title', cronExpression: '0 9 * * *' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).routine as Record<string, unknown>).id as string;

    const res = await app.request(`/api/routines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(((await json(res)).routine as Record<string, unknown>).title).toBe('New Title');
  });

  it('PATCH /api/routines/:id with invalid cron → 422', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'Valid Start', cronExpression: '0 9 * * *' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).routine as Record<string, unknown>).id as string;

    const res = await app.request(`/api/routines/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ cronExpression: 'bad-cron' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(422);
  });

  it('PATCH /api/routines/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/routines/ghost-id', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Ghost' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  // ── DELETE ──────────────────────────────────────────────────────────────────

  it('DELETE /api/routines/:id → success', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/routines`, {
      method: 'POST',
      body: JSON.stringify({ agentId, title: 'To Delete', cronExpression: '0 9 * * *' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).routine as Record<string, unknown>).id as string;

    const res = await app.request(`/api/routines/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await json(res)).success).toBe(true);
  });

  it('DELETE /api/routines/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/routines/ghost-id', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
