import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { broadcast } from '../sse.js';

export const issuesRouter = new Hono();

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).default(''),
  status: z
    .enum(['open', 'in_progress', 'resolved', 'closed', 'wont_fix'])
    .default('open'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  agentId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial();

interface IssueRow {
  id: string;
  company_id: string;
  project_id: string | null;
  agent_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

function rowToIssue(row: IssueRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    agentId: row.agent_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/companies/:companyId/issues
issuesRouter.get('/api/companies/:companyId/issues', (c) => {
  const companyId = c.req.param('companyId');

  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const status = c.req.query('status');
  const priority = c.req.query('priority');
  const agentId = c.req.query('agentId');

  let query = `SELECT * FROM issues WHERE company_id = ?`;
  const params: unknown[] = [companyId];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }
  if (priority) {
    query += ` AND priority = ?`;
    params.push(priority);
  }
  if (agentId) {
    query += ` AND agent_id = ?`;
    params.push(agentId);
  }

  query += ` ORDER BY
    CASE priority
      WHEN 'critical' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
      ELSE 4
    END,
    created_at DESC`;

  const rows = all<IssueRow>(query, params);

  return c.json({ issues: rows.map(rowToIssue) });
});

// POST /api/companies/:companyId/issues
issuesRouter.post(
  '/api/companies/:companyId/issues',
  zValidator('json', createSchema),
  (c) => {
    const companyId = c.req.param('companyId');
    const body = c.req.valid('json');

    const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    if (body.agentId) {
      const agent = get(
        `SELECT id FROM agents WHERE id = ? AND company_id = ?`,
        [body.agentId, companyId]
      );
      if (!agent) {
        return c.json({ error: 'Agent not found in this company' }, 404);
      }
    }

    const now = new Date().toISOString();
    const id = nanoid();

    run(
      `INSERT INTO issues (id, company_id, project_id, agent_id, title, description,
       status, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        body.projectId ?? null,
        body.agentId ?? null,
        body.title,
        body.description,
        body.status,
        body.priority,
        now,
        now,
      ]
    );

    const row = get<IssueRow>(`SELECT * FROM issues WHERE id = ?`, [id]);

    broadcast({
      type: 'issue.created',
      data: rowToIssue(row!) as unknown as Record<string, unknown>,
    });

    return c.json({ issue: rowToIssue(row!) }, 201);
  }
);

// GET /api/issues/:id
issuesRouter.get('/api/issues/:id', (c) => {
  const id = c.req.param('id');
  const row = get<IssueRow>(`SELECT * FROM issues WHERE id = ?`, [id]);

  if (!row) {
    return c.json({ error: 'Issue not found' }, 404);
  }

  return c.json({ issue: rowToIssue(row) });
});

// PATCH /api/issues/:id
issuesRouter.patch(
  '/api/issues/:id',
  zValidator('json', updateSchema),
  (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = get<IssueRow>(`SELECT * FROM issues WHERE id = ?`, [id]);

    if (!existing) {
      return c.json({ error: 'Issue not found' }, 404);
    }

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.title !== undefined) { fields.push('title = ?'); values.push(body.title); }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description);
    }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
    if (body.priority !== undefined) {
      fields.push('priority = ?');
      values.push(body.priority);
    }
    if (body.agentId !== undefined) {
      fields.push('agent_id = ?');
      values.push(body.agentId);
    }
    if (body.projectId !== undefined) {
      fields.push('project_id = ?');
      values.push(body.projectId);
    }

    if (fields.length === 0) {
      return c.json({ issue: rowToIssue(existing) });
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    run(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = get<IssueRow>(`SELECT * FROM issues WHERE id = ?`, [id]);

    broadcast({
      type: 'issue.updated',
      data: rowToIssue(updated!) as unknown as Record<string, unknown>,
    });

    return c.json({ issue: rowToIssue(updated!) });
  }
);

// DELETE /api/issues/:id
issuesRouter.delete('/api/issues/:id', (c) => {
  const id = c.req.param('id');

  const existing = get(`SELECT id FROM issues WHERE id = ?`, [id]);

  if (!existing) {
    return c.json({ error: 'Issue not found' }, 404);
  }

  run(`DELETE FROM issues WHERE id = ?`, [id]);

  return c.json({ success: true });
});
