/**
 * Canonical shipped page-render.iife.js resolution for diagnostic + production.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const SHIPPED_PAGE_ARTIFACT_FILENAME = "page-render.iife.js" as const;

export type ShippedPageArtifactPresentClass =
  | "present_readable"
  | "absent"
  | "unreadable";

export type ShippedPageArtifactAuthority =
  | {
      readonly ok: true;
      readonly presentClass: "present_readable";
      readonly byteLength: number;
      readonly digestSha256: string;
      readonly bytes: Uint8Array;
    }
  | {
      readonly ok: false;
      readonly presentClass: "absent" | "unreadable";
    };

function bundleDirFromEnv(env: NodeJS.ProcessEnv | Record<string, unknown>): string | null {
  for (const key of ["HEADLESS_PAGE_BUNDLE_PATH", "HEADLESS_HOSTED_WORKER_ROOT", "HEADLESS_PAGE_DIAGNOSTIC_ROOT"] as const) {
    const raw = (env as Record<string, unknown>)[key];
    if (typeof raw !== "string" || raw.length === 0) continue;
    if (key === "HEADLESS_PAGE_BUNDLE_PATH") {
      return dirname(raw);
    }
    return raw;
  }
  return null;
}

export function resolveHostedWorkerBundleDir(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): string {
  const fromEnv = bundleDirFromEnv(env);
  if (fromEnv != null) return fromEnv;
  const argv1 = typeof process.argv[1] === "string" ? process.argv[1] : "";
  if (argv1.length > 0) return dirname(argv1);
  return process.cwd();
}

export function resolveShippedPageArtifactPath(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): string | null {
  const explicit = (env as Record<string, unknown>).HEADLESS_PAGE_BUNDLE_PATH;
  if (typeof explicit === "string" && explicit.length > 0) {
    return existsSync(explicit) ? explicit : null;
  }

  const rootedDir = bundleDirFromEnv(env);
  if (rootedDir != null) {
    const rootedCandidate = join(rootedDir, SHIPPED_PAGE_ARTIFACT_FILENAME);
    return existsSync(rootedCandidate) ? rootedCandidate : null;
  }

  const argv1 = typeof process.argv[1] === "string" ? process.argv[1] : "";
  const candidates = [
    argv1.length > 0
      ? join(dirname(argv1), SHIPPED_PAGE_ARTIFACT_FILENAME)
      : null,
    join(process.cwd(), SHIPPED_PAGE_ARTIFACT_FILENAME),
    join(process.cwd(), "dist/headless-worker", SHIPPED_PAGE_ARTIFACT_FILENAME),
  ];
  for (const candidate of candidates) {
    if (candidate != null && existsSync(candidate)) return candidate;
  }
  return null;
}

export function readShippedPageArtifactAuthority(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): ShippedPageArtifactAuthority {
  const path = resolveShippedPageArtifactPath(env);
  if (path == null) {
    return { ok: false, presentClass: "absent" };
  }
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size <= 0) {
      return { ok: false, presentClass: "unreadable" };
    }
    const bytes = new Uint8Array(readFileSync(path));
    if (bytes.byteLength <= 0) {
      return { ok: false, presentClass: "unreadable" };
    }
    return {
      ok: true,
      presentClass: "present_readable",
      byteLength: bytes.byteLength,
      digestSha256: createHash("sha256").update(bytes).digest("hex"),
      bytes,
    };
  } catch {
    return { ok: false, presentClass: "unreadable" };
  }
}
