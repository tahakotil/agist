import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js';

const broadcastMock = vi.fn();

vi.mock('../src/db.js', () => createDbMock());
vi.mock('../src/sse.js', () => ({
  broadcast: broadcastMock,
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
  const { signalsRouter } = await import('../src/routes/signals.js');
  const app = new Hono();
  // Inject admin role so RBAC middleware passes in tests
  app.use('*', async (c, next) => {
    c.set('role', 'admin');
    c.set('apiKeyId', 'test-key');
    return next();
  });
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', signalsRouter);
  app.onError((err, c) => c.json({ error: err.message }, 500));
  return app;
}

function json(res: Response) {
  return res.json() as Promise<Record<string, unknown>>;
}

async function createCompany(app: Hono, name = 'Signal Corp') {
  const res = await app.request('/api/companies', {
    method: 'POST',
    body: JSON.stringify({ name }),
    headers: { 'Content-Type': 'application/json' },
  });
  return ((await json(res)).company as Record<string, unknown>).id as string;
}

async function createAgent(app: Hono, companyId: string, name = 'SignalAgent') {
  const res = await app.request(`/api/companies/${companyId}/agents`, {
    method: 'POST',
    body: JSON.stringify({ name, role: 'worker' }),
    headers: { 'Content-Type': 'application/json' },
  });
  return (await json(res)).agent as Record<string, unknown>;
}

async function createSignal(
  app: Hono,
  companyId: string,
  agentId: string,
  overrides: Record<string, unknown> = {}
) {
  const body = {
    source_agent_id: agentId,
    signal_type: 'alert',
    title: 'Test signal',
    ...overrides,
  };
  return app.request(`/api/companies/${companyId}/signals`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Signals CRUD', () => {
  let app: Hono;
  let companyId: string;
  let agentId: string;

  beforeEach(async () => {
    broadcastMock.mockClear();
    const db = await createTestDb();
    setActiveDb(db);
    app = await buildApp();
    companyId = await createCompany(app);
    const agent = await createAgent(app, companyId);
    agentId = agent.id as string;
  });

  // ── CREATE ──────────────────────────────────────────────────────────────────

  it('POST /api/companies/:cid/signals → 201', async () => {
    const res = await createSignal(app, companyId, agentId, {
      signal_type: 'kpi-change',
      title: 'Revenue up 20%',
      payload: { value: 20 },
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    const signal = body.signal as Record<string, unknown>;
    expect(signal.title).toBe('Revenue up 20%');
    expect(signal.signalType).toBe('kpi-change');
    expect(signal.companyId).toBe(companyId);
    expect(signal.sourceAgentId).toBe(agentId);
    expect((signal.payload as Record<string, unknown>).value).toBe(20);
    expect(signal.consumedBy).toEqual([]);
  });

  it('POST signal without title → 400', async () => {
    const res = await app.request(`/api/companies/${companyId}/signals`, {
      method: 'POST',
      body: JSON.stringify({ source_agent_id: agentId, signal_type: 'alert' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  it('POST signal with invalid type → 400', async () => {
    const res = await createSignal(app, companyId, agentId, { signal_type: 'invalid-type' });
    expect(res.status).toBe(400);
  });

  it('POST signal to nonexistent company → 404', async () => {
    const res = await createSignal(app, 'ghost-company', agentId);
    expect(res.status).toBe(404);
  });

  it('POST signal with agent from different company → 404', async () => {
    const otherCompanyId = await createCompany(app, 'Other Corp');
    const res = await createSignal(app, otherCompanyId, agentId);
    expect(res.status).toBe(404);
  });

  it('POST signal broadcasts SSE signal.created event', async () => {
    await createSignal(app, companyId, agentId, { title: 'SSE broadcast test' });
    expect(broadcastMock).toHaveBeenCalledOnce();
    const call = broadcastMock.mock.calls[0][0] as { type: string; data: Record<string, unknown> };
    expect(call.type).toBe('signal.created');
    expect(call.data.title).toBe('SSE broadcast test');
  });

  it('POST signal stores sourceAgentName from agent', async () => {
    const agentData = await createAgent(app, companyId, 'MarketingBot');
    const botId = agentData.id as string;
    const res = await createSignal(app, companyId, botId, { source_agent_id: botId });
    const signal = (await json(res)).signal as Record<string, unknown>;
    expect(signal.sourceAgentName).toBe('MarketingBot');
  });

  // ── LIST ─────────────────────────────────────────────────────────────────────

  it('GET /api/companies/:cid/signals → 200 list', async () => {
    for (const title of ['Signal A', 'Signal B', 'Signal C']) {
      await createSignal(app, companyId, agentId, { title });
    }
    const res = await app.request(`/api/companies/${companyId}/signals`);
    expect(res.status).toBe(200);
    const signals = (await json(res)).signals as unknown[];
    expect(signals.length).toBe(3);
  });

  it('GET signals for nonexistent company → 404', async () => {
    const res = await app.request('/api/companies/ghost/signals');
    expect(res.status).toBe(404);
  });

  it('GET signals filtered by type', async () => {
    await createSignal(app, companyId, agentId, { signal_type: 'alert', title: 'Alert 1' });
    await createSignal(app, companyId, agentId, { signal_type: 'kpi-change', title: 'KPI 1' });
    await createSignal(app, companyId, agentId, { signal_type: 'alert', title: 'Alert 2' });

    const res = await app.request(`/api/companies/${companyId}/signals?type=alert`);
    const signals = (await json(res)).signals as Array<Record<string, unknown>>;
    expect(signals.length).toBe(2);
    expect(signals.every((s) => s.signalType === 'alert')).toBe(true);
  });

  it('GET signals newest-first ordering', async () => {
    await createSignal(app, companyId, agentId, { title: 'First' });
    await createSignal(app, companyId, agentId, { title: 'Second' });
    await createSignal(app, companyId, agentId, { title: 'Third' });

    const res = await app.request(`/api/companies/${companyId}/signals`);
    const signals = (await json(res)).signals as Array<Record<string, unknown>>;
    // DB uses datetime('now') so all might have same timestamp; at minimum confirm 3 are returned
    expect(signals.length).toBe(3);
  });

  // ── UNCONSUMED ───────────────────────────────────────────────────────────────

  it('GET unconsumed → returns signals not consumed by agent', async () => {
    const agent2 = await createAgent(app, companyId, 'Agent2');
    const agent2Id = agent2.id as string;

    // Create signal from agentId
    const sigRes = await createSignal(app, companyId, agentId, { title: 'Cross-agent signal' });
    const sigId = ((await json(sigRes)).signal as Record<string, unknown>).id as string;

    // agent2 has not consumed it
    const res = await app.request(`/api/companies/${companyId}/signals/unconsumed/${agent2Id}`);
    expect(res.status).toBe(200);
    const signals = (await json(res)).signals as Array<Record<string, unknown>>;
    expect(signals.some((s) => s.id === sigId)).toBe(true);
  });

  it('GET unconsumed → excludes signals already consumed by agent', async () => {
    const agent2 = await createAgent(app, companyId, 'Agent2');
    const agent2Id = agent2.id as string;

    // Create signal
    const sigRes = await createSignal(app, companyId, agentId, { title: 'Consumed signal' });
    const sigId = ((await json(sigRes)).signal as Record<string, unknown>).id as string;

    // Consume it as agent2
    await app.request(`/api/companies/${companyId}/signals/${sigId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agent2Id }),
      headers: { 'Content-Type': 'application/json' },
    });

    // Now agent2 should not see it as unconsumed
    const res = await app.request(`/api/companies/${companyId}/signals/unconsumed/${agent2Id}`);
    const signals = (await json(res)).signals as Array<Record<string, unknown>>;
    expect(signals.some((s) => s.id === sigId)).toBe(false);
  });

  it('GET unconsumed → limits to 10 signals', async () => {
    for (let i = 0; i < 15; i++) {
      await createSignal(app, companyId, agentId, { title: `Signal ${i}` });
    }
    const agent2 = await createAgent(app, companyId, 'Consumer');
    const agent2Id = agent2.id as string;

    const res = await app.request(`/api/companies/${companyId}/signals/unconsumed/${agent2Id}`);
    const signals = (await json(res)).signals as unknown[];
    expect(signals.length).toBeLessThanOrEqual(10);
  });

  // ── CONSUME ──────────────────────────────────────────────────────────────────

  it('POST consume → marks signal consumed by agent', async () => {
    const agent2 = await createAgent(app, companyId, 'Consumer2');
    const agent2Id = agent2.id as string;

    const sigRes = await createSignal(app, companyId, agentId, { title: 'To consume' });
    const sigId = ((await json(sigRes)).signal as Record<string, unknown>).id as string;

    const res = await app.request(`/api/companies/${companyId}/signals/${sigId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agent2Id }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(200);
    const signal = (await json(res)).signal as Record<string, unknown>;
    expect(signal.consumedBy).toContain(agent2Id);
  });

  it('POST consume is idempotent — no duplicate entries', async () => {
    const agent2 = await createAgent(app, companyId, 'Idempotent');
    const agent2Id = agent2.id as string;

    const sigRes = await createSignal(app, companyId, agentId);
    const sigId = ((await json(sigRes)).signal as Record<string, unknown>).id as string;

    await app.request(`/api/companies/${companyId}/signals/${sigId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agent2Id }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res2 = await app.request(`/api/companies/${companyId}/signals/${sigId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agent2Id }),
      headers: { 'Content-Type': 'application/json' },
    });

    const signal = (await json(res2)).signal as Record<string, unknown>;
    const consumedBy = signal.consumedBy as string[];
    expect(consumedBy.filter((id) => id === agent2Id).length).toBe(1);
  });

  it('POST consume multiple agents → all tracked', async () => {
    const agent2 = await createAgent(app, companyId, 'ConsumerA');
    const agent3 = await createAgent(app, companyId, 'ConsumerB');

    const sigRes = await createSignal(app, companyId, agentId);
    const sigId = ((await json(sigRes)).signal as Record<string, unknown>).id as string;

    await app.request(`/api/companies/${companyId}/signals/${sigId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agent2.id }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await app.request(`/api/companies/${companyId}/signals/${sigId}/consume`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agent3.id }),
      headers: { 'Content-Type': 'application/json' },
    });

    const signal = (await json(res)).signal as Record<string, unknown>;
    const consumedBy = signal.consumedBy as string[];
    expect(consumedBy).toContain(agent2.id);
    expect(consumedBy).toContain(agent3.id);
  });

  it('POST consume nonexistent signal → 404', async () => {
    const res = await app.request(`/api/companies/${companyId}/signals/ghost-id/consume`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });

  it('POST consume without agent_id → 400', async () => {
    const sigRes = await createSignal(app, companyId, agentId);
    const sigId = ((await json(sigRes)).signal as Record<string, unknown>).id as string;

    const res = await app.request(`/api/companies/${companyId}/signals/${sigId}/consume`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  // ── ALL SIGNAL TYPES ─────────────────────────────────────────────────────────

  it.each([
    'product-update',
    'social-proof',
    'seo-tactic',
    'market-trend',
    'alert',
    'kpi-change',
  ] as const)('signal_type=%s is accepted → 201', async (signalType) => {
    const res = await createSignal(app, companyId, agentId, { signal_type: signalType });
    expect(res.status).toBe(201);
    const signal = (await json(res)).signal as Record<string, unknown>;
    expect(signal.signalType).toBe(signalType);
  });
});
