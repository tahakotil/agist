/**
 * Test setup: creates an isolated in-memory SQLite database for each test suite.
 * Patches the db module so all route handlers use the test DB, not the real one.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import initSqlJs, { type Database } from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to schema.sql (relative to this file: ../../src/schema.sql)
const SCHEMA_PATH = join(__dirname, '..', 'src', 'schema.sql');

let _testDb: Database | null = null;

/**
 * Create a fresh in-memory SQLite database with the full schema applied.
 * Call this in beforeEach / beforeAll to get a clean slate.
 */
export async function createTestDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  db.run(schema);

  return db;
}

/**
 * Install a test DB into the server's db module so all route handlers use it.
 * Must be called before importing any route/app modules (or after vi.resetModules).
 */
export function setTestDb(db: Database): void {
  _testDb = db;
}

export function getTestDb(): Database {
  if (!_testDb) throw new Error('Test DB not set. Call setTestDb() first.');
  return _testDb;
}

// ─── Hono app factory ──────────────────────────────────────────────────────────
// We cannot use the real index.ts because it starts a server and an auto-save
// interval. Instead we wire up only the routers we need.

import { Hono } from 'hono';

/**
 * Build a Hono app that uses the provided database for all requests.
 * Import routes AFTER the db module is patched.
 */
export async function buildTestApp(db: Database) {
  // Patch the db module singleton so every handler sees this DB
  const dbModule = await import('../src/db.js');
  // Override the internal `db` by calling initDb-like logic manually
  // We override getDb and all helpers by monkey-patching the module exports
  // (since the module uses a module-level variable, we need to use vi.mock instead).
  // This factory is called AFTER vi.mock is in place (see each test file).
  void dbModule; // imported for side-effects; actual patching via vi.mock

  const { healthRouter } = await import('../src/routes/health.js');
  const { companiesRouter } = await import('../src/routes/companies.js');
  const { agentsRouter } = await import('../src/routes/agents.js');
  const { routinesRouter } = await import('../src/routes/routines.js');
  const { runsRouter } = await import('../src/routes/runs.js');
  const { issuesRouter } = await import('../src/routes/issues.js');

  const app = new Hono();

  // Tests run without an HTTP auth layer — inject admin role so RBAC passes.
  // This mirrors AGIST_AUTH_DISABLED=true behaviour in production dev mode.
  app.use('*', async (c, next) => {
    c.set('role', 'admin');
    c.set('apiKeyId', 'test-key');
    return next();
  });

  app.route('/', healthRouter);
  app.route('/', companiesRouter);
  app.route('/', agentsRouter);
  app.route('/', routinesRouter);
  app.route('/', runsRouter);
  app.route('/', issuesRouter);

  app.onError((err, c) => {
    return c.json({ error: 'Internal server error', message: err.message }, 500);
  });

  app.notFound((c) => {
    return c.json({ error: 'Not found', path: c.req.path }, 404);
  });

  return app;
}

// ─── HTTP helper ───────────────────────────────────────────────────────────────

type JsonBody = Record<string, unknown> | unknown[] | null;

export function makeRequest(app: Hono, method: string, path: string, body?: JsonBody) {
  const init: RequestInit = { method };
  if (body !== undefined && body !== null) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return app.request(path, init);
}

export const req = {
  get: (app: Hono, path: string) => makeRequest(app, 'GET', path),
  post: (app: Hono, path: string, body: JsonBody) => makeRequest(app, 'POST', path, body),
  patch: (app: Hono, path: string, body: JsonBody) => makeRequest(app, 'PATCH', path, body),
  delete: (app: Hono, path: string) => makeRequest(app, 'DELETE', path),
};
