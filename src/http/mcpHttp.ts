import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { DB } from "../db/index.js";
import type { AppConfig } from "../config.js";
import { apiKeyAuth, type AuthEnv } from "./auth.js";
import { buildMcpServer } from "../mcp/tools.js";

/**
 * MCP over Streamable HTTP for remote clients.
 *
 * Stateless: each request authenticates via API key, builds a fresh owner-
 * scoped MCP server + transport, and serves that single request. This keeps
 * remote MCP owner-isolated exactly like the REST API, and avoids cross-request
 * session state on a horizontally scalable deployment.
 */
export function mcpHttpRouter(db: DB, cfg: AppConfig): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  app.use("*", apiKeyAuth(db, cfg));

  app.all("/", async (c) => {
    const ctx = c.get("toolCtx");
    const server = buildMcpServer(ctx);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  return app;
}
