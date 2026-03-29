-- Agent Platform Schema
-- All IDs are TEXT (nanoid), dates are TEXT (ISO8601), money in INTEGER cents

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ─── companies ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id                   TEXT    NOT NULL PRIMARY KEY,
  name                 TEXT    NOT NULL,
  description          TEXT,
  status               TEXT    NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'paused', 'archived')),
  budget_monthly_cents INTEGER NOT NULL DEFAULT 0,
  spent_monthly_cents  INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT    NOT NULL,
  updated_at           TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies (status);

-- ─── agents ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agents (
  id                   TEXT    NOT NULL PRIMARY KEY,
  company_id           TEXT    NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,
  role                 TEXT    NOT NULL
                         CHECK (role IN ('ceo','engineer','devops','marketing','seo','content','research','sales','general')),
  title                TEXT,
  model                TEXT,
  capabilities         TEXT,
  status               TEXT    NOT NULL DEFAULT 'idle'
                         CHECK (status IN ('idle', 'running', 'paused', 'error')),
  reports_to           TEXT    REFERENCES agents (id) ON DELETE SET NULL,
  adapter_type         TEXT    NOT NULL,
  adapter_config       TEXT    NOT NULL DEFAULT '{}',
  working_directory    TEXT,
  budget_monthly_cents INTEGER NOT NULL DEFAULT 0,
  spent_monthly_cents  INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT    NOT NULL,
  updated_at           TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_company_id ON agents (company_id);
CREATE INDEX IF NOT EXISTS idx_agents_status     ON agents (status);
CREATE INDEX IF NOT EXISTS idx_agents_role       ON agents (role);
CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON agents (reports_to);

-- ─── routines ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS routines (
  id              TEXT    NOT NULL PRIMARY KEY,
  company_id      TEXT    NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  agent_id        TEXT    NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  description     TEXT,
  cron_expression TEXT    NOT NULL,
  timezone        TEXT    NOT NULL DEFAULT 'UTC',
  enabled         INTEGER NOT NULL DEFAULT 1,
  last_run_at     TEXT,
  next_run_at     TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routines_company_id ON routines (company_id);
CREATE INDEX IF NOT EXISTS idx_routines_agent_id   ON routines (agent_id);
CREATE INDEX IF NOT EXISTS idx_routines_enabled    ON routines (enabled);
CREATE INDEX IF NOT EXISTS idx_routines_next_run   ON routines (next_run_at) WHERE enabled = 1;

-- ─── runs ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS runs (
  id           TEXT    NOT NULL PRIMARY KEY,
  agent_id     TEXT    NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  company_id   TEXT    NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  routine_id   TEXT    REFERENCES routines (id) ON DELETE SET NULL,
  status       TEXT    NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'running', 'completed', 'failed', 'timeout', 'cancelled')),
  model        TEXT,
  source       TEXT    NOT NULL
                 CHECK (source IN ('schedule', 'manual', 'event')),
  started_at   TEXT,
  finished_at  TEXT,
  exit_code    INTEGER,
  error        TEXT,
  token_input  INTEGER NOT NULL DEFAULT 0,
  token_output INTEGER NOT NULL DEFAULT 0,
  cost_cents   INTEGER NOT NULL DEFAULT 0,
  log_excerpt  TEXT,
  created_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_agent_id   ON runs (agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_company_id ON runs (company_id);
CREATE INDEX IF NOT EXISTS idx_runs_routine_id ON runs (routine_id);
CREATE INDEX IF NOT EXISTS idx_runs_status     ON runs (status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs (created_at DESC);

-- ─── issues ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS issues (
  id          TEXT NOT NULL PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  project_id  TEXT,
  agent_id    TEXT REFERENCES agents (id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')),
  priority    TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_company_id ON issues (company_id);
CREATE INDEX IF NOT EXISTS idx_issues_agent_id   ON issues (agent_id);
CREATE INDEX IF NOT EXISTS idx_issues_status     ON issues (status);
CREATE INDEX IF NOT EXISTS idx_issues_priority   ON issues (priority);
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues (project_id);
