/**
 * Tests for Context Capsules
 *
 * Covers:
 *  - Static capsule CRUD + versioning
 *  - Dynamic capsule auto-update on agent run (via updateDynamicCapsulesForAgent)
 *  - Composite capsule assembly
 *  - Stale detection (isStale flag)
 *  - API endpoints: list, create, get, update, delete, refresh, versions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTestDb, setActiveDb, createDbMock } from './db-mock.js';

// ── Mock heavy deps ────────────────────────────────────────────────────────────
vi.mock('../db.js', () => createDbMock());
vi.mock('../sse.js', () => ({ broadcast: vi.fn() }));
vi.mock('../ws.js', () => ({ pushToAgent: vi.fn() }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { nanoid } from 'nanoid';
import { run, get, all } from '../db.js';
import {
  createCapsule,
  getCapsule,
  listCapsules,
  updateCapsuleContent,
  deleteCapsule,
  getCapsuleVersions,
  getCapsuleVersion,
  updateDynamicCapsulesForAgent,
  refreshCompositeCapsule,
  estimateTokenCount,
} from '../capsules/capsule-manager.js';

// ── Seed helpers ─────────────────────────────────────────────────────────────

function seedCompany(id = 'co-1', name = 'Test Co') {
  run(
    `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, '', 'active', 0, 0, datetime('now'), datetime('now'))`,
    [id, name]
  );
}

function seedAgent(opts: { id?: string; companyId?: string; name?: string }) {
  const id = opts.id ?? nanoid();
  const companyId = opts.companyId ?? 'co-1';
  const now = new Date().toISOString();
  run(
    `INSERT INTO agents
       (id, company_id, name, slug, role, title, model, capabilities, status,
        adapter_type, adapter_config, tags, context_capsule,
        budget_monthly_cents, spent_monthly_cents,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, 'worker', '', 'mock', '[]', 'idle', 'mock', '{}', '', '', 0, 0, ?, ?)`,
    [id, companyId, opts.name ?? 'TestAgent', (opts.name ?? 'TestAgent').toLowerCase().replace(/\s/g, '-'), now, now]
  );
  return id;
}

function seedRunOutput(agentId: string, runId: string, data: Record<string, unknown> = { summary: 'latest run summary' }) {
  const outputId = nanoid();
  const now = new Date().toISOString();
  run(
    `INSERT INTO run_outputs (id, run_id, agent_id, output_type, data, created_at) VALUES (?, ?, ?, 'report', ?, ?)`,
    [outputId, runId, agentId, JSON.stringify(data), now]
  );
}

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('capsule-manager unit tests', () => {
  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);
    seedCompany();
  });

  // ── estimateTokenCount ───────────────────────────────────────────────────

  it('estimateTokenCount: 4 chars = 1 token', () => {
    expect(estimateTokenCount('1234')).toBe(1);
    expect(estimateTokenCount('12345678')).toBe(2);
    expect(estimateTokenCount('')).toBe(0);
  });

  // ── Static capsule CRUD ──────────────────────────────────────────────────

  it('createCapsule: static — persists to DB', () => {
    const capsule = createCapsule('co-1', 'static', 'My Capsule', 'hello world');
    expect(capsule.id).toBeTruthy();
    expect(capsule.type).toBe('static');
    expect(capsule.name).toBe('My Capsule');
    expect(capsule.content).toBe('hello world');
    expect(capsule.version).toBe(1);
    expect(capsule.active).toBe(true);
    expect(capsule.tokenCount).toBe(estimateTokenCount('hello world'));
  });

  it('createCapsule: stores initial version in capsule_versions', () => {
    const capsule = createCapsule('co-1', 'static', 'v1', 'initial content');
    const versions = getCapsuleVersions(capsule.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].content).toBe('initial content');
  });

  it('getCapsule: returns capsule by id', () => {
    const created = createCapsule('co-1', 'static', 'Test', 'content');
    const fetched = getCapsule(created.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(created.id);
  });

  it('getCapsule: returns undefined for missing id', () => {
    expect(getCapsule('does-not-exist')).toBeUndefined();
  });

  it('listCapsules: returns all active capsules for company', () => {
    createCapsule('co-1', 'static', 'A', 'a');
    createCapsule('co-1', 'static', 'B', 'b');
    const list = listCapsules('co-1');
    expect(list.length).toBe(2);
  });

  it('listCapsules: excludes soft-deleted capsules', () => {
    const c1 = createCapsule('co-1', 'static', 'Keep', 'keep');
    const c2 = createCapsule('co-1', 'static', 'Delete', 'delete');
    deleteCapsule(c2.id);
    const list = listCapsules('co-1');
    expect(list.map((c) => c.id)).toContain(c1.id);
    expect(list.map((c) => c.id)).not.toContain(c2.id);
  });

  it('updateCapsuleContent: increments version and stores old version', () => {
    const capsule = createCapsule('co-1', 'static', 'V', 'v1 content');
    const updated = updateCapsuleContent(capsule.id, 'v2 content');
    expect(updated).toBeDefined();
    expect(updated!.version).toBe(2);
    expect(updated!.content).toBe('v2 content');

    const versions = getCapsuleVersions(capsule.id);
    // Version 1 created at init, version 2 on update
    expect(versions.some((v) => v.version === 1)).toBe(true);
    expect(versions.some((v) => v.version === 2)).toBe(true);
  });

  it('updateCapsuleContent: updates token_count', () => {
    const capsule = createCapsule('co-1', 'static', 'T', 'abc');
    const longContent = 'x'.repeat(400); // ~100 tokens
    const updated = updateCapsuleContent(capsule.id, longContent);
    expect(updated!.tokenCount).toBe(100);
  });

  it('updateCapsuleContent: returns undefined for missing capsule', () => {
    const result = updateCapsuleContent('ghost-id', 'content');
    expect(result).toBeUndefined();
  });

  it('deleteCapsule: soft-deletes by setting active=0', () => {
    const capsule = createCapsule('co-1', 'static', 'Del', 'x');
    const result = deleteCapsule(capsule.id);
    expect(result).toBe(true);
    const fetched = getCapsule(capsule.id);
    // getCapsule uses WHERE active=1, so returns undefined after soft-delete
    expect(fetched).toBeUndefined();
  });

  it('deleteCapsule: returns false for missing capsule', () => {
    expect(deleteCapsule('ghost-id')).toBe(false);
  });

  // ── Versioning ───────────────────────────────────────────────────────────

  it('getCapsuleVersions: returns all versions in descending order', () => {
    const capsule = createCapsule('co-1', 'static', 'V', 'v1');
    updateCapsuleContent(capsule.id, 'v2');
    updateCapsuleContent(capsule.id, 'v3');
    const versions = getCapsuleVersions(capsule.id);
    expect(versions[0].version).toBe(3);
    expect(versions[versions.length - 1].version).toBe(1);
  });

  it('getCapsuleVersion: returns specific version', () => {
    const capsule = createCapsule('co-1', 'static', 'V', 'v1');
    updateCapsuleContent(capsule.id, 'v2');
    const v1 = getCapsuleVersion(capsule.id, 1);
    expect(v1).toBeDefined();
    expect(v1!.content).toBe('v1');
  });

  it('getCapsuleVersion: returns undefined for missing version', () => {
    const capsule = createCapsule('co-1', 'static', 'V', 'v1');
    expect(getCapsuleVersion(capsule.id, 99)).toBeUndefined();
  });

  // ── Stale detection ───────────────────────────────────────────────────────

  it('isStale: false when no expires_at', () => {
    const capsule = createCapsule('co-1', 'dynamic', 'D', 'content', {
      source: 'agent:ag-1',
    });
    expect(capsule.isStale).toBe(false);
  });

  it('isStale: true when expires_at is in the past', () => {
    // Manually insert a capsule with a past expires_at
    const id = nanoid();
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 10_000).toISOString();
    run(
      `INSERT INTO capsules (id, company_id, type, name, content, token_count, version, config, active, created_at, updated_at, expires_at)
       VALUES (?, 'co-1', 'dynamic', 'Stale', 'old content', 10, 1, '{}', 1, ?, ?, ?)`,
      [id, now, now, past]
    );
    const capsule = getCapsule(id);
    expect(capsule).toBeDefined();
    expect(capsule!.isStale).toBe(true);
  });

  it('isStale: false when expires_at is in the future', () => {
    const capsule = createCapsule('co-1', 'dynamic', 'D', 'content', {
      source: 'agent:ag-1',
      maxAge: 3600, // 1 hour
    });
    expect(capsule.isStale).toBe(false);
    expect(capsule.expiresAt).toBeTruthy();
  });

  // ── Dynamic capsule auto-update ───────────────────────────────────────────

  it('updateDynamicCapsulesForAgent: updates matching dynamic capsule', () => {
    const agentId = seedAgent({ id: 'ag-1', companyId: 'co-1' });
    const runId = nanoid();

    // Create a run record (required for FK on run_outputs)
    run(
      `INSERT INTO runs (id, agent_id, company_id, status, model, source, created_at)
       VALUES (?, ?, 'co-1', 'completed', 'mock', 'manual', datetime('now'))`,
      [runId, agentId]
    );

    // Create a run output for this agent
    seedRunOutput(agentId, runId, { summary: 'dynamic content from run' });

    // Create a dynamic capsule sourced from this agent
    const capsule = createCapsule('co-1', 'dynamic', 'AgentOutput', '', {
      source: `agent:${agentId}`,
    });

    updateDynamicCapsulesForAgent(agentId, 'co-1');

    const updated = getCapsule(capsule.id);
    expect(updated!.content).toBe('dynamic content from run');
  });

  it('updateDynamicCapsulesForAgent: no-op when no matching capsules', () => {
    const agentId = seedAgent({ id: 'ag-2', companyId: 'co-1' });
    const runId = nanoid();
    run(
      `INSERT INTO runs (id, agent_id, company_id, status, model, source, created_at)
       VALUES (?, ?, 'co-1', 'completed', 'mock', 'manual', datetime('now'))`,
      [runId, agentId]
    );
    seedRunOutput(agentId, runId);

    // No capsule exists for this agent — should not throw
    expect(() => updateDynamicCapsulesForAgent(agentId, 'co-1')).not.toThrow();
  });

  it('updateDynamicCapsulesForAgent: no-op when no run outputs exist', () => {
    const agentId = seedAgent({ id: 'ag-3', companyId: 'co-1' });

    createCapsule('co-1', 'dynamic', 'NoOutput', '', {
      source: `agent:${agentId}`,
    });

    // Should not throw even without run outputs
    expect(() => updateDynamicCapsulesForAgent(agentId, 'co-1')).not.toThrow();
  });

  // ── Composite capsule assembly ────────────────────────────────────────────

  it('refreshCompositeCapsule: concatenates included capsule contents', async () => {
    const c1 = createCapsule('co-1', 'static', 'Part A', 'Content A');
    const c2 = createCapsule('co-1', 'static', 'Part B', 'Content B');
    const composite = createCapsule('co-1', 'composite', 'Combined', '', {
      includes: [c1.id, c2.id],
    });

    await refreshCompositeCapsule(composite.id);

    const refreshed = getCapsule(composite.id);
    expect(refreshed!.content).toContain('Content A');
    expect(refreshed!.content).toContain('Content B');
  });

  it('refreshCompositeCapsule: no-op for non-composite capsule', async () => {
    const staticCapsule = createCapsule('co-1', 'static', 'S', 'original');
    await refreshCompositeCapsule(staticCapsule.id);
    const unchanged = getCapsule(staticCapsule.id);
    expect(unchanged!.content).toBe('original');
  });

  it('refreshCompositeCapsule: handles missing included capsule gracefully', async () => {
    const c1 = createCapsule('co-1', 'static', 'Exists', 'real content');
    const composite = createCapsule('co-1', 'composite', 'Mixed', '', {
      includes: [c1.id, 'does-not-exist'],
    });

    // Should not throw
    await expect(refreshCompositeCapsule(composite.id)).resolves.not.toThrow();

    const refreshed = getCapsule(composite.id);
    expect(refreshed!.content).toContain('real content');
  });
});

// ── API endpoint tests ────────────────────────────────────────────────────────

describe('Capsules API', () => {
  let app: Hono;
  let companyId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    setActiveDb(db);

    // Build app with admin role
    const { companiesRouter } = await import('../routes/companies.js');
    const { capsulesRouter } = await import('../routes/capsules.js');
    app = new Hono();
    app.use('*', async (c, next) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = c as any;
      ctx.set('role', 'admin');
      ctx.set('apiKeyId', 'test-key');
      return next();
    });
    app.route('/', companiesRouter);
    app.route('/', capsulesRouter);
    app.onError((err, c) => c.json({ error: err.message }, 500));

    // Create a company via API
    const res = await app.request('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Corp' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const body = (await res.json()) as Record<string, unknown>;
    companyId = (body.company as Record<string, unknown>).id as string;
  });

  function apiRequest(path: string, opts?: RequestInit) {
    return app.request(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    });
  }

  // ── GET /api/companies/:cid/capsules ──────────────────────────────────────

  it('GET /api/companies/:cid/capsules → 200 empty list initially', async () => {
    const res = await apiRequest(`/api/companies/${companyId}/capsules`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capsules: unknown[] };
    expect(body.capsules).toEqual([]);
  });

  it('GET /api/companies/nonexistent/capsules → 404', async () => {
    const res = await apiRequest(`/api/companies/ghost-id/capsules`);
    expect(res.status).toBe(404);
  });

  // ── POST /api/companies/:cid/capsules ─────────────────────────────────────

  it('POST static capsule → 201', async () => {
    const res = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'My Capsule', content: 'hello' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { capsule: Record<string, unknown> };
    expect(body.capsule.type).toBe('static');
    expect(body.capsule.name).toBe('My Capsule');
    expect(body.capsule.content).toBe('hello');
    expect(body.capsule.version).toBe(1);
  });

  it('POST with unknown type → 400', async () => {
    const res = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'invalid', name: 'X', content: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST composite with missing include capsule → 400', async () => {
    const res = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'composite',
        name: 'C',
        content: '',
        config: { includes: ['ghost-id'] },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('POST composite with valid includes → 201', async () => {
    // Create two static capsules first
    const r1 = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'S1', content: 'part1' }),
    });
    const b1 = (await r1.json()) as { capsule: { id: string } };
    const r2 = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'S2', content: 'part2' }),
    });
    const b2 = (await r2.json()) as { capsule: { id: string } };

    const res = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'composite',
        name: 'Combo',
        content: '',
        config: { includes: [b1.capsule.id, b2.capsule.id] },
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { capsule: Record<string, unknown> };
    expect(body.capsule.type).toBe('composite');
  });

  // ── GET /api/capsules/:id ─────────────────────────────────────────────────

  it('GET /api/capsules/:id → 200', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'N', content: 'c' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    const res = await apiRequest(`/api/capsules/${capsule.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capsule: Record<string, unknown> };
    expect(body.capsule.id).toBe(capsule.id);
  });

  it('GET /api/capsules/nonexistent → 404', async () => {
    const res = await apiRequest(`/api/capsules/ghost-id`);
    expect(res.status).toBe(404);
  });

  // ── PUT /api/capsules/:id ─────────────────────────────────────────────────

  it('PUT /api/capsules/:id → 200 updates content and increments version', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'N', content: 'v1' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    const updateRes = await apiRequest(`/api/capsules/${capsule.id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: 'v2 content' }),
    });
    expect(updateRes.status).toBe(200);
    const body = (await updateRes.json()) as { capsule: Record<string, unknown> };
    expect(body.capsule.content).toBe('v2 content');
    expect(body.capsule.version).toBe(2);
  });

  it('PUT /api/capsules/nonexistent → 404', async () => {
    const res = await apiRequest(`/api/capsules/ghost-id`, {
      method: 'PUT',
      body: JSON.stringify({ content: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  // ── DELETE /api/capsules/:id ──────────────────────────────────────────────

  it('DELETE /api/capsules/:id → 200', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'N', content: 'c' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    const delRes = await apiRequest(`/api/capsules/${capsule.id}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);

    // Verify it's gone
    const getRes = await apiRequest(`/api/capsules/${capsule.id}`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE /api/capsules/nonexistent → 404', async () => {
    const res = await apiRequest(`/api/capsules/ghost-id`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  // ── POST /api/capsules/:id/refresh ────────────────────────────────────────

  it('POST /api/capsules/:id/refresh → 400 for static capsule', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'N', content: 'c' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    const res = await apiRequest(`/api/capsules/${capsule.id}/refresh`, { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('POST /api/capsules/nonexistent/refresh → 404', async () => {
    const res = await apiRequest(`/api/capsules/ghost-id/refresh`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('POST /api/capsules/:id/refresh → 200 for composite capsule', async () => {
    const r1 = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'S1', content: 'refreshed part' }),
    });
    const b1 = (await r1.json()) as { capsule: { id: string } };

    const r2 = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'composite',
        name: 'Combo',
        content: '',
        config: { includes: [b1.capsule.id] },
      }),
    });
    const { capsule } = (await r2.json()) as { capsule: { id: string } };

    const res = await apiRequest(`/api/capsules/${capsule.id}/refresh`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capsule: Record<string, unknown> };
    expect(body.capsule.content).toContain('refreshed part');
  });

  // ── GET /api/capsules/:id/versions ────────────────────────────────────────

  it('GET /api/capsules/:id/versions → 200 with initial version', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'V', content: 'initial' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    const res = await apiRequest(`/api/capsules/${capsule.id}/versions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { versions: Array<Record<string, unknown>> };
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0].version).toBe(1);
    expect(body.versions[0].content).toBe('initial');
  });

  it('GET /api/capsules/:id/versions → multiple versions after updates', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'V', content: 'v1' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    await apiRequest(`/api/capsules/${capsule.id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: 'v2' }),
    });

    const res = await apiRequest(`/api/capsules/${capsule.id}/versions`);
    const body = (await res.json()) as { versions: Array<Record<string, unknown>> };
    expect(body.versions).toHaveLength(2);
  });

  // ── GET /api/capsules/:id/versions/:v ─────────────────────────────────────

  it('GET /api/capsules/:id/versions/:v → 200 specific version', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'V', content: 'v1 content' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    await apiRequest(`/api/capsules/${capsule.id}`, {
      method: 'PUT',
      body: JSON.stringify({ content: 'v2 content' }),
    });

    const res = await apiRequest(`/api/capsules/${capsule.id}/versions/1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: Record<string, unknown> };
    expect(body.version.version).toBe(1);
    expect(body.version.content).toBe('v1 content');
  });

  it('GET /api/capsules/:id/versions/99 → 404', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'V', content: 'v1' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    const res = await apiRequest(`/api/capsules/${capsule.id}/versions/99`);
    expect(res.status).toBe(404);
  });

  it('GET /api/capsules/:id/versions/0 → 400 invalid version', async () => {
    const createRes = await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'V', content: 'v1' }),
    });
    const { capsule } = (await createRes.json()) as { capsule: { id: string } };

    const res = await apiRequest(`/api/capsules/${capsule.id}/versions/0`);
    expect(res.status).toBe(400);
  });

  // ── List after create/delete ──────────────────────────────────────────────

  it('List after create shows new capsule', async () => {
    await apiRequest(`/api/companies/${companyId}/capsules`, {
      method: 'POST',
      body: JSON.stringify({ type: 'static', name: 'Listed', content: 'x' }),
    });

    const res = await apiRequest(`/api/companies/${companyId}/capsules`);
    const body = (await res.json()) as { capsules: Array<{ name: string }> };
    expect(body.capsules.some((c) => c.name === 'Listed')).toBe(true);
  });
});
