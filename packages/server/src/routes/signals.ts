import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { broadcast } from '../sse.js';
import { requireRole } from '../middleware/rbac.js';

export const signalsRouter = new Hono();

const VALID_SIGNAL_TYPES = [
  'product-update',
  'social-proof',
  'seo-tactic',
  'market-trend',
  'alert',
  'kpi-change',
] as const;

const createSchema = z.object({
  source_agent_id: z.string().min(1),
  signal_type: z.enum(VALID_SIGNAL_TYPES),
  title: z.string().min(1).max(500),
  payload: z.record(z.unknown()).optional().default({}),
});

const consumeSchema = z.object({
  agent_id: z.string().min(1),
});

interface SignalRow {
  id: string;
  company_id: string;
  source_agent_id: string;
  source_agent_name: string;
  signal_type: string;
  title: string;
  payload: string;
  consumed_by: string;
  created_at: string;
}

function rowToSignal(row: SignalRow) {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  let consumedBy: string[] = [];
  try {
    consumedBy = JSON.parse(row.consumed_by) as string[];
  } catch {
    consumedBy = [];
  }

  return {
    id: row.id,
    companyId: row.company_id,
    sourceAgentId: row.source_agent_id,
    sourceAgentName: row.source_agent_name,
    signalType: row.signal_type,
    title: row.title,
    payload,
    consumedBy,
    createdAt: row.created_at,
  };
}

// POST /api/companies/:cid/signals — create a signal
signalsRouter.post(
  '/api/companies/:cid/signals',
  requireRole('admin'),
  zValidator('json', createSchema),
  (c) => {
    const companyId = c.req.param('cid');
    const body = c.req.valid('json');

    const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const agentRow = get<{ name: string }>(
      `SELECT name FROM agents WHERE id = ? AND company_id = ?`,
      [body.source_agent_id, companyId]
    );
    if (!agentRow) {
      return c.json({ error: 'Source agent not found in this company' }, 404);
    }

    const id = nanoid();
    const payloadStr = JSON.stringify(body.payload ?? {});

    run(
      `INSERT INTO signals (id, company_id, source_agent_id, source_agent_name, signal_type, title, payload, consumed_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '[]', datetime('now'))`,
      [id, companyId, body.source_agent_id, agentRow.name, body.signal_type, body.title, payloadStr]
    );

    const row = get<SignalRow>(`SELECT * FROM signals WHERE id = ?`, [id]);
    const signal = rowToSignal(row!);

    broadcast({
      type: 'signal.created',
      data: signal as unknown as Record<string, unknown>,
    });

    return c.json({ signal }, 201);
  }
);

// GET /api/companies/:cid/signals — list signals
signalsRouter.get('/api/companies/:cid/signals', (c) => {
  const companyId = c.req.param('cid');

  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const type = c.req.query('type');
  const since = c.req.query('since');
  const limitParam = c.req.query('limit');
  const limit = Math.min(parseInt(limitParam ?? '50', 10) || 50, 200);

  const clauses: string[] = ['company_id = ?'];
  const params: unknown[] = [companyId];

  if (type) {
    clauses.push(`signal_type = ?`);
    params.push(type);
  }
  if (since) {
    clauses.push(`created_at > ?`);
    params.push(since);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;

  const rows = all<SignalRow>(
    `SELECT * FROM signals ${where} ORDER BY created_at DESC LIMIT ?`,
    [...params, limit]
  );

  return c.json({ signals: rows.map(rowToSignal) });
});

// GET /api/companies/:cid/signals/unconsumed/:agentId — unconsumed signals for an agent
signalsRouter.get('/api/companies/:cid/signals/unconsumed/:agentId', (c) => {
  const companyId = c.req.param('cid');
  const agentId = c.req.param('agentId');

  const company = get(`SELECT id FROM companies WHERE id = ?`, [companyId]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  // Use LIKE to find signals not yet consumed by this agent
  // consumed_by is a JSON array like ["agent-id-1","agent-id-2"]
  const rows = all<SignalRow>(
    `SELECT * FROM signals
     WHERE company_id = ?
       AND consumed_by NOT LIKE ?
       AND created_at > datetime('now', '-24 hours')
     ORDER BY created_at DESC LIMIT 10`,
    [companyId, `%"${agentId}"%`]
  );

  return c.json({ signals: rows.map(rowToSignal) });
});

// POST /api/companies/:cid/signals/:id/consume — mark signal consumed by agent
signalsRouter.post(
  '/api/companies/:cid/signals/:id/consume',
  zValidator('json', consumeSchema),
  (c) => {
    const companyId = c.req.param('cid');
    const signalId = c.req.param('id');
    const body = c.req.valid('json');

    const row = get<SignalRow>(
      `SELECT * FROM signals WHERE id = ? AND company_id = ?`,
      [signalId, companyId]
    );
    if (!row) {
      return c.json({ error: 'Signal not found' }, 404);
    }

    let consumedBy: string[] = [];
    try {
      consumedBy = JSON.parse(row.consumed_by) as string[];
    } catch {
      consumedBy = [];
    }

    if (!consumedBy.includes(body.agent_id)) {
      consumedBy.push(body.agent_id);
      run(
        `UPDATE signals SET consumed_by = ? WHERE id = ?`,
        [JSON.stringify(consumedBy), signalId]
      );
    }

    const updated = get<SignalRow>(`SELECT * FROM signals WHERE id = ?`, [signalId]);
    return c.json({ signal: rowToSignal(updated!) });
  }
);
