#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../config.js";
import { getDb } from "../db/index.js";
import { authenticate } from "../core/apiKeys.js";
import { buildMcpServer, type ToolContext } from "./tools.js";

/**
 * Local stdio MCP entrypoint (for Claude Code / Claude Desktop).
 *
 * The key it acts as is supplied via the ARTIFACTS_API_KEY env var so that
 * artifacts created here are owner-scoped just like the HTTP path. All stderr
 * logging is safe; stdout is reserved for the JSON-RPC transport.
 */
async function main() {
  const cfg = loadConfig();
  const db = getDb(cfg.dbPath);

  const key = process.env.ARTIFACTS_API_KEY;
  if (!key) {
    console.error(
      "ARTIFACTS_API_KEY is not set. Create one with `npm run create-key` and " +
        "pass it via the MCP server env config.",
    );
    process.exit(1);
  }

  const owner = authenticate(db, key);
  if (!owner) {
    console.error("ARTIFACTS_API_KEY is invalid or has been revoked.");
    process.exit(1);
  }

  const ctx: ToolContext = {
    db,
    contentBaseUrl: cfg.contentBaseUrl,
    maxHtmlBytes: cfg.maxHtmlBytes,
    defaultCspMode: cfg.defaultCspMode,
    ownerKeyId: owner.id,
  };

  const server = buildMcpServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("publish-artifacts MCP (stdio) ready");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
