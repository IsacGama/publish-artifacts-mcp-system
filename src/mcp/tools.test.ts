import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer, type ToolContext } from "./tools.js";
import { memDb, testDeps, seedKey } from "../test-helpers.js";

async function connectedClient(ctx: ToolContext) {
  const server = buildMcpServer(ctx);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

function parse(res: unknown): any {
  const content = (res as { content: Array<{ type: string; text: string }> }).content;
  return JSON.parse(content[0]!.text);
}

describe("MCP tools (in-memory)", () => {
  it("exposes the full tool set", async () => {
    const db = memDb();
    const owner = seedKey(db);
    const client = await connectedClient({ ...testDeps(db), ownerKeyId: owner.id });
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "delete_artifact",
        "get_artifact",
        "get_share_link",
        "list_artifacts",
        "publish_artifact",
        "update_artifact",
      ].sort(),
    );
  });

  it("runs a full publish -> share -> update -> delete lifecycle", async () => {
    const db = memDb();
    const owner = seedKey(db);
    const client = await connectedClient({ ...testDeps(db), ownerKeyId: owner.id });

    const published = parse(
      await client.callTool({
        name: "publish_artifact",
        arguments: { html: "<h1>hello</h1>", title: "Greeting" },
      }),
    );
    expect(published.share_url).toMatch(/\/a\/[A-Za-z0-9_-]{22}$/);

    const share = parse(
      await client.callTool({ name: "get_share_link", arguments: { id: published.id, rotate: true } }),
    );
    expect(share.slug).not.toBe(published.slug);

    const updated = parse(
      await client.callTool({
        name: "update_artifact",
        arguments: { id: published.id, title: "Renamed" },
      }),
    );
    expect(updated.title).toBe("Renamed");

    const list = parse(await client.callTool({ name: "list_artifacts", arguments: {} }));
    expect(list.total).toBe(1);

    const del = parse(await client.callTool({ name: "delete_artifact", arguments: { id: published.id } }));
    expect(del.ok).toBe(true);
  });

  it("returns an error result for a missing artifact", async () => {
    const db = memDb();
    const owner = seedKey(db);
    const client = await connectedClient({ ...testDeps(db), ownerKeyId: owner.id });
    const res = (await client.callTool({
      name: "get_artifact",
      arguments: { id: "nonexistent" },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });
});
