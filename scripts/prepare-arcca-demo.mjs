#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, copyFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const exec = promisify(execFile);
const [archiveArg, outputArg] = process.argv.slice(2);
if (!archiveArg || !outputArg) { console.error("Usage: node scripts/prepare-arcca-demo.mjs ./arcca-ds.tgz ./site"); process.exit(1); }
const archive = resolve(archiveArg), output = resolve(outputArg);
const template = resolve(dirname(fileURLToPath(import.meta.url)), "../examples/arcca-ds");
async function member(name) {
  // Read specific archive members to memory; never extract arbitrary package paths
  // or execute npm scripts. tar is available on Linux/macOS and current Windows.
  const result = await exec("tar", ["-xOf", archive, `package/${name}`], { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });
  return result.stdout;
}
try {
  try { if ((await readdir(output)).length) throw new Error("Output directory must be empty"); }
  catch (err) { if (err.code !== "ENOENT") throw err; }
  const meta = JSON.parse((await member("package.json")).toString("utf8"));
  if (meta.name !== "@arcca/arcca-ds") throw new Error("Expected an @arcca/arcca-ds npm tarball");
  const runtime = await member("dist/universal/web/index.mjs");
  const license = await member("dist/universal/web/Inter-LICENSE.txt");
  const fonts = await Promise.all([400, 500, 600, 700].map(async weight => {
    const name = `inter-latin-${weight}-normal.woff2`;
    return [name, await member(`dist/universal/web/reference/fonts/${name}`)];
  }));
  await mkdir(join(output, "assets"), { recursive: true });
  const version = String(meta.version).replace(/[^A-Za-z0-9.+_-]/g, "");
  await writeFile(join(output, "index.html"), (await readFile(join(template, "index.html"), "utf8")).replaceAll("__DS_VERSION__", version));
  for (const name of ["site.css", "demo.mjs"]) await copyFile(join(template, name), join(output, "assets", name));
  await writeFile(join(output, "assets/arcca-ds.mjs"), runtime);
  await writeFile(join(output, "assets/Inter-LICENSE.txt"), license);
  for (const [name, bytes] of fonts) await writeFile(join(output, "assets", name), bytes);
  console.log(JSON.stringify({ directory: output, package: meta.name, version, runtime_sha256: createHash("sha256").update(runtime).digest("hex") }, null, 2));
} catch (err) { console.error(err.message); process.exitCode = 1; }
