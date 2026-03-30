import { nanoid } from 'nanoid';
import { run } from './db.js';
import { logger } from './logger.js';

/**
 * Write an audit log entry.
 * Fire-and-forget — never throws.
 */
export function audit(
  companyId: string | null,
  agentId: string | null,
  action: string,
  detail: Record<string, unknown> = {},
  actor = 'system'
): void {
  try {
    const id = nanoid();
    const now = new Date().toISOString();
    run(
      `INSERT INTO audit_log (id, company_id, agent_id, action, detail, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId ?? null, agentId ?? null, action, JSON.stringify(detail), actor, now]
    );
  } catch (err) {
    logger.warn('audit: failed to write audit log entry', { action, agentId, error: String(err) });
  }
}
