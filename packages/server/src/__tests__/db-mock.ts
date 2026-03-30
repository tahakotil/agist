/**
 * Shared mock factory for the db module.
 * Import this and call installDbMock(db) inside vi.mock.
 *
 * Usage in a test file:
 *
 *   import { createTestDb } from './db-mock.js';
 *   vi.mock('../src/db.js', () => createDbMock());
 *
 * Then in beforeEach:
 *   const db = await createTestDb();
 *   setActiveDb(db);
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs, { type Database } from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCHEMA_PATH = join(__dirname, '..', 'schema.sql');

// The currently active test DB instance (swapped in beforeEach)
let _activeDb: Database | null = null;

export async function createTestDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  db.run(schema);

  // Run the same additive migrations as initDb() so test DB is always up-to-date
  const migrations = [
    'ALTER TABLE agents ADD COLUMN working_directory TEXT',
    "ALTER TABLE agents ADD COLUMN project_id TEXT",
    "ALTER TABLE agents ADD COLUMN tags TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE routines ADD COLUMN project_id TEXT",
    "ALTER TABLE agents ADD COLUMN context_capsule TEXT NOT NULL DEFAULT ''",
    // Governance v1.6
    "ALTER TABLE agents ADD COLUMN last_reset_month TEXT",
    `CREATE TABLE IF NOT EXISTS approval_gates (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      gate_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      decided_at TEXT,
      decided_by TEXT,
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_gates_company ON approval_gates(company_id)",
    "CREATE INDEX IF NOT EXISTS idx_gates_agent ON approval_gates(agent_id)",
    "CREATE INDEX IF NOT EXISTS idx_gates_status ON approval_gates(status)",
    `CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      agent_id TEXT,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '{}',
      actor TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_log(company_id)",
    "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)",
  ]
  for (const sql of migrations) {
    try { db.run(sql) } catch { /* column or table already exists */ }
  }

  return db;
}

export function setActiveDb(db: Database): void {
  _activeDb = db;
}

export function getActiveDb(): Database {
  if (!_activeDb) throw new Error('No active test DB. Call setActiveDb() first.');
  return _activeDb;
}

// ─── Drop-in replacements for db.ts exports ────────────────────────────────────

function getDb(): Database {
  return getActiveDb();
}

function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const db = getDb();
  const stmt = db.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (params.length) stmt.bind(params as any);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  const rows = all<T>(sql, params);
  return rows[0];
}

function runSql(sql: string, params: unknown[] = []): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDb().run(sql, params as any);
}

/**
 * Returns the mock module object for vi.mock.
 * Call this inside the vi.mock factory function.
 */
export function createDbMock() {
  return {
    initDb: async () => getActiveDb(),
    getDb,
    saveDb: () => { /* no-op in tests */ },
    all,
    get,
    run: runSql,
    default: {
      initDb: async () => getActiveDb(),
      getDb,
      saveDb: () => { /* no-op */ },
      all,
      get,
      run: runSql,
    },
  };
}
