import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Lowercase hex SHA-256 of UTF-8 text or raw bytes. */
export function sha256Bytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Synchronous SHA-256 of a repo-relative file path. */
export function sha256FileSync(
  relativePath: string,
  rootDir: string = process.cwd(),
): string {
  return createHash("sha256")
    .update(readFileSync(path.join(rootDir, relativePath)))
    .digest("hex");
}
