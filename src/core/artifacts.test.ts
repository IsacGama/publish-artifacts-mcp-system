import { describe, it, expect } from "vitest";
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
    const a = publishArtifact(deps, owner.id, { html: "<h1>hi</h1>", title: "T" });
    expect(a.slug).toHaveLength(22);
    expect(a.share_url).toBe(`http://content.localhost:8787/a/${a.slug}`);
    expect(a.visibility).toBe("unlisted");
    expect(a.csp_mode).toBe("strict");
  });

  it("enforces owner scoping across all operations", () => {
    const db = memDb();
    const deps = testDeps(db);
    const alice = seedKey(db, "alice");
    const bob = seedKey(db, "bob");
    const a = publishArtifact(deps, alice.id, { html: "<p>a</p>" });

    // bob cannot see, update, or delete alice's artifact
    expect(() => getArtifact(deps, bob.id, a.id)).toThrow(NotFoundError);
    expect(() => updateArtifact(deps, bob.id, a.id, { title: "hack" })).toThrow(NotFoundError);
    expect(deleteArtifact(deps, bob.id, a.id)).toBe(false);

    // bob's listing is empty; alice sees one
    expect(listArtifacts(deps, bob.id).total).toBe(0);
    expect(listArtifacts(deps, alice.id).total).toBe(1);
  });

  it("updates only provided fields", () => {
    const db = memDb();
    const deps = testDeps(db);
    const owner = seedKey(db);
    const a = publishArtifact(deps, owner.id, { html: "<p>1</p>", title: "orig" });
    const upd = updateArtifact(deps, owner.id, a.id, { title: "new" });
    expect(upd.title).toBe("new");
    const full = getArtifact(deps, owner.id, a.id, true);
    expect(full.html).toBe("<p>1</p>"); // unchanged
  });

  it("rejects oversized html", () => {
    const db = memDb();
    const deps = { ...testDeps(db), maxHtmlBytes: 10 };
    const owner = seedKey(db);
    expect(() => publishArtifact(deps, owner.id, { html: "x".repeat(50) })).toThrow(
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
    expect(full.html).not.toContain("<script>");
    expect(full.html).toContain("ok");
  });

  it("resolves for serve by slug, respecting expiry", () => {
    const db = memDb();
    const deps = testDeps(db);
    const owner = seedKey(db);
    const past = new Date(Date.now() - 1000).toISOString();
    const live = publishArtifact(deps, owner.id, { html: "<p>live</p>" });
    const dead = publishArtifact(deps, owner.id, { html: "<p>dead</p>", expires_at: past });

    expect(resolveForServe(db, live.slug)?.html).toBe("<p>live</p>");
    expect(resolveForServe(db, dead.slug)).toBeNull();
    expect(resolveForServe(db, "does-not-exist")).toBeNull();
    expect(isExpired({ expires_at: past })).toBe(true);
    expect(isExpired({ expires_at: null })).toBe(false);
  });

  it("rotates the share slug, invalidating the old link", () => {
    const db = memDb();
    const deps = testDeps(db);
    const owner = seedKey(db);
    const a = publishArtifact(deps, owner.id, { html: "<p>x</p>" });
    const oldSlug = a.slug;
    const rotated = getShareLink(deps, owner.id, a.id, true);
    expect(rotated.slug).not.toBe(oldSlug);
    expect(resolveForServe(db, oldSlug)).toBeNull();
    expect(resolveForServe(db, rotated.slug)).not.toBeNull();
  });
});
