/**
 * Governance System Tests
 *
 * Tests for:
 *  - Budget enforcement: unlimited (budget=0), under budget, exceeded
 *  - Monthly spend reset logic
 *  - Approval gate CRUD via HTTP
 *  - Pause / resume status transitions via HTTP
 *  - Audit log creation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js';

// ── Mock heavy deps before importing the modules under test ──────────────────
vi.mock('../db.js', () => createDbMock());
vi.mock('../sse.js', () => ({ broadcast: vi.fn() }));
vi.mock('../ws.js', () => ({ pushToAgent: vi.fn() }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../metrics.js', () => ({
  incRun: vi.fn(),
  incRunsActive: vi.fn(),
  decRunsActive: vi.fn(),
  addTokens: vi.fn(),
  incHttpRequest: vi.fn(),
}));
vi.mock('../webhooks.js', () => ({ dispatchWebhooks: vi.fn() }));
vi.mock('../integrations/slack.js', () => ({ sendSlackNotification: vi.fn() }));
vi.mock('../integrations/github.js', () => ({ createGitHubIssue: vi.fn() }));
vi.mock('../adapters/index.js', () => ({
  getAdapter: vi.fn(),
  getDefaultAdapter: vi.fn(),
}));
vi.mock('../adapters/cost.js', () => ({ estimateCostCents: vi.fn().mockReturnValue(0) }));
vi.mock('../output-parser.js', () => ({ parseAgentOutputs: vi.fn().mockReturnValue([]) }));
vi.mock('../workspace.js', () => ({
  ensureWorkspace: vi.fn(),
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, '-'),
}));

import { nanoid } from 'nanoid';
import { get, run, all } from '../db.js';
import { checkAgentBudget, maybeResetMonthlySpend, parseApprovalRequests } from '../adapter.js';
import { audit } from '../audit.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seedCompany(id = 'co-1', name = 'Test Co') {
  run(
    `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, '', 'active', 0, 0, datetime('now'), datetime('now'))`,
    [id, name]
  );
}

function seedAgent(opts: {
  id?: string;
  companyId?: string;
  status?: string;
  budgetMonthlyCents?: number;
  spentMonthlyCents?: number;
  lastResetMonth?: string | null;
}) {
  const id = opts.id ?? nanoid();
  const companyId = opts.companyId ?? 'co-1';
  const now = new Date().toISOString();
  run(
    `INSERT INTO agents
       (id, company_id, name, slug, role, title, model, capabilities, status,
        adapter_type, adapter_config, tags, context_capsule,
        budget_monthly_cents, spent_monthly_cents, last_reset_month,
        created_at, updated_at)
     VALUES (?, ?, 'Test Agent', 'test-agent', 'worker', '', 'claude-opus-4-5',
             '[]', ?, 'mock', '{}', '[]', '', ?, ?, ?, ?, ?)`,
    [
      id, companyId,
      opts.status ?? 'idle',
      opts.budgetMonthlyCents ?? 0,
      opts.spentMonthlyCents ?? 0,
      opts.lastResetMonth ?? null,
      now, now,
    ]
  );
  return id;
}

// ─── Budget Enforcement ───────────────────────────────────────────────────────

describe('checkAgentBudget', () => {
  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    seedCompany();
  });

  it('returns null when budget is 0 (unlimited)', () => {
    const id = seedAgent({ budgetMonthlyCents: 0, spentMonthlyCents: 9999 });
    expect(checkAgentBudget(id)).toBeNull();
  });

  it('returns null when spent is below budget', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const id = seedAgent({ budgetMonthlyCents: 1000, spentMonthlyCents: 500, lastResetMonth: currentMonth });
    expect(checkAgentBudget(id)).toBeNull();
  });

  it('returns null when spent equals zero', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const id = seedAgent({ budgetMonthlyCents: 500, spentMonthlyCents: 0, lastResetMonth: currentMonth });
    expect(checkAgentBudget(id)).toBeNull();
  });

  it('returns error string when spent >= budget', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const id = seedAgent({ budgetMonthlyCents: 100, spentMonthlyCents: 100, lastResetMonth: currentMonth });
    const result = checkAgentBudget(id);
    expect(result).toBeTypeOf('string');
    expect(result).toContain('budget');
  });

  it('marks agent status as budget_exceeded when over budget', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const id = seedAgent({ budgetMonthlyCents: 100, spentMonthlyCents: 200, lastResetMonth: currentMonth });
    checkAgentBudget(id);
    const agent = get<{ status: string }>(`SELECT status FROM agents WHERE id = ?`, [id]);
    expect(agent?.status).toBe('budget_exceeded');
  });

  it('returns null for unknown agent id (graceful)', () => {
    // Should not throw, just return null or error string depending on impl
    const result = checkAgentBudget('nonexistent-id');
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

// ─── Monthly Reset ────────────────────────────────────────────────────────────

describe('maybeResetMonthlySpend', () => {
  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    seedCompany();
  });

  it('resets spent_monthly_cents when last_reset_month is from a previous month', () => {
    const pastMonth = '2020-01';
    const id = seedAgent({ spentMonthlyCents: 500, lastResetMonth: pastMonth });
    maybeResetMonthlySpend(id);
    const agent = get<{ spent_monthly_cents: number }>(`SELECT spent_monthly_cents FROM agents WHERE id = ?`, [id]);
    expect(agent?.spent_monthly_cents).toBe(0);
  });

  it('updates last_reset_month to current month after reset', () => {
    const pastMonth = '2020-01';
    const id = seedAgent({ spentMonthlyCents: 500, lastResetMonth: pastMonth });
    maybeResetMonthlySpend(id);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const agent = get<{ last_reset_month: string }>(`SELECT last_reset_month FROM agents WHERE id = ?`, [id]);
    expect(agent?.last_reset_month).toBe(currentMonth);
  });

  it('does NOT reset when last_reset_month is current month', () => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const id = seedAgent({ spentMonthlyCents: 300, lastResetMonth: currentMonth });
    maybeResetMonthlySpend(id);
    const agent = get<{ spent_monthly_cents: number }>(`SELECT spent_monthly_cents FROM agents WHERE id = ?`, [id]);
    expect(agent?.spent_monthly_cents).toBe(300);
  });

  it('sets last_reset_month when it was null (first run of month)', () => {
    const id = seedAgent({ spentMonthlyCents: 100, lastResetMonth: null });
    maybeResetMonthlySpend(id);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const agent = get<{ last_reset_month: string }>(`SELECT last_reset_month FROM agents WHERE id = ?`, [id]);
    expect(agent?.last_reset_month).toBe(currentMonth);
  });
});

// ─── Approval Gate CRUD ───────────────────────────────────────────────────────

describe('Approval Gates via HTTP', () => {
  let app: import('hono').Hono;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    seedCompany();

    const { gatesRouter } = await import('../routes/gates.js');
    const { Hono } = await import('hono');
    app = new Hono();
    app.route('/', gatesRouter);
  });

  it('creates a gate and returns 201', async () => {
    const coId = 'co-1';
    const agentId = seedAgent({ companyId: coId });

    const res = await app.request(`/api/companies/${coId}/gates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        gateType: 'deploy',
        title: 'Deploy to production',
        description: 'Needs approval before deploy',
        payload: { env: 'prod' },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { gate: { id: string; status: string } };
    expect(body.gate.status).toBe('pending');
    expect(body.gate.id).toBeTruthy();
  });

  it('lists pending gates', async () => {
    const coId = 'co-1';
    const agentId = seedAgent({ companyId: coId });
    const gateId = nanoid();
    run(
      `INSERT INTO approval_gates (id, company_id, agent_id, gate_type, title, description, payload, status, created_at)
       VALUES (?, ?, ?, 'test', 'My Gate', '', '{}', 'pending', datetime('now'))`,
      [gateId, coId, agentId]
    );

    const res = await app.request(`/api/companies/${coId}/gates/pending`);
    expect(res.status).toBe(200);
    const body = await res.json() as { gates: unknown[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  it('approves a pending gate', async () => {
    const coId = 'co-1';
    const agentId = seedAgent({ companyId: coId });
    const gateId = nanoid();
    run(
      `INSERT INTO approval_gates (id, company_id, agent_id, gate_type, title, description, payload, status, created_at)
       VALUES (?, ?, ?, 'test', 'My Gate', '', '{}', 'pending', datetime('now'))`,
      [gateId, coId, agentId]
    );

    const res = await app.request(`/api/companies/${coId}/gates/${gateId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decidedBy: 'admin@test.com' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { gate: { status: string } };
    expect(body.gate.status).toBe('approved');
  });

  it('rejects a pending gate', async () => {
    const coId = 'co-1';
    const agentId = seedAgent({ companyId: coId });
    const gateId = nanoid();
    run(
      `INSERT INTO approval_gates (id, company_id, agent_id, gate_type, title, description, payload, status, created_at)
       VALUES (?, ?, ?, 'test', 'My Gate', '', '{}', 'pending', datetime('now'))`,
      [gateId, coId, agentId]
    );

    const res = await app.request(`/api/companies/${coId}/gates/${gateId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decidedBy: 'admin@test.com' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { gate: { status: string } };
    expect(body.gate.status).toBe('rejected');
  });

  it('returns 409 when approving an already-approved gate', async () => {
    const coId = 'co-1';
    const agentId = seedAgent({ companyId: coId });
    const gateId = nanoid();
    run(
      `INSERT INTO approval_gates (id, company_id, agent_id, gate_type, title, description, payload, status, decided_at, decided_by, created_at)
       VALUES (?, ?, ?, 'test', 'My Gate', '', '{}', 'approved', datetime('now'), 'human', datetime('now'))`,
      [gateId, coId, agentId]
    );

    const res = await app.request(`/api/companies/${coId}/gates/${gateId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decidedBy: 'human' }),
    });

    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown company', async () => {
    const res = await app.request('/api/companies/nonexistent/gates');
    expect(res.status).toBe(404);
  });
});

// ─── Pause / Resume Transitions ───────────────────────────────────────────────

describe('Pause / Resume via HTTP', () => {
  let app: import('hono').Hono;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    seedCompany();

    const { agentsRouter } = await import('../routes/agents.js');
    const { Hono } = await import('hono');
    app = new Hono();
    app.route('/', agentsRouter);
  });

  it('pauses an idle agent', async () => {
    const id = seedAgent({ status: 'idle' });
    const res = await app.request(`/api/agents/${id}/pause`, { method: 'POST' });
    expect(res.status).toBe(200);
    const agent = get<{ status: string }>(`SELECT status FROM agents WHERE id = ?`, [id]);
    expect(agent?.status).toBe('paused');
  });

  it('returns 409 when pausing already-paused agent', async () => {
    const id = seedAgent({ status: 'paused' });
    const res = await app.request(`/api/agents/${id}/pause`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('resumes a paused agent', async () => {
    const id = seedAgent({ status: 'paused' });
    const res = await app.request(`/api/agents/${id}/resume`, { method: 'POST' });
    expect(res.status).toBe(200);
    const agent = get<{ status: string }>(`SELECT status FROM agents WHERE id = ?`, [id]);
    expect(agent?.status).toBe('idle');
  });

  it('resumes a budget_exceeded agent', async () => {
    const id = seedAgent({ status: 'budget_exceeded' });
    const res = await app.request(`/api/agents/${id}/resume`, { method: 'POST' });
    expect(res.status).toBe(200);
    const agent = get<{ status: string }>(`SELECT status FROM agents WHERE id = ?`, [id]);
    expect(agent?.status).toBe('idle');
  });

  it('returns 409 when resuming idle agent', async () => {
    const id = seedAgent({ status: 'idle' });
    const res = await app.request(`/api/agents/${id}/resume`, { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown agent', async () => {
    const res = await app.request('/api/agents/nonexistent/pause', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

describe('audit()', () => {
  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    seedCompany();
  });

  it('writes an entry to the audit_log table', () => {
    audit('co-1', 'agent-1', 'agent.wake', { test: true });
    const rows = all<{ action: string }>(`SELECT action FROM audit_log WHERE company_id = 'co-1'`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].action).toBe('agent.wake');
  });

  it('records the correct actor', () => {
    audit('co-1', null, 'test.action', {}, 'admin@test.com');
    const row = get<{ actor: string }>(`SELECT actor FROM audit_log WHERE action = 'test.action'`);
    expect(row?.actor).toBe('admin@test.com');
  });

  it('records detail as JSON', () => {
    audit('co-1', null, 'test.detail', { key: 'value', num: 42 });
    const row = get<{ detail: string }>(`SELECT detail FROM audit_log WHERE action = 'test.detail'`);
    const detail = JSON.parse(row?.detail ?? '{}') as Record<string, unknown>;
    expect(detail.key).toBe('value');
    expect(detail.num).toBe(42);
  });

  it('does not throw when companyId or agentId is null', () => {
    expect(() => audit(null, null, 'test.null', {})).not.toThrow();
  });

  it('uses "system" as default actor', () => {
    audit('co-1', null, 'default.actor', {});
    const row = get<{ actor: string }>(`SELECT actor FROM audit_log WHERE action = 'default.actor'`);
    expect(row?.actor).toBe('system');
  });
});

// ─── parseApprovalRequests ─────────────────────────────────────────────────────

describe('parseApprovalRequests', () => {
  it('parses a valid __agist_approval marker', () => {
    const output = `Some output\n{"__agist_approval": {"gate_type": "deploy", "title": "Deploy now"}}\nMore output`;
    const result = parseApprovalRequests(output);
    expect(result).toHaveLength(1);
    expect(result[0].gate_type).toBe('deploy');
    expect(result[0].title).toBe('Deploy now');
  });

  it('returns empty array when no markers present', () => {
    const result = parseApprovalRequests('no markers here');
    expect(result).toHaveLength(0);
  });

  it('skips malformed JSON gracefully', () => {
    const output = '{"__agist_approval": {invalid json}';
    expect(() => parseApprovalRequests(output)).not.toThrow();
  });

  it('skips entries missing gate_type', () => {
    const output = `{"__agist_approval": {"title": "Missing type"}}`;
    const result = parseApprovalRequests(output);
    expect(result).toHaveLength(0);
  });

  it('skips entries missing title', () => {
    const output = `{"__agist_approval": {"gate_type": "deploy"}}`;
    const result = parseApprovalRequests(output);
    expect(result).toHaveLength(0);
  });
});
