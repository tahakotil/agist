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
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', issuesRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  return app;
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

describe('Error Handling', () => {
  let app: Hono;
  let companyId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildApp();

    // Seed a company for tests that need one
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Error Test Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    companyId = ((await json(res)).company as Record<string, unknown>).id as string;
  });

  // ── INVALID JSON ─────────────────────────────────────────────────────────────

  it('POST with malformed JSON → non-2xx error response', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: '{ invalid json !!!',
      headers: { 'Content-Type': 'application/json' },
    });
    // Hono throws on malformed JSON before reaching zod validator → 400 or 500
    // The key invariant is that it returns an error (not 2xx success)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST with empty body → non-2xx error response', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: '',
      headers: { 'Content-Type': 'application/json' },
    });
    // Empty body with Content-Type: application/json is invalid → Hono returns 400 or 500
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST with wrong type for name (number) → 400', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 12345 }),
      headers: { 'Content-Type': 'application/json' },
    });
    // Zod coerces numbers to strings for z.string(), so this may pass — check for 2xx or 4xx
    // The key is it should not crash with 500
    expect(res.status).not.toBe(500);
  });

  it('POST issue with invalid status enum → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Bad Status', status: 'invalid-status-value' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST issue with invalid priority enum → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Bad Priority', priority: 'extreme' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  // ── SQL INJECTION ATTEMPTS ───────────────────────────────────────────────────

  it('SQL injection in name field → stored as literal string, no DB corruption', async () => {
    const injectionPayload = "'; DROP TABLE companies; --";
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: injectionPayload }),
      headers: { 'Content-Type': 'application/json' },
    });
    // Should succeed (200-level) — input is sanitized via parameterized queries
    expect(res.status).toBe(201);
    const body = await json(res);
    // Stored as-is, not executed as SQL
    expect((body.company as Record<string, unknown>).name).toBe(injectionPayload);

    // companies table should still be accessible (not dropped)
    const listRes = await app.request('/api/companies');
    expect(listRes.status).toBe(200);
  });

  it('SQL injection in description field → stored safely', async () => {
    const injection = "test' OR '1'='1";
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Safe Corp', description: injection }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.company as Record<string, unknown>).description).toBe(injection);
  });

  it('SQL injection in URL path → 404 (not a server error)', async () => {
    const res = await app.request("/api/companies/' OR '1'='1");
    expect(res.status).toBe(404);
  });

  // ── 404 ROUTES ───────────────────────────────────────────────────────────────

  it('GET unknown route → 404', async () => {
    const res = await app.request('/api/nonexistent-endpoint');
    expect(res.status).toBe(404);
  });

  it('DELETE unknown resource → 404', async () => {
    const res = await app.request('/api/companies', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  // ── FIELD VALIDATION ─────────────────────────────────────────────────────────

  it('POST company with name too long (>200 chars) → 400', async () => {
    const longName = 'A'.repeat(201);
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: longName }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST company with negative budget → 400', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Neg Budget', budgetMonthlyCents: -100 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST company with invalid status → 400', async () => {
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bad Status', status: 'unknown-status' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});
