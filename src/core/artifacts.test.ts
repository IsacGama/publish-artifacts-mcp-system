import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memDb, testDeps, seedKey } from "../test-helpers.js";
import {
  publishArtifact,
  updateArtifact,
  deleteArtifact,
  getArtifact,
  listArtifacts,
} from "./artifacts.js";
import { resolveForServe, getShareLink, isExpired } from "./shareLinks.js";
import { NotFoundError } from "./types.js";
import { PayloadTooLargeError } from "../security/limits.js";

describe("artifacts service", () => {
  it("publishes and produces a share url on the content origin", () => {
    const db = memDb();
    const deps = testDeps(db);
    const owner = seedKey(db);
    const a = publishArtifact(deps, owner.id, {
      html: "<h1>hi</h1>",
      title: "T",
    });
    assert.strictEqual(a.slug.length, 22);
    assert.strictEqual(
      a.share_url,
      `http://content.localhost:8787/a/${a.slug}`,
    );
    assert.strictEqual(a.visibility, "unlisted");
    assert.strictEqual(a.csp_mode, "strict");
  });

  it("enforces owner scoping across all operations", () => {
    const db = memDb();
    const deps = testDeps(db);
    const alice = seedKey(db, "alice");
    const bob = seedKey(db, "bob");
    const a = publishArtifact(deps, alice.id, { html: "<p>a</p>" });

    // bob cannot see, update, or delete alice's artifact
    assert.throws(() => getArtifact(deps, bob.id, a.id), NotFoundError);
    assert.throws(
      () => updateArtifact(deps, bob.id, a.id, { title: "hack" }),
      NotFoundError,
    );
    assert.strictEqual(deleteArtifact(deps, bob.id, a.id), false);

    // bob's listing is empty; alice sees one
    assert.strictEqual(listArtifacts(deps, bob.id).total, 0);
    assert.strictEqual(listArtifacts(deps, alice.id).total, 1);
  });

  it("updates only provided fields", () => {
    const db = memDb();
    const deps = testDeps(db);
    const owner = seedKey(db);
    const a = publishArtifact(deps, owner.id, {
      html: "<p>1</p>",
      title: "orig",
    });
    const upd = updateArtifact(deps, owner.id, a.id, { title: "new" });
    assert.strictEqual(upd.title, "new");
    const full = getArtifact(deps, owner.id, a.id, true);
    assert.strictEqual(full.html, "<p>1</p>"); // unchanged
  });

  it("rejects oversized html", () => {
    const db = memDb();
    const deps = { ...testDeps(db), maxHtmlBytes: 10 };
    const owner = seedKey(db);
    assert.throws(
      () => publishArtifact(deps, owner.id, { html: "x".repeat(50) }),
      PayloadTooLargeError,
    );
  });

  it("strips scripts when sanitize=true", () => {
    const db = memDb();
    const deps = testDeps(db);
    const owner = seedKey(db);
    const a = publishArtifact(deps, owner.id, {
      html: "<div>ok</div><script>alert(1)</script>",
      sanitize: true,
    });
    const full = getArtifact(deps, owner.id, a.id, true);
    assert.ok(!full.html?.includes("<script>"));
    assert.ok(full.html?.includes("ok"));
  });

  it("resolves for serve by slug, respecting expiry", () => {
    const db = memDb();
    const deps = testDeps(db);
    const owner = seedKey(db);
    const past = new Date(Date.now() - 1000).toISOString();
    const live = publishArtifact(deps, owner.id, { html: "<p>live</p>" });
    const dead = publishArtifact(deps, owner.id, {
      html: "<p>dead</p>",
      expires_at: past,
    });

    assert.strictEqual(resolveForServe(db, live.slug)?.html, "<p>live</p>");
    assert.strictEqual(resolveForServe(db, dead.slug), null);
    assert.strictEqual(resolveForServe(db, "does-not-exist"), null);
    assert.strictEqual(isExpired({ expires_at: past }), true);
    assert.strictEqual(isExpired({ expires_at: null }), false);
  });

  it("rotates the share slug, invalidating the old link", () => {
    const db = memDb();
    const deps = testDeps(db);
    const owner = seedKey(db);
    const a = publishArtifact(deps, owner.id, { html: "<p>x</p>" });
    const oldSlug = a.slug;
    const rotated = getShareLink(deps, owner.id, a.id, true);
    assert.notStrictEqual(rotated.slug, oldSlug);
    assert.strictEqual(resolveForServe(db, oldSlug), null);
    assert.notStrictEqual(resolveForServe(db, rotated.slug), null);
  });
});
