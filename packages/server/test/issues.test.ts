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
  const { issuesRouter } = await import('../src/routes/issues.js');
  const app = new Hono();
  // Inject admin role so RBAC middleware passes in tests
  app.use('*', async (c, next) => { c.set('role', 'admin'); c.set('apiKeyId', 'test-key'); return next(); });
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', issuesRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

async function createCompany(app: Hono, name = 'Issue Corp') {
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
    body: JSON.stringify({ name: 'IssueAgent', role: 'worker' }),
    headers: { 'Content-Type': 'application/json' },
  });
  return ((await json(res)).agent as Record<string, unknown>).id as string;
}

describe('Issues CRUD', () => {
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

  it('POST /api/companies/:companyId/issues → 201', async () => {
    const res = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Bug #1', description: 'Something is broken' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const issue = body.issue as Record<string, unknown>;
    expect(issue.title).toBe('Bug #1');
    expect(issue.description).toBe('Something is broken');
    expect(issue.status).toBe('open');
    expect(issue.priority).toBe('medium');
    expect(issue.companyId).toBe(companyId);
  });

  it('POST issue without title → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ description: 'No title' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST issue with empty title → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST issue with agentId → links to agent', async () => {
    const res = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Agent issue', agentId }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.issue as Record<string, unknown>).agentId).toBe(agentId);
  });

  it('POST issue to nonexistent company → 404', async () => {
    const res = await app.request('/api/companies/ghost/issues', {
      method: 'POST',
      body: JSON.stringify({ title: 'Ghost Issue' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('POST issue with priority=critical → 201', async () => {
    const res = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Critical Bug', priority: 'critical' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    expect(((await json(res)).issue as Record<string, unknown>).priority).toBe('critical');
  });

  // ── LIST ─────────────────────────────────────────────────────────────────────

  it('GET /api/companies/:companyId/issues → 200 list', async () => {
    for (const title of ['Issue A', 'Issue B', 'Issue C']) {
      await app.request(`/api/companies/${companyId}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title }),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await app.request(`/api/companies/${companyId}/issues`);
    expect(res.status).toBe(200);
    expect(((await json(res)).issues as unknown[]).length).toBe(3);
  });

  it('GET issues for nonexistent company → 404', async () => {
    const res = await app.request('/api/companies/ghost/issues');
    expect(res.status).toBe(404);
  });

  // ── FILTERS ──────────────────────────────────────────────────────────────────

  it('GET issues filtered by status → only matching', async () => {
    await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Open Issue', status: 'open' }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Closed Issue', status: 'closed' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await app.request(`/api/companies/${companyId}/issues?status=open`);
    const issues = ((await json(res)).issues as Array<Record<string, unknown>>);
    expect(issues.length).toBe(1);
    expect(issues[0].status).toBe('open');
  });

  it('GET issues filtered by priority → only matching', async () => {
    await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Critical', priority: 'critical' }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Low Priority', priority: 'low' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await app.request(`/api/companies/${companyId}/issues?priority=critical`);
    const issues = ((await json(res)).issues as Array<Record<string, unknown>>);
    expect(issues.length).toBe(1);
    expect(issues[0].priority).toBe('critical');
  });

  it('GET issues filtered by agentId → only matching', async () => {
    await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Agent Issue', agentId }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'No Agent Issue' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await app.request(`/api/companies/${companyId}/issues?agentId=${agentId}`);
    const issues = ((await json(res)).issues as Array<Record<string, unknown>>);
    expect(issues.length).toBe(1);
    expect(issues[0].agentId).toBe(agentId);
  });

  it('GET issues sorted by priority (critical first)', async () => {
    for (const [title, priority] of [['Low', 'low'], ['High', 'high'], ['Critical', 'critical'], ['Medium', 'medium']]) {
      await app.request(`/api/companies/${companyId}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title, priority }),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await app.request(`/api/companies/${companyId}/issues`);
    const issues = ((await json(res)).issues as Array<Record<string, unknown>>);
    expect(issues[0].priority).toBe('critical');
    expect(issues[1].priority).toBe('high');
  });

  // ── GET BY ID ────────────────────────────────────────────────────────────────

  it('GET /api/issues/:id → 200 for existing issue', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Findable Issue' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).issue as Record<string, unknown>).id as string;

    const res = await app.request(`/api/issues/${id}`);
    expect(res.status).toBe(200);
    expect(((await json(res)).issue as Record<string, unknown>).id).toBe(id);
  });

  it('GET /api/issues/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/issues/ghost-id');
    expect(res.status).toBe(404);
  });

  // ── UPDATE ───────────────────────────────────────────────────────────────────

  it('PATCH /api/issues/:id → 200 update status', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Working Issue' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).issue as Record<string, unknown>).id as string;

    const res = await app.request(`/api/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'resolved' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(((await json(res)).issue as Record<string, unknown>).status).toBe('resolved');
  });

  it('PATCH /api/issues/:id → 200 update priority', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Priority Issue' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).issue as Record<string, unknown>).id as string;

    const res = await app.request(`/api/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ priority: 'high' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect(((await json(res)).issue as Record<string, unknown>).priority).toBe('high');
  });

  it('PATCH /api/issues/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/issues/ghost-id', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'closed' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  // ── DELETE ───────────────────────────────────────────────────────────────────

  it('DELETE /api/issues/:id → success', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Delete Me' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).issue as Record<string, unknown>).id as string;

    const res = await app.request(`/api/issues/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await json(res)).success).toBe(true);
  });

  it('DELETE /api/issues/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/issues/ghost-id', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('GET /api/issues/:id after DELETE → 404', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Temp Issue' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const id = ((await json(createRes)).issue as Record<string, unknown>).id as string;

    await app.request(`/api/issues/${id}`, { method: 'DELETE' });
    const res = await app.request(`/api/issues/${id}`);
    expect(res.status).toBe(404);
  });
});
