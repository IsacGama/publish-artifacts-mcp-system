import { createHash } from "node:crypto";
import { z } from "zod";
import type { DB } from "../db/index.js";
import { PayloadTooLargeError } from "../security/limits.js";

export const fileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(240)
    .describe(
      "Relative path, e.g. assets/app.mjs; reference it as ./assets/app.mjs in HTML",
    ),
  content: z.string().describe("UTF-8 text or base64-encoded bytes"),
  encoding: z
    .enum(["utf8", "base64"])
    .optional()
    .describe("Defaults to utf8; use base64 for fonts and images"),
});
export type FileInput = z.infer<typeof fileSchema>;
export interface FileMeta {
  path: string;
  content_type: string;
  size: number;
  sha256: string;
}
export interface PreparedFile extends FileMeta {
  data: Buffer;
}
export class InvalidFileError extends Error {}

const types: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
};

export function validFilePath(path: string): boolean {
  return (
    path.length <= 240 &&
    path
      .split("/")
      .every(
        (s) =>
          /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) && s !== "." && s !== "..",
      )
  );
}

export function prepareFiles(
  files: FileInput[],
  limits: { maxFileBytes?: number; maxBundleBytes?: number; maxFiles?: number },
  htmlBytes: number,
): PreparedFile[] {
  const maxFile = limits.maxFileBytes ?? 8 * 1024 * 1024;
  const maxBundle = limits.maxBundleBytes ?? 20 * 1024 * 1024;
  if (files.length > (limits.maxFiles ?? 64))
    throw new InvalidFileError("Too many files (maximum 64 by default)");
  const seen = new Set<string>();
  let total = htmlBytes;
  const prepared = files.map((file) => {
    if (
      !validFilePath(file.path) ||
      file.path === "index.html" ||
      seen.has(file.path)
    )
      throw new InvalidFileError(
        `Invalid or duplicate file path: ${file.path}`,
      );
    seen.add(file.path);
    const ext = file.path.split(".").pop()!.toLowerCase();
    const content_type = Object.hasOwn(types, ext) ? types[ext] : undefined;
    if (!content_type)
      throw new InvalidFileError(`Unsupported file type: ${file.path}`);
    if (
      file.encoding === "base64" &&
      (file.content.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content) ||
        Buffer.from(file.content, "base64").toString("base64") !== file.content)
    )
      throw new InvalidFileError(`Invalid base64: ${file.path}`);
    const data = Buffer.from(
      file.content,
      file.encoding === "base64" ? "base64" : "utf8",
    );
    if (data.length > maxFile) throw new PayloadTooLargeError(maxFile);
    total += data.length;
    return {
      path: file.path,
      content_type,
      size: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
      data,
    };
  });
  if (total > maxBundle) throw new PayloadTooLargeError(maxBundle);
  return prepared;
}

export function replaceFiles(
  db: DB,
  artifactId: string,
  files: PreparedFile[],
): void {
  db.prepare("DELETE FROM artifact_files WHERE artifact_id = ?").run(
    artifactId,
  );
  const insert = db.prepare(
    "INSERT INTO artifact_files (artifact_id, path, content_type, size, sha256, data) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const f of files)
    insert.run(artifactId, f.path, f.content_type, f.size, f.sha256, f.data);
}

export function listFiles(db: DB, artifactId: string): FileMeta[] {
  return db
    .prepare(
      "SELECT path, content_type, size, sha256 FROM artifact_files WHERE artifact_id = ? ORDER BY path",
    )
    .all(artifactId) as FileMeta[];
}
