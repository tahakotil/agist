import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

  // ── Enum migration: normalize legacy status values ────────────────────────
  db.run(`UPDATE runs SET status = 'completed' WHERE status IN ('success', 'succeeded')`);
  db.run(`UPDATE companies SET status = 'active' WHERE status IN ('inactive', 'suspended')`);
  db.run(`UPDATE issues SET status = 'open' WHERE status IN ('backlog', 'todo')`);
  db.run(`UPDATE issues SET status = 'resolved' WHERE status = 'done'`);
  db.run(`UPDATE issues SET status = 'in_progress' WHERE status = 'in_review'`);

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

export default { initDb, getDb, saveDb, all, get, run };
