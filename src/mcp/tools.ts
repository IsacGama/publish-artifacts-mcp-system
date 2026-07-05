import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ArtifactServiceDeps } from "../core/artifacts.js";
import {
  publishArtifact,
  updateArtifact,
  deleteArtifact,
  getArtifact,
  listArtifacts,
} from "../core/artifacts.js";
import { getShareLink } from "../core/shareLinks.js";
import { NotFoundError } from "../core/types.js";
import { PayloadTooLargeError } from "../security/limits.js";

/** Context every tool call runs within: the resolved owner key + service deps. */
export interface ToolContext extends ArtifactServiceDeps {
  ownerKeyId: string;
}

const visibility = z.enum(["public", "unlisted"]);
const cspMode = z.enum(["strict", "relaxed"]);

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function fail(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

/** Wraps a tool body, translating domain errors into MCP error results. */
async function guard<T>(fn: () => T | Promise<T>) {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof NotFoundError) return fail(err.message);
    if (err instanceof PayloadTooLargeError) return fail(err.message);
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Builds an McpServer whose tools act on behalf of a single owner key.
 * Shared by both the stdio transport and the per-request HTTP transport.
 */
export function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({
    name: "publish-artifacts-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "publish_artifact",
    {
      title: "Publish HTML artifact",
      description:
        "Publish a self-contained HTML document and get back a shareable link. " +
        "Content is served on an isolated origin under a strict Content-Security-Policy.",
      inputSchema: {
        html: z.string().min(1).describe("The full HTML document to publish"),
        title: z.string().optional(),
        description: z.string().optional(),
        visibility: visibility.optional().describe("public (listed) or unlisted (default)"),
        csp_mode: cspMode
          .optional()
          .describe("strict blocks network egress (default); relaxed allows https network"),
        expires_at: z
          .string()
          .datetime()
          .optional()
          .describe("ISO timestamp after which the link stops resolving"),
        sanitize: z
          .boolean()
          .optional()
          .describe("If true, strip scripts/handlers via DOMPurify before storing"),
      },
    },
    async (args) => guard(() => publishArtifact(ctx, ctx.ownerKeyId, args)),
  );

  server.registerTool(
    "update_artifact",
    {
      title: "Update an artifact",
      description: "Update any subset of an owned artifact's fields by id.",
      inputSchema: {
        id: z.string().min(1),
        html: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        visibility: visibility.optional(),
        csp_mode: cspMode.optional(),
        expires_at: z.string().datetime().nullable().optional(),
        sanitize: z.boolean().optional(),
      },
    },
    async ({ id, ...rest }) => guard(() => updateArtifact(ctx, ctx.ownerKeyId, id, rest)),
  );

  server.registerTool(
    "delete_artifact",
    {
      title: "Delete an artifact",
      description: "Permanently delete an owned artifact by id.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) =>
      guard(() => {
        const removed = deleteArtifact(ctx, ctx.ownerKeyId, id);
        if (!removed) throw new NotFoundError(`Artifact ${id} not found`);
        return { ok: true, id };
      }),
  );

  server.registerTool(
    "get_artifact",
    {
      title: "Get an artifact",
      description: "Fetch metadata (and optionally the HTML) for an owned artifact.",
      inputSchema: {
        id: z.string().min(1),
        include_html: z.boolean().optional(),
      },
    },
    async ({ id, include_html }) =>
      guard(() => getArtifact(ctx, ctx.ownerKeyId, id, include_html ?? false)),
  );

  server.registerTool(
    "list_artifacts",
    {
      title: "List artifacts",
      description: "List artifacts owned by the calling key, newest first.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
        visibility: visibility.optional(),
      },
    },
    async ({ limit, offset, visibility: vis }) =>
      guard(() => listArtifacts(ctx, ctx.ownerKeyId, { limit, offset, visibility: vis })),
  );

  server.registerTool(
    "get_share_link",
    {
      title: "Get / rotate share link",
      description:
        "Return the public share URL for an owned artifact. Set rotate=true to " +
        "generate a new slug, immediately invalidating the previous link.",
      inputSchema: {
        id: z.string().min(1),
        rotate: z.boolean().optional(),
      },
    },
    async ({ id, rotate }) =>
      guard(() => {
        const meta = getShareLink(ctx, ctx.ownerKeyId, id, rotate ?? false);
        return { id: meta.id, slug: meta.slug, share_url: meta.share_url };
      }),
  );

  return server;
}
