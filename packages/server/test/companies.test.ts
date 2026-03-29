import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js';

vi.mock('../src/db.js', () => createDbMock());
vi.mock('../src/sse.js', () => ({ broadcast: () => {}, subscribe: () => () => {} }));
vi.mock('../src/ws.js', () => ({ pushToAgent: () => {}, initWebSocketServer: () => {}, handleUpgrade: () => {} }));
vi.mock('../src/adapter.js', () => ({ spawnClaudeLocal: async () => {} }));

async function buildApp() {
  const { companiesRouter } = await import('../src/routes/companies.js');
  const app = new Hono();
  app.route('/', companiesRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe('Companies CRUD', () => {
  let app: Hono;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildApp();
  });

  // ── CREATE ──────────────────────────────────────────────────────────────────

  it('POST /api/companies → 201 with created company', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Acme Corp', description: 'Test company' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const company = body.company as Record<string, unknown>;
    expect(company.name).toBe('Acme Corp');
    expect(company.description).toBe('Test company');
    expect(typeof company.id).toBe('string');
    expect(company.status).toBe('active');
    expect(company.budgetMonthlyCents).toBe(0);
  });

  it('POST /api/companies without name → 400', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ description: 'No name provided' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/companies with empty name → 400', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/companies with budget → 201', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Budget Corp', budgetMonthlyCents: 50000 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const company = body.company as Record<string, unknown>;
    expect(company.budgetMonthlyCents).toBe(50000);
  });

  // ── LIST ────────────────────────────────────────────────────────────────────

  it('GET /api/companies → 200 with empty list', async () => {
    const res = await app.request('/api/companies');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.companies)).toBe(true);
    expect((body.companies as unknown[]).length).toBe(0);
  });

  it('GET /api/companies → 200 with populated list', async () => {
    // Create two companies
    await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alpha' }),
      headers: { 'Content-Type': 'application/json' },
    });
    await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Beta' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await app.request('/api/companies');
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.companies as unknown[]).length).toBe(2);
  });

  // ── GET BY ID ───────────────────────────────────────────────────────────────

  it('GET /api/companies/:id → 200 for existing company', async () => {
    const createRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Findable Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const created = await json(createRes);
    const id = (created.company as Record<string, unknown>).id as string;

    const res = await app.request(`/api/companies/${id}`);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.company as Record<string, unknown>).id).toBe(id);
  });

  it('GET /api/companies/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/companies/nonexistent-id-xyz');
    expect(res.status).toBe(404);
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────────

  it('PATCH /api/companies/:id → 200 with updated fields', async () => {
    const createRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Old Name' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const created = await json(createRes);
    const id = (created.company as Record<string, unknown>).id as string;

    const res = await app.request(`/api/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name', budgetMonthlyCents: 10000 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    const company = body.company as Record<string, unknown>;
    expect(company.name).toBe('New Name');
    expect(company.budgetMonthlyCents).toBe(10000);
  });

  it('PATCH /api/companies/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/companies/nonexistent-id', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Ghost' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  // ── DELETE ──────────────────────────────────────────────────────────────────

  it('DELETE /api/companies/:id → success', async () => {
    const createRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'To Delete' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const created = await json(createRes);
    const id = (created.company as Record<string, unknown>).id as string;

    const delRes = await app.request(`/api/companies/${id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    const body = await json(delRes);
    expect(body.success).toBe(true);
  });

  it('DELETE /api/companies/:id → 404 for nonexistent id', async () => {
    const res = await app.request('/api/companies/nonexistent-id', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('GET /api/companies/:id after DELETE → 404', async () => {
    const createRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Temp Company' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const created = await json(createRes);
    const id = (created.company as Record<string, unknown>).id as string;

    await app.request(`/api/companies/${id}`, { method: 'DELETE' });

    const res = await app.request(`/api/companies/${id}`);
    expect(res.status).toBe(404);
  });

  // ── STATUS FIELD ─────────────────────────────────────────────────────────────

  it('POST /api/companies with status=paused → 201', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Paused Corp', status: 'paused' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.company as Record<string, unknown>).status).toBe('paused');
  });

  it('PATCH /api/companies/:id status update → 200', async () => {
    const createRes = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Status Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const created = await json(createRes);
    const id = (created.company as Record<string, unknown>).id as string;

    const res = await app.request(`/api/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    expect((await json(res)).company as unknown as Record<string, unknown>).toMatchObject({ status: 'archived' });
  });
});
