import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { get } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import {
  listCapsules,
  getCapsule,
  createCapsule,
  updateCapsuleContent,
  deleteCapsule,
  getCapsuleVersions,
  getCapsuleVersion,
  refreshCompositeCapsule,
  updateDynamicCapsulesForAgent,
} from '../capsules/capsule-manager.js';

export const capsulesRouter = new Hono();

// ── Schemas ───────────────────────────────────────────────────────────────────

const staticConfigSchema = z.object({
  label: z.string().max(200).optional(),
});

const dynamicConfigSchema = z.object({
  source: z.string().min(1).max(200),
  maxAge: z.number().int().min(0).optional(),
});

const compositeConfigSchema = z.object({
  includes: z.array(z.string()).min(1),
  maxTokens: z.number().int().min(1).optional(),
  summarizeIfExceeds: z.boolean().optional(),
});

const createCapsuleSchema = z.object({
  type: z.enum(['static', 'dynamic', 'composite']),
  name: z.string().min(1).max(300),
  content: z.string().max(100_000).default(''),
  config: z
    .union([staticConfigSchema, dynamicConfigSchema, compositeConfigSchema, z.object({})])
    .default({}),
});

const updateCapsuleSchema = z.object({
  content: z.string().max(100_000),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireCompany(cid: string) {
  return get(`SELECT id FROM companies WHERE id = ?`, [cid]);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/companies/:cid/capsules
capsulesRouter.get('/api/companies/:cid/capsules', (c) => {
  const cid = c.req.param('cid');
  if (!cid) {
    return c.json({ error: 'Company ID required' }, 400);
  }

  if (!requireCompany(cid)) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const capsules = listCapsules(cid);
  return c.json({ capsules });
});

// POST /api/companies/:cid/capsules
capsulesRouter.post(
  '/api/companies/:cid/capsules',
  requireRole('admin'),
  async (c) => {
    const cid = c.req.param('cid');
    if (!cid) {
      return c.json({ error: 'Company ID required' }, 400);
    }

    // Parse and validate body manually so we can access the raw config field
    // before Zod's union strips unknown keys (e.g. composite.includes).
    let rawBody: Record<string, unknown>;
    try {
      rawBody = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = createCapsuleSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: 'Validation error', details: parsed.error.errors }, 400);
    }
    const body = parsed.data;

    if (!requireCompany(cid)) {
      return c.json({ error: 'Company not found' }, 404);
    }

    // For dynamic capsules, validate that the source agent belongs to this company.
    // Use rawBody.config to avoid Zod union stripping type-specific keys.
    if (body.type === 'dynamic') {
      const dynCfg = (rawBody.config ?? {}) as { source?: string };
      if (dynCfg.source?.startsWith('agent:')) {
        const agentId = dynCfg.source.slice('agent:'.length);
        const agent = get(`SELECT id FROM agents WHERE id = ? AND company_id = ?`, [agentId, cid]);
        if (!agent) {
          return c.json({ error: 'Source agent not found in this company' }, 400);
        }
      }
    }

    // For composite capsules, validate that included capsule IDs exist in this company.
    // Use rawBody.config to avoid Zod union stripping the "includes" key.
    if (body.type === 'composite') {
      const compCfg = (rawBody.config ?? {}) as { includes?: unknown[] };
      if (Array.isArray(compCfg.includes)) {
        for (const incId of compCfg.includes) {
          if (typeof incId !== 'string') continue;
          const inc = get(
            `SELECT id FROM capsules WHERE id = ? AND company_id = ? AND active = 1`,
            [incId, cid]
          );
          if (!inc) {
            return c.json({ error: `Included capsule not found: ${incId}` }, 400);
          }
        }
      }
    }

    // Build type-specific config from rawBody so that keys aren't stripped
    const rawConfig = (rawBody.config ?? {}) as Record<string, unknown>;
    const capsule = createCapsule(cid, body.type, body.name, body.content, rawConfig);
    return c.json({ capsule }, 201);
  }
);

// GET /api/capsules/:id
capsulesRouter.get('/api/capsules/:id', (c) => {
  const id = c.req.param('id');
  const capsule = getCapsule(id);
  if (!capsule) {
    return c.json({ error: 'Capsule not found' }, 404);
  }
  return c.json({ capsule });
});

// PUT /api/capsules/:id
capsulesRouter.put(
  '/api/capsules/:id',
  requireRole('admin'),
  zValidator('json', updateCapsuleSchema),
  (c) => {
    const id = c.req.param('id');
    const { content } = c.req.valid('json');

    const updated = updateCapsuleContent(id, content);
    if (!updated) {
      return c.json({ error: 'Capsule not found' }, 404);
    }

    return c.json({ capsule: updated });
  }
);

// DELETE /api/capsules/:id
capsulesRouter.delete('/api/capsules/:id', requireRole('admin'), (c) => {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ error: 'Capsule ID required' }, 400);
  }

  const deleted = deleteCapsule(id);
  if (!deleted) {
    return c.json({ error: 'Capsule not found' }, 404);
  }

  return c.json({ success: true });
});

// POST /api/capsules/:id/refresh — manually refresh dynamic or composite capsule
capsulesRouter.post('/api/capsules/:id/refresh', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ error: 'Capsule ID required' }, 400);
  }

  const capsule = getCapsule(id);
  if (!capsule) {
    return c.json({ error: 'Capsule not found' }, 404);
  }

  if (capsule.type === 'static') {
    return c.json({ error: 'Static capsules cannot be refreshed' }, 400);
  }

  if (capsule.type === 'composite') {
    await refreshCompositeCapsule(id);
    const refreshed = getCapsule(id);
    return c.json({ capsule: refreshed });
  }

  if (capsule.type === 'dynamic') {
    // Re-run the dynamic update for the source agent
    const dynCfg = capsule.config as { source?: string };
    if (dynCfg.source?.startsWith('agent:')) {
      const agentId = dynCfg.source.slice('agent:'.length);
      updateDynamicCapsulesForAgent(agentId, capsule.companyId);
    }
    const refreshed = getCapsule(id);
    return c.json({ capsule: refreshed });
  }

  return c.json({ capsule });
});

// GET /api/capsules/:id/versions
capsulesRouter.get('/api/capsules/:id/versions', (c) => {
  const id = c.req.param('id');

  const capsule = getCapsule(id);
  if (!capsule) {
    return c.json({ error: 'Capsule not found' }, 404);
  }

  const versions = getCapsuleVersions(id);
  return c.json({ versions });
});

// GET /api/capsules/:id/versions/:v
capsulesRouter.get('/api/capsules/:id/versions/:v', (c) => {
  const id = c.req.param('id');
  const vParam = parseInt(c.req.param('v'), 10);

  if (isNaN(vParam) || vParam < 1) {
    return c.json({ error: 'Invalid version number' }, 400);
  }

  const capsule = getCapsule(id);
  if (!capsule) {
    return c.json({ error: 'Capsule not found' }, 404);
  }

  const version = getCapsuleVersion(id, vParam);
  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  return c.json({ version });
});
