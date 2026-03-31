/**
 * Daily Digest API Routes
 *
 * GET  /api/companies/:cid/digest           — today's digest (or latest)
 * GET  /api/companies/:cid/digest/:date     — specific date (YYYY-MM-DD)
 * POST /api/companies/:cid/digest/generate  — manual trigger for today
 * GET  /api/companies/:cid/digest/range     — date range (?from=&to=)
 */

import { Hono } from 'hono';
import { get, all } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import { generateDigest, type DailyDigest } from '../digest/generate-digest.js';
import { logger } from '../logger.js';

export const digestRouter = new Hono();

interface DigestRow {
  id: string;
  company_id: string;
  date: string;
  content: string;
  created_at: string;
}

function rowToDigest(row: DigestRow): DailyDigest {
  try {
    return JSON.parse(row.content) as DailyDigest;
  } catch {
    // Return a minimal valid digest if content is corrupted
    return {
      id: row.id,
      date: row.date,
      companyId: row.company_id,
      summary: {
        totalRuns: 0,
        successful: 0,
        failed: 0,
        totalCostUsd: 0,
        totalTokens: { input: 0, output: 0 },
      },
      byAgent: [],
      actionItems: [],
      budgetStatus: {
        spentToday: 0,
        spentMonth: 0,
        limitMonth: 0,
        burnRate: 'on track',
      },
      pendingApprovals: 0,
      createdAt: row.created_at,
    };
  }
}

// Validate YYYY-MM-DD format
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// GET /api/companies/:cid/digest — today's digest or the latest available
digestRouter.get('/api/companies/:cid/digest', async (c) => {
  const cid = c.req.param('cid');
  if (!cid) {
    return c.json({ error: 'Company ID required' }, 400);
  }

  const company = get(`SELECT id FROM companies WHERE id = ?`, [cid]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Try today first, then fall back to most recent
  const row = get<DigestRow>(
    `SELECT * FROM digests WHERE company_id = ? AND date = ?`,
    [cid, today]
  );

  if (row) {
    return c.json({ digest: rowToDigest(row) });
  }

  // No digest for today — return latest if available
  const latest = get<DigestRow>(
    `SELECT * FROM digests WHERE company_id = ? ORDER BY date DESC LIMIT 1`,
    [cid]
  );

  if (!latest) {
    return c.json({ digest: null });
  }

  return c.json({ digest: rowToDigest(latest) });
});

// GET /api/companies/:cid/digest/range — date range
digestRouter.get('/api/companies/:cid/digest/range', async (c) => {
  const cid = c.req.param('cid');
  if (!cid) {
    return c.json({ error: 'Company ID required' }, 400);
  }
  const from = c.req.query('from');
  const to = c.req.query('to') ?? new Date().toISOString().slice(0, 10);

  const company = get(`SELECT id FROM companies WHERE id = ?`, [cid]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  if (!from || !isValidDate(from) || !isValidDate(to)) {
    return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
  }

  const rows = all<DigestRow>(
    `SELECT * FROM digests WHERE company_id = ? AND date >= ? AND date <= ? ORDER BY date DESC`,
    [cid, from, to]
  );

  return c.json({ digests: rows.map(rowToDigest) });
});

// GET /api/companies/:cid/digest/:date — specific date
digestRouter.get('/api/companies/:cid/digest/:date', async (c) => {
  const cid = c.req.param('cid');
  if (!cid) {
    return c.json({ error: 'Company ID required' }, 400);
  }
  const date = c.req.param('date');

  if (!isValidDate(date)) {
    return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400);
  }

  const company = get(`SELECT id FROM companies WHERE id = ?`, [cid]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const row = get<DigestRow>(
    `SELECT * FROM digests WHERE company_id = ? AND date = ?`,
    [cid, date]
  );

  if (!row) {
    return c.json({ digest: null });
  }

  return c.json({ digest: rowToDigest(row) });
});

// POST /api/companies/:cid/digest/generate — manual trigger
digestRouter.post(
  '/api/companies/:cid/digest/generate',
  requireRole('admin'),
  async (c) => {
    const cid = c.req.param('cid');
    if (!cid) {
      return c.json({ error: 'Company ID required' }, 400);
    }

    const company = get(`SELECT id FROM companies WHERE id = ?`, [cid]);
    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const today = new Date().toISOString().slice(0, 10);

    try {
      const digest = await generateDigest(cid, today);
      return c.json({ digest }, 201);
    } catch (err) {
      logger.error('digest/generate: failed', { companyId: cid, error: String(err) });
      return c.json({ error: 'Failed to generate digest' }, 500);
    }
  }
);
