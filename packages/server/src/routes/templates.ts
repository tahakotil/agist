import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import { slugify } from '../workspace.js';
// Template interfaces (mirrors packages/shared/src/template.ts)
interface TemplateAgent {
  slug: string;
  name: string;
  role: string;
  title?: string;
  model: string;
  capabilities?: string;
  reports_to?: string;
  budget_monthly_cents?: number;
  context_capsule?: string;
}

interface TemplateRoutine {
  agent_slug: string;
  title: string;
  cron_expression: string;
  timezone?: string;
}

interface AgistTemplate {
  version: '1.0';
  name: string;
  description: string;
  author?: string;
  url?: string;
  company: {
    name: string;
    description?: string;
    budget_monthly_cents?: number;
  };
  agents: TemplateAgent[];
  routines: TemplateRoutine[];
}

export const templatesRouter = new Hono();

// ── Row types ─────────────────────────────────────────────────────────────────

interface CompanyRow {
  id: string;
  name: string;
  description: string;
  budget_monthly_cents: number;
}

interface AgentRow {
  id: string;
  name: string;
  slug: string | null;
  role: string;
  title: string;
  model: string;
  capabilities: string;
  reports_to: string | null;
  budget_monthly_cents: number;
  context_capsule: string;
}

interface RoutineRow {
  id: string;
  agent_id: string;
  title: string;
  cron_expression: string;
  timezone: string;
}

// ── Sensitive data scrubbing ──────────────────────────────────────────────────

function scrubSensitiveData(text: string): string {
  // Scrub IP addresses
  let scrubbed = text.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[REDACTED_IP]');
  // Scrub secrets (api keys, tokens, passwords, secrets)
  scrubbed = scrubbed.replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '[REDACTED]');
  return scrubbed;
}

// ── GET /api/companies/:cid/export ────────────────────────────────────────────

templatesRouter.get('/api/companies/:cid/export', (c) => {
  const cid = c.req.param('cid');

  const company = get<CompanyRow>(`SELECT id, name, description, budget_monthly_cents FROM companies WHERE id = ?`, [cid]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const agentRows = all<AgentRow>(
    `SELECT id, name, slug, role, title, model, capabilities, reports_to, budget_monthly_cents, context_capsule
     FROM agents WHERE company_id = ? ORDER BY created_at ASC`,
    [cid]
  );

  // Build a map of agent id -> slug for reports_to resolution
  const agentIdToSlug = new Map<string, string>();
  for (const row of agentRows) {
    const effectiveSlug = row.slug ?? slugify(row.name);
    agentIdToSlug.set(row.id, effectiveSlug);
  }

  const agents: TemplateAgent[] = agentRows.map((row) => {
    const effectiveSlug = row.slug ?? slugify(row.name);
    const capsule = row.context_capsule ? scrubSensitiveData(row.context_capsule) : undefined;

    // Parse capabilities (stored as JSON array)
    let capsStr: string | undefined;
    try {
      const parsed = JSON.parse(row.capabilities) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        capsStr = parsed.join(', ');
      }
    } catch {
      if (row.capabilities && row.capabilities.trim()) {
        capsStr = row.capabilities;
      }
    }

    const agent: TemplateAgent = {
      slug: effectiveSlug,
      name: row.name,
      role: row.role,
      model: row.model,
    };

    if (row.title) agent.title = row.title;
    if (capsStr) agent.capabilities = capsStr;
    if (row.reports_to) {
      const parentSlug = agentIdToSlug.get(row.reports_to);
      if (parentSlug) agent.reports_to = parentSlug;
    }
    if (row.budget_monthly_cents > 0) agent.budget_monthly_cents = row.budget_monthly_cents;
    if (capsule && capsule.trim()) agent.context_capsule = capsule;

    return agent;
  });

  const routineRows = all<RoutineRow & { agent_slug: string | null }>(
    `SELECT r.id, r.agent_id, r.title, r.cron_expression, r.timezone, a.slug as agent_slug
     FROM routines r
     LEFT JOIN agents a ON a.id = r.agent_id
     WHERE r.company_id = ? ORDER BY r.created_at ASC`,
    [cid]
  );

  const routines: TemplateRoutine[] = routineRows.map((row) => {
    const agentSlug = row.agent_slug ?? agentIdToSlug.get(row.agent_id) ?? row.agent_id;
    const routine: TemplateRoutine = {
      agent_slug: agentSlug,
      title: row.title,
      cron_expression: row.cron_expression,
    };
    if (row.timezone && row.timezone !== 'UTC') {
      routine.timezone = row.timezone;
    }
    return routine;
  });

  const template: AgistTemplate = {
    version: '1.0',
    name: company.name,
    description: company.description ?? '',
    company: {
      name: company.name,
      ...(company.description ? { description: company.description } : {}),
      ...(company.budget_monthly_cents > 0 ? { budget_monthly_cents: company.budget_monthly_cents } : {}),
    },
    agents,
    routines,
  };

  // Return as downloadable JSON
  c.header('Content-Disposition', `attachment; filename="${slugify(company.name)}-template.json"`);
  c.header('Content-Type', 'application/json');
  return c.body(JSON.stringify(template, null, 2));
});

// ── POST /api/companies/import ────────────────────────────────────────────────

templatesRouter.post('/api/companies/import', requireRole('admin'), async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  // Basic validation
  const template = body as Partial<AgistTemplate>;

  if (!template || typeof template !== 'object') {
    return c.json({ error: 'Invalid template: must be a JSON object' }, 400);
  }

  if (template.version !== '1.0') {
    return c.json({ error: `Invalid template version: expected "1.0", got "${String(template.version)}"` }, 400);
  }

  if (!template.company || typeof template.company !== 'object' || !template.company.name) {
    return c.json({ error: 'Invalid template: missing company.name' }, 400);
  }

  if (!Array.isArray(template.agents)) {
    return c.json({ error: 'Invalid template: agents must be an array' }, 400);
  }

  if (!Array.isArray(template.routines)) {
    return c.json({ error: 'Invalid template: routines must be an array' }, 400);
  }

  const now = new Date().toISOString();

  // 1. Create company
  const companyId = nanoid();
  run(
    `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, 0, ?, ?)`,
    [
      companyId,
      template.company.name,
      template.company.description ?? '',
      template.company.budget_monthly_cents ?? 0,
      now,
      now,
    ]
  );

  // 2. First pass: create all agents, collect slug -> id map
  const slugToId = new Map<string, string>();

  for (const agentDef of template.agents) {
    if (!agentDef.name || !agentDef.slug) {
      continue; // skip malformed agents
    }

    const agentId = nanoid();

    // Ensure slug is unique within company
    const baseSlug = agentDef.slug || slugify(agentDef.name);
    let slug = baseSlug;
    let counter = 1;
    while (get(`SELECT id FROM agents WHERE company_id = ? AND slug = ?`, [companyId, slug])) {
      slug = `${baseSlug}-${counter++}`;
    }

    // Parse capabilities string into JSON array
    const capsArr: string[] = agentDef.capabilities
      ? agentDef.capabilities.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    run(
      `INSERT INTO agents (id, company_id, name, slug, role, title, model, capabilities, status,
       reports_to, adapter_type, adapter_config, working_directory, project_id, tags,
       context_capsule, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', NULL, 'claude-cli', '{}', NULL, NULL, '', ?, ?, 0, ?, ?)`,
      [
        agentId,
        companyId,
        agentDef.name,
        slug,
        agentDef.role || 'general',
        agentDef.title ?? '',
        agentDef.model || 'claude-opus-4-5',
        JSON.stringify(capsArr),
        agentDef.context_capsule ?? '',
        agentDef.budget_monthly_cents ?? 0,
        now,
        now,
      ]
    );

    slugToId.set(agentDef.slug, agentId);
  }

  // 3. Second pass: set reports_to relationships
  for (const agentDef of template.agents) {
    if (!agentDef.slug || !agentDef.reports_to) continue;

    const agentId = slugToId.get(agentDef.slug);
    const parentId = slugToId.get(agentDef.reports_to);

    if (agentId && parentId) {
      run(`UPDATE agents SET reports_to = ? WHERE id = ?`, [parentId, agentId]);
    }
  }

  // 4. Create routines (disabled by default for safety)
  for (const routineDef of template.routines) {
    if (!routineDef.agent_slug || !routineDef.title || !routineDef.cron_expression) {
      continue; // skip malformed routines
    }

    const agentId = slugToId.get(routineDef.agent_slug);
    if (!agentId) continue; // skip if agent not found

    const routineId = nanoid();
    run(
      `INSERT INTO routines (id, company_id, agent_id, title, description, cron_expression,
       timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', ?, ?, 0, NULL, NULL, ?, ?)`,
      [
        routineId,
        companyId,
        agentId,
        routineDef.title,
        routineDef.cron_expression,
        routineDef.timezone ?? 'UTC',
        now,
        now,
      ]
    );
  }

  return c.json({ companyId }, 201);
});
