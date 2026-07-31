/**
 * Credential surface authority for controlled schema-008 bridge rollout.
 *
 * Separates three operator surfaces:
 * - eleven-key QA master (verify-live contract, REST keys allowed)
 * - nine-key hosted-worker Fly bridge (REST excluded)
 * - one-key Neon migration master (unpooled direct URL only)
 *
 * Public pins (app name, env name) never belong in secret files.
 */

import { classifyHeadlessNeonMigrationEnvironment } from "@/features/headless-renderer/control-plane/runtime/neon-migration-environment";
import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import {
  FLY_VERIFY_LIVE_QA_SECRET_KEYS,
  parseFlyVerifyLiveQaBridgeKeyNames,
  validateFlyVerifyLiveQaBridgeKeyNames,
} from "@/verification/headless-renderer/fly-verify-live/qa-secret-contract";

/** Hosted-worker Fly bridge — mirrors FLY_STAGING_SECRET_NAMES in fly-staging-common.sh */
export const FLY_STAGING_HOSTED_WORKER_BRIDGE_SECRET_KEYS = Object.freeze([
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_ASSETS",
  "R2_BUCKET_ARTIFACTS",
  "R2_ENDPOINT",
  "HEADLESS_ALLOWED_ORIGINS",
  "UPSTASH_REDIS_TCP_URL",
] as const);

export type FlyStagingHostedWorkerBridgeSecretKey =
  (typeof FLY_STAGING_HOSTED_WORKER_BRIDGE_SECRET_KEYS)[number];

const HOSTED_WORKER_BRIDGE_KEY_SET = new Set<string>(
  FLY_STAGING_HOSTED_WORKER_BRIDGE_SECRET_KEYS,
);

/** Keys legal in QA master but forbidden in hosted-worker bridge. */
export const FLY_STAGING_HOSTED_WORKER_BRIDGE_FORBIDDEN_KEYS = Object.freeze([
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "DATABASE_URL_UNPOOLED",
  "HEADLESS_FLY_STAGING_APP_NAME",
  "HEADLESS_ENV_NAME",
] as const);

export const FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS = Object.freeze({
  HEADLESS_ENV_NAME: "staging",
  HEADLESS_FLY_STAGING_APP_NAME: "shortforge-hw-staging-4def8fa0",
} as const);

export const FLY_STAGING_NEON_MIGRATION_MASTER_KEYS = Object.freeze([
  "DATABASE_URL_UNPOOLED",
] as const);

export type FlyStagingBridgeRolloutCredentialFailClass =
  | "ok"
  | "master_not_regular_file"
  | "master_wrong_mode"
  | "master_empty"
  | "qa_master_key_invalid"
  | "qa_master_empty_value"
  | "qa_master_duplicate_key"
  | "worker_bridge_key_invalid"
  | "worker_bridge_forbidden_key"
  | "worker_bridge_missing_key"
  | "migration_master_missing"
  | "migration_master_wrong_mode"
  | "migration_master_key_count"
  | "migration_master_extra_key"
  | "migration_master_empty_value"
  | "migration_master_unconfigured"
  | "migration_master_pooler_rejected"
  | "pooled_url_unreadable"
  | "unpooled_url_in_worker_bridge"
  | "rest_keys_in_worker_bridge"
  | "app_name_in_secret_file"
  | "hostile_input";

export type FlyStagingBridgeRolloutCredentialResult =
  | { readonly ok: true; readonly failClass: "ok" }
  | { readonly ok: false; readonly failClass: FlyStagingBridgeRolloutCredentialFailClass };

export type ParsedEnvAssignment = {
  readonly key: string;
  readonly value: string;
};

function stripOptionalQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Parse env file into assignments — caller must never log values. */
export function parseEnvFileAssignments(body: string): readonly ParsedEnvAssignment[] {
  const assignments: ParsedEnvAssignment[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    let bodyLine = trimmed;
    if (bodyLine.startsWith("export ")) {
      bodyLine = bodyLine.slice(7).trim();
    }
    const eq = bodyLine.indexOf("=");
    if (eq <= 0) continue;
    const key = bodyLine.slice(0, eq).trim();
    const value = stripOptionalQuotes(bodyLine.slice(eq + 1));
    assignments.push(Object.freeze({ key, value }));
  }
  return Object.freeze(assignments);
}

export function validateBridgeRolloutQaMasterBody(body: unknown): FlyStagingBridgeRolloutCredentialResult {
  if (typeof body !== "string") {
    return { ok: false, failClass: "hostile_input" };
  }
  const assignments = parseEnvFileAssignments(body);
  if (assignments.length === 0) {
    return { ok: false, failClass: "master_empty" };
  }
  const keyNames: string[] = [];
  for (const { key, value } of assignments) {
    if (value.length === 0) {
      return { ok: false, failClass: "qa_master_empty_value" };
    }
    keyNames.push(key);
    if (key === "HEADLESS_FLY_STAGING_APP_NAME" || key === "HEADLESS_ENV_NAME") {
      return { ok: false, failClass: "app_name_in_secret_file" };
    }
  }
  const bridgeKeys = validateFlyVerifyLiveQaBridgeKeyNames(
    parseFlyVerifyLiveQaBridgeKeyNames(body),
  );
  if (!bridgeKeys.ok) {
    return { ok: false, failClass: "qa_master_key_invalid" };
  }
  if (keyNames.length !== FLY_VERIFY_LIVE_QA_SECRET_KEYS.length) {
    return { ok: false, failClass: "qa_master_key_invalid" };
  }
  return { ok: true, failClass: "ok" };
}

export function validateBridgeRolloutQaMasterFile(input: {
  readonly body: unknown;
  readonly modeOctal: unknown;
}): FlyStagingBridgeRolloutCredentialResult {
  if (input.modeOctal !== "600" && input.modeOctal !== 600 && input.modeOctal !== "0600") {
    return { ok: false, failClass: "master_wrong_mode" };
  }
  return validateBridgeRolloutQaMasterBody(input.body);
}

export function validateHostedWorkerBridgeKeyNames(
  keyNames: readonly string[],
): FlyStagingBridgeRolloutCredentialResult {
  if (keyNames.length !== FLY_STAGING_HOSTED_WORKER_BRIDGE_SECRET_KEYS.length) {
    return { ok: false, failClass: "worker_bridge_key_invalid" };
  }
  const seen = new Set<string>();
  for (const key of keyNames) {
    if (seen.has(key)) {
      return { ok: false, failClass: "worker_bridge_key_invalid" };
    }
    seen.add(key);
    if (
      (FLY_STAGING_HOSTED_WORKER_BRIDGE_FORBIDDEN_KEYS as readonly string[]).includes(
        key,
      )
    ) {
      return { ok: false, failClass: "worker_bridge_forbidden_key" };
    }
    if (!HOSTED_WORKER_BRIDGE_KEY_SET.has(key)) {
      return { ok: false, failClass: "worker_bridge_key_invalid" };
    }
  }
  for (const required of FLY_STAGING_HOSTED_WORKER_BRIDGE_SECRET_KEYS) {
    if (!seen.has(required)) {
      return { ok: false, failClass: "worker_bridge_missing_key" };
    }
  }
  return { ok: true, failClass: "ok" };
}

export function formatEnvAssignment(key: string, value: string): string {
  if (/[\s#'"`$&|<>\\]/.test(value)) {
    return `${key}='${value.replace(/'/g, `'\\''`)}'`;
  }
  return `${key}=${value}`;
}

/** Derive nine-key worker bridge lines from validated QA master body — never logs values. */
export function deriveHostedWorkerBridgeLinesFromQaMaster(
  qaMasterBody: string,
): readonly string[] {
  const byKey = new Map<string, string>();
  for (const { key, value } of parseEnvFileAssignments(qaMasterBody)) {
    byKey.set(key, value);
  }
  return Object.freeze(
    FLY_STAGING_HOSTED_WORKER_BRIDGE_SECRET_KEYS.map((key) =>
      formatEnvAssignment(key, byKey.get(key) ?? ""),
    ),
  );
}

export function validateMigrationMasterBody(body: unknown): FlyStagingBridgeRolloutCredentialResult {
  if (typeof body !== "string") {
    return { ok: false, failClass: "hostile_input" };
  }
  const assignments = parseEnvFileAssignments(body);
  if (assignments.length === 0) {
    return { ok: false, failClass: "migration_master_missing" };
  }
  if (assignments.length !== 1) {
    return { ok: false, failClass: "migration_master_key_count" };
  }
  const only = assignments[0]!;
  if (only.key !== "DATABASE_URL_UNPOOLED") {
    return { ok: false, failClass: "migration_master_extra_key" };
  }
  if (only.value.length === 0) {
    return { ok: false, failClass: "migration_master_empty_value" };
  }
  const status = classifyHeadlessNeonMigrationEnvironment({
    DATABASE_URL_UNPOOLED: only.value,
  });
  if (status === "unconfigured") {
    return { ok: false, failClass: "migration_master_unconfigured" };
  }
  if (status === "pooler_rejected") {
    return { ok: false, failClass: "migration_master_pooler_rejected" };
  }
  if (status !== "configured") {
    return { ok: false, failClass: "migration_master_unconfigured" };
  }
  return { ok: true, failClass: "ok" };
}

export function validateMigrationMasterFile(input: {
  readonly body: unknown;
  readonly modeOctal: unknown;
  readonly exists: boolean;
}): FlyStagingBridgeRolloutCredentialResult {
  if (!input.exists) {
    return { ok: false, failClass: "migration_master_missing" };
  }
  if (input.modeOctal !== "600" && input.modeOctal !== 600 && input.modeOctal !== "0600") {
    return { ok: false, failClass: "migration_master_wrong_mode" };
  }
  return validateMigrationMasterBody(input.body);
}

/** Prove pooled read URL is configured and unpooled URL stays out of worker bridge. */
export function classifyBridgeRolloutCredentialSurfaceCoherence(input: {
  readonly qaMasterBody: string;
  readonly workerBridgeLines: readonly string[];
  readonly migrationMasterBody?: string | null;
}): FlyStagingBridgeRolloutCredentialResult {
  const qa = validateBridgeRolloutQaMasterBody(input.qaMasterBody);
  if (!qa.ok) return qa;

  const workerKeyNames = input.workerBridgeLines.map((line) => line.split("=")[0] ?? "");
  const workerKeys = validateHostedWorkerBridgeKeyNames(workerKeyNames);
  if (!workerKeys.ok) return workerKeys;

  if (input.workerBridgeLines.some((line) => line.startsWith("DATABASE_URL_UNPOOLED="))) {
    return { ok: false, failClass: "unpooled_url_in_worker_bridge" };
  }
  if (
    input.workerBridgeLines.some(
      (line) =>
        line.startsWith("UPSTASH_REDIS_REST_URL=") ||
        line.startsWith("UPSTASH_REDIS_REST_TOKEN="),
    )
  ) {
    return { ok: false, failClass: "rest_keys_in_worker_bridge" };
  }

  const envFromQa: Record<string, string> = {};
  for (const { key, value } of parseEnvFileAssignments(input.qaMasterBody)) {
    envFromQa[key] = value;
  }
  if (classifyHeadlessNeonEnvironment(envFromQa) !== "configured") {
    return { ok: false, failClass: "pooled_url_unreadable" };
  }
  if (readConfiguredHeadlessDatabaseUrl(envFromQa) == null) {
    return { ok: false, failClass: "pooled_url_unreadable" };
  }

  return { ok: true, failClass: "ok" };
}

/** Pooled DATABASE_URL must not satisfy migration-only classification. */
export function classifyPooledUrlCannotApplyMigrations(
  qaMasterBody: string,
): FlyStagingBridgeRolloutCredentialResult {
  const envFromQa: Record<string, string> = {};
  for (const { key, value } of parseEnvFileAssignments(qaMasterBody)) {
    envFromQa[key] = value;
  }
  const pooled = readConfiguredHeadlessDatabaseUrl(envFromQa);
  if (pooled == null) {
    return { ok: false, failClass: "pooled_url_unreadable" };
  }
  const migrationAttempt = classifyHeadlessNeonMigrationEnvironment({
    DATABASE_URL_UNPOOLED: pooled,
  });
  if (migrationAttempt === "configured") {
    return { ok: false, failClass: "hostile_input" };
  }
  return { ok: true, failClass: "ok" };
}
