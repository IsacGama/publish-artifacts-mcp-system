import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

/**
 * Opens (creating if needed) the SQLite database at `dbPath`, applies the
 * schema, and enables WAL mode so the HTTP server and the stdio MCP process
 * can safely share the same file concurrently.
 */
export function openDatabase(dbPath: string): DB {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}

let shared: DB | null = null;

/** Process-wide shared connection, opened lazily from the given path. */
export function getDb(dbPath: string): DB {
  if (!shared) shared = openDatabase(dbPath);
  return shared;
}

/** Test helper: close and forget the shared connection. */
export function closeSharedDb(): void {
  if (shared) {
    shared.close();
    shared = null;
  }
}
