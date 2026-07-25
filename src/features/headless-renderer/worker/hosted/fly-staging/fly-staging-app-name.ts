/**
 * Sprint 11E Phase 2E.2D.4 — staging Fly app-name authority (local only).
 *
 * Pattern: shortforge-hw-staging-<operator-suffix>
 * Suffix is globally unique, operator-supplied at execution time.
 */

export const HEADLESS_FLY_STAGING_APP_PREFIX = "shortforge-hw-staging-" as const;

/** Fly app name max length (DNS label family). */
export const HEADLESS_FLY_STAGING_APP_NAME_MAX = 63;

/** Operator suffix: lowercase alphanumeric, 4–24 chars. */
const SUFFIX_RE = /^[a-z0-9]{4,24}$/;

const APP_RE = /^shortforge-hw-staging-[a-z0-9]{4,24}$/;

/** Names that must never be used for staging (production / ambiguous). */
export const HEADLESS_FLY_PRODUCTION_APP_NAMES = Object.freeze([
  "shortforge-hw-production",
  "shortforge-hw-prod",
  "shortforge-hw-live",
  "footiebitz-hw-production",
  "footiebitz-hw-prod",
  "footiebitz-headless-production",
  "footiebitz-headless-prod",
] as const);

export type HeadlessFlyStagingAppNameStatus =
  | "ok"
  | "invalid"
  | "production_name_rejected"
  | "hostile_input";

export type HeadlessFlyStagingAppNameReasonId =
  | "ok"
  | "empty"
  | "not_string"
  | "uppercase_or_underscore"
  | "invalid_charset"
  | "missing_staging_prefix"
  | "invalid_suffix"
  | "too_long"
  | "production_name_rejected"
  | "contains_prod_token"
  | "hostile_input";

export type HeadlessFlyStagingAppNameClassification = {
  readonly status: HeadlessFlyStagingAppNameStatus;
  readonly reasonId: HeadlessFlyStagingAppNameReasonId;
  readonly appName: string | null;
};

function result(
  status: HeadlessFlyStagingAppNameStatus,
  reasonId: HeadlessFlyStagingAppNameReasonId,
  appName: string | null = null,
): HeadlessFlyStagingAppNameClassification {
  return Object.freeze({ status, reasonId, appName });
}

/**
 * Classify a candidate staging app name. Never contacts Fly.
 */
export function classifyHeadlessFlyStagingAppName(
  raw: unknown,
): HeadlessFlyStagingAppNameClassification {
  try {
    if (raw === undefined || raw === null) {
      return result("invalid", "empty");
    }
    if (typeof raw !== "string") {
      return result("hostile_input", "not_string");
    }
    const name = raw;
    if (name.length === 0) {
      return result("invalid", "empty");
    }
    if (name !== name.trim() || /\s/.test(name)) {
      return result("invalid", "invalid_charset");
    }
    if (/[A-Z_]/.test(name)) {
      return result("invalid", "uppercase_or_underscore");
    }
    if (name.length > HEADLESS_FLY_STAGING_APP_NAME_MAX) {
      return result("invalid", "too_long");
    }
    if (
      (HEADLESS_FLY_PRODUCTION_APP_NAMES as readonly string[]).includes(name)
    ) {
      return result("production_name_rejected", "production_name_rejected");
    }
    if (!name.startsWith(HEADLESS_FLY_STAGING_APP_PREFIX)) {
      return result("invalid", "missing_staging_prefix");
    }
    // Suffix must not smuggle production tokens.
    const suffix = name.slice(HEADLESS_FLY_STAGING_APP_PREFIX.length);
    if (suffix.includes("prod") || suffix === "live" || suffix.startsWith("live")) {
      return result("production_name_rejected", "contains_prod_token");
    }
    if (!SUFFIX_RE.test(suffix)) {
      return result("invalid", "invalid_suffix");
    }
    if (!APP_RE.test(name)) {
      return result("invalid", "invalid_charset");
    }
    return result("ok", "ok", name);
  } catch {
    return result("hostile_input", "hostile_input");
  }
}

/**
 * Build a staging app name from an operator suffix.
 */
export function buildHeadlessFlyStagingAppName(
  operatorSuffix: unknown,
): HeadlessFlyStagingAppNameClassification {
  try {
    if (typeof operatorSuffix !== "string") {
      return result("hostile_input", "not_string");
    }
    if (!SUFFIX_RE.test(operatorSuffix)) {
      return result("invalid", "invalid_suffix");
    }
    return classifyHeadlessFlyStagingAppName(
      `${HEADLESS_FLY_STAGING_APP_PREFIX}${operatorSuffix}`,
    );
  } catch {
    return result("hostile_input", "hostile_input");
  }
}

export function isHeadlessFlyStagingAppName(
  raw: unknown,
): raw is string {
  return classifyHeadlessFlyStagingAppName(raw).status === "ok";
}
