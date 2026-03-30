import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateApiKey } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(homedir(), '.agist');
const DB_PATH = join(DATA_DIR, 'data.db');

mkdirSync(DATA_DIR, { recursive: true });

let db: Database;
let saveInterval: NodeJS.Timeout | null = null;

export async function initDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  // Load and run schema
  const schemaPathCurrent = join(__dirname, 'schema.sql');
  const schemaPathSrc = join(__dirname, '..', 'src', 'schema.sql');
  let schemaPath: string;
  if (existsSync(schemaPathCurrent)) {
    schemaPath = schemaPathCurrent;
  } else if (existsSync(schemaPathSrc)) {
    schemaPath = schemaPathSrc;
  } else {
    throw new Error(`schema.sql not found. Checked: ${schemaPathCurrent}, ${schemaPathSrc}`);
  }

  const schema = readFileSync(schemaPath, 'utf8');
  db.run(schema);

  // Migrations for additive schema changes on existing DBs
  try {
    db.run('ALTER TABLE agents ADD COLUMN working_directory TEXT');
  } catch {
    // Column already exists — ignore
  }

  // Webhooks table migration (added in v1.1)
  try {
    db.run(`CREATE TABLE IF NOT EXISTS webhooks (
      id          TEXT PRIMARY KEY,
      company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      url         TEXT NOT NULL,
      events      TEXT NOT NULL DEFAULT '*',
      secret      TEXT,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_webhooks_company_id ON webhooks(company_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled)`);
  } catch {
    // Table already exists — ignore
  }

  // Projects table migration (added in v1.2)
  try {
    db.run(`CREATE TABLE IF NOT EXISTS projects (
      id                TEXT PRIMARY KEY,
      company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name              TEXT NOT NULL,
      description       TEXT NOT NULL DEFAULT '',
      working_directory TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id)`);
  } catch {
    // Table already exists — ignore
  }

  // Project ID migrations for agents, routines
  try {
    db.run('ALTER TABLE agents ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
  } catch {
    // Column already exists — ignore
  }
  try {
    db.run('ALTER TABLE routines ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
  } catch {
    // Column already exists — ignore
  }

  // Agent tags migration (added in v1.2)
  try {
    db.run("ALTER TABLE agents ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
  } catch {
    // Column already exists — ignore
  }

  // Context capsule migration (added in v1.4)
  try {
    db.run("ALTER TABLE agents ADD COLUMN context_capsule TEXT NOT NULL DEFAULT ''");
  } catch {
    // Column already exists — ignore
  }

  // Agent slug migration (added in v1.3)
  try {
    db.run("ALTER TABLE agents ADD COLUMN slug TEXT");
  } catch {
    // Column already exists — ignore
  }
  try {
    db.run("CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug)");
  } catch {
    // Index already exists — ignore
  }
  // Back-fill slugs for existing rows that don't have one yet
  try {
    const rows = db.exec("SELECT id, name FROM agents WHERE slug IS NULL OR slug = ''");
    if (rows.length > 0 && rows[0].values.length > 0) {
      for (const row of rows[0].values) {
        const id = row[0] as string;
        const name = row[1] as string;
        const baseSlug = name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'agent';
        // Ensure uniqueness within company
        const agentRow = db.exec(`SELECT company_id FROM agents WHERE id = '${id}'`);
        const companyId = agentRow[0]?.values[0]?.[0] as string | undefined;
        if (companyId) {
          let slug = baseSlug;
          let counter = 1;
          while (true) {
            const conflict = db.exec(
              `SELECT id FROM agents WHERE company_id = '${companyId}' AND slug = '${slug}' AND id != '${id}'`
            );
            if (!conflict[0] || conflict[0].values.length === 0) break;
            slug = `${baseSlug}-${counter++}`;
          }
          db.run(`UPDATE agents SET slug = ? WHERE id = ?`, [slug, id]);
        }
      }
    }
  } catch {
    // Back-fill failed — non-critical
  }

  // run_outputs table migration (added in v1.3)
  try {
    db.run(`CREATE TABLE IF NOT EXISTS run_outputs (
      id          TEXT PRIMARY KEY,
      run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      agent_id    TEXT NOT NULL,
      output_type TEXT NOT NULL DEFAULT 'report',
      data        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_run_outputs_run ON run_outputs(run_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_run_outputs_agent ON run_outputs(agent_id)`);
  } catch {
    // Table already exists — ignore
  }

  // Run chain_depth migration (added in v1.3 — wake chain support)
  try {
    db.run("ALTER TABLE runs ADD COLUMN chain_depth INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists — ignore
  }

  // Signals table migration (added in v1.5)
  try {
    db.run(`CREATE TABLE IF NOT EXISTS signals (
      id                TEXT PRIMARY KEY,
      company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      source_agent_id   TEXT NOT NULL,
      source_agent_name TEXT NOT NULL DEFAULT '',
      signal_type       TEXT NOT NULL,
      title             TEXT NOT NULL,
      payload           TEXT NOT NULL DEFAULT '{}',
      consumed_by       TEXT NOT NULL DEFAULT '[]',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_signals_company ON signals(company_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_signals_type ON signals(signal_type)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at)`);
  } catch {
    // Table already exists — ignore
  }

  // Governance: last_reset_month column on agents (added in v1.6)
  try {
    db.run("ALTER TABLE agents ADD COLUMN last_reset_month TEXT");
  } catch {
    // Column already exists — ignore
  }

  // Governance: approval_gates table (added in v1.6)
  try {
    db.run(`CREATE TABLE IF NOT EXISTS approval_gates (
      id           TEXT PRIMARY KEY,
      company_id   TEXT NOT NULL,
      agent_id     TEXT NOT NULL,
      gate_type    TEXT NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      payload      TEXT NOT NULL DEFAULT '{}',
      status       TEXT NOT NULL DEFAULT 'pending',
      decided_at   TEXT,
      decided_by   TEXT DEFAULT 'human',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_gates_company ON approval_gates(company_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_gates_agent ON approval_gates(agent_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_gates_status ON approval_gates(status)`);
  } catch {
    // Table already exists — ignore
  }

  // Governance: audit_log table (added in v1.6)
  try {
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
      id         TEXT PRIMARY KEY,
      company_id TEXT,
      agent_id   TEXT,
      action     TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '{}',
      actor      TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log(company_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)`);
  } catch {
    // Table already exists — ignore
  }

  // ── Enum migration: normalize legacy status values ────────────────────────
  db.run(`UPDATE runs SET status = 'completed' WHERE status IN ('success', 'succeeded')`);
  db.run(`UPDATE companies SET status = 'active' WHERE status IN ('inactive', 'suspended')`);
  db.run(`UPDATE issues SET status = 'open' WHERE status IN ('backlog', 'todo')`);
  db.run(`UPDATE issues SET status = 'resolved' WHERE status = 'done'`);
  db.run(`UPDATE issues SET status = 'in_progress' WHERE status = 'in_review'`);

  // ── Bootstrap API key: create one if none exist ───────────────────────────
  // Only when auth is enabled (AGIST_AUTH_DISABLED !== 'true')
  if (process.env.AGIST_AUTH_DISABLED !== 'true') {
    bootstrapApiKey(db);
  }

  // Auto-save to disk every 30 seconds (store handle so it can be cleared on shutdown)
  saveInterval = setInterval(() => saveDb(), 30_000);

  return db;
}

export function shutdownDb(): void {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
  saveDb(); // final save before exit
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function saveDb(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

// Helper to run a query and return all rows
export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (params.length) stmt.bind(params as any);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

// Helper to run a query and return first row
export function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  const rows = all<T>(sql, params);
  return rows[0];
}

// Helper to run a statement (INSERT/UPDATE/DELETE)
export function run(sql: string, params: unknown[] = []): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDb().run(sql, params as any);
}

/**
 * On first startup with auth enabled, auto-generate a bootstrap admin key and
 * print it to stdout. The raw key is shown ONCE — it is not stored.
 */
function bootstrapApiKey(database: Database): void {
  try {
    const stmt = database.prepare(`SELECT COUNT(*) as cnt FROM api_keys`);
    stmt.step();
    const row = stmt.getAsObject() as { cnt: number };
    stmt.free();

    if (row.cnt > 0) return; // Keys already exist — nothing to do

    const { key, hash } = generateApiKey();
    const id = `bootstrap_${Date.now()}`;
    const now = new Date().toISOString();

    database.run(
      `INSERT INTO api_keys (id, name, key_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)`,
      [id, 'Bootstrap Key', hash, now]
    );

    console.log('');
    console.log('[Agist] ─────────────────────────────────────────────────────');
    console.log('[Agist] No API keys found. Generated a bootstrap admin key:');
    console.log(`[Agist] X-Api-Key: ${key}`);
    console.log('[Agist] Save this key — it will NOT be shown again.');
    console.log('[Agist] Create additional keys via POST /api/api-keys');
    console.log('[Agist] ─────────────────────────────────────────────────────');
    console.log('');
  } catch {
    // Table may not exist yet if schema hasn't been applied; safe to ignore
  }
}

export default { initDb, getDb, saveDb, all, get, run };
