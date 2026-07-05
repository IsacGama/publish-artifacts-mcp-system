#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { getDb } from "./db/index.js";
import { createApp } from "./http/app.js";

const cfg = loadConfig();
const db = getDb(cfg.dbPath);
const app = createApp(db, cfg);

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`publish-artifacts server listening on :${info.port}`);
  console.log(`  control : ${cfg.controlBaseUrl}  (admin at ${cfg.controlBaseUrl}/admin, MCP at /mcp)`);
  console.log(`  content : ${cfg.contentBaseUrl}  (artifacts at /a/:slug)`);
  if (cfg.allowSameOrigin) console.log("  ⚠  ALLOW_SAME_ORIGIN=1 — dev only, origins NOT isolated");
});
