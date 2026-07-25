/**
 * Worker-owned temporary workspace — unique per job/attempt.
 * Cleanup on success/failure/cancel; blocks traversal and symlink escape.
 * Process shutdown ownership belongs to the worker runtime (no SIGINT/SIGTERM).
 */

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

export interface HeadlessWorkerWorkspace {
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly assetsDir: string;
  readonly framesDir: string;
  readonly outputDir: string;
  readonly logsDir: string;
  resolveSafePath(relativePath: string): string;
  writeFileSafe(relativePath: string, bytes: Uint8Array): string;
  cleanup(): void;
}

function assertInsideRoot(rootReal: string, candidate: string): string {
  const resolved = resolve(candidate);
  let real: string;
  try {
    real = existsSync(resolved)
      ? realpathSync(resolved)
      : realpathSync(resolve(resolved, "..")) + sep + basename(resolved);
  } catch {
    real = resolved;
  }
  const rel = relative(rootReal, real);
  if (
    rel.startsWith("..") ||
    rel.includes(`..${sep}`) ||
    resolve(rootReal, rel) !== real
  ) {
    if (!real.startsWith(rootReal + sep) && real !== rootReal) {
      throw new Error("Workspace path escapes root.");
    }
  }
  if (existsSync(resolved)) {
    const st = lstatSync(resolved);
    if (st.isSymbolicLink()) {
      throw new Error("Symlink rejected in worker workspace.");
    }
  }
  return resolved;
}

export function createHeadlessWorkerWorkspace(input: {
  jobId: string;
  attempt: number;
  baseDir?: string;
}): HeadlessWorkerWorkspace {
  const safeJob = input.jobId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const parent = input.baseDir ?? join(tmpdir(), "footiebitz-headless-worker");
  mkdirSync(parent, { recursive: true });
  const rootDir = mkdtempSync(
    join(parent, `job-${safeJob}-a${input.attempt}-`),
  );
  chmodSync(rootDir, 0o700);
  const rootReal = realpathSync(rootDir);

  const assetsDir = join(rootDir, "assets");
  const framesDir = join(rootDir, "frames");
  const outputDir = join(rootDir, "output");
  const logsDir = join(rootDir, "logs");
  for (const d of [assetsDir, framesDir, outputDir, logsDir]) {
    mkdirSync(d, { recursive: true });
  }

  const manifestPath = join(rootDir, "manifest.read-only.json");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      rmSync(rootDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  };

  return {
    rootDir,
    manifestPath,
    assetsDir,
    framesDir,
    outputDir,
    logsDir,
    resolveSafePath(relativePath: string) {
      if (
        relativePath.includes("\0") ||
        relativePath.split(/[/\\]/).some((p) => p === "..")
      ) {
        throw new Error("Unsafe relative path.");
      }
      return assertInsideRoot(rootReal, join(rootDir, relativePath));
    },
    writeFileSafe(relativePath: string, bytes: Uint8Array) {
      const path = this.resolveSafePath(relativePath);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, bytes);
      if (lstatSync(path).isSymbolicLink()) {
        throw new Error("Symlink created unexpectedly.");
      }
      return path;
    },
    cleanup,
  };
}
