import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';

export const companiesRouter = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  budgetMonthlyCents: z.number().int().min(0).default(0),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

const updateSchema = createSchema.partial();

interface CompanyRow {
  id: string;
  name: string;
  description: string;
  status: string;
  budget_monthly_cents: number;
  spent_monthly_cents: number;
  created_at: string;
  updated_at: string;
}

function rowToCompany(row: CompanyRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    budgetMonthlyCents: row.budget_monthly_cents,
    spentMonthlyCents: row.spent_monthly_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/companies
companiesRouter.get('/api/companies', (c) => {
  const rows = all<CompanyRow>(`SELECT * FROM companies ORDER BY created_at DESC`);

  return c.json({ companies: rows.map(rowToCompany) });
});

// POST /api/companies
companiesRouter.post(
  '/api/companies',
  zValidator('json', createSchema),
  (c) => {
    const body = c.req.valid('json');
    const now = new Date().toISOString();
    const id = nanoid();

    run(
      `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, body.name, body.description, body.status, body.budgetMonthlyCents, now, now]
    );

    const row = get<CompanyRow>(`SELECT * FROM companies WHERE id = ?`, [id]);

    return c.json({ company: rowToCompany(row!) }, 201);
  }
);

// GET /api/companies/:id
companiesRouter.get('/api/companies/:id', (c) => {
  const id = c.req.param('id');
  const row = get<CompanyRow>(`SELECT * FROM companies WHERE id = ?`, [id]);

  if (!row) {
    return c.json({ error: 'Company not found' }, 404);
  }

  return c.json({ company: rowToCompany(row) });
});

// PATCH /api/companies/:id
companiesRouter.patch(
  '/api/companies/:id',
  zValidator('json', updateSchema),
  (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = get<CompanyRow>(`SELECT * FROM companies WHERE id = ?`, [id]);

    if (!existing) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const now = new Date().toISOString();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      fields.push('name = ?');
      values.push(body.name);
    }
    if (body.description !== undefined) {
      fields.push('description = ?');
      values.push(body.description);
    }
    if (body.status !== undefined) {
      fields.push('status = ?');
      values.push(body.status);
    }
    if (body.budgetMonthlyCents !== undefined) {
      fields.push('budget_monthly_cents = ?');
      values.push(body.budgetMonthlyCents);
    }

    if (fields.length === 0) {
      return c.json({ company: rowToCompany(existing) });
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    run(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = get<CompanyRow>(`SELECT * FROM companies WHERE id = ?`, [id]);

    return c.json({ company: rowToCompany(updated!) });
  }
);

// DELETE /api/companies/:id
companiesRouter.delete('/api/companies/:id', (c) => {
  const id = c.req.param('id');

  const existing = get(`SELECT id FROM companies WHERE id = ?`, [id]);

  if (!existing) {
    return c.json({ error: 'Company not found' }, 404);
  }

  run(`DELETE FROM companies WHERE id = ?`, [id]);

  return c.json({ success: true });
});
