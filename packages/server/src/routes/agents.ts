import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { isAbsolute } from 'path';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { spawnClaudeLocal, checkAgentBudget } from '../adapter.js';
import { broadcast } from '../sse.js';
import { getPaginationParams, paginatedResponse } from '../utils/pagination.js';
import { requireRole } from '../middleware/rbac.js';
import { slugify } from '../workspace.js';
import { audit } from '../audit.js';
import { validateOutputSchema } from '../parser/parse-output.js';

export const agentsRouter = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().min(1).default('worker'),
  title: z.string().max(200).default(''),
  model: z.string().default('claude-opus-4-5'),
  capabilities: z.array(z.string()).default([]),
  reportsTo: z.string().nullable().optional(),
  adapterType: z.enum(['claude-cli', 'claude_local', 'anthropic-api', 'openai', 'mock']).default('claude-cli'),
  adapterConfig: z.record(z.unknown()).default({}),
  workingDirectory: z.string().max(500).nullable().optional(),
  projectId: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  budgetMonthlyCents: z.number().int().min(0).default(0),
  status: z
    .enum(['idle', 'running', 'paused', 'error', 'budget_exceeded'])
    .default('idle'),
  /** Optional structured output schema for this agent's runs */
  outputSchema: z.record(z.unknown()).nullable().optional(),
});

const updateSchema = createSchema.partial();

interface AgentRow {
  id: string;
  company_id: string;
  name: string;
  slug: string | null;
  role: string;
  title: string;
  model: string;
  capabilities: string;
  status: string;
  reports_to: string | null;
  adapter_type: string;
  adapter_config: string;
  working_directory: string | null;
  project_id: string | null;
  tags: string;
  context_capsule: string;
  output_schema: string | null;
  budget_monthly_cents: number;
  spent_monthly_cents: number;
  created_at: string;
  updated_at: string;
}

function rowToAgent(row: AgentRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    slug: row.slug ?? slugify(row.name),
    role: row.role,
    title: row.title,
    model: row.model,
    capabilities: (() => {
      try {
        return JSON.parse(row.capabilities) as string[];
      } catch {
        return [];
      }
    })(),
    status: row.status,
    reportsTo: row.reports_to,
    adapterType: row.adapter_type,
    adapterConfig: (() => {
      try {
        return JSON.parse(row.adapter_config) as Record<string, unknown>;
      } catch {
        return {};
      }
    })(),
    workingDirectory: row.working_directory ?? null,
    projectId: row.project_id ?? null,
    tags: row.tags
      ? row.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [],
    contextCapsule: row.context_capsule ?? '',
    outputSchema: (() => {
      try {
        return row.output_schema ? (JSON.parse(row.output_schema) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    })(),
    budgetMonthlyCents: row.budget_monthly_cents,
    spentMonthlyCents: row.spent_monthly_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_AGENT_SORT: Record<string, string> = {
  name: 'a.name',
  status: 'a.status',
  createdAt: 'a.created_at',
};

function buildAgentWhere(params: {
  companyId?: string;
  status?: string;
  model?: string;
  role?: string;
  search?: string;
  tag?: string;
  projectId?: string;
}): { where: string; queryParams: unknown[] } {
  const clauses: string[] = [];
  const queryParams: unknown[] = [];

  if (params.companyId) {
    clauses.push('a.company_id = ?');
    queryParams.push(params.companyId);
  }
  if (params.status) {
    clauses.push('a.status = ?');
    queryParams.push(params.status);
  }
  if (params.model) {
    clauses.push('a.model = ?');
    queryParams.push(params.model);
  }
  if (params.role) {
    clauses.push('a.role = ?');
    queryParams.push(params.role);
  }
  if (params.search) {
    clauses.push('a.name LIKE ?');
    queryParams.push(`%${params.search}%`);
  }
  if (params.tag) {
    // Match tag in comma-separated tags field
    clauses.push("(',' || a.tags || ',' LIKE ?)");
    queryParams.push(`%,${params.tag},%`);
  }
  if (params.projectId) {
    clauses.push('a.project_id = ?');
    queryParams.push(params.projectId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, queryParams };
}

// GET /api/agents — list ALL agents across all companies with company name
agentsRouter.get('/api/agents', (c) => {
  const { page, limit, offset } = getPaginationParams(c);
  const status = c.req.query('status');
  const model = c.req.query('model');
  const role = c.req.query('role');
  const search = c.req.query('search');
  const sortParam = c.req.query('sort') ?? 'createdAt';
  const sortCol = VALID_AGENT_SORT[sortParam] ?? 'a.created_at';

  const tag = c.req.query('tag');
  const projectId = c.req.query('projectId');

  const { where, queryParams } = buildAgentWhere({ status, model, role, search, tag, projectId });

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total FROM agents a ${where}`,
    queryParams
  );
  const total = countRow?.total ?? 0;

  const rows = all<AgentRow & { company_name: string }>(
    `SELECT a.*, c.name as company_name
     FROM agents a
     LEFT JOIN companies c ON c.id = a.company_id
     ${where}
     ORDER BY ${sortCol} DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({
    agents: rows.map((row) => ({
      ...rowToAgent(row),
      companyName: row.company_name ?? '',
    })),
    pagination,
  });
});

// GET /api/companies/:companyId/agents
agentsRouter.get('/api/companies/:companyId/agents', (c) => {
  const companyId = c.req.param('companyId');

  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const { page, limit, offset } = getPaginationParams(c);
  const status = c.req.query('status');
  const model = c.req.query('model');
  const role = c.req.query('role');
  const search = c.req.query('search');
  const sortParam = c.req.query('sort') ?? 'createdAt';
  const sortCol = VALID_AGENT_SORT[sortParam] ?? 'a.created_at';

  const tag = c.req.query('tag');
  const projectIdFilter = c.req.query('projectId');

  const { where, queryParams } = buildAgentWhere({ companyId, status, model, role, search, tag, projectId: projectIdFilter });

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total FROM agents a ${where}`,
    queryParams
  );
  const total = countRow?.total ?? 0;

  const rows = all<AgentRow>(
    `SELECT a.* FROM agents a
     ${where}
     ORDER BY ${sortCol} DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({ agents: rows.map(rowToAgent), pagination });
});

// POST /api/companies/:companyId/agents
agentsRouter.post(
  '/api/companies/:companyId/agents',
  requireRole('admin'),
  zValidator('json', createSchema),
  (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');

    const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    // Validate workingDirectory is absolute if provided
    if (body.workingDirectory != null && !isAbsolute(body.workingDirectory)) {
      return c.json({ error: 'workingDirectory must be an absolute path' }, 400);
    }

    // Validate reportsTo: must exist and be in same company
    if (body.reportsTo != null) {
      const parent = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [body.reportsTo]);
      if (!parent) {
        return c.json({ error: 'reportsTo agent not found' }, 400);
      }
      if (parent.company_id !== companyId) {
        return c.json({ error: 'reportsTo agent must be in the same company' }, 400);
      }
    }

    // Validate projectId if provided
    if (body.projectId != null) {
      const project = get(`SELECT id FROM projects WHERE id = ? AND company_id = ?`, [body.projectId, companyId]);
      if (!project) {
        return c.json({ error: 'Project not found in this company' }, 400);
      }
    }

    // Validate outputSchema if provided
    if (body.outputSchema != null) {
      const schemaError = validateOutputSchema(body.outputSchema);
      if (schemaError) {
        return c.json({ error: schemaError }, 400);
      }
    }

    const now = new Date().toISOString();
    const id = nanoid();

    // Generate unique slug within the company
    const baseSlug = slugify(body.name);
    let slug = baseSlug;
    let slugCounter = 1;
    while (get(`SELECT id FROM agents WHERE company_id = ? AND slug = ?`, [companyId, slug])) {
      slug = `${baseSlug}-${slugCounter++}`;
    }

    run(
      `INSERT INTO agents (id, company_id, name, slug, role, title, model, capabilities, status,
       reports_to, adapter_type, adapter_config, working_directory, project_id, tags,
       output_schema, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        companyId,
        body.name,
        slug,
        body.role,
        body.title,
        body.model,
        JSON.stringify(body.capabilities),
        body.status,
        body.reportsTo ?? null,
        body.adapterType,
        JSON.stringify(body.adapterConfig),
        body.workingDirectory ?? null,
        body.projectId ?? null,
        body.tags.join(','),
        body.outputSchema != null ? JSON.stringify(body.outputSchema) : null,
        body.budgetMonthlyCents,
        now,
        now,
      ]
    );

    const row = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);

    return c.json({ agent: rowToAgent(row!) }, 201);
  }
);

// ─── Wake chain wake schema (shared) ──────────────────────────────────────────
const wakeChainBodySchema = z.object({
  prompt: z.string().max(10_000, 'Prompt must be 10,000 characters or fewer').optional(),
  source: z.string().max(200).optional(),
  chainDepth: z.number().int().min(0).max(100).optional(),
});

// GET /api/agents/by-slug/:slug — find agent by slug (MUST be before /:id)
agentsRouter.get('/api/agents/by-slug/:slug', (c) => {
  const slug = c.req.param('slug');
  const rows = all<AgentRow & { company_name: string }>(
    `SELECT a.*, c.name as company_name
     FROM agents a
     LEFT JOIN companies c ON c.id = a.company_id
     WHERE a.slug = ?`,
    [slug]
  );
  const row = rows[0];

  if (!row) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  return c.json({ agent: { ...rowToAgent(row), companyName: row.company_name ?? '' } });
});

// POST /api/agents/by-slug/:slug/wake — wake agent by slug (MUST be before /:id)
agentsRouter.post('/api/agents/by-slug/:slug/wake', requireRole('admin'), async (c) => {
  const slug = c.req.param('slug');

  const agent = get<AgentRow>(`SELECT * FROM agents WHERE slug = ?`, [slug]);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.status === 'running') {
    return c.json({ error: 'Agent is already running' }, 409);
  }

  // Parse optional body
  let bodyPrompt: string | undefined;
  let bodySource: string | undefined;
  let bodyChainDepth: number = 0;
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = wakeChainBodySchema.safeParse(raw);
    if (parsed.success) {
      bodyPrompt = parsed.data.prompt;
      bodySource = parsed.data.source;
      bodyChainDepth = parsed.data.chainDepth ?? 0;
    }
  } catch {
    // ignore body parse errors
  }

  const MAX_CHAIN_DEPTH = 5;
  if (bodyChainDepth >= MAX_CHAIN_DEPTH) {
    return c.json({
      error: `Chain depth limit reached (max ${MAX_CHAIN_DEPTH}). Cannot wake agent at depth ${bodyChainDepth}.`,
      chainDepth: bodyChainDepth,
    }, 429);
  }

  const runId = nanoid();
  const now = new Date().toISOString();
  const source = bodySource ?? 'manual';

  run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, chain_depth, created_at)
     VALUES (?, ?, ?, NULL, 'queued', ?, ?, ?, ?)`,
    [runId, agent.id, agent.company_id, agent.model, source, bodyChainDepth, now]
  );

  const adapterConfig = (() => {
    try {
      return JSON.parse(agent.adapter_config) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  const prompt =
    bodyPrompt ??
    (adapterConfig['defaultPrompt'] as string | undefined) ??
    `You are ${agent.name}, ${agent.title}. Perform your next task.`;

  // Fire-and-forget
  spawnClaudeLocal({
    runId,
    agentId: agent.id,
    companyId: agent.company_id,
    model: agent.model,
    prompt,
    workingDirectory: agent.working_directory ?? null,
    adapterConfig,
    adapterType: agent.adapter_type,
    chainDepth: bodyChainDepth,
    sourceAgentSlug: source.startsWith('chain:') ? source.slice(6) : undefined,
  }).catch((err: unknown) => {
    console.error(`[wake-by-slug] Adapter error for agent ${agent.slug}:`, err);
  });

  return c.json({ run: { id: runId, agentId: agent.id, agentSlug: slug, status: 'queued', chainDepth: bodyChainDepth } }, 202);
});

// GET /api/agents/:id
agentsRouter.get('/api/agents/:id', (c) => {
  const id = c.req.param('id');
  const rows = all<AgentRow & { company_name: string }>(
    `SELECT a.*, c.name as company_name
     FROM agents a
     LEFT JOIN companies c ON c.id = a.company_id
     WHERE a.id = ?`,
    [id]
  );
  const row = rows[0];

  if (!row) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  return c.json({ agent: { ...rowToAgent(row), companyName: row.company_name ?? '' } });
});

// PATCH /api/agents/:id
agentsRouter.patch('/api/agents/:id', requireRole('admin'), zValidator('json', updateSchema), (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);

  if (!existing) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  // Validate workingDirectory is absolute if provided (and not null)
  if (body.workingDirectory != null && !isAbsolute(body.workingDirectory)) {
    return c.json({ error: 'workingDirectory must be an absolute path' }, 400);
  }

  // Validate reportsTo: must exist, be in same company, and not create circular ref
  if (body.reportsTo !== undefined && body.reportsTo !== null) {
    const parent = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [body.reportsTo]);
    if (!parent) {
      return c.json({ error: 'reportsTo agent not found' }, 400);
    }
    if (parent.company_id !== existing.company_id) {
      return c.json({ error: 'reportsTo agent must be in the same company' }, 400);
    }
    // Circular reference check: if parent reports to this agent, it's circular
    if (parent.reports_to === id) {
      return c.json({ error: 'Circular reportsTo reference detected' }, 400);
    }
  }

  // Validate projectId if provided
  if (body.projectId != null) {
    const project = get(`SELECT id FROM projects WHERE id = ? AND company_id = ?`, [body.projectId, existing.company_id]);
    if (!project) {
      return c.json({ error: 'Project not found in this company' }, 400);
    }
  }

  // Validate outputSchema if provided
  if (body.outputSchema != null) {
    const schemaError = validateOutputSchema(body.outputSchema);
    if (schemaError) {
      return c.json({ error: schemaError }, 400);
    }
  }

  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
  if (body.role !== undefined) { fields.push('role = ?'); values.push(body.role); }
  if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title); }
  if (body.model !== undefined) { fields.push('model = ?'); values.push(body.model); }
  if (body.capabilities !== undefined) {
    fields.push('capabilities = ?');
    values.push(JSON.stringify(body.capabilities));
  }
  if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
  if (body.reportsTo !== undefined) {
    fields.push('reports_to = ?');
    values.push(body.reportsTo);
  }
  if (body.adapterType !== undefined) {
    fields.push('adapter_type = ?');
    values.push(body.adapterType);
  }
  if (body.adapterConfig !== undefined) {
    fields.push('adapter_config = ?');
    values.push(JSON.stringify(body.adapterConfig));
  }
  if ('workingDirectory' in body) {
    fields.push('working_directory = ?');
    values.push(body.workingDirectory ?? null);
  }
  if ('projectId' in body) {
    fields.push('project_id = ?');
    values.push(body.projectId ?? null);
  }
  if (body.tags !== undefined) {
    fields.push('tags = ?');
    values.push(body.tags.join(','));
  }
  if (body.budgetMonthlyCents !== undefined) {
    fields.push('budget_monthly_cents = ?');
    values.push(body.budgetMonthlyCents);
  }
  if ('outputSchema' in body) {
    fields.push('output_schema = ?');
    values.push(body.outputSchema != null ? JSON.stringify(body.outputSchema) : null);
  }

  if (fields.length === 0) {
    return c.json({ agent: rowToAgent(existing) });
  }

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  run(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`, values);

  const updated = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);

  if (body.status) {
    broadcast({
      type: 'agent.status',
      data: { agentId: id, status: body.status },
    });
  }

  return c.json({ agent: rowToAgent(updated!) });
});

// DELETE /api/agents/:id
agentsRouter.delete('/api/agents/:id', requireRole('admin'), (c) => {
  const id = c.req.param('id');

  const existing = get(`SELECT id FROM agents WHERE id = ?`, [id]);

  if (!existing) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  run(`DELETE FROM agents WHERE id = ?`, [id]);

  return c.json({ success: true });
});

const wakeSchema = z.object({
  // Prompt is optional but capped at 10,000 chars to prevent abuse
  prompt: z.string().max(10_000, 'Prompt must be 10,000 characters or fewer').optional(),
  // source: used for chain wakes ('chain:{slug}') or 'manual'
  source: z.string().max(200).optional(),
  // chainDepth: increments with each chain hop (max 5)
  chainDepth: z.number().int().min(0).max(100).optional(),
});

// In-memory rate limit: agentId -> last wake timestamp (ms)
const wakeRateLimit = new Map<string, number>();
const WAKE_COOLDOWN_MS = 10_000; // 10 seconds
const MAX_CHAIN_DEPTH = 5;

// POST /api/agents/:id/wake — manual trigger (admin only)
agentsRouter.post('/api/agents/:id/wake', requireRole('admin'), async (c) => {
  const id = c.req.param('id') ?? '';

  const agent = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.status === 'running') {
    return c.json({ error: 'Agent is already running' }, 409);
  }

  // Budget check: reject if agent has exceeded monthly budget
  const budgetError = checkAgentBudget(id);
  if (budgetError) {
    return c.json({ error: budgetError, code: 'budget_exceeded' }, 402);
  }

  // Rate limit: prevent re-waking within 10 seconds
  const now_ms = Date.now();

  // Lazy pruning: clean stale entries when map grows large to prevent memory leak
  if (wakeRateLimit.size > 100) {
    for (const [key, timestamp] of wakeRateLimit) {
      if (now_ms - timestamp > 60_000) wakeRateLimit.delete(key);
    }
  }

  const lastWake = wakeRateLimit.get(id);
  if (lastWake !== undefined && now_ms - lastWake < WAKE_COOLDOWN_MS) {
    const retryAfter = Math.ceil((WAKE_COOLDOWN_MS - (now_ms - lastWake)) / 1000);
    return c.json(
      { error: 'Rate limit: agent was just woken. Please wait before waking again.', retryAfterSeconds: retryAfter },
      429
    );
  }
  wakeRateLimit.set(id, now_ms);

  // Parse optional body (may be empty)
  let bodyPrompt: string | undefined;
  let bodySource: string | undefined;
  let bodyChainDepth: number = 0;
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = wakeSchema.safeParse(raw);
    if (parsed.success) {
      bodyPrompt = parsed.data.prompt;
      bodySource = parsed.data.source;
      bodyChainDepth = parsed.data.chainDepth ?? 0;
    }
  } catch {
    // ignore body parse errors
  }

  // Chain depth guard
  if (bodyChainDepth >= MAX_CHAIN_DEPTH) {
    return c.json({
      error: `Chain depth limit reached (max ${MAX_CHAIN_DEPTH}). Cannot wake agent at depth ${bodyChainDepth}.`,
      chainDepth: bodyChainDepth,
    }, 429);
  }

  const runId = nanoid();
  const now = new Date().toISOString();
  const source = bodySource ?? 'manual';

  run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, chain_depth, created_at)
     VALUES (?, ?, ?, NULL, 'queued', ?, ?, ?, ?)`,
    [runId, agent.id, agent.company_id, agent.model, source, bodyChainDepth, now]
  );

  audit(agent.company_id, agent.id, 'agent.wake', { runId, source, prompt: bodyPrompt ?? null });

  const adapterConfig = (() => {
    try {
      return JSON.parse(agent.adapter_config) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  const prompt =
    bodyPrompt ??
    (adapterConfig['defaultPrompt'] as string | undefined) ??
    `You are ${agent.name}, ${agent.title}. Perform your next task.`;

  // Fire-and-forget
  spawnClaudeLocal({
    runId,
    agentId: agent.id,
    companyId: agent.company_id,
    model: agent.model,
    prompt,
    workingDirectory: agent.working_directory ?? null,
    adapterConfig,
    adapterType: agent.adapter_type,
    chainDepth: bodyChainDepth,
    sourceAgentSlug: source.startsWith('chain:') ? source.slice(6) : undefined,
  }).catch((err: unknown) => {
    console.error(`[wake] Adapter error for agent ${agent.id}:`, err);
  });

  return c.json({ run: { id: runId, agentId: id, status: 'queued', chainDepth: bodyChainDepth } }, 202);
});

// POST /api/agents/:id/pause — pause agent (stops scheduler from picking it up)
agentsRouter.post('/api/agents/:id/pause', requireRole('admin'), (c) => {
  const id = c.req.param('id');

  const existing = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);
  if (!existing) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (existing.status === 'paused') {
    return c.json({ error: 'Agent is already paused' }, 409);
  }

  const now = new Date().toISOString();
  run(`UPDATE agents SET status = 'paused', updated_at = ? WHERE id = ?`, [now, id]);

  audit(existing.company_id, id ?? null, 'agent.paused', { previousStatus: existing.status });

  broadcast({ type: 'agent.status', data: { agentId: id, status: 'paused' } });

  const updated = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);
  return c.json({ agent: rowToAgent(updated!) });
});

// POST /api/agents/:id/resume — resume paused/budget_exceeded agent
agentsRouter.post('/api/agents/:id/resume', requireRole('admin'), (c) => {
  const id = c.req.param('id');

  const existing = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);
  if (!existing) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (existing.status !== 'paused' && existing.status !== 'budget_exceeded') {
    return c.json({ error: 'Agent is not paused or budget_exceeded' }, 409);
  }

  const now = new Date().toISOString();
  run(`UPDATE agents SET status = 'idle', updated_at = ? WHERE id = ?`, [now, id]);

  audit(existing.company_id, id ?? null, 'agent.resumed', { previousStatus: existing.status });

  broadcast({ type: 'agent.status', data: { agentId: id, status: 'idle' } });

  const updated = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);
  return c.json({ agent: rowToAgent(updated!) });
});

// GET /api/agents/:id/context — get context capsule
agentsRouter.get('/api/agents/:id/context', (c) => {
  const id = c.req.param('id');

  const row = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);
  if (!row) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  return c.json({ capsule: row.context_capsule ?? '' });
});

const contextUpdateSchema = z.object({
  capsule: z.string().max(10_000, 'Context capsule must be 10,000 characters or fewer'),
});

// PUT /api/agents/:id/context — update context capsule
agentsRouter.put('/api/agents/:id/context', requireRole('admin'), zValidator('json', contextUpdateSchema), (c) => {
  const id = c.req.param('id');
  const { capsule } = c.req.valid('json');

  const existing = get<AgentRow>(`SELECT id FROM agents WHERE id = ?`, [id]);
  if (!existing) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const now = new Date().toISOString();
  run(`UPDATE agents SET context_capsule = ?, updated_at = ? WHERE id = ?`, [capsule, now, id]);

  return c.json({ capsule });
});

// DELETE /api/agents/:id/runs — bulk run cleanup
agentsRouter.delete('/api/agents/:id/runs', (c) => {
  const id = c.req.param('id');

  const existing = get(`SELECT id FROM agents WHERE id = ?`, [id]);
  if (!existing) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  const olderThan = c.req.query('olderThan');
  const statusFilter = c.req.query('status');

  const clauses: string[] = ['agent_id = ?'];
  const params: unknown[] = [id];

  if (olderThan) {
    // Parse duration like "30d", "7d", "0d"
    const match = olderThan.match(/^(\d+)d$/);
    if (!match) {
      return c.json({ error: 'Invalid olderThan format. Use e.g. "30d"' }, 400);
    }
    const days = parseInt(match[1], 10);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    clauses.push('created_at < ?');
    params.push(cutoff);
  }

  if (statusFilter) {
    clauses.push('status = ?');
    params.push(statusFilter);
  }

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total FROM runs WHERE ${clauses.join(' AND ')}`,
    params
  );
  const deleted = countRow?.total ?? 0;

  run(`DELETE FROM runs WHERE ${clauses.join(' AND ')}`, params);

  return c.json({ deleted });
});
