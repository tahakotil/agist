/**
 * Agent Permission Middleware
 *
 * Implements Claude Code's layered trust model:
 * - autonomous: agent can do anything without gates
 * - supervised: destructive operations create approval gates
 * - readonly: agent can only read, no writes/executions
 * - custom: per-agent capability rules
 *
 * Permission inheritance: Company > Project > Agent
 * Upper-level deny cannot be overridden at lower level.
 */
import { get } from '../db.js';
import { logger } from '../logger.js';

export type PermissionMode = 'autonomous' | 'supervised' | 'readonly' | 'custom';

export interface PermissionCheckResult {
  allowed: boolean;
  requiresGate: boolean;
  reason: string;
}

/**
 * Check if an agent has permission to perform an action.
 * Gate stack (cheapest first):
 * 1. Agent status check (in-memory comparison)
 * 2. Permission mode check (single column read)
 * 3. Budget check (computed field)
 * 4. Capability check (JSON parse, most expensive)
 */
export function checkAgentPermission(
  agentId: string,
  action: 'wake' | 'execute' | 'write' | 'deploy' | 'delete'
): PermissionCheckResult {
  // Gate 1: Agent exists and is not paused/error
  const agent = get<{
    id: string;
    status: string;
    permission_mode: string | null;
    capabilities: string;
    budget_monthly_cents: number;
    spent_monthly_cents: number;
  }>(
    `SELECT id, status, permission_mode, capabilities, budget_monthly_cents, spent_monthly_cents
     FROM agents WHERE id = ?`,
    [agentId]
  );

  if (!agent) {
    return { allowed: false, requiresGate: false, reason: 'Agent not found' };
  }

  if (agent.status === 'paused') {
    return { allowed: false, requiresGate: false, reason: 'Agent is paused' };
  }

  if (agent.status === 'error') {
    return { allowed: false, requiresGate: false, reason: 'Agent is in error state' };
  }

  // Gate 2: Permission mode check
  // Default to 'supervised' if the column doesn't exist yet (backwards compat)
  const mode = ((agent.permission_mode as string | null | undefined) ?? 'supervised') as PermissionMode;

  if (mode === 'readonly') {
    if (action !== 'wake') {
      return {
        allowed: false,
        requiresGate: false,
        reason: 'Agent is readonly — only wake (read) operations allowed',
      };
    }
  }

  if (mode === 'supervised') {
    // Destructive actions require approval gate
    const destructiveActions: string[] = ['deploy', 'delete'];
    if (destructiveActions.includes(action)) {
      return {
        allowed: true,
        requiresGate: true,
        reason: `Supervised mode: ${action} requires approval`,
      };
    }
  }

  // autonomous mode: everything allowed, no gates
  if (mode === 'autonomous') {
    return { allowed: true, requiresGate: false, reason: 'Autonomous mode' };
  }

  // Gate 3: Budget check
  if (agent.budget_monthly_cents > 0 && agent.spent_monthly_cents >= agent.budget_monthly_cents) {
    return { allowed: false, requiresGate: false, reason: 'Agent budget exceeded' };
  }

  // Gate 4: Custom capability check (most expensive — JSON parse)
  if (mode === 'custom') {
    try {
      const caps = JSON.parse(agent.capabilities || '[]') as string[];
      if (caps.length > 0 && !caps.includes(action) && !caps.includes('*')) {
        return {
          allowed: false,
          requiresGate: false,
          reason: `Action "${action}" not in agent capabilities: [${caps.join(', ')}]`,
        };
      }
    } catch {
      logger.warn('Failed to parse agent capabilities', { agentId, capabilities: agent.capabilities });
    }
  }

  return { allowed: true, requiresGate: false, reason: 'Permitted' };
}

/**
 * Get effective permission mode considering company-level overrides.
 * Company-level deny cannot be overridden at agent level (inheritance pattern).
 */
export function getEffectivePermissionMode(agentId: string): PermissionMode {
  const row = get<{
    agent_mode: string | null;
    company_status: string;
  }>(
    `SELECT a.permission_mode as agent_mode, c.status as company_status
     FROM agents a JOIN companies c ON a.company_id = c.id
     WHERE a.id = ?`,
    [agentId]
  );

  if (!row) return 'readonly';

  // Company-level override: archived/paused company forces readonly
  if (row.company_status === 'archived' || row.company_status === 'paused') {
    return 'readonly';
  }

  return ((row.agent_mode as string | null | undefined) ?? 'supervised') as PermissionMode;
}
