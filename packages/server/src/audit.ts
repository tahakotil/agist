import { nanoid } from 'nanoid';
import { run } from './db.js';
import { logger } from './logger.js';

/**
 * Write an audit log entry.
 * Fire-and-forget — never throws.
 *
 * @param decisionReason - Optional human-readable reason for gate decisions or
 *   permission overrides. Stored in the `detail` JSON blob as `decision_reason`.
 */
export function audit(
  companyId: string | null,
  agentId: string | null,
  action: string,
  detail: Record<string, unknown> = {},
  actor = 'system',
  decisionReason = ''
): void {
  try {
    const id = nanoid();
    const now = new Date().toISOString();
    // Merge decisionReason into detail if provided so it's queryable
    const enrichedDetail: Record<string, unknown> = decisionReason
      ? { ...detail, decision_reason: decisionReason }
      : detail;
    run(
      `INSERT INTO audit_log (id, company_id, agent_id, action, detail, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId ?? null, agentId ?? null, action, JSON.stringify(enrichedDetail), actor, now]
    );
  } catch (err) {
    logger.warn('audit: failed to write audit log entry', { action, agentId, error: String(err) });
  }
}
