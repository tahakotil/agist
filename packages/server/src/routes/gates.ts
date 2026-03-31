import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { all, get, run } from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import { getPaginationParams, paginatedResponse } from '../utils/pagination.js';
import { audit } from '../audit.js';

/**
 * Auto-create an approval gate based on agent permission mode and action type.
 * Returns the gate ID if created, null if not needed.
 *
 * Only creates a gate when:
 * 1. The agent is in 'supervised' permission mode
 * 2. The action is considered destructive (deploy, delete, budget_change)
 */
export function autoCreateGate(
  companyId: string,
  agentId: string,
  agentName: string,
  action: string,
  description: string
): string | null {
  // Check if agent is in supervised mode (column may not exist yet on older DBs)
  const agent = get<{ permission_mode: string | null }>(
    `SELECT permission_mode FROM agents WHERE id = ?`,
    [agentId]
  );

  if (!agent) return null;

  // Default to 'supervised' if column is absent (null)
  const mode = agent.permission_mode ?? 'supervised';
  if (mode !== 'supervised') return null;

  const destructiveActions = ['deploy', 'delete', 'budget_change'];
  if (!destructiveActions.includes(action)) return null;

  const gateId = nanoid();
  const now = new Date().toISOString();
  run(
    `INSERT INTO approval_gates (id, company_id, agent_id, gate_type, title, description, payload, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '{}', 'pending', ?)`,
    [gateId, companyId, agentId, action, `Auto-gate: ${agentName} — ${action}`, description, now]
  );

  return gateId;
}

const CreateApprovalGateSchema = z.object({
  agentId: z.string().min(1),
  gateType: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).default(''),
  payload: z.record(z.unknown()).default({}),
});

const DecideApprovalGateSchema = z.object({
  decidedBy: z.string().max(200).default('human'),
});

export const gatesRouter = new Hono();

interface GateRow {
  id: string;
  company_id: string;
  agent_id: string;
  gate_type: string;
  title: string;
  description: string;
  payload: string;
  status: string;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
}

function rowToGate(row: GateRow, agentName?: string) {
  return {
    id: row.id,
    companyId: row.company_id,
    agentId: row.agent_id,
    agentName: agentName ?? null,
    gateType: row.gate_type,
    title: row.title,
    description: row.description,
    payload: (() => {
      try { return JSON.parse(row.payload) as Record<string, unknown>; }
      catch { return {}; }
    })(),
    status: row.status,
    decidedAt: row.decided_at ?? null,
    decidedBy: row.decided_by ?? 'human',
    createdAt: row.created_at,
  };
}

// GET /api/companies/:cid/gates — list gates (?status=pending)
gatesRouter.get('/api/companies/:cid/gates', (c) => {
  const cid = c.req.param('cid');
  const statusFilter = c.req.query('status');
  const { page, limit, offset } = getPaginationParams(c);

  const company = get(`SELECT id FROM companies WHERE id = ?`, [cid]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const clauses: string[] = ['g.company_id = ?'];
  const params: unknown[] = [cid];

  if (statusFilter) {
    clauses.push('g.status = ?');
    params.push(statusFilter);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total FROM approval_gates g ${where}`,
    params
  );
  const total = countRow?.total ?? 0;

  const rows = all<GateRow & { agent_name: string }>(
    `SELECT g.*, a.name as agent_name
     FROM approval_gates g
     LEFT JOIN agents a ON a.id = g.agent_id
     ${where}
     ORDER BY g.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({
    gates: rows.map((r) => rowToGate(r, r.agent_name)),
    pagination,
  });
});

// GET /api/companies/:cid/gates/pending — pending gates only (convenience alias)
gatesRouter.get('/api/companies/:cid/gates/pending', (c) => {
  const cid = c.req.param('cid');

  const company = get(`SELECT id FROM companies WHERE id = ?`, [cid]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const rows = all<GateRow & { agent_name: string }>(
    `SELECT g.*, a.name as agent_name
     FROM approval_gates g
     LEFT JOIN agents a ON a.id = g.agent_id
     WHERE g.company_id = ? AND g.status = 'pending'
     ORDER BY g.created_at DESC
     LIMIT 100`,
    [cid]
  );

  return c.json({
    gates: rows.map((r) => rowToGate(r, r.agent_name)),
    total: rows.length,
  });
});

// POST /api/companies/:cid/gates — create gate
gatesRouter.post(
  '/api/companies/:cid/gates',
  requireRole('admin'),
  zValidator('json', CreateApprovalGateSchema),
  (c) => {
    const cid = c.req.param('cid');
    const body = c.req.valid('json');

    const company = get(`SELECT id FROM companies WHERE id = ?`, [cid]);
    if (!company) {
      return c.json({ error: 'Company not found' }, 404);
    }

    const agent = get(`SELECT id FROM agents WHERE id = ? AND company_id = ?`, [body.agentId, cid]);
    if (!agent) {
      return c.json({ error: 'Agent not found in this company' }, 404);
    }

    const id = nanoid();
    run(
      `INSERT INTO approval_gates (id, company_id, agent_id, gate_type, title, description, payload, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
      [id, cid, body.agentId, body.gateType, body.title, body.description, JSON.stringify(body.payload)]
    );

    audit(cid, body.agentId, 'gate.created', { gateId: id, gateType: body.gateType, title: body.title });

    const row = get<GateRow & { agent_name: string }>(
      `SELECT g.*, a.name as agent_name FROM approval_gates g LEFT JOIN agents a ON a.id = g.agent_id WHERE g.id = ?`,
      [id]
    );

    return c.json({ gate: rowToGate(row!, row?.agent_name) }, 201);
  }
);

// POST /api/companies/:cid/gates/:id/approve — approve a gate
gatesRouter.post(
  '/api/companies/:cid/gates/:id/approve',
  requireRole('admin'),
  zValidator('json', DecideApprovalGateSchema),
  (c) => {
    const cid = c.req.param('cid');
    const gateId = c.req.param('id');
    const body = c.req.valid('json');

    const gate = get<GateRow>(`SELECT * FROM approval_gates WHERE id = ? AND company_id = ?`, [gateId, cid]);
    if (!gate) {
      return c.json({ error: 'Approval gate not found' }, 404);
    }

    if (gate.status !== 'pending') {
      return c.json({ error: `Gate is already ${gate.status}` }, 409);
    }

    const now = new Date().toISOString();
    run(
      `UPDATE approval_gates SET status = 'approved', decided_at = ?, decided_by = ? WHERE id = ?`,
      [now, body.decidedBy, gateId]
    );

    audit(cid, gate.agent_id, 'gate.approved', { gateId, decidedBy: body.decidedBy });

    const updated = get<GateRow & { agent_name: string }>(
      `SELECT g.*, a.name as agent_name FROM approval_gates g LEFT JOIN agents a ON a.id = g.agent_id WHERE g.id = ?`,
      [gateId]
    );

    return c.json({ gate: rowToGate(updated!, updated?.agent_name) });
  }
);

// POST /api/companies/:cid/gates/:id/reject — reject a gate
gatesRouter.post(
  '/api/companies/:cid/gates/:id/reject',
  requireRole('admin'),
  zValidator('json', DecideApprovalGateSchema),
  (c) => {
    const cid = c.req.param('cid');
    const gateId = c.req.param('id');
    const body = c.req.valid('json');

    const gate = get<GateRow>(`SELECT * FROM approval_gates WHERE id = ? AND company_id = ?`, [gateId, cid]);
    if (!gate) {
      return c.json({ error: 'Approval gate not found' }, 404);
    }

    if (gate.status !== 'pending') {
      return c.json({ error: `Gate is already ${gate.status}` }, 409);
    }

    const now = new Date().toISOString();
    run(
      `UPDATE approval_gates SET status = 'rejected', decided_at = ?, decided_by = ? WHERE id = ?`,
      [now, body.decidedBy, gateId]
    );

    audit(cid, gate.agent_id, 'gate.rejected', { gateId, decidedBy: body.decidedBy });

    const updated = get<GateRow & { agent_name: string }>(
      `SELECT g.*, a.name as agent_name FROM approval_gates g LEFT JOIN agents a ON a.id = g.agent_id WHERE g.id = ?`,
      [gateId]
    );

    return c.json({ gate: rowToGate(updated!, updated?.agent_name) });
  }
);
