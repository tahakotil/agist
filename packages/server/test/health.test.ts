import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js';

vi.mock('../src/db.js', () => createDbMock());

// Also mock SSE broadcast and WS push so they don't explode
vi.mock('../src/sse.js', () => ({
  broadcast: () => {},
  subscribe: () => () => {},
  sseRouter: { get: () => {} },
}));

vi.mock('../src/ws.js', () => ({
  pushToAgent: () => {},
  initWebSocketServer: () => {},
  handleUpgrade: () => {},
}));

vi.mock('../src/adapter.js', () => ({
  spawnClaudeLocal: async () => {},
}));

async function buildApp() {
  const { Hono } = await import('hono');
  const { healthRouter } = await import('../src/routes/health.js');
  const app = new Hono();
  app.route('/', healthRouter);
  return app;
}

describe('GET /api/health', () => {
  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
  });

  it('returns 200 with status ok when DB is up', async () => {
    const app = await buildApp();
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.version).toBe('0.1.0');
    expect(typeof body.ts).toBe('string');
  });
});

describe('GET /api/dashboard/stats', () => {
  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
  });

  it('returns all zeros on empty DB', async () => {
    const app = await buildApp();
    const res = await app.request('/api/dashboard/stats');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.totalAgents).toBe(0);
    expect(body.runningNow).toBe(0);
    expect(body.successRate24h).toBeNull();
    expect(body.costToday).toBe(0);
  });
});
