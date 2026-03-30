import { Hono } from 'hono';
import { all, get } from '../db.js';
import { getPaginationParams, paginatedResponse } from '../utils/pagination.js';

export const auditRouter = new Hono();

interface AuditRow {
  id: string;
  company_id: string | null;
  agent_id: string | null;
  action: string;
  detail: string;
  actor: string;
  created_at: string;
}

function rowToEntry(row: AuditRow, agentName?: string) {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    agentId: row.agent_id ?? null,
    agentName: agentName ?? null,
    action: row.action,
    detail: (() => {
      try { return JSON.parse(row.detail) as Record<string, unknown>; }
      catch { return {}; }
    })(),
    actor: row.actor,
    createdAt: row.created_at,
  };
}

// GET /api/companies/:cid/audit — list audit log entries
auditRouter.get('/api/companies/:cid/audit', (c) => {
  const cid = c.req.param('cid');
  const actionFilter = c.req.query('action');
  const agentIdFilter = c.req.query('agent_id');
  const limitParam = c.req.query('limit');
  const { page, limit: defaultLimit, offset } = getPaginationParams(c);
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : defaultLimit;

  const company = get(`SELECT id FROM companies WHERE id = ?`, [cid]);
  if (!company) {
    return c.json({ error: 'Company not found' }, 404);
  }

  const clauses: string[] = ['al.company_id = ?'];
  const params: unknown[] = [cid];

  if (actionFilter) {
    clauses.push('al.action = ?');
    params.push(actionFilter);
  }

  if (agentIdFilter) {
    clauses.push('al.agent_id = ?');
    params.push(agentIdFilter);
  }

  const where = `WHERE ${clauses.join(' AND ')}`;

  const countRow = get<{ total: number }>(
    `SELECT COUNT(*) as total FROM audit_log al ${where}`,
    params
  );
  const total = countRow?.total ?? 0;

  const rows = all<AuditRow & { agent_name: string | null }>(
    `SELECT al.*, a.name as agent_name
     FROM audit_log al
     LEFT JOIN agents a ON a.id = al.agent_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const { pagination } = paginatedResponse(rows, total, page, limit);

  return c.json({
    entries: rows.map((r) => rowToEntry(r, r.agent_name ?? undefined)),
    pagination,
  });
});
