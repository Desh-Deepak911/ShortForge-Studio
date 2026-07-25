/**
 * Sprint 11E Phase 2E.2D.6A — FOOTIEBITZ_ROOT orchestrator authority (local only).
 *
 * Canonical root resolution never uses caller $0, cwd, or .tmp orchestrator paths.
 * Official scripts set FLY_STAGING_COMMON_DIR; orchestrators export FOOTIEBITZ_ROOT
 * or FLY_STAGING_COMMON_SH before sourcing fly-staging-common.sh.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Paths that must exist under a valid repository root. */
export const HEADLESS_FLY_STAGING_ROOT_MARKER_PATHS = Object.freeze([
  "package.json",
  "scripts/fly-staging/fly-staging-common.sh",
  "deploy/headless-worker/fly.staging.template.toml",
  "deploy/headless-worker/fly.staging.verify-first.template.toml",
  "deploy/headless-worker/Dockerfile",
  "dist/headless-worker/hosted-worker.js",
] as const);

export type HeadlessFlyStagingRootReasonId =
  | "ok"
  | "blank"
  | "relative"
  | "missing"
  | "not_directory"
  | "wrong_package"
  | "missing_marker"
  | "hostile_input";

export type HeadlessFlyStagingRootClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingRootReasonId;
  readonly canonicalRoot: string | null;
  readonly missingMarker: string | null;
};

function packageNameIsFootiebitz(packageJsonPath: string): boolean {
  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    return parsed.name === "footiebitz";
  } catch {
    return false;
  }
}

/**
 * Validate an exported or derived FOOTIEBITZ_ROOT candidate.
 */
export function classifyHeadlessFlyStagingRoot(
  candidate: unknown,
): HeadlessFlyStagingRootClassification {
  try {
    if (candidate == null || typeof candidate !== "string") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        canonicalRoot: null,
        missingMarker: null,
      });
    }
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      return Object.freeze({
        status: "invalid",
        reasonId: "blank",
        canonicalRoot: null,
        missingMarker: null,
      });
    }
    if (!path.isAbsolute(trimmed)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "relative",
        canonicalRoot: null,
        missingMarker: null,
      });
    }
    if (!existsSync(trimmed)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "missing",
        canonicalRoot: null,
        missingMarker: null,
      });
    }
    let canonical: string;
    try {
      canonical = path.resolve(trimmed);
    } catch {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        canonicalRoot: null,
        missingMarker: null,
      });
    }
    if (!existsSync(canonical)) {
      return Object.freeze({
        status: "invalid",
        reasonId: "missing",
        canonicalRoot: null,
        missingMarker: null,
      });
    }
    const packageJson = path.join(canonical, "package.json");
    if (
      !existsSync(packageJson) ||
      !packageNameIsFootiebitz(packageJson)
    ) {
      return Object.freeze({
        status: "invalid",
        reasonId: "wrong_package",
        canonicalRoot: null,
        missingMarker: null,
      });
    }
    for (const marker of HEADLESS_FLY_STAGING_ROOT_MARKER_PATHS) {
      if (marker === "package.json") continue;
      const full = path.join(canonical, marker);
      if (!existsSync(full)) {
        return Object.freeze({
          status: "invalid",
          reasonId: "missing_marker",
          canonicalRoot: null,
          missingMarker: marker,
        });
      }
    }
    return Object.freeze({
      status: "ok",
      reasonId: "ok",
      canonicalRoot: canonical,
      missingMarker: null,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      canonicalRoot: null,
      missingMarker: null,
    });
  }
}

/** Derive repo root from scripts/fly-staging directory (two levels up). */
export function deriveHeadlessFlyStagingRootFromCommonDir(
  commonDir: unknown,
): HeadlessFlyStagingRootClassification {
  try {
    if (typeof commonDir !== "string" || commonDir.trim().length === 0) {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        canonicalRoot: null,
        missingMarker: null,
      });
    }
    const resolvedCommon = path.resolve(commonDir);
    const derived = path.resolve(resolvedCommon, "../..");
    return classifyHeadlessFlyStagingRoot(derived);
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      canonicalRoot: null,
      missingMarker: null,
    });
  }
}

export const HEADLESS_FLY_STAGING_ORCHESTRATOR_ROOT_CONTRACT = Object.freeze({
  exportedRootHonoredWhenValid: true,
  neverUsesCallerZero: true,
  fallbackUsesCommonScriptLocation: true,
  commonDirEnv: "FLY_STAGING_COMMON_DIR",
  commonShEnv: "FLY_STAGING_COMMON_SH",
  rootEnv: "FOOTIEBITZ_ROOT",
} as const);
