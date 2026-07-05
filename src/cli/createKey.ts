#!/usr/bin/env node
import { loadConfig } from "../config.js";
import { getDb } from "../db/index.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../core/apiKeys.js";

/**
 * Bootstrap / manage API keys from the command line.
 *
 *   npm run create-key -- "my laptop"     create a key (prints plaintext ONCE)
 *   npm run create-key -- --list          list keys (no secrets)
 *   npm run create-key -- --revoke <id>   revoke a key
 */
function main() {
  const cfg = loadConfig();
  const db = getDb(cfg.dbPath);
  const args = process.argv.slice(2);

  if (args[0] === "--list") {
    console.table(listApiKeys(db));
    return;
  }

  if (args[0] === "--revoke") {
    const id = args[1];
    if (!id) {
      console.error("Usage: --revoke <key-id>");
      process.exit(1);
    }
    console.log(revokeApiKey(db, id) ? `Revoked ${id}` : `No active key ${id}`);
    return;
  }

  const label = args.join(" ").trim() || "unnamed";
  const key = createApiKey(db, label);
  console.log("\nAPI key created. Store it now — it will NOT be shown again:\n");
  console.log(`  id:    ${key.id}`);
  console.log(`  label: ${key.label}`);
  console.log(`  key:   ${key.plaintext}\n`);
  console.log("Use it as a Bearer token (HTTP) or the ARTIFACTS_API_KEY env var (stdio MCP).\n");
}

main();
