import initSqlJs, { type Database } from "sql.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createDb(path: string): Promise<Database> {
  const SQL = await initSqlJs();

  let db: Database;
  try {
    const fileBuffer = readFileSync(path);
    db = new SQL.Database(fileBuffer);
  } catch {
    // File doesn't exist yet — create a new in-memory DB (will be saved on close)
    db = new SQL.Database();
  }

  db.run("PRAGMA foreign_keys = ON");

  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");

  // Split on semicolons and execute each non-empty statement individually
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("PRAGMA"));

  for (const stmt of statements) {
    db.run(stmt);
  }

  return db;
}
