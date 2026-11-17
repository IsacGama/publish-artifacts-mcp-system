import { afterEach, describe, it, expect } from "vitest";
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
    expect(published.status).toBe(201);
    const a = await published.json();
    expect(a.files).toHaveLength(4);
    expect(a.files[0].sha256).toHaveLength(64);
    const redirect = await app.request(a.share_url);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe(`/a/${a.slug}/`);
    const page = await app.request(a.share_url + "/");
    const csp = page.headers.get("content-security-policy")!;
    expect(csp).toContain(`http://content.localhost:8787/a/${a.slug}/`);
    expect(csp).toContain("connect-src 'none'");
    for (const file of files) {
      const res = await app.request(`${a.share_url}/${file.path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(Buffer.from(await res.arrayBuffer())).toEqual(
        Buffer.from(
          file.content,
          file.encoding === "base64" ? "base64" : "utf8",
        ),
      );
      expect((await app.request(`${C}/a/${a.slug}/${file.path}`)).status).toBe(
        404,
      );
    }
    expect(
      (await app.request(`${a.share_url}/assets/app.mjs`)).headers.get(
        "content-type",
      ),
    ).toContain("text/javascript");
    expect(
      (await app.request(`${a.share_url}/assets/font.woff2`)).headers.get(
        "content-type",
      ),
    ).toBe("font/woff2");
    expect((await app.request(`${a.share_url}/missing.js`)).status).toBe(404);
    expect((await api(`/${a.id}`)).status).toBe(200);
  });

  it("preserves files on HTML updates, replaces atomically and clears explicitly", async () => {
    const { api, app } = setup();
    const a = await (await api("", "POST", { html: "old", files })).json();
    await api(`/${a.id}`, "PATCH", { html: "new" });
    expect((await app.request(a.share_url + "/assets/app.mjs")).status).toBe(
      200,
    );
    expect(
      (
        await api(`/${a.id}`, "PATCH", {
          html: "bad",
          files: [{ path: "../bad.js", content: "bad" }],
        })
      ).status,
    ).toBe(400);
    expect(await (await app.request(a.share_url + "/")).text()).toBe("new");
    await api(`/${a.id}`, "PATCH", {
      files: [{ path: "only.css", content: "p{}" }],
    });
    expect((await app.request(a.share_url + "/assets/app.mjs")).status).toBe(
      404,
    );
    expect((await app.request(a.share_url + "/only.css")).status).toBe(200);
    await api(`/${a.id}`, "PATCH", { files: [] });
    expect((await app.request(a.share_url)).status).toBe(200);
    expect((await app.request(a.share_url + "/only.css")).status).toBe(404);
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
    expect(forbidden.status).toBe(404);
    const rotated = await (
      await api(`/${a.id}/share`, "POST", { rotate: true })
    ).json();
    expect((await app.request(a.share_url + "/assets/app.mjs")).status).toBe(
      404,
    );
    expect(
      (await app.request(rotated.share_url + "/assets/app.mjs")).status,
    ).toBe(200);
    await api(`/${a.id}`, "PATCH", { expires_at: "2000-01-01T00:00:00.000Z" });
    expect(
      (await app.request(rotated.share_url + "/assets/app.mjs")).status,
    ).toBe(404);
    await api(`/${a.id}`, "DELETE");
    expect(
      db.prepare("SELECT count(*) AS n FROM artifact_files").get(),
    ).toEqual({ n: 0 });
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
      expect(
        (await api("", "POST", { html: "x", files: [{ path, content: "x" }] }))
          .status,
      ).toBe(400);
    }
    expect(
      (
        await api("", "POST", {
          html: "x",
          files: [{ path: "x.js", content: "???", encoding: "base64" }],
        })
      ).status,
    ).toBe(400);
    expect(
      (await api("", "POST", { html: "x", files: [files[0], files[0]] }))
        .status,
    ).toBe(400);
    expect((await api("", "POST", { html: "x", files })).status).toBe(400);
    expect(
      (
        await api("", "POST", {
          html: "x",
          files: [{ path: "x.js", content: "x".repeat(33) }],
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await api("", "POST", {
          html: "x".repeat(20),
          files: [{ path: "x.js", content: "x".repeat(21) }],
        })
      ).status,
    ).toBe(413);
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
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<p>safe</p>");
    expect(html).not.toContain("<script>");
    expect(page.headers.get("content-security-policy")).not.toContain(
      `/a/${a.slug}/`,
    );
  });
  it("bounds raw HTTP bodies before parsing, even without Content-Length", async () => {
    const { app } = setup({ maxHtmlBytes: 10, maxBundleBytes: 20 });
    const res = await app.request(`${C}/api/artifacts`, { method: "POST", body: "x".repeat(1100000) });
    expect(res.status).toBe(413);
  });

  it("checks bundle size when replacing only HTML and preserves the prior revision", async () => {
    const { api, app } = setup({ maxBundleBytes: 20 });
    const a = await (await api("", "POST", { html: "a", files: [{ path: "a.js", content: "x".repeat(15) }] })).json();
    expect((await api(`/${a.id}`, "PATCH", { html: "123456" })).status).toBe(413);
    expect(await (await app.request(a.share_url + "/")).text()).toBe("a");
  });

});
