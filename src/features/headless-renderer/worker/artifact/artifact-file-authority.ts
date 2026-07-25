/**
 * Workspace-owned artifact file authority.
 * Paths stay ephemeral in the worker — never enter job records, diagnostics,
 * fingerprints, or API responses.
 */

import { lstatSync, realpathSync, type Stats } from "node:fs";

export interface ArtifactFileIdentity {
  /** Absolute real path — worker-internal only; never persist or log. */
  readonly absolutePath: string;
  readonly byteLength: number;
  readonly mtimeMs: number;
  readonly ino: number | bigint;
  readonly dev: number | bigint;
}

export type ArtifactFileAuthorityFailReason =
  | "missing"
  | "not_regular"
  | "symlink"
  | "oversized"
  | "truncated"
  | "identity_mismatch"
  | "stat_failed";

function isSymlink(stats: Stats): boolean {
  return typeof stats.isSymbolicLink === "function" && stats.isSymbolicLink();
}

function isRegularFile(stats: Stats): boolean {
  return typeof stats.isFile === "function" && stats.isFile();
}

/**
 * Validate a completed FFmpeg artifact as a workspace-owned regular file.
 * Rejects missing, non-regular, symlinked, truncated, or oversized files.
 */
export function authorizeArtifactFile(input: {
  absolutePath: string;
  maxBytes: number;
  minBytes?: number;
}):
  | { readonly ok: true; readonly identity: ArtifactFileIdentity }
  | {
      readonly ok: false;
      readonly reason: ArtifactFileAuthorityFailReason;
      readonly message: string;
    } {
  const minBytes = input.minBytes ?? 32;
  if (
    !Number.isSafeInteger(input.maxBytes) ||
    input.maxBytes < 1 ||
    !Number.isSafeInteger(minBytes) ||
    minBytes < 1
  ) {
    return {
      ok: false,
      reason: "stat_failed",
      message: "Invalid artifact size bounds.",
    };
  }

  let stats: Stats;
  try {
    stats = lstatSync(input.absolutePath);
  } catch {
    return { ok: false, reason: "missing", message: "Artifact file missing." };
  }

  if (isSymlink(stats)) {
    return {
      ok: false,
      reason: "symlink",
      message: "Artifact path must not be a symlink.",
    };
  }
  if (!isRegularFile(stats)) {
    return {
      ok: false,
      reason: "not_regular",
      message: "Artifact path is not a regular file.",
    };
  }

  let realPath: string;
  try {
    realPath = realpathSync(input.absolutePath);
  } catch {
    return {
      ok: false,
      reason: "stat_failed",
      message: "Artifact realpath failed.",
    };
  }

  // Re-lstat the resolved path — reject if it resolves to a different kind.
  let resolvedStats: Stats;
  try {
    resolvedStats = lstatSync(realPath);
  } catch {
    return { ok: false, reason: "missing", message: "Artifact file missing." };
  }
  if (isSymlink(resolvedStats) || !isRegularFile(resolvedStats)) {
    return {
      ok: false,
      reason: "not_regular",
      message: "Resolved artifact path is not a regular file.",
    };
  }

  const byteLength = resolvedStats.size;
  if (!Number.isSafeInteger(byteLength) || byteLength < minBytes) {
    return {
      ok: false,
      reason: "truncated",
      message: "Artifact file truncated or empty.",
    };
  }
  if (byteLength > input.maxBytes) {
    return {
      ok: false,
      reason: "oversized",
      message: "Artifact file exceeds authorized ceiling.",
    };
  }

  return {
    ok: true,
    identity: Object.freeze({
      absolutePath: realPath,
      byteLength,
      mtimeMs: resolvedStats.mtimeMs,
      ino: resolvedStats.ino,
      dev: resolvedStats.dev,
    }),
  };
}

/** Re-validate that the same file identity still points at the same inode/size. */
export function assertSameArtifactFileIdentity(
  expected: ArtifactFileIdentity,
):
  | { readonly ok: true; readonly identity: ArtifactFileIdentity }
  | {
      readonly ok: false;
      readonly reason: ArtifactFileAuthorityFailReason;
      readonly message: string;
    } {
  const again = authorizeArtifactFile({
    absolutePath: expected.absolutePath,
    maxBytes: expected.byteLength,
    minBytes: expected.byteLength,
  });
  if (!again.ok) {
    if (again.reason === "oversized" || again.reason === "truncated") {
      return {
        ok: false,
        reason: "identity_mismatch",
        message: "Artifact file size changed after validation.",
      };
    }
    return again;
  }
  const actual = again.identity;
  if (
    actual.absolutePath !== expected.absolutePath ||
    actual.byteLength !== expected.byteLength ||
    actual.mtimeMs !== expected.mtimeMs ||
    actual.ino !== expected.ino ||
    actual.dev !== expected.dev
  ) {
    return {
      ok: false,
      reason: "identity_mismatch",
      message: "Artifact file replaced or mutated after validation.",
    };
  }
  return { ok: true, identity: actual };
}
