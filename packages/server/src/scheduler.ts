import { CronExpressionParser } from 'cron-parser';
import { nanoid } from 'nanoid';
import { all, get, run } from './db.js';
import { spawnClaudeLocal } from './adapter.js';

interface RoutineRow {
  id: string;
  company_id: string;
  agent_id: string;
  title: string;
  description: string;
  cron_expression: string;
  timezone: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface AgentRow {
  id: string;
  model: string;
  adapter_type: string;
  adapter_config: string;
  status: string;
  company_id: string;
}

function computeNextRunAt(cronExpression: string, timezone: string): string | null {
  try {
    const expr = CronExpressionParser.parse(cronExpression, {
      tz: timezone,
      currentDate: new Date(),
    });
    return expr.next().toISOString();
  } catch {
    return null;
  }
}

async function processDueRoutines(): Promise<void> {
  const now = new Date().toISOString();

  const dueRoutines = all<RoutineRow & { company_id: string }>(
    `SELECT r.*, a.company_id
     FROM routines r
     JOIN agents a ON a.id = r.agent_id
     WHERE r.enabled = 1
       AND r.next_run_at IS NOT NULL
       AND r.next_run_at <= ?`,
    [now]
  );

  for (const routine of dueRoutines) {
    const agent = get<AgentRow>(`SELECT * FROM agents WHERE id = ?`, [routine.agent_id]);

    if (!agent) continue;

    // Don't pile on if agent is already running
    if (agent.status === 'running') continue;

    const runId = nanoid();
    const createdAt = new Date().toISOString();

    // Create the run record
    run(
      `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, created_at)
       VALUES (?, ?, ?, ?, 'queued', ?, 'routine', ?)`,
      [runId, routine.agent_id, routine.company_id, routine.id, agent.model, createdAt]
    );

    // Update routine timestamps
    const nextRunAt = computeNextRunAt(routine.cron_expression, routine.timezone);
    run(
      `UPDATE routines SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?`,
      [createdAt, nextRunAt, createdAt, routine.id]
    );

    // Fire-and-forget: spawn adapter
    spawnClaudeLocal({
      runId,
      agentId: routine.agent_id,
      companyId: routine.company_id,
      model: agent.model,
      prompt: `[Routine: ${routine.title}]\n\n${routine.description}`,
      adapterConfig: (() => {
        try {
          return JSON.parse(agent.adapter_config) as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
    }).catch((err: unknown) => {
      console.error(`[scheduler] Adapter error for routine ${routine.id}:`, err);
    });
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  // Run immediately on start, then every 30 seconds
  processDueRoutines().catch((err: unknown) => {
    console.error('[scheduler] Initial tick error:', err);
  });

  schedulerInterval = setInterval(() => {
    processDueRoutines().catch((err: unknown) => {
      console.error('[scheduler] Tick error:', err);
    });
  }, 30_000);

  console.log('[scheduler] Started — checking routines every 30s');
}

export function stopScheduler(): void {
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[scheduler] Stopped.');
  }
}

export function initializeNextRunAts(): void {
  // On server start, populate next_run_at for routines that don't have one
  const routines = all<RoutineRow>(
    `SELECT * FROM routines WHERE enabled = 1 AND next_run_at IS NULL`
  );

  for (const routine of routines) {
    const nextRunAt = computeNextRunAt(routine.cron_expression, routine.timezone);
    if (nextRunAt) {
      const now = new Date().toISOString();
      run(
        `UPDATE routines SET next_run_at = ?, updated_at = ? WHERE id = ?`,
        [nextRunAt, now, routine.id]
      );
    }
  }
}
