/**
 * Prompt 6 implementation fingerprint — tracked source + lockfile only.
 * Does not include .tmp artifacts or generated Next caches.
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PreviewRuntimeParityImplementationFingerprint {
  readonly branch: string;
  readonly head: string;
  readonly upstream: string;
  readonly trackedDiffHash: string;
  readonly implementationFingerprint: string;
  readonly lockfileHash: string;
  readonly headlessBundleHash: string | null;
  readonly recordedAt: string;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function recordPreviewRuntimeParityImplementationFingerprint(
  cwd = process.cwd(),
): PreviewRuntimeParityImplementationFingerprint {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8" }).trim();
  const head = execSync("git rev-parse HEAD", { cwd, encoding: "utf8" }).trim();
  const upstream = execSync("git rev-parse --abbrev-ref --symbolic-full-name @{u}", {
    cwd,
    encoding: "utf8",
  }).trim();
  const trackedDiff = execSync(
    "git diff HEAD -- . ':!.tmp' ':!.next' ':!docs/evidence/preview' ':!next-env.d.ts'",
    {
      cwd,
      encoding: "utf8",
    },
  );
  const untracked = execSync(
    "git ls-files --others --exclude-standard -- . ':!.tmp' ':!.next' ':!docs/evidence/preview' ':!next-env.d.ts'",
    { cwd, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const untrackedPayload = untracked
    .map((rel) => `${rel}:${sha256File(join(cwd, rel))}`)
    .join("\n");
  const lockfilePath = existsSync(join(cwd, "package-lock.json"))
    ? join(cwd, "package-lock.json")
    : join(cwd, "package.json");
  const bundleCandidates = [
    join(cwd, "dist/headless-worker/hosted-worker.js"),
    join(cwd, "dist/headless-worker/page-render.iife.js"),
    join(cwd, "dist/headless-worker/worker.mjs"),
    join(cwd, "dist/headless-worker.js"),
    join(cwd, ".tmp/headless-worker/worker.mjs"),
  ];
  const bundlePath = bundleCandidates.find((path) => existsSync(path)) ?? null;

  return {
    branch,
    head,
    upstream,
    trackedDiffHash: sha256Text(trackedDiff),
    implementationFingerprint: sha256Text(`${trackedDiff}\n${untrackedPayload}`),
    lockfileHash: sha256File(lockfilePath),
    headlessBundleHash: bundlePath ? sha256File(bundlePath) : null,
    recordedAt: new Date().toISOString(),
  };
}

export function fingerprintsMatch(
  left: PreviewRuntimeParityImplementationFingerprint,
  right: PreviewRuntimeParityImplementationFingerprint,
): boolean {
  return (
    left.head === right.head &&
    left.trackedDiffHash === right.trackedDiffHash &&
    left.implementationFingerprint === right.implementationFingerprint &&
    left.lockfileHash === right.lockfileHash &&
    left.headlessBundleHash === right.headlessBundleHash
  );
}
