import { describe, it, expect } from "vitest";
import { createApp } from "./app.js";
import { memDb, testConfig, seedKey } from "../test-helpers.js";

const CONTROL = "http://localhost:8787";
const CONTENT = "http://content.localhost:8787";

function setup() {
  const db = memDb();
  const cfg = testConfig();
  const key = seedKey(db);
  const app = createApp(db, cfg);
  const bearer = { authorization: `Bearer ${key.plaintext}`, "content-type": "application/json" };
  return { app, bearer };
}

async function publish(app: ReturnType<typeof createApp>, bearer: Record<string, string>, body: object) {
  const res = await app.fetch(
    new Request(`${CONTROL}/api/artifacts`, { method: "POST", headers: bearer, body: JSON.stringify(body) }),
  );
  return { res, json: (await res.json()) as any };
}

describe("HTTP app (host-based isolation)", () => {
  it("requires an API key on the control plane", async () => {
    const { app } = setup();
    const res = await app.fetch(new Request(`${CONTROL}/api/artifacts`));
    expect(res.status).toBe(401);
  });

  it("publishes on control plane and serves on content plane with CSP", async () => {
    const { app, bearer } = setup();
    const { res, json } = await publish(app, bearer, { html: "<h1>hi</h1>", title: "T" });
    expect(res.status).toBe(201);
    expect(json.share_url).toContain(`${CONTENT}/a/`);

    const served = await app.fetch(new Request(json.share_url));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toContain("text/html");
    expect(served.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await served.text()).toContain("<h1>hi</h1>");
  });

  it("does NOT expose the API/admin surface on the content origin", async () => {
    const { app, bearer } = setup();
    // API path on the content host must not resolve to the control router
    const res = await app.fetch(
      new Request(`${CONTENT}/api/artifacts`, { headers: bearer }),
    );
    expect(res.status).toBe(404);
  });

  it("does NOT serve artifact content on the control origin", async () => {
    const { app, bearer } = setup();
    const { json } = await publish(app, bearer, { html: "<p>x</p>" });
    const res = await app.fetch(new Request(`${CONTROL}/a/${json.slug}`));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a missing or expired slug", async () => {
    const { app } = setup();
    const res = await app.fetch(new Request(`${CONTENT}/a/nonexistentnonexistent0`));
    expect(res.status).toBe(404);
  });

  it("serves the admin page shell on the control origin", async () => {
    const { app } = setup();
    const res = await app.fetch(new Request(`${CONTROL}/admin`));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Artifacts Admin");
  });

  it("deletes an artifact so the link stops resolving", async () => {
    const { app, bearer } = setup();
    const { json } = await publish(app, bearer, { html: "<p>bye</p>" });
    const del = await app.fetch(
      new Request(`${CONTROL}/api/artifacts/${json.id}`, { method: "DELETE", headers: bearer }),
    );
    expect(del.status).toBe(200);
    const served = await app.fetch(new Request(json.share_url));
    expect(served.status).toBe(404);
  });
});
