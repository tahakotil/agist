import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { spawnClaudeLocal } from '../adapter.js';
import { broadcast } from '../sse.js';

export const agentsRouter = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().min(1).default('worker'),
  title: z.string().max(200).default(''),
  model: z.string().default('claude-opus-4-5'),
  capabilities: z.array(z.string()).default([]),
  reportsTo: z.string().nullable().optional(),
  adapterType: z.enum(['claude_local']).default('claude_local'),
  adapterConfig: z.record(z.unknown()).default({}),
  budgetMonthlyCents: z.number().int().min(0).default(0),
  status: z
    .enum(['idle', 'running', 'paused', 'error'])
    .default('idle'),
});

const updateSchema = createSchema.partial();

interface AgentRow {
  id: string;
  company_id: string;
  name: string;
  role: string;
  title: string;
  model: string;
  capabilities: string;
  status: string;
  reports_to: string | null;
  adapter_type: string;
  adapter_config: string;
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
    budgetMonthlyCents: row.budget_monthly_cents,
    spentMonthlyCents: row.spent_monthly_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/agents — list ALL agents across all companies with company name
agentsRouter.get('/api/agents', (c) => {
  const rows = all<AgentRow & { company_name: string }>(
    `SELECT a.*, c.name as company_name
     FROM agents a
     LEFT JOIN companies c ON c.id = a.company_id
     ORDER BY a.created_at DESC`
  );

  return c.json({
    agents: rows.map((row) => ({
      ...rowToAgent(row),
      companyName: row.company_name ?? '',
    })),
  });
});

// GET /api/companies/:companyId/agents
agentsRouter.get('/api/companies/:companyId/agents', (c) => {
  const companyId = c.req.param('companyId');

  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const rows = all<AgentRow>(
    `SELECT * FROM agents WHERE company_id = ? ORDER BY created_at ASC`,
    [companyId]
  );

  return c.json({ agents: rows.map(rowToAgent) });
});

// POST /api/companies/:companyId/agents
agentsRouter.post(
  '/api/companies/:companyId/agents',
  zValidator('json', createSchema),
  (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');

    const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const now = new Date().toISOString();
    const id = nanoid();

    run(
      `INSERT INTO agents (id, company_id, name, role, title, model, capabilities, status,
       reports_to, adapter_type, adapter_config, budget_monthly_cents, spent_monthly_cents,
       created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        companyId,
        body.name,
        body.role,
        body.title,
        body.model,
        JSON.stringify(body.capabilities),
        body.status,
        body.reportsTo ?? null,
        body.adapterType,
        JSON.stringify(body.adapterConfig),
        body.budgetMonthlyCents,
        now,
        now,
      ]
    );

    const row = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);

    return c.json({ agent: rowToAgent(row!) }, 201);
  }
);

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
agentsRouter.patch('/api/agents/:id', zValidator('json', updateSchema), (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);

  if (!existing) {
    return c.json({ error: 'Agent not found' }, 404);
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
  if (body.budgetMonthlyCents !== undefined) {
    fields.push('budget_monthly_cents = ?');
    values.push(body.budgetMonthlyCents);
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
agentsRouter.delete('/api/agents/:id', (c) => {
  const id = c.req.param('id');

  const existing = get(`SELECT id FROM agents WHERE id = ?`, [id]);

  if (!existing) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  run(`DELETE FROM agents WHERE id = ?`, [id]);

  return c.json({ success: true });
});

const wakeSchema = z.object({
  prompt: z.string().optional(),
});

// POST /api/agents/:id/wake — manual trigger
agentsRouter.post('/api/agents/:id/wake', async (c) => {
  const id = c.req.param('id');

  const agent = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [id]);

  if (!agent) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  if (agent.status === 'running') {
    return c.json({ error: 'Agent is already running' }, 409);
  }

  // Parse optional body (may be empty)
  let bodyPrompt: string | undefined;
  try {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = wakeSchema.safeParse(raw);
    if (parsed.success) bodyPrompt = parsed.data.prompt;
  } catch {
    // ignore body parse errors
  }

  const runId = nanoid();
  const now = new Date().toISOString();

  run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, created_at)
     VALUES (?, ?, ?, NULL, 'queued', ?, 'manual', ?)`,
    [runId, agent.id, agent.company_id, agent.model, now]
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
    adapterConfig,
  }).catch((err: unknown) => {
    console.error(`[wake] Adapter error for agent ${agent.id}:`, err);
  });

  return c.json({ run: { id: runId, agentId: id, status: 'queued' } }, 202);
});
