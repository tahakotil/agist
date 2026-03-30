import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { CronExpressionParser } from 'cron-parser';
import { all, get, run } from '../db.js';
import { getPaginationParams, paginatedResponse } from '../utils/pagination.js';
import { requireRole } from '../middleware/rbac.js';

export const routinesRouter = new Hono();

const createSchema = z.object({
  agentId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(''),
  cronExpression: z.string().min(1),
  timezone: z.string().default('UTC'),
  enabled: z.boolean().default(true),
});

const updateSchema = z.object({
  agentId: z.string().min(1).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  cronExpression: z.string().min(1).optional(),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
});

interface RoutineRow {
  id: string;
  company_id: string;
  agent_id: string;
  title: string;
  description: string;
  cron_expression: string;
  timezone: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRoutine(row: RoutineRow & { company_name?: string; agent_name?: string }) {
  return {
    id: row.id,
    companyId: row.company_id,
    agentId: row.agent_id,
    title: row.title,
    description: row.description,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.company_name !== undefined ? { companyName: row.company_name } : {}),
    ...(row.agent_name !== undefined ? { agentName: row.agent_name } : {}),
  };
}

function computeNextRunAt(cronExpression: string, timezone: string): string | null {
  try {
    const expr = CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: new Date(),
    });
    return expr.next().toISOString();
  } catch {
    return null;
  }
}

function validateCron(expr: string): boolean {
  try {
    CronExpressionParser.parse(expr);
    return true;
  } catch {
    return false;
  }
}

// GET /api/routines — Global routines list across all companies
routinesRouter.get('/api/routines', (c) => {
  const { page, limit, offset } = getPaginationParams(c);
  const enabledParam = c.req.query('enabled');
  const agentId = c.req.query('agentId');

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (enabledParam !== undefined) {
    clauses.push('r.enabled = ?');
    params.push(enabledParam === 'true' ? 1 : 0);
  }
  if (agentId) {
    clauses.push('r.agent_id = ?');
    params.push(agentId);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total FROM routines r ${where}`,
    params
  );
  const total = countRow?.total ?? 0;

  const rows = all<RoutineRow & { company_name: string; agent_name: string }>(
    `SELECT r.*, c.name as company_name, a.name as agent_name
     FROM routines r
     LEFT JOIN companies c ON c.id = r.company_id
     LEFT JOIN agents a ON a.id = r.agent_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({ routines: rows.map(rowToRoutine), pagination });
});

// GET /api/companies/:companyId/routines
routinesRouter.get('/api/companies/:companyId/routines', (c) => {
  const companyId = c.req.param('companyId');

  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const { page, limit, offset } = getPaginationParams(c);
  const enabledParam = c.req.query('enabled');
  const agentId = c.req.query('agentId');

  const clauses: string[] = ['r.company_id = ?'];
  const params: unknown[] = [companyId];

  if (enabledParam !== undefined) {
    clauses.push('r.enabled = ?');
    params.push(enabledParam === 'true' ? 1 : 0);
  }
  if (agentId) {
    clauses.push('r.agent_id = ?');
    params.push(agentId);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total FROM routines r ${where}`,
    params
  );
  const total = countRow?.total ?? 0;

  const rows = all<RoutineRow>(
    `SELECT r.* FROM routines r ${where} ORDER BY r.created_at ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({ routines: rows.map(rowToRoutine), pagination });
});

// POST /api/companies/:companyId/routines
routinesRouter.post(
  '/api/companies/:companyId/routines',
  requireRole('admin'),
  zValidator('json', createSchema),
  (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');

    const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const agent = get(
      `SELECT id FROM agents WHERE id = ? AND company_id = ?`,
      [body.agentId, companyId]
    );
    if (!agent) {
      return c.json({ error: 'Agent not found in this company' }, 404);
    }

    if (!validateCron(body.cronExpression)) {
      return c.json({ error: 'Invalid cron expression' }, 422);
    }

    const now = new Date().toISOString();
    const id = nanoid();
    const nextRunAt = body.enabled
      ? computeNextRunAt(body.cronExpression, body.timezone)
      : null;

    run(
      `INSERT INTO routines (id, company_id, agent_id, title, description, cron_expression,
       timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      [
        id,
        companyId,
        body.agentId,
        body.title,
        body.description,
        body.cronExpression,
        body.timezone,
        body.enabled ? 1 : 0,
        nextRunAt,
        now,
        now,
      ]
    );

    const row = get<RoutineRow>(`SELECT * FROM routines WHERE id = ?`, [id]);

    return c.json({ routine: rowToRoutine(row!) }, 201);
  }
);

// PATCH /api/routines/:id
routinesRouter.patch(
  '/api/routines/:id',
  requireRole('admin'),
  zValidator('json', updateSchema),
  (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = get<RoutineRow>(`SELECT * FROM routines WHERE id = ?`, [id]);

    if (!existing) {
      return c.json({ error: 'Routine not found' }, 404);
    }

    if (body.cronExpression && !validateCron(body.cronExpression)) {
      return c.json({ error: 'Invalid cron expression' }, 422);
    }

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.agentId !== undefined) {
      // Verify agent belongs to same company
      const agent = get(
        `SELECT id FROM agents WHERE id = ? AND company_id = ?`,
        [body.agentId, existing.company_id]
      );
      if (!agent) {
        return c.json({ error: 'Agent not found in this company' }, 404);
      }
      fields.push('agent_id = ?');
      values.push(body.agentId);
    }
    if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title); }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description);
    }
    if (body.timezone !== undefined) {
      fields.push('timezone = ?');
      values.push(body.timezone);
    }
    if (body.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(body.enabled ? 1 : 0);
    }

    // Recompute next_run_at if cron or enabled changed
    const newCron = body.cronExpression ?? existing.cron_expression;
    const newTimezone = body.timezone ?? existing.timezone;
    const newEnabled =
      body.enabled !== undefined ? body.enabled : existing.enabled === 1;

    if (body.cronExpression !== undefined) {
      fields.push('cron_expression = ?');
      values.push(newCron);
    }

    if (
      body.cronExpression !== undefined ||
      body.timezone !== undefined ||
      body.enabled !== undefined
    ) {
      const nextRunAt = newEnabled
        ? computeNextRunAt(newCron, newTimezone)
        : null;
      fields.push('next_run_at = ?');
      values.push(nextRunAt);
    }

    if (fields.length === 0) {
      return c.json({ routine: rowToRoutine(existing) });
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    run(`UPDATE routines SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = get<RoutineRow>(`SELECT * FROM routines WHERE id = ?`, [id]);

    return c.json({ routine: rowToRoutine(updated!) });
  }
);

// DELETE /api/routines/:id
routinesRouter.delete('/api/routines/:id', requireRole('admin'), (c) => {
  const id = c.req.param('id');

  const existing = get(`SELECT id FROM routines WHERE id = ?`, [id]);

  if (!existing) {
    return c.json({ error: 'Routine not found' }, 404);
  }

  run(`DELETE FROM routines WHERE id = ?`, [id]);

  return c.json({ success: true });
});
