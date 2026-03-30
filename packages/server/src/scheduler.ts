import { CronExpressionParser } from 'cron-parser';
import { nanoid } from 'nanoid';
import { all, get, run } from './db.js';
import { spawnClaudeLocal, checkAgentBudget } from './adapter.js';
import { logger } from './logger.js';
import { generateDigest } from './digest/generate-digest.js';

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

function purgeExpiredRuns(): void {
  const ttlDays = process.env.RUN_TTL_DAYS ? parseInt(process.env.RUN_TTL_DAYS, 10) : null;
  if (!ttlDays || isNaN(ttlDays) || ttlDays <= 0) return;

  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const countRow = run(`DELETE FROM runs WHERE created_at < ?`, [cutoff]);
  // Log the purge (we can't get delete count easily from sql.js, so just log that it ran)
  logger.info('Purged expired runs', { ttlDays, cutoff });
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

    // Don't pile on if agent is already running, paused, or over budget
    if (agent.status === 'running' || agent.status === 'paused' || agent.status === 'budget_exceeded') continue;

    // Check budget before spawning
    const budgetError = checkAgentBudget(routine.agent_id);
    if (budgetError) {
      logger.warn('Scheduler: skipping routine — agent over budget', {
        routineId: routine.id,
        agentId: routine.agent_id,
        error: budgetError,
      });
      continue;
    }

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
      adapterType: agent.adapter_type,
      adapterConfig: (() => {
        try {
          return JSON.parse(agent.adapter_config) as Record<string, unknown>;
        } catch {
          return {};
        }
      })(),
    }).catch((err: unknown) => {
      logger.error('Adapter error for routine', { routineId: routine.id, error: String(err) });
    });
  }
}

// ── Daily Digest ─────────────────────────────────────────────────────────────

/**
 * Run daily digest generation for all active companies.
 * Fires at 23:00 UTC daily. Idempotent — skips if digest already exists.
 */
async function processDailyDigests(): Promise<void> {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  // Only run between 23:00–23:29 UTC
  if (hour !== 23 || minute >= 30) return;

  const today = now.toISOString().slice(0, 10);

  interface CompanyRow {
    id: string;
    name: string;
  }

  const companies = all<CompanyRow>(
    `SELECT id, name FROM companies WHERE status = 'active'`
  );

  for (const company of companies) {
    // Check if digest already exists for today (idempotent)
    const existing = get(
      `SELECT id FROM digests WHERE company_id = ? AND date = ?`,
      [company.id, today]
    );

    if (existing) {
      logger.debug('Scheduler: daily digest already exists, skipping', {
        companyId: company.id,
        date: today,
      });
      continue;
    }

    try {
      await generateDigest(company.id, today);
      logger.info('Scheduler: daily digest generated', { companyId: company.id, date: today });
    } catch (err: unknown) {
      logger.error('Scheduler: daily digest generation failed', {
        companyId: company.id,
        date: today,
        error: String(err),
      });
    }
  }
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  // Run immediately on start, then every 30 seconds
  processDueRoutines().catch((err: unknown) => {
    logger.error('Scheduler initial tick error', { error: String(err) });
  });

  schedulerInterval = setInterval(() => {
    processDueRoutines().catch((err: unknown) => {
      logger.error('Scheduler tick error', { error: String(err) });
    });
    try {
      purgeExpiredRuns();
    } catch (err: unknown) {
      logger.error('Run TTL purge error', { error: String(err) });
    }
    // Check if it's time for daily digests
    processDailyDigests().catch((err: unknown) => {
      logger.error('Daily digest scheduler error', { error: String(err) });
    });
  }, 30_000);

  logger.info('Scheduler started', { intervalMs: 30000 });
}

export function stopScheduler(): void {
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Scheduler stopped');
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
