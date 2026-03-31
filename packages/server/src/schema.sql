PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'active',
  budget_monthly_cents  INTEGER NOT NULL DEFAULT 0,
  spent_monthly_cents   INTEGER NOT NULL DEFAULT 0,
  system_budget_cents   INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

CREATE TABLE IF NOT EXISTS agents (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  slug                  TEXT,
  role                  TEXT NOT NULL DEFAULT 'worker',
  title                 TEXT NOT NULL DEFAULT '',
  model                 TEXT NOT NULL DEFAULT 'claude-opus-4-5',
  capabilities          TEXT NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'idle',
  reports_to            TEXT REFERENCES agents(id) ON DELETE SET NULL,
  adapter_type          TEXT NOT NULL DEFAULT 'claude_local',
  adapter_config        TEXT NOT NULL DEFAULT '{}',
  working_directory     TEXT,
  project_id            TEXT,
  tags                  TEXT NOT NULL DEFAULT '',
  budget_monthly_cents  INTEGER NOT NULL DEFAULT 0,
  spent_monthly_cents   INTEGER NOT NULL DEFAULT 0,
  permission_mode       TEXT NOT NULL DEFAULT 'supervised',
  system_prompt         TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_company_id ON agents(company_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON agents(reports_to);

CREATE TABLE IF NOT EXISTS routines (
  id               TEXT PRIMARY KEY,
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  cron_expression  TEXT NOT NULL,
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  enabled          INTEGER NOT NULL DEFAULT 1,
  last_run_at      TEXT,
  next_run_at      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_routines_company_id ON routines(company_id);
CREATE INDEX IF NOT EXISTS idx_routines_agent_id ON routines(agent_id);
CREATE INDEX IF NOT EXISTS idx_routines_enabled ON routines(enabled);
CREATE INDEX IF NOT EXISTS idx_routines_next_run_at ON routines(next_run_at);

CREATE TABLE IF NOT EXISTS runs (
  id             TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  routine_id     TEXT REFERENCES routines(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'queued',
  model          TEXT NOT NULL DEFAULT '',
  source         TEXT NOT NULL DEFAULT 'manual',
  chain_depth    INTEGER NOT NULL DEFAULT 0,
  started_at     TEXT,
  finished_at    TEXT,
  exit_code      INTEGER,
  error          TEXT,
  token_input    INTEGER NOT NULL DEFAULT 0,
  token_output   INTEGER NOT NULL DEFAULT 0,
  cost_cents     INTEGER NOT NULL DEFAULT 0,
  log_excerpt    TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_company_id ON runs(company_id);
CREATE INDEX IF NOT EXISTS idx_runs_routine_id ON runs(routine_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);

CREATE TABLE IF NOT EXISTS issues (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id  TEXT,
  agent_id    TEXT REFERENCES agents(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open',
  priority    TEXT NOT NULL DEFAULT 'medium',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_company_id ON issues(company_id);
CREATE INDEX IF NOT EXISTS idx_issues_agent_id ON issues(agent_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority);

CREATE TABLE IF NOT EXISTS projects (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  working_directory TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  role         TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin', 'readonly')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS webhooks (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  events      TEXT NOT NULL DEFAULT '*',
  secret      TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhooks_company_id ON webhooks(company_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled);

CREATE TABLE IF NOT EXISTS run_outputs (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent_id    TEXT NOT NULL,
  output_type TEXT NOT NULL DEFAULT 'report',
  data        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_run_outputs_run ON run_outputs(run_id);
CREATE INDEX IF NOT EXISTS idx_run_outputs_agent ON run_outputs(agent_id);

CREATE TABLE IF NOT EXISTS signals (
  id                  TEXT PRIMARY KEY,
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_agent_id     TEXT NOT NULL,
  source_agent_name   TEXT NOT NULL DEFAULT '',
  signal_type         TEXT NOT NULL,
  title               TEXT NOT NULL,
  payload             TEXT NOT NULL DEFAULT '{}',
  consumed_by         TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signals_company ON signals(company_id);
CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);

CREATE TABLE IF NOT EXISTS approval_gates (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  gate_type    TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  payload      TEXT NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'pending',
  decided_at       TEXT,
  decided_by       TEXT DEFAULT 'human',
  auto_created     INTEGER NOT NULL DEFAULT 0,
  decision_reason  TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gates_company ON approval_gates(company_id);
CREATE INDEX IF NOT EXISTS idx_gates_agent ON approval_gates(agent_id);
CREATE INDEX IF NOT EXISTS idx_gates_status ON approval_gates(status);

CREATE TABLE IF NOT EXISTS audit_log (
  id               TEXT PRIMARY KEY,
  company_id       TEXT,
  agent_id         TEXT,
  action           TEXT NOT NULL,
  detail           TEXT NOT NULL DEFAULT '{}',
  actor            TEXT NOT NULL DEFAULT 'system',
  decision_reason  TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS capsule_consolidation (
  id                    TEXT PRIMARY KEY,
  company_id            TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  last_consolidated_at  TEXT,
  runs_since_last       INTEGER NOT NULL DEFAULT 0,
  lock_holder           TEXT,
  lock_acquired_at      TEXT,
  status                TEXT NOT NULL DEFAULT 'idle',
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_capsule_consolidation_company ON capsule_consolidation(company_id);
