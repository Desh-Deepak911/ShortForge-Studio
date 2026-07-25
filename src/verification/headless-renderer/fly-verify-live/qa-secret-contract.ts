/**
 * Sprint 11E Phase 2E.2D.7A.1 — Hosted Fly verifier QA secret contract.
 * Eleven-key bridge membership + production classifier alignment. No network.
 */

import { classifyHeadlessNeonEnvironment } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { classifyHeadlessR2Environment } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import {
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";

/** Canonical hosted-verifier QA bridge secret names — exactly eleven. */
export const FLY_VERIFY_LIVE_QA_SECRET_KEYS = Object.freeze([
  "DATABASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_ASSETS",
  "R2_BUCKET_ARTIFACTS",
  "R2_ENDPOINT",
  "HEADLESS_ALLOWED_ORIGINS",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_TCP_URL",
] as const);

export type FlyVerifyLiveQaSecretKey =
  (typeof FLY_VERIFY_LIVE_QA_SECRET_KEYS)[number];

const QA_SECRET_KEY_SET = new Set<string>(FLY_VERIFY_LIVE_QA_SECRET_KEYS);

/** Wrong / legacy keys that must never appear in QA bridge or env contract. */
export const FLY_VERIFY_LIVE_QA_FORBIDDEN_SECRET_KEYS = Object.freeze([
  "R2_ALLOWED_ORIGINS",
] as const);

/** Gate / public pins — never bridge secret lines. */
export const FLY_VERIFY_LIVE_QA_FORBIDDEN_BRIDGE_EXACT_KEYS = Object.freeze([
  "HEADLESS_FLY_VERIFY_QA",
  "HEADLESS_FLY_VERIFY_QA_PRESERVE",
  "HEADLESS_ENV_NAME",
  "HEADLESS_FLY_STAGING_APP_NAME",
  "HEADLESS_WORKER_MODE",
  "HEADLESS_CONTROL_PLANE_ENABLED",
] as const);

export const FLY_VERIFY_LIVE_QA_FORBIDDEN_BRIDGE_PREFIXES = Object.freeze([
  "CLERK_",
  "NEXT_PUBLIC_",
  "VERCEL_",
] as const);

export type FlyVerifyLiveProviderAttributionStatus =
  | "configured"
  | "unconfigured"
  | "invalid";

export type FlyVerifyLiveEnvNameAttributionStatus =
  | "staging"
  | "absent"
  | "invalid";

export type FlyVerifyLiveAppNameAttributionStatus =
  | "accepted"
  | "absent"
  | "invalid";

/** Safe configuration attribution — never includes secret values or per-key hints. */
export type FlyVerifyLiveConfigAttribution = {
  readonly neon_status: FlyVerifyLiveProviderAttributionStatus;
  readonly r2_status: FlyVerifyLiveProviderAttributionStatus;
  readonly upstash_rest_status: FlyVerifyLiveProviderAttributionStatus;
  readonly upstash_tcp_status: FlyVerifyLiveProviderAttributionStatus;
  readonly env_name_status: FlyVerifyLiveEnvNameAttributionStatus;
  readonly app_name_status: FlyVerifyLiveAppNameAttributionStatus;
};

export type FlyVerifyLiveQaBridgeValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failClass: string };

export type FlyVerifyLiveQaEnvContractResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failClass: string };

function readEnvString(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
): string | null {
  try {
    const raw = (env as Record<string, unknown>)[key];
    if (typeof raw !== "string") return null;
    return raw;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: string | null): value is string {
  return value != null && value.length > 0;
}

/** Deterministic canonical configured env for authority fixtures (no network). */
export function createCanonicalFlyVerifyLiveQaConfiguredEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const base: Record<string, string> = {
    HEADLESS_FLY_VERIFY_QA: "1",
    HEADLESS_ENV_NAME: "staging",
    HEADLESS_FLY_STAGING_APP_NAME: HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP,
    DATABASE_URL:
      "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "access_key_id_value",
    R2_SECRET_ACCESS_KEY: "secret_access_key_value",
    R2_BUCKET_ASSETS: "footie-assets-staging",
    R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
    R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
    HEADLESS_ALLOWED_ORIGINS: "https://app.example.com",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete base[k];
    } else {
      base[k] = v;
    }
  }
  return base;
}

export function attributeFlyVerifyLiveEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): FlyVerifyLiveConfigAttribution {
  const neon = classifyHeadlessNeonEnvironment(env);
  const r2 = classifyHeadlessR2Environment(env);
  const producer = classifyHeadlessUpstashProducerEnvironment(env);
  const consumer = classifyHeadlessUpstashConsumerEnvironment(env);
  const envName = readEnvString(env, "HEADLESS_ENV_NAME");
  const appName = readEnvString(env, "HEADLESS_FLY_STAGING_APP_NAME");

  let env_name_status: FlyVerifyLiveEnvNameAttributionStatus = "absent";
  if (envName != null) {
    env_name_status = envName === "staging" ? "staging" : "invalid";
  }

  let app_name_status: FlyVerifyLiveAppNameAttributionStatus = "absent";
  if (appName != null) {
    app_name_status =
      appName === HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP
        ? "accepted"
        : "invalid";
  }

  return Object.freeze({
    neon_status: neon,
    r2_status: r2,
    upstash_rest_status: producer,
    upstash_tcp_status: consumer,
    env_name_status,
    app_name_status,
  });
}

export function isFlyVerifyLiveConfigAttributionEligible(
  attribution: FlyVerifyLiveConfigAttribution,
): boolean {
  return (
    attribution.neon_status === "configured" &&
    attribution.r2_status === "configured" &&
    attribution.upstash_rest_status === "configured" &&
    attribution.upstash_tcp_status === "configured" &&
    attribution.env_name_status === "staging" &&
    attribution.app_name_status === "accepted"
  );
}

/** Parse bridge file body into key names only — never returns values. */
export function parseFlyVerifyLiveQaBridgeKeyNames(body: string): readonly string[] {
  const keys: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    let bodyLine = trimmed;
    if (bodyLine.startsWith("export ")) {
      bodyLine = bodyLine.slice(7).trim();
    }
    const eq = bodyLine.indexOf("=");
    if (eq <= 0) continue;
    keys.push(bodyLine.slice(0, eq).trim());
  }
  return Object.freeze(keys.slice());
}

export function validateFlyVerifyLiveQaBridgeKeyNames(
  keyNames: readonly string[],
): FlyVerifyLiveQaBridgeValidationResult {
  if (keyNames.length === 0) {
    return { ok: false, failClass: "bridge_empty" };
  }

  const seen = new Set<string>();
  for (const key of keyNames) {
    if (seen.has(key)) {
      return { ok: false, failClass: "bridge_duplicate_key" };
    }
    seen.add(key);

    if (
      (FLY_VERIFY_LIVE_QA_FORBIDDEN_SECRET_KEYS as readonly string[]).includes(
        key,
      )
    ) {
      return { ok: false, failClass: "bridge_forbidden_secret_key" };
    }

    for (const exact of FLY_VERIFY_LIVE_QA_FORBIDDEN_BRIDGE_EXACT_KEYS) {
      if (key === exact) {
        return { ok: false, failClass: "bridge_public_or_gate_key" };
      }
    }

    for (const prefix of FLY_VERIFY_LIVE_QA_FORBIDDEN_BRIDGE_PREFIXES) {
      if (key.startsWith(prefix)) {
        return { ok: false, failClass: "bridge_forbidden_prefix" };
      }
    }

    if (!QA_SECRET_KEY_SET.has(key)) {
      return { ok: false, failClass: "bridge_extra_key" };
    }
  }

  if (keyNames.length !== FLY_VERIFY_LIVE_QA_SECRET_KEYS.length) {
    return { ok: false, failClass: "bridge_key_count_mismatch" };
  }

  for (const required of FLY_VERIFY_LIVE_QA_SECRET_KEYS) {
    if (!seen.has(required)) {
      return { ok: false, failClass: "bridge_missing_key" };
    }
  }

  return { ok: true };
}

/** Eleven-key env membership — complements production classifiers. */
export function validateFlyVerifyLiveQaEnvContract(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): FlyVerifyLiveQaEnvContractResult {
  for (const forbidden of FLY_VERIFY_LIVE_QA_FORBIDDEN_SECRET_KEYS) {
    if (isNonEmptyString(readEnvString(env, forbidden))) {
      return { ok: false, failClass: "env_forbidden_secret_key" };
    }
  }

  let presentCount = 0;
  for (const key of FLY_VERIFY_LIVE_QA_SECRET_KEYS) {
    if (isNonEmptyString(readEnvString(env, key))) {
      presentCount += 1;
    }
  }

  if (presentCount === 0) {
    return { ok: false, failClass: "env_no_qa_secrets" };
  }
  if (presentCount !== FLY_VERIFY_LIVE_QA_SECRET_KEYS.length) {
    return { ok: false, failClass: "env_qa_secret_membership" };
  }

  return { ok: true };
}

export function isFlyVerifyLiveGateEnvironmentEligible(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  const contract = validateFlyVerifyLiveQaEnvContract(env);
  if (!contract.ok) return false;
  const attribution = attributeFlyVerifyLiveEnvironment(env);
  return isFlyVerifyLiveConfigAttributionEligible(attribution);
}

/** True only when every provider adapter is injected — skips real connections. */
export function isFlyVerifyLiveInjectedProvidersOnly(
  deps: {
    readonly injectedSql?: unknown;
    readonly injectedTcpConsumer?: unknown;
    readonly injectedRestProducer?: unknown;
    readonly injectedRestClient?: unknown;
    readonly injectedJobStore?: unknown;
    readonly injectedOwnedObjectStore?: unknown;
    readonly injectedProjectAuthorization?: unknown;
    readonly injectedDispatchOutbox?: unknown;
    readonly injectedFingerprint?: unknown;
  },
): boolean {
  return (
    deps.injectedSql != null &&
    deps.injectedTcpConsumer != null &&
    (deps.injectedRestProducer != null || deps.injectedRestClient != null) &&
    deps.injectedJobStore != null &&
    deps.injectedOwnedObjectStore != null &&
    deps.injectedProjectAuthorization != null &&
    deps.injectedDispatchOutbox != null &&
    deps.injectedFingerprint != null
  );
}
