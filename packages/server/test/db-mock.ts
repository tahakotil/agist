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

const SCHEMA_PATH = join(__dirname, '..', 'src', 'schema.sql');

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
  ]
  for (const sql of migrations) {
    try { db.run(sql) } catch { /* column already exists */ }
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
  if (params.length) stmt.bind(params);
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
  getDb().run(sql, params);
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
