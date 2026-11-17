import { afterEach, describe, it, expect } from "vitest";
import { createApp } from "./app.js";
import { memDb, seedKey, testConfig } from "../test-helpers.js";
import type { DB } from "../db/index.js";

const dbs: DB[] = [];
afterEach(() => dbs.splice(0).forEach((db) => db.close()));
function setup(overrides = {}) {
  const db = memDb();
  dbs.push(db);
  const app = createApp(db, testConfig(overrides));
  const key = seedKey(db);
  const call = (args: unknown, auth = key.plaintext) =>
    app.request("http://localhost:8787/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "publish_artifact", arguments: args },
      }),
    });
  return { app, db, call };
}

describe("MCP HTTP security upgrade compatibility", () => {
  it("keeps bundles larger than the new SDK default 4 MiB within our configured limit", async () => {
    const { call } = setup();
    const response = await call({
      html: "<p>bundle</p>",
      files: [{ path: "app.js", content: "x".repeat(4 * 1024 * 1024 + 128) }],
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.error).toBeUndefined();
    expect(result.result.isError).not.toBe(true);
    const artifact = result.result.structuredContent;
    expect(artifact.files[0].size).toBe(4 * 1024 * 1024 + 128);
  });

  it("still rejects requests beyond the configured body limit", async () => {
    const { call, db } = setup({ maxBundleBytes: 100, maxHtmlBytes: 100 });
    const response = await call({
      html: "<p>too large</p>",
      files: [{ path: "app.js", content: "x".repeat(1100000) }],
    });
    expect(response.status).toBe(413);
    expect(db.prepare("select count(*) as n from artifacts").get()).toEqual({
      n: 0,
    });
  });

  it("retains authentication and validates malformed tool arguments with Zod 4", async () => {
    const { call, db } = setup();
    expect((await call({ html: "<p>no</p>" }, "invalid")).status).toBe(401);
    const res = await call({ html: 42 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Boolean(body.error || body.result?.isError)).toBe(true);
    expect(db.prepare("select count(*) as n from artifacts").get()).toEqual({
      n: 0,
    });
  });
});
