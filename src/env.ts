import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let loaded = false;

/**
 * Minimal, dependency-free .env loader.
 *
 * Populates process.env from a dotenv-style file WITHOUT overriding variables
 * that are already set — so an explicit env passed by the launcher (e.g. a
 * Claude `.mcp.json` `env` block or docker-compose `environment`) always wins
 * over the file. Called once, before config is read.
 *
 * Path resolution order: $ENV_FILE, then ./.env in the current working dir.
 */
export function loadDotenv(): void {
  if (loaded) return;
  loaded = true;

  const path = resolve(process.env.ENV_FILE ?? ".env");
  if (!existsSync(path)) return;

  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice(7) : line;
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;

    let value = withoutExport.slice(eq + 1).trim();
    // Strip a single pair of surrounding quotes, if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}
