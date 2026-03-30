import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';

export const projectsRouter = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).default(''),
  workingDirectory: z.string().max(500).nullable().optional(),
});

const updateSchema = createSchema.partial();

interface ProjectRow {
  id: string;
  company_id: string;
  name: string;
  description: string;
  working_directory: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow, agentCount = 0) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    workingDirectory: row.working_directory ?? null,
    agentCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/companies/:companyId/projects
projectsRouter.get('/api/companies/:companyId/projects', (c) => {
  const companyId = c.req.param('companyId');

  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const rows = all<ProjectRow & { agent_count: number }>(
    `SELECT p.*, COUNT(a.id) as agent_count
     FROM projects p
     LEFT JOIN agents a ON a.project_id = p.id
     WHERE p.company_id = ?
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [companyId]
  );

  return c.json({
    projects: rows.map((r) => rowToProject(r, r.agent_count ?? 0)),
  });
});

// POST /api/companies/:companyId/projects
projectsRouter.post(
  '/api/companies/:companyId/projects',
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
      `INSERT INTO projects (id, company_id, name, description, working_directory, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        body.name,
        body.description,
        body.workingDirectory ?? null,
        now,
        now,
      ]
    );

    const row = get<ProjectRow>(`SELECT * FROM projects WHERE id = ?`, [id]);

    return c.json({ project: rowToProject(row!) }, 201);
  }
);

// GET /api/projects/:id
projectsRouter.get('/api/projects/:id', (c) => {
  const id = c.req.param('id');

  const rows = all<ProjectRow & { agent_count: number }>(
    `SELECT p.*, COUNT(a.id) as agent_count
     FROM projects p
     LEFT JOIN agents a ON a.project_id = p.id
     WHERE p.id = ?
     GROUP BY p.id`,
    [id]
  );
  const row = rows[0];

  if (!row) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json({ project: rowToProject(row, row.agent_count ?? 0) });
});

// PATCH /api/projects/:id
projectsRouter.patch(
  '/api/projects/:id',
  zValidator('json', updateSchema),
  (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = get<ProjectRow>(`SELECT * FROM projects WHERE id = ?`, [id]);
    if (!existing) {
      return c.json({ error: 'Project not found' }, 404);
    }

    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
    if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description); }
    if ('workingDirectory' in body) {
      fields.push('working_directory = ?');
      values.push(body.workingDirectory ?? null);
    }

    if (fields.length === 0) {
      return c.json({ project: rowToProject(existing) });
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = get<ProjectRow>(`SELECT * FROM projects WHERE id = ?`, [id]);

    return c.json({ project: rowToProject(updated!) });
  }
);

// DELETE /api/projects/:id
projectsRouter.delete('/api/projects/:id', (c) => {
  const id = c.req.param('id');

  const existing = get(`SELECT id FROM projects WHERE id = ?`, [id]);
  if (!existing) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Cascade: set null on agents, routines (FK ON DELETE SET NULL handles this)
  run(`DELETE FROM projects WHERE id = ?`, [id]);

  return c.json({ success: true });
});
