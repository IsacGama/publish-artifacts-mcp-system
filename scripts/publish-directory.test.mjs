import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { directoryPayload } from "./publish-directory.mjs";

describe("directory publisher", () => {
  it("reads a portable HTML and binary file bundle without putting credentials in it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "beacons-publish-"));
    try {
      await writeFile(join(dir, "index.html"), "<p>hello</p>");
      await mkdir(join(dir, "assets"));
      await writeFile(join(dir, "assets/font.woff2"), Buffer.from([0, 255, 2]));
      const payload = await directoryPayload(dir, "Local prototype");
      assert.strictEqual(payload.html, "<p>hello</p>");
      assert.deepStrictEqual(payload.files, [
        { path: "assets/font.woff2", content: "AP8C", encoding: "base64" },
      ]);
      assert.strictEqual(payload.csp_mode, "strict");
      assert.strictEqual(payload.visibility, "unlisted");
      await symlink(join(dir, "index.html"), join(dir, "outside.txt"));
      await assert.rejects(
        directoryPayload(dir),
        new RegExp("Symlinks are not allowed"),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
