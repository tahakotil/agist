/**
 * Standalone migration runner.
 * Usage: tsx src/migrate.ts [db-path]
 * Default db path: ./agent-platform.db
 */

import { createDb } from "./db.js";
import { resolve } from "path";
import { writeFileSync } from "fs";

const dbPath = resolve(process.argv[2] ?? "agent-platform.db");

console.log(`Running migrations on: ${dbPath}`);
const db = await createDb(dbPath);
console.log("Migrations complete.");

// Persist the database to disk
const data = db.export();
writeFileSync(dbPath, Buffer.from(data));
db.close();
