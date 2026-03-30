/**
 * Daily Digest Tests
 *
 * Tests for:
 *  - Digest generation with mock run data
 *  - Empty day (no runs) → digest with zero values
 *  - Idempotency: generate twice for same date, no duplicate rows
 *  - API endpoint tests (GET today, GET by date, GET range, POST generate)
 *  - Budget burn rate calculation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js';

// ── Mock heavy deps before importing modules under test ──────────────────────
vi.mock('../db.js', () => createDbMock());
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../sse.js', () => ({ broadcast: vi.fn() }));
vi.mock('../ws.js', () => ({ pushToAgent: vi.fn() }));
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

// ─── Test helpers ─────────────────────────────────────────────────────────────

const TEST_DATE = '2026-03-31';

function seedCompany(opts: {
  id?: string;
  name?: string;
  budgetMonthlyCents?: number;
  spentMonthlyCents?: number;
} = {}) {
  const id = opts.id ?? 'co-test';
  run(
    `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, '', 'active', ?, ?, datetime('now'), datetime('now'))`,
    [id, opts.name ?? 'Test Co', opts.budgetMonthlyCents ?? 0, opts.spentMonthlyCents ?? 0]
  );
  return id;
}

function seedAgent(companyId: string, name = 'Test Agent') {
  const id = nanoid();
  run(
    `INSERT INTO agents
       (id, company_id, name, slug, role, title, model, capabilities, status,
        adapter_type, adapter_config, tags, context_capsule,
        budget_monthly_cents, spent_monthly_cents,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, 'general', '', 'claude-sonnet-4-5',
             '[]', 'idle', 'mock', '{}', '[]', '', 0, 0, datetime('now'), datetime('now'))`,
    [id, companyId, name, name.toLowerCase().replace(/\s+/g, '-')]
  );
  return id;
}

function seedRun(opts: {
  agentId: string;
  companyId: string;
  status?: string;
  costCents?: number;
  tokenInput?: number;
  tokenOutput?: number;
  date?: string;
  logExcerpt?: string;
  error?: string;
}) {
  const id = nanoid();
  const date = opts.date ?? TEST_DATE;
  const createdAt = `${date}T10:00:00.000Z`;
  const startedAt = `${date}T10:00:01.000Z`;
  const finishedAt = `${date}T10:00:30.000Z`;

  run(
    `INSERT INTO runs (id, agent_id, company_id, status, model, source, started_at, finished_at,
                       token_input, token_output, cost_cents, log_excerpt, error, created_at)
     VALUES (?, ?, ?, ?, 'claude-sonnet-4-5', 'manual', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.agentId,
      opts.companyId,
      opts.status ?? 'completed',
      startedAt,
      finishedAt,
      opts.tokenInput ?? 100,
      opts.tokenOutput ?? 50,
      opts.costCents ?? 10,
      opts.logExcerpt ?? 'Task completed successfully',
      opts.error ?? null,
      createdAt,
    ]
  );
  return id;
}

// ─── generateDigest tests ─────────────────────────────────────────────────────

describe('generateDigest', () => {
  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    // Ensure ANTHROPIC_API_KEY is NOT set so LLM calls are skipped
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('generates a digest for a company with runs', async () => {
    const companyId = seedCompany();
    const agentId = seedAgent(companyId, 'Backend Bot');
    seedRun({ agentId, companyId, status: 'completed', costCents: 50 });
    seedRun({ agentId, companyId, status: 'failed', costCents: 10, error: 'Exit code 1' });

    const { generateDigest } = await import('../digest/generate-digest.js');
    const digest = await generateDigest(companyId, TEST_DATE);

    expect(digest.companyId).toBe(companyId);
    expect(digest.date).toBe(TEST_DATE);
    expect(digest.summary.totalRuns).toBe(2);
    expect(digest.summary.successful).toBe(1);
    expect(digest.summary.failed).toBe(1);
    expect(digest.summary.totalCostUsd).toBeCloseTo(0.60, 2);
    expect(digest.byAgent).toHaveLength(1);
    expect(digest.byAgent[0].agentName).toBe('Backend Bot');
    expect(digest.byAgent[0].runs).toBe(2);
    expect(digest.id).toBeTruthy();
    expect(digest.createdAt).toBeTruthy();
  });

  it('generates a digest with zero values when no runs exist (empty day)', async () => {
    const companyId = seedCompany();
    seedAgent(companyId, 'Idle Bot');

    const { generateDigest } = await import('../digest/generate-digest.js');
    const digest = await generateDigest(companyId, TEST_DATE);

    expect(digest.summary.totalRuns).toBe(0);
    expect(digest.summary.successful).toBe(0);
    expect(digest.summary.failed).toBe(0);
    expect(digest.summary.totalCostUsd).toBe(0);
    expect(digest.byAgent).toHaveLength(0);
    expect(digest.actionItems).toHaveLength(0);
  });

  it('is idempotent — calling twice for the same date does not create duplicate rows', async () => {
    const companyId = seedCompany();
    const agentId = seedAgent(companyId);
    seedRun({ agentId, companyId });

    const { generateDigest } = await import('../digest/generate-digest.js');
    const first = await generateDigest(companyId, TEST_DATE);
    const second = await generateDigest(companyId, TEST_DATE);

    // The digest is updated in-place, so both should refer to same company+date
    expect(first.companyId).toBe(second.companyId);
    expect(first.date).toBe(second.date);

    // Only one row in DB
    const rows = all<{ id: string }>(
      `SELECT id FROM digests WHERE company_id = ? AND date = ?`,
      [companyId, TEST_DATE]
    );
    expect(rows).toHaveLength(1);
  });

  it('persists digest to the digests table', async () => {
    const companyId = seedCompany();
    const agentId = seedAgent(companyId);
    seedRun({ agentId, companyId, costCents: 100 });

    const { generateDigest } = await import('../digest/generate-digest.js');
    await generateDigest(companyId, TEST_DATE);

    const row = get<{ content: string }>(`SELECT content FROM digests WHERE company_id = ? AND date = ?`, [
      companyId,
      TEST_DATE,
    ]);
    expect(row).toBeTruthy();
    const parsed = JSON.parse(row!.content) as { summary: { totalCostUsd: number } };
    expect(parsed.summary.totalCostUsd).toBeCloseTo(1.0, 2);
  });

  it('throws when company does not exist', async () => {
    const { generateDigest } = await import('../digest/generate-digest.js');
    await expect(generateDigest('nonexistent-co', TEST_DATE)).rejects.toThrow('Company not found');
  });

  it('includes pending approvals count in digest', async () => {
    const companyId = seedCompany();
    const agentId = seedAgent(companyId);
    seedRun({ agentId, companyId });

    // Seed a pending gate
    const gateId = nanoid();
    run(
      `INSERT INTO approval_gates (id, company_id, agent_id, gate_type, title, description, payload, status, created_at)
       VALUES (?, ?, ?, 'deploy', 'Deploy gate', '', '{}', 'pending', datetime('now'))`,
      [gateId, companyId, agentId]
    );

    const { generateDigest } = await import('../digest/generate-digest.js');
    const digest = await generateDigest(companyId, TEST_DATE);

    expect(digest.pendingApprovals).toBe(1);
    // Should have an action item for the pending gate
    const gateActionItem = digest.actionItems.find((a) => a.description.includes('approval gate'));
    expect(gateActionItem).toBeTruthy();
    expect(gateActionItem?.priority).toBe('high');
  });

  it('calculates correct budget status', async () => {
    const companyId = seedCompany({
      budgetMonthlyCents: 10000, // $100
      spentMonthlyCents: 5000,   // $50
    });
    seedAgent(companyId);

    const { generateDigest } = await import('../digest/generate-digest.js');
    const digest = await generateDigest(companyId, TEST_DATE);

    expect(digest.budgetStatus.limitMonth).toBeCloseTo(100, 1);
    expect(digest.budgetStatus.spentMonth).toBeCloseTo(50, 1);
  });

  it('adds action item for failed runs', async () => {
    const companyId = seedCompany();
    const agentId = seedAgent(companyId, 'Failing Bot');
    seedRun({ agentId, companyId, status: 'failed', error: 'OOM' });
    seedRun({ agentId, companyId, status: 'failed', error: 'timeout' });
    seedRun({ agentId, companyId, status: 'failed', error: 'crash' });

    const { generateDigest } = await import('../digest/generate-digest.js');
    const digest = await generateDigest(companyId, TEST_DATE);

    // Should have an action item for failures
    const failItem = digest.actionItems.find((a) => a.source === 'Failing Bot');
    expect(failItem).toBeTruthy();
    expect(failItem?.priority).toBe('high'); // 3 failures → high
  });

  it('handles multiple agents correctly', async () => {
    const companyId = seedCompany();
    const agentA = seedAgent(companyId, 'Agent Alpha');
    const agentB = seedAgent(companyId, 'Agent Beta');
    seedRun({ agentId: agentA, companyId, status: 'completed', costCents: 100 });
    seedRun({ agentId: agentB, companyId, status: 'completed', costCents: 200 });
    seedRun({ agentId: agentB, companyId, status: 'failed', costCents: 20 });

    const { generateDigest } = await import('../digest/generate-digest.js');
    const digest = await generateDigest(companyId, TEST_DATE);

    expect(digest.summary.totalRuns).toBe(3);
    expect(digest.byAgent).toHaveLength(2);
    const totalCost = digest.byAgent.reduce((s, a) => s + a.costUsd, 0);
    expect(totalCost).toBeCloseTo(3.2, 2);
  });

  it('does not include runs from other dates', async () => {
    const companyId = seedCompany();
    const agentId = seedAgent(companyId);
    // Run on target date
    seedRun({ agentId, companyId, date: TEST_DATE, costCents: 100 });
    // Run on different date
    seedRun({ agentId, companyId, date: '2026-03-30', costCents: 9999 });

    const { generateDigest } = await import('../digest/generate-digest.js');
    const digest = await generateDigest(companyId, TEST_DATE);

    expect(digest.summary.totalRuns).toBe(1);
    expect(digest.summary.totalCostUsd).toBeCloseTo(1.0, 2);
  });
});

// ─── Digest API endpoint tests ────────────────────────────────────────────────

describe('Digest API', () => {
  let app: import('hono').Hono;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    delete process.env.ANTHROPIC_API_KEY;

    const { digestRouter } = await import('../routes/digest.js');
    const { Hono } = await import('hono');
    app = new Hono();
    app.route('/', digestRouter);
  });

  it('GET /api/companies/:cid/digest — returns null when no digest exists', async () => {
    seedCompany();
    const res = await app.request('/api/companies/co-test/digest');
    expect(res.status).toBe(200);
    const body = await res.json() as { digest: null };
    expect(body.digest).toBeNull();
  });

  it('GET /api/companies/:cid/digest — returns 404 for unknown company', async () => {
    const res = await app.request('/api/companies/nonexistent/digest');
    expect(res.status).toBe(404);
  });

  it('GET /api/companies/:cid/digest — returns latest digest when today has none', async () => {
    const companyId = seedCompany();
    const digestId = nanoid();
    run(
      `INSERT INTO digests (id, company_id, date, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [
        digestId,
        companyId,
        '2026-03-29',
        JSON.stringify({
          id: digestId,
          date: '2026-03-29',
          companyId,
          summary: { totalRuns: 5, successful: 4, failed: 1, totalCostUsd: 0.5, totalTokens: { input: 1000, output: 500 } },
          byAgent: [],
          actionItems: [],
          budgetStatus: { spentToday: 0.5, spentMonth: 5, limitMonth: 100, burnRate: 'on track' },
          pendingApprovals: 0,
          createdAt: new Date().toISOString(),
        }),
      ]
    );

    const res = await app.request(`/api/companies/${companyId}/digest`);
    expect(res.status).toBe(200);
    const body = await res.json() as { digest: { date: string } };
    expect(body.digest).not.toBeNull();
    expect(body.digest.date).toBe('2026-03-29');
  });

  it('GET /api/companies/:cid/digest/:date — returns specific digest', async () => {
    const companyId = seedCompany();
    const digestId = nanoid();
    run(
      `INSERT INTO digests (id, company_id, date, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
      [
        digestId,
        companyId,
        TEST_DATE,
        JSON.stringify({
          id: digestId,
          date: TEST_DATE,
          companyId,
          summary: { totalRuns: 3, successful: 3, failed: 0, totalCostUsd: 0.03, totalTokens: { input: 300, output: 150 } },
          byAgent: [],
          actionItems: [],
          budgetStatus: { spentToday: 0.03, spentMonth: 0.3, limitMonth: 0, burnRate: 'on track' },
          pendingApprovals: 0,
          createdAt: new Date().toISOString(),
        }),
      ]
    );

    const res = await app.request(`/api/companies/${companyId}/digest/${TEST_DATE}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { digest: { summary: { totalRuns: number } } };
    expect(body.digest.summary.totalRuns).toBe(3);
  });

  it('GET /api/companies/:cid/digest/:date — returns null when digest does not exist for date', async () => {
    seedCompany();
    const res = await app.request(`/api/companies/co-test/digest/${TEST_DATE}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { digest: null };
    expect(body.digest).toBeNull();
  });

  it('GET /api/companies/:cid/digest/:date — returns 400 for invalid date format', async () => {
    seedCompany();
    const res = await app.request('/api/companies/co-test/digest/not-a-date');
    expect(res.status).toBe(400);
  });

  it('GET /api/companies/:cid/digest/range — returns digests within range', async () => {
    const companyId = seedCompany();
    for (const date of ['2026-03-29', '2026-03-30', TEST_DATE]) {
      const digestId = nanoid();
      run(
        `INSERT INTO digests (id, company_id, date, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [
          digestId,
          companyId,
          date,
          JSON.stringify({
            id: digestId,
            date,
            companyId,
            summary: { totalRuns: 1, successful: 1, failed: 0, totalCostUsd: 0.01, totalTokens: { input: 100, output: 50 } },
            byAgent: [],
            actionItems: [],
            budgetStatus: { spentToday: 0.01, spentMonth: 0.1, limitMonth: 0, burnRate: 'on track' },
            pendingApprovals: 0,
            createdAt: new Date().toISOString(),
          }),
        ]
      );
    }

    const res = await app.request(
      `/api/companies/${companyId}/digest/range?from=2026-03-29&to=${TEST_DATE}`
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { digests: unknown[] };
    expect(body.digests).toHaveLength(3);
  });

  it('GET /api/companies/:cid/digest/range — returns 400 for missing from param', async () => {
    seedCompany();
    const res = await app.request('/api/companies/co-test/digest/range');
    expect(res.status).toBe(400);
  });

  it('POST /api/companies/:cid/digest/generate — generates digest and returns 201', async () => {
    const companyId = seedCompany();
    const agentId = seedAgent(companyId, 'Auto Bot');
    seedRun({ agentId, companyId, date: new Date().toISOString().slice(0, 10) });

    const res = await app.request(`/api/companies/${companyId}/digest/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { digest: { companyId: string } };
    expect(body.digest.companyId).toBe(companyId);
  });

  it('POST /api/companies/:cid/digest/generate — returns 404 for unknown company', async () => {
    const res = await app.request('/api/companies/nonexistent/digest/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });
});
