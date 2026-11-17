#!/usr/bin/env node
// Upload only a prepared static directory. Build/extract local packages first.
import { readdir, readFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function directoryPayload(directory, title) {
  const root = resolve(directory);
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Symlinks are not allowed: ${path}`);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const name = relative(root, path).split("\\").join("/");
        if (name !== "index.html")
          files.push({
            path: name,
            content: (await readFile(path)).toString("base64"),
            encoding: "base64",
          });
      }
    }
  }
  await walk(root);
  return {
    html: await readFile(join(root, "index.html"), "utf8"),
    title: title || "Static artifact",
    files,
    csp_mode: "strict",
    visibility: "unlisted",
  };
}

export async function publishDirectory(directory, title) {
  const key = process.env.ARTIFACTS_API_KEY;
  const base = process.env.CONTROL_BASE_URL?.replace(/\/+$/, "");
  if (!key || !base)
    throw new Error("Set ARTIFACTS_API_KEY and CONTROL_BASE_URL");
  const payload = await directoryPayload(directory, title);
  const client = new Client({
    name: "beacons-directory-publisher",
    version: "0.2.0",
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
      }),
    );
    const result = await client.callTool({
      name: "publish_artifact",
      arguments: payload,
    });
    if (result.isError)
      throw new Error(result.content.map((c) => c.text ?? "").join("\n"));
    return result.structuredContent ?? JSON.parse(result.content[0].text);
  } finally {
    await client.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = process.argv[2];
  if (!directory) {
    console.error('Usage: npm run publish:directory -- ./site "Title"');
    process.exit(1);
  }
  publishDirectory(directory, process.argv[3])
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}
