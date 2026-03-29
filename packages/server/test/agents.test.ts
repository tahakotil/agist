import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js';

vi.mock('../src/db.js', () => createDbMock());
vi.mock('../src/sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {} }));
vi.mock('../src/ws.js', () => ({
  pushToAgent: () => {},
  initWebSocketServer: () => {},
  handleUpgrade: () => {},
}));
// Mock adapter so /wake doesn't try to spawn a real process
vi.mock('../src/adapter.js', () => ({
  spawnClaudeLocal: vi.fn(async () => {}),
}));

async function buildApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const app = new Hono();
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
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
  const body = await json(res);
  return (body.company as Record<string, unknown>).id as string;
}

async function createAgent(app: Hono, companyId: string, name = 'TestAgent') {
  const res = await app.request(`/api/companies/${companyId}/agents`, {
    method: 'POST',
    body: JSON.stringify({ name, role: 'worker' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await json(res);
  return (body.agent as Record<string, unknown>).id as string;
}

describe('Agents CRUD', () => {
  let app: Hono;
  let companyId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildApp();
    companyId = await createCompany(app);
  });

  // ── CREATE ──────────────────────────────────────────────────────────────────

  it('POST /api/companies/:companyId/agents → 201', async () => {
    const res = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice', role: 'seo', model: 'claude-haiku-4-5' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const agent = body.agent as Record<string, unknown>;
    expect(agent.name).toBe('Alice');
    expect(agent.role).toBe('seo');
    expect(agent.companyId).toBe(companyId);
    expect(agent.model).toBe('claude-haiku-4-5');
  });

  it('POST agent without name → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ role: 'worker' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST agent with empty name → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: '', role: 'worker' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST agent to nonexistent company → 404', async () => {
    const res = await app.request('/api/companies/ghost-company/agents', {
      method: 'POST',
      body: JSON.stringify({ name: 'Ghost Agent' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('POST agent with capabilities array → 201', async () => {
    const res = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Skilled', capabilities: ['git', 'bash', 'python'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.agent as Record<string, unknown>).capabilities).toEqual(['git', 'bash', 'python']);
  });

  // ── LIST ────────────────────────────────────────────────────────────────────

  it('GET /api/companies/:companyId/agents → 200 list', async () => {
    await createAgent(app, companyId, 'Agent1');
    await createAgent(app, companyId, 'Agent2');

    const res = await app.request(`/api/companies/${companyId}/agents`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.agents as unknown[]).length).toBe(2);
  });

  it('GET /api/agents → 200 list all agents', async () => {
    await createAgent(app, companyId, 'Alpha');

    const res = await app.request('/api/agents');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.agents as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/companies/:companyId/agents for nonexistent company → 404', async () => {
    const res = await app.request('/api/companies/ghost/agents');
    expect(res.status).toBe(404);
  });

  // ── GET BY ID ───────────────────────────────────────────────────────────────

  it('GET /api/agents/:id → 200 for existing agent', async () => {
    const agentId = await createAgent(app, companyId);
    const res = await app.request(`/api/agents/${agentId}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.agent as Record<string, unknown>).id).toBe(agentId);
  });

  it('GET /api/agents/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/agents/nonexistent-agent-id');
    expect(res.status).toBe(404);
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────────

  it('PATCH /api/agents/:id → 200 update model', async () => {
    const agentId = await createAgent(app, companyId);
    const res = await app.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ model: 'claude-sonnet-4-6' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.agent as Record<string, unknown>).model).toBe('claude-sonnet-4-6');
  });

  it('PATCH /api/agents/:id → 200 update status', async () => {
    const agentId = await createAgent(app, companyId);
    const res = await app.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paused' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect((await json(res)).agent as unknown as Record<string, unknown>).toMatchObject({ status: 'paused' });
  });

  it('PATCH /api/agents/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/agents/ghost-id', {
      method: 'PATCH',
      body: JSON.stringify({ model: 'claude-haiku-4-5' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  // ── DELETE ──────────────────────────────────────────────────────────────────

  it('DELETE /api/agents/:id → success', async () => {
    const agentId = await createAgent(app, companyId);
    const res = await app.request(`/api/agents/${agentId}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
  });

  it('DELETE /api/agents/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/agents/ghost-id', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('GET /api/agents/:id after DELETE → 404', async () => {
    const agentId = await createAgent(app, companyId);
    await app.request(`/api/agents/${agentId}`, { method: 'DELETE' });
    const res = await app.request(`/api/agents/${agentId}`);
    expect(res.status).toBe(404);
  });

  // ── WAKE ────────────────────────────────────────────────────────────────────

  it('POST /api/agents/:id/wake → 202 creates a run record', async () => {
    const agentId = await createAgent(app, companyId);

    const res = await app.request(`/api/agents/${agentId}/wake`, {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Hello agent' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(202);
    const body = await json(res);
    const runResult = body.run as Record<string, unknown>;
    expect(runResult.agentId).toBe(agentId);
    expect(runResult.status).toBe('queued');
    expect(typeof runResult.id).toBe('string');
  });

  it('POST /api/agents/:id/wake → 404 for nonexistent agent', async () => {
    const res = await app.request('/api/agents/ghost-id/wake', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('POST /api/agents/:id/wake when already running → 409', async () => {
    const agentId = await createAgent(app, companyId);
    // Set agent status to running
    await app.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'running' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await app.request(`/api/agents/${agentId}/wake`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  // ── WORKING DIRECTORY ───────────────────────────────────────────────────────

  it('POST agent with absolute workingDirectory → 201 and field is stored', async () => {
    const res = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'DirAgent', workingDirectory: '/home/user/project' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const agent = body.agent as Record<string, unknown>;
    expect(agent.workingDirectory).toBe('/home/user/project');
  });

  it('POST agent with relative workingDirectory → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'BadDir', workingDirectory: 'relative/path' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect((body.error as string).toLowerCase()).toContain('absolute');
  });

  it('GET /api/agents/:id returns workingDirectory field', async () => {
    const createRes = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'DirAgent2', workingDirectory: '/var/www/app' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const agentId = ((await createRes.json() as Record<string, unknown>).agent as Record<string, unknown>).id as string;

    const res = await app.request(`/api/agents/${agentId}`);
    const body = await json(res);
    expect((body.agent as Record<string, unknown>).workingDirectory).toBe('/var/www/app');
  });

  it('PATCH agent with absolute workingDirectory → 200 and field is updated', async () => {
    const agentId = await createAgent(app, companyId);
    const res = await app.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ workingDirectory: '/opt/new-project' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.agent as Record<string, unknown>).workingDirectory).toBe('/opt/new-project');
  });

  it('PATCH agent with null workingDirectory → 200 clears the field', async () => {
    // First set a directory
    const createRes = await app.request(`/api/companies/${companyId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ name: 'ClearDir', workingDirectory: '/tmp/oldpath' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const agentId = ((await createRes.json() as Record<string, unknown>).agent as Record<string, unknown>).id as string;

    // Now clear it
    const res = await app.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ workingDirectory: null }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.agent as Record<string, unknown>).workingDirectory).toBeNull();
  });

  it('PATCH agent with relative workingDirectory → 400', async () => {
    const agentId = await createAgent(app, companyId);
    const res = await app.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ workingDirectory: 'not/absolute' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect((body.error as string).toLowerCase()).toContain('absolute');
  });
});
