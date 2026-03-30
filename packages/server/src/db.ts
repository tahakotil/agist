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
