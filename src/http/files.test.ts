import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { memDb, testConfig, seedKey } from "../test-helpers.js";
import type { DB } from "../db/index.js";

const C = "http://localhost:8787";
const databases: DB[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function setup(overrides = {}) {
  const db = memDb();
  databases.push(db);
  const app = createApp(db, testConfig(overrides));
  const key = seedKey(db);
  const headers = {
    authorization: `Bearer ${key.plaintext}`,
    "content-type": "application/json",
  };
  const api = (path: string, method = "GET", data?: unknown) =>
    app.request(`${C}/api/artifacts${path}`, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  return { db, app, api };
}
const files = [
  { path: "assets/app.mjs", content: "import './chunk.mjs';" },
  { path: "assets/chunk.mjs", content: "window.loaded = true" },
  { path: "assets/site.css", content: "body { color: red }" },
  {
    path: "assets/font.woff2",
    content: Buffer.from([0, 255, 1, 2]).toString("base64"),
    encoding: "base64",
  },
];

describe("artifact file publication", () => {
  it("round trips binary and text with MIME, relative URLs, scoped CSP and origin isolation", async () => {
    const { api, app } = setup();
    const published = await api("", "POST", {
      html: '<script type="module" src="./assets/app.mjs"></script>',
      files,
    });
    assert.strictEqual(published.status, 201);
    const a = await published.json();
    assert.strictEqual(a.files.length, 4);
    assert.strictEqual(a.files[0].sha256.length, 64);
    const redirect = await app.request(a.share_url);
    assert.strictEqual(redirect.status, 302);
    assert.strictEqual(redirect.headers.get("location"), `/a/${a.slug}/`);
    const page = await app.request(a.share_url + "/");
    const csp = page.headers.get("content-security-policy")!;
    assert.ok(csp?.includes(`http://content.localhost:8787/a/${a.slug}/`));
    assert.ok(csp?.includes("connect-src 'none'"));
    for (const file of files) {
      const res = await app.request(`${a.share_url}/${file.path}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("cache-control"), "no-store");
      assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
      assert.deepStrictEqual(
        Buffer.from(await res.arrayBuffer()),
        Buffer.from(
          file.content,
          file.encoding === "base64" ? "base64" : "utf8",
        ),
      );
      assert.strictEqual(
        (await app.request(`${C}/a/${a.slug}/${file.path}`)).status,
        404,
      );
    }
    assert.ok(
      (await app.request(`${a.share_url}/assets/app.mjs`)).headers
        .get("content-type")
        ?.includes("text/javascript"),
    );
    assert.strictEqual(
      (await app.request(`${a.share_url}/assets/font.woff2`)).headers.get(
        "content-type",
      ),
      "font/woff2",
    );
    assert.strictEqual(
      (await app.request(`${a.share_url}/missing.js`)).status,
      404,
    );
    assert.strictEqual((await api(`/${a.id}`)).status, 200);
  });

  it("preserves files on HTML updates, replaces atomically and clears explicitly", async () => {
    const { api, app } = setup();
    const a = await (await api("", "POST", { html: "old", files })).json();
    await api(`/${a.id}`, "PATCH", { html: "new" });
    assert.strictEqual(
      (await app.request(a.share_url + "/assets/app.mjs")).status,
      200,
    );
    assert.strictEqual(
      (
        await api(`/${a.id}`, "PATCH", {
          html: "bad",
          files: [{ path: "../bad.js", content: "bad" }],
        })
      ).status,
      400,
    );
    assert.strictEqual(
      await (await app.request(a.share_url + "/")).text(),
      "new",
    );
    await api(`/${a.id}`, "PATCH", {
      files: [{ path: "only.css", content: "p{}" }],
    });
    assert.strictEqual(
      (await app.request(a.share_url + "/assets/app.mjs")).status,
      404,
    );
    assert.strictEqual(
      (await app.request(a.share_url + "/only.css")).status,
      200,
    );
    await api(`/${a.id}`, "PATCH", { files: [] });
    assert.strictEqual((await app.request(a.share_url)).status, 200);
    assert.strictEqual(
      (await app.request(a.share_url + "/only.css")).status,
      404,
    );
  });

  it("revokes file URLs with rotation, expiry and deletion and prevents cross-owner writes", async () => {
    const { api, app, db } = setup();
    const a = await (await api("", "POST", { html: "hi", files })).json();
    const bob = seedKey(db);
    const forbidden = await app.request(`${C}/api/artifacts/${a.id}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${bob.plaintext}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ files: [] }),
    });
    assert.strictEqual(forbidden.status, 404);
    const rotated = await (
      await api(`/${a.id}/share`, "POST", { rotate: true })
    ).json();
    assert.strictEqual(
      (await app.request(a.share_url + "/assets/app.mjs")).status,
      404,
    );
    assert.strictEqual(
      (await app.request(rotated.share_url + "/assets/app.mjs")).status,
      200,
    );
    await api(`/${a.id}`, "PATCH", { expires_at: "2000-01-01T00:00:00.000Z" });
    assert.strictEqual(
      (await app.request(rotated.share_url + "/assets/app.mjs")).status,
      404,
    );
    await api(`/${a.id}`, "DELETE");
    assert.deepStrictEqual(
      db.prepare("SELECT count(*) AS n FROM artifact_files").get(),
      { n: 0 },
    );
  });

  it("rejects unsafe paths, active documents, invalid encoding, duplicate names and limits", async () => {
    const { api } = setup({
      maxFileBytes: 32,
      maxBundleBytes: 40,
      maxFiles: 2,
    });
    for (const path of [
      "../x.js",
      "/x.js",
      "a//x.js",
      "a/../x.js",
      "a\\x.js",
      "a/%2e.js",
      "index.html",
      "foo.html",
      "x.constructor",
    ]) {
      assert.strictEqual(
        (await api("", "POST", { html: "x", files: [{ path, content: "x" }] }))
          .status,
        400,
      );
    }
    assert.strictEqual(
      (
        await api("", "POST", {
          html: "x",
          files: [{ path: "x.js", content: "???", encoding: "base64" }],
        })
      ).status,
      400,
    );
    assert.strictEqual(
      (await api("", "POST", { html: "x", files: [files[0], files[0]] }))
        .status,
      400,
    );
    assert.strictEqual(
      (await api("", "POST", { html: "x", files })).status,
      400,
    );
    assert.strictEqual(
      (
        await api("", "POST", {
          html: "x",
          files: [{ path: "x.js", content: "x".repeat(33) }],
        })
      ).status,
      413,
    );
    assert.strictEqual(
      (
        await api("", "POST", {
          html: "x".repeat(20),
          files: [{ path: "x.js", content: "x".repeat(21) }],
        })
      ).status,
      413,
    );
  });

  it("retains the single-HTML contract, including sanitize", async () => {
    const { api, app } = setup();
    const a = await (
      await api("", "POST", {
        html: "<p>safe</p><script>alert(1)</script>",
        sanitize: true,
      })
    ).json();
    const page = await app.request(a.share_url);
    assert.strictEqual(page.status, 200);
    const html = await page.text();
    assert.ok(html?.includes("<p>safe</p>"));
    assert.ok(!html?.includes("<script>"));
    assert.ok(
      !page.headers.get("content-security-policy")?.includes(`/a/${a.slug}/`),
    );
  });
  it("bounds raw HTTP bodies before parsing, even without Content-Length", async () => {
    const { app } = setup({ maxHtmlBytes: 10, maxBundleBytes: 20 });
    const res = await app.request(`${C}/api/artifacts`, {
      method: "POST",
      body: "x".repeat(1100000),
    });
    assert.strictEqual(res.status, 413);
  });

  it("checks bundle size when replacing only HTML and preserves the prior revision", async () => {
    const { api, app } = setup({ maxBundleBytes: 20 });
    const a = await (
      await api("", "POST", {
        html: "a",
        files: [{ path: "a.js", content: "x".repeat(15) }],
      })
    ).json();
    assert.strictEqual(
      (await api(`/${a.id}`, "PATCH", { html: "123456" })).status,
      413,
    );
    assert.strictEqual(
      await (await app.request(a.share_url + "/")).text(),
      "a",
    );
  });
});
