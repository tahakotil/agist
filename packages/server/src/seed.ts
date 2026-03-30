import { initDb, run, saveDb } from './db.js';
import { nanoid } from 'nanoid';

async function seed() {
  console.log('[seed] Initializing database...');
  await initDb();

  console.log('[seed] Clearing existing data...');
  run('DELETE FROM runs');
  run('DELETE FROM issues');
  run('DELETE FROM routines');
  run('DELETE FROM agents');
  run('DELETE FROM companies');

  const now = new Date();

  // ── Company ──────────────────────────────────────────────
  const companyId = nanoid();
  run(
    `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyId,
      'Acme Corp',
      'Demo company for Agist platform',
      'active',
      50000, // $500/mo
      0,
      now.toISOString(),
      now.toISOString(),
    ]
  );
  console.log(`[seed] Created company: Acme Corp (${companyId})`);

  // ── Agents ────────────────────────────────────────────────
  const watchdogId = nanoid();
  const builderId = nanoid();
  const reviewerId = nanoid();
  const strategistId = nanoid();

  run(
    `INSERT INTO agents (id, company_id, name, role, title, model, capabilities, status, reports_to, adapter_type, adapter_config, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      watchdogId,
      companyId,
      'Watchdog',
      'specialist',
      'System Monitor',
      'claude-haiku-4-5-20251001',
      '[]',
      'idle',
      null,
      'claude_local',
      '{}',
      0,
      0,
      now.toISOString(),
      now.toISOString(),
    ]
  );

  run(
    `INSERT INTO agents (id, company_id, name, role, title, model, capabilities, status, reports_to, adapter_type, adapter_config, working_directory, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      builderId,
      companyId,
      'Builder',
      'worker',
      'Lead Developer',
      'claude-sonnet-4-6',
      '[]',
      'idle',
      null,
      'claude_local',
      '{}',
      '/tmp/agist-demo-project',
      0,
      0,
      now.toISOString(),
      now.toISOString(),
    ]
  );

  run(
    `INSERT INTO agents (id, company_id, name, role, title, model, capabilities, status, reports_to, adapter_type, adapter_config, working_directory, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reviewerId,
      companyId,
      'Reviewer',
      'specialist',
      'Code Reviewer',
      'claude-sonnet-4-6',
      '[]',
      'idle',
      builderId,
      'claude_local',
      '{}',
      '/tmp/agist-demo-project',
      0,
      0,
      now.toISOString(),
      now.toISOString(),
    ]
  );

  run(
    `INSERT INTO agents (id, company_id, name, role, title, model, capabilities, status, reports_to, adapter_type, adapter_config, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      strategistId,
      companyId,
      'Strategist',
      'lead',
      'Technical Architect',
      'claude-opus-4-6',
      '[]',
      'idle',
      null,
      'claude_local',
      '{}',
      0,
      0,
      now.toISOString(),
      now.toISOString(),
    ]
  );
  console.log('[seed] Created 4 agents: Watchdog, Builder, Reviewer, Strategist');

  // ── Routines ──────────────────────────────────────────────
  const routine1Id = nanoid();
  const routine2Id = nanoid();

  run(
    `INSERT INTO routines (id, company_id, agent_id, title, description, cron_expression, timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      routine1Id,
      companyId,
      watchdogId,
      'Health Check',
      'Periodic system health monitoring',
      '0 */6 * * *',
      'UTC',
      1,
      null,
      null,
      now.toISOString(),
      now.toISOString(),
    ]
  );

  run(
    `INSERT INTO routines (id, company_id, agent_id, title, description, cron_expression, timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      routine2Id,
      companyId,
      builderId,
      'Morning Standup',
      'Daily morning status check on weekdays',
      '0 9 * * 1-5',
      'UTC',
      1,
      null,
      null,
      now.toISOString(),
      now.toISOString(),
    ]
  );
  console.log('[seed] Created 2 routines: Health Check, Morning Standup');

  // ── Runs ──────────────────────────────────────────────────
  // Run 1: Watchdog — 2 hours ago — succeeded
  const run1StartedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const run1FinishedAt = new Date(run1StartedAt.getTime() + 45 * 1000);
  run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, started_at, finished_at, exit_code, error, token_input, token_output, cost_cents, log_excerpt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nanoid(),
      watchdogId,
      companyId,
      routine1Id,
      'completed',
      'claude-haiku-4-5-20251001',
      'scheduled',
      run1StartedAt.toISOString(),
      run1FinishedAt.toISOString(),
      0,
      null,
      1200,
      800,
      2,
      'Health check completed successfully. All systems nominal.',
      run1StartedAt.toISOString(),
    ]
  );

  // Run 2: Watchdog — 8 hours ago — succeeded
  const run2StartedAt = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  const run2FinishedAt = new Date(run2StartedAt.getTime() + 38 * 1000);
  run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, started_at, finished_at, exit_code, error, token_input, token_output, cost_cents, log_excerpt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nanoid(),
      watchdogId,
      companyId,
      routine1Id,
      'completed',
      'claude-haiku-4-5-20251001',
      'scheduled',
      run2StartedAt.toISOString(),
      run2FinishedAt.toISOString(),
      0,
      null,
      1100,
      750,
      2,
      'Health check completed. CPU: 34%, Memory: 62%, Disk: 45%.',
      run2StartedAt.toISOString(),
    ]
  );

  // Run 3: Watchdog — 14 hours ago — succeeded
  const run3StartedAt = new Date(now.getTime() - 14 * 60 * 60 * 1000);
  const run3FinishedAt = new Date(run3StartedAt.getTime() + 52 * 1000);
  run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, started_at, finished_at, exit_code, error, token_input, token_output, cost_cents, log_excerpt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nanoid(),
      watchdogId,
      companyId,
      routine1Id,
      'completed',
      'claude-haiku-4-5-20251001',
      'scheduled',
      run3StartedAt.toISOString(),
      run3FinishedAt.toISOString(),
      0,
      null,
      1300,
      900,
      2,
      'Health check completed. Minor latency spike detected on API endpoint.',
      run3StartedAt.toISOString(),
    ]
  );

  // Run 4: Builder — 1 day ago — succeeded
  const run4StartedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const run4FinishedAt = new Date(run4StartedAt.getTime() + 120 * 1000);
  run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, started_at, finished_at, exit_code, error, token_input, token_output, cost_cents, log_excerpt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nanoid(),
      builderId,
      companyId,
      routine2Id,
      'completed',
      'claude-sonnet-4-6',
      'scheduled',
      run4StartedAt.toISOString(),
      run4FinishedAt.toISOString(),
      0,
      null,
      5000,
      3000,
      6,
      'Morning standup complete. Reviewed 3 PRs, updated task board, flagged 2 blockers.',
      run4StartedAt.toISOString(),
    ]
  );

  // Run 5: Reviewer — 2 days ago — failed
  const run5StartedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const run5FinishedAt = new Date(run5StartedAt.getTime() + 15 * 1000);
  run(
    `INSERT INTO runs (id, agent_id, company_id, routine_id, status, model, source, started_at, finished_at, exit_code, error, token_input, token_output, cost_cents, log_excerpt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nanoid(),
      reviewerId,
      companyId,
      null,
      'failed',
      'claude-sonnet-4-6',
      'manual',
      run5StartedAt.toISOString(),
      run5FinishedAt.toISOString(),
      1,
      'Process exited with code 1',
      500,
      100,
      1,
      'Code review failed. Process exited with code 1.',
      run5StartedAt.toISOString(),
    ]
  );
  console.log('[seed] Created 5 runs');

  // ── Issues ────────────────────────────────────────────────
  run(
    `INSERT INTO issues (id, company_id, project_id, agent_id, title, description, status, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nanoid(),
      companyId,
      null,
      watchdogId,
      'Memory usage high on staging',
      'Watchdog detected elevated memory usage on the staging server. Needs investigation.',
      'open',
      'high',
      now.toISOString(),
      now.toISOString(),
    ]
  );

  run(
    `INSERT INTO issues (id, company_id, project_id, agent_id, title, description, status, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nanoid(),
      companyId,
      null,
      builderId,
      'Optimize database queries',
      'Several slow queries identified in the runs endpoint. N+1 problem suspected.',
      'in_progress',
      'medium',
      now.toISOString(),
      now.toISOString(),
    ]
  );
  console.log('[seed] Created 2 issues');

  // ── Kotivon Company ──────────────────────────────────────────
  const kotivonCompanyId = nanoid();
  run(
    `INSERT INTO companies (id, name, description, status, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      kotivonCompanyId,
      'Kotivon',
      'Digital agency — web development, SEO, automation services',
      'active',
      100000, // $1000/mo
      0,
      now.toISOString(),
      now.toISOString(),
    ]
  );
  console.log(`[seed] Created company: Kotivon (${kotivonCompanyId})`);

  // ── kotivon-devops Agent ──────────────────────────────────────
  const kotivonDevopsId = nanoid();
  run(
    `INSERT INTO agents (id, company_id, name, role, title, model, capabilities, status, reports_to, adapter_type, adapter_config, budget_monthly_cents, spent_monthly_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      kotivonDevopsId,
      kotivonCompanyId,
      'kotivon-devops',
      'specialist',
      'Production Monitor & DevOps Agent',
      'claude-haiku-4-5-20251001',
      '["ssl-monitoring", "health-checks", "deployment-status", "alert-management"]',
      'idle',
      null,
      'claude_local',
      '{}',
      0,
      0,
      now.toISOString(),
      now.toISOString(),
    ]
  );
  console.log(`[seed] Created agent: kotivon-devops (${kotivonDevopsId})`);

  // ── Kotivon Monitoring Routines ──────────────────────────────
  const apiHealthRoutineId = nanoid();
  const sslMonitorRoutineId = nanoid();
  const deploymentStatusRoutineId = nanoid();

  run(
    `INSERT INTO routines (id, company_id, agent_id, title, description, cron_expression, timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      apiHealthRoutineId,
      kotivonCompanyId,
      kotivonDevopsId,
      'API Health Check',
      'Monitor client site API health — check endpoints, latency, errors',
      '*/5 * * * *',
      'UTC',
      1,
      null,
      null,
      now.toISOString(),
      now.toISOString(),
    ]
  );

  run(
    `INSERT INTO routines (id, company_id, agent_id, title, description, cron_expression, timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sslMonitorRoutineId,
      kotivonCompanyId,
      kotivonDevopsId,
      'SSL Certificate Monitoring',
      'Check SSL certificate expiration dates for all client domains',
      '0 9 * * *',
      'UTC',
      1,
      null,
      null,
      now.toISOString(),
      now.toISOString(),
    ]
  );

  run(
    `INSERT INTO routines (id, company_id, agent_id, title, description, cron_expression, timezone, enabled, last_run_at, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      deploymentStatusRoutineId,
      kotivonCompanyId,
      kotivonDevopsId,
      'Deployment Status Check',
      'Verify deployed services are running, check server resources, log health metrics',
      '*/15 * * * *',
      'UTC',
      1,
      null,
      null,
      now.toISOString(),
      now.toISOString(),
    ]
  );
  console.log('[seed] Created 3 Kotivon monitoring routines: API Health, SSL Monitor, Deployment Status');

  // ── Save to disk ──────────────────────────────────────────
  saveDb();
  console.log('[seed] Database saved to disk.');
  console.log('[seed] Done! Seeded:');
  console.log('  - 2 companies: Acme Corp, Kotivon');
  console.log('  - 5 agents: Watchdog, Builder, Reviewer, Strategist, kotivon-devops');
  console.log('  - 5 routines: Health Check, Morning Standup + 3 Kotivon monitoring');
  console.log('  - 5 runs (3 Watchdog, 1 Builder, 1 Reviewer)');
  console.log('  - 2 issues');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] Error:', err);
  process.exit(1);
});
