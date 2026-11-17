import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { memDb, testConfig, seedKey } from "../test-helpers.js";

const CONTROL = "http://localhost:8787";
const CONTENT = "http://content.localhost:8787";

function setup() {
  const db = memDb();
  const cfg = testConfig();
  const key = seedKey(db);
  const app = createApp(db, cfg);
  const bearer = {
    authorization: `Bearer ${key.plaintext}`,
    "content-type": "application/json",
  };
  return { app, bearer };
}

async function publish(
  app: ReturnType<typeof createApp>,
  bearer: Record<string, string>,
  body: object,
) {
  const res = await app.fetch(
    new Request(`${CONTROL}/api/artifacts`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify(body),
    }),
  );
  return { res, json: (await res.json()) as any };
}

describe("HTTP app (host-based isolation)", () => {
  it("requires an API key on the control plane", async () => {
    const { app } = setup();
    const res = await app.fetch(new Request(`${CONTROL}/api/artifacts`));
    assert.strictEqual(res.status, 401);
  });

  it("publishes on control plane and serves on content plane with CSP", async () => {
    const { app, bearer } = setup();
    const { res, json } = await publish(app, bearer, {
      html: "<h1>hi</h1>",
      title: "T",
    });
    assert.strictEqual(res.status, 201);
    assert.ok(json.share_url?.includes(`${CONTENT}/a/`));

    const served = await app.fetch(new Request(json.share_url));
    assert.strictEqual(served.status, 200);
    assert.ok(served.headers.get("content-type")?.includes("text/html"));
    assert.ok(
      served.headers
        .get("content-security-policy")
        ?.includes("connect-src 'none'"),
    );
    assert.strictEqual(served.headers.get("x-content-type-options"), "nosniff");
    assert.ok((await served.text())?.includes("<h1>hi</h1>"));
  });

  it("does NOT expose the API/admin surface on the content origin", async () => {
    const { app, bearer } = setup();
    // API path on the content host must not resolve to the control router
    const res = await app.fetch(
      new Request(`${CONTENT}/api/artifacts`, { headers: bearer }),
    );
    assert.strictEqual(res.status, 404);
  });

  it("does NOT serve artifact content on the control origin", async () => {
    const { app, bearer } = setup();
    const { json } = await publish(app, bearer, { html: "<p>x</p>" });
    const res = await app.fetch(new Request(`${CONTROL}/a/${json.slug}`));
    assert.strictEqual(res.status, 404);
  });

  it("returns 404 for a missing or expired slug", async () => {
    const { app } = setup();
    const res = await app.fetch(
      new Request(`${CONTENT}/a/nonexistentnonexistent0`),
    );
    assert.strictEqual(res.status, 404);
  });

  it("serves the admin page shell on the control origin", async () => {
    const { app } = setup();
    const res = await app.fetch(new Request(`${CONTROL}/admin`));
    assert.strictEqual(res.status, 200);
    assert.ok((await res.text())?.includes("Artifacts Admin"));
  });

  it("deletes an artifact so the link stops resolving", async () => {
    const { app, bearer } = setup();
    const { json } = await publish(app, bearer, { html: "<p>bye</p>" });
    const del = await app.fetch(
      new Request(`${CONTROL}/api/artifacts/${json.id}`, {
        method: "DELETE",
        headers: bearer,
      }),
    );
    assert.strictEqual(del.status, 200);
    const served = await app.fetch(new Request(json.share_url));
    assert.strictEqual(served.status, 404);
  });
});
