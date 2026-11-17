import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
  const content = (res as { content: Array<{ type: string; text: string }> })
    .content;
  return JSON.parse(content[0]!.text);
}

describe("MCP tools (in-memory)", () => {
  it("exposes the full tool set", async () => {
    const db = memDb();
    const owner = seedKey(db);
    const client = await connectedClient({
      ...testDeps(db),
      ownerKeyId: owner.id,
    });
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepStrictEqual(
      names,
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
    const client = await connectedClient({
      ...testDeps(db),
      ownerKeyId: owner.id,
    });

    const published = parse(
      await client.callTool({
        name: "publish_artifact",
        arguments: { html: "<h1>hello</h1>", title: "Greeting" },
      }),
    );
    assert.match(published.share_url, /\/a\/[A-Za-z0-9_-]{22}$/);

    const share = parse(
      await client.callTool({
        name: "get_share_link",
        arguments: { id: published.id, rotate: true },
      }),
    );
    assert.notStrictEqual(share.slug, published.slug);

    const updated = parse(
      await client.callTool({
        name: "update_artifact",
        arguments: { id: published.id, title: "Renamed" },
      }),
    );
    assert.strictEqual(updated.title, "Renamed");

    const list = parse(
      await client.callTool({ name: "list_artifacts", arguments: {} }),
    );
    assert.strictEqual(list.total, 1);

    const del = parse(
      await client.callTool({
        name: "delete_artifact",
        arguments: { id: published.id },
      }),
    );
    assert.strictEqual(del.ok, true);
  });

  it("returns an error result for a missing artifact", async () => {
    const db = memDb();
    const owner = seedKey(db);
    const client = await connectedClient({
      ...testDeps(db),
      ownerKeyId: owner.id,
    });
    const res = (await client.callTool({
      name: "get_artifact",
      arguments: { id: "nonexistent" },
    })) as { isError?: boolean };
    assert.strictEqual(res.isError, true);
  });
  it("publishes local files through MCP and preserves them on metadata updates", async () => {
    const db = memDb();
    const owner = seedKey(db);
    const client = await connectedClient({
      ...testDeps(db),
      ownerKeyId: owner.id,
    });
    const a = parse(
      await client.callTool({
        name: "publish_artifact",
        arguments: {
          html: '<script src="./app.js"></script>',
          files: [{ path: "app.js", content: "window.ok=true" }],
        },
      }),
    );
    assert.strictEqual(a.files[0].path, "app.js");
    const updated = parse(
      await client.callTool({
        name: "update_artifact",
        arguments: { id: a.id, title: "updated" },
      }),
    );
    assert.deepStrictEqual(updated.files, a.files);
    const cleared = parse(
      await client.callTool({
        name: "update_artifact",
        arguments: { id: a.id, files: [] },
      }),
    );
    assert.deepStrictEqual(cleared.files, []);
    await client.close();
    db.close();
  });
});
