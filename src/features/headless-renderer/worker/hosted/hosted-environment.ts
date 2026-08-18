/**
 * Total, hostile-input-safe hosted-worker environment classification.
 * Never opens a network connection. Never returns or logs secrets/URLs.
 *
 * Sprint 11E Phase 2E.1 — Fly hosted-worker foundation.
 */

import {
  classifyHeadlessNeonEnvironment,
  type HeadlessNeonEnvironmentStatus,
} from "../../control-plane/runtime/neon-environment";
import {
  classifyHeadlessR2Environment,
  readConfiguredHeadlessR2Config,
  type HeadlessR2EnvironmentStatus,
} from "../../control-plane/runtime/r2-environment";
import {
  classifyHeadlessUpstashConsumerEnvironment,
  readHeadlessQueueLeaseSettings,
  type HeadlessQueueLeaseSettings,
  type HeadlessUpstashConsumerEnvironmentStatus,
} from "../../control-plane/runtime/upstash-environment";
import { classifyHeadlessQueueProvider } from "../../control-plane/runtime/queue-provider";
import {
  classifyHeadlessSchemaPreflightCompatibilityBinding,
  assertHeadlessExportMaintenanceDisabledForBridge,
  HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
} from "../../control-plane/runtime/headless-schema-preflight-compatibility-authority";
import {
  HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID,
  HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
  HEADLESS_HOSTED_ACCEPTED_RENDERER_BUILD_IDS,
} from "../runtime/renderer-build-id";

export type HeadlessHostedWorkerMode = "verify" | "render";

/** Hosted Fly workers accept staging|production only — never local. */
export type HeadlessHostedEnvName = "staging" | "production";

export type HeadlessHostedWorkerEnvironmentStatus =
  | "unconfigured"
  | "configured"
  | "invalid";

export type HeadlessHostedWorkerEnvironmentReasonId =
  | "ok"
  | "unconfigured"
  | "partial_configuration"
  | "hostile_input"
  | "invalid_mode"
  | "invalid_env_name"
  | "invalid_neon"
  | "invalid_r2"
  | "invalid_upstash_tcp"
  | "invalid_binary_path"
  | "invalid_renderer_build_id"
  | "invalid_schema_compatibility_mode"
  | "maintenance_enabled_forbidden"
  | "invalid_concurrency"
  | "invalid_shutdown_deadline"
  | "invalid_isolation_flag"
  | "forbidden_web_secret_present"
  | "forbidden_vercel_present"
  | "forbidden_clerk_present"
  | "forbidden_upstash_rest_present"
  | "mixed_environment_identity"
  | "lease_settings_invalid";

const MODE_SET = new Set<string>(["verify", "render"]);
const HOSTED_ENV_SET = new Set<string>(["staging", "production"]);

const PATH_MAX = 1024;
const BUILD_ID_MAX = 128;
const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 8;
const SHUTDOWN_MIN_MS = 1_000;
const SHUTDOWN_MAX_MS = 300_000;
const DEFAULT_SHUTDOWN_MS = 25_000;
const DEFAULT_RENDER_CONCURRENCY = 1;
const DEFAULT_VERIFY_CONCURRENCY = 1;

/** Keys that must never appear in a hosted worker process env. */
const FORBIDDEN_PREFIXES = Object.freeze([
  "NEXT_PUBLIC_",
  "VERCEL_",
  "CLERK_",
] as const);

const FORBIDDEN_EXACT = Object.freeze([
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const);

export type HeadlessConfiguredHostedWorkerEnvironment = {
  readonly mode: HeadlessHostedWorkerMode;
  readonly envName: HeadlessHostedEnvName;
  readonly chromeExecutable: string;
  readonly ffmpegExecutable: string;
  readonly ffprobeExecutable: string;
  readonly rendererBuildId: string;
  readonly concurrency: number;
  readonly gracefulShutdownDeadlineMs: number;
  readonly allowNoSandboxWithExternalIsolation: boolean;
  readonly leaseSettings: HeadlessQueueLeaseSettings;
  readonly neonStatus: HeadlessNeonEnvironmentStatus;
  readonly r2Status: HeadlessR2EnvironmentStatus;
  readonly upstashConsumerStatus: HeadlessUpstashConsumerEnvironmentStatus;
};

export type HeadlessHostedWorkerEnvironmentClassification = {
  readonly status: HeadlessHostedWorkerEnvironmentStatus;
  readonly reasonId: HeadlessHostedWorkerEnvironmentReasonId;
  /** Present only when status === configured. Never contains secrets. */
  readonly config: HeadlessConfiguredHostedWorkerEnvironment | null;
};

function readEnvString(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
):
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly value: string }
  | { readonly kind: "hostile" } {
  try {
    if (env == null || typeof env !== "object") {
      return { kind: "hostile" };
    }
    const raw = (env as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) {
      return { kind: "absent" };
    }
    if (typeof raw !== "string") {
      return { kind: "hostile" };
    }
    return { kind: "present", value: raw };
  } catch {
    return { kind: "hostile" };
  }
}

function isBoundedPath(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= PATH_MAX &&
    value === value.trim() &&
    !/\s/.test(value) &&
    (value.startsWith("/") || /^[A-Za-z]:\\/.test(value))
  );
}

function parseSafeBoundedInteger(
  raw: string,
  min: number,
  max: number,
): number | null {
  if (raw.length === 0 || raw !== raw.trim() || /\s/.test(raw)) return null;
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function hasForbiddenWebSurface(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    for (const key of Object.keys(env as object)) {
      if (FORBIDDEN_EXACT.includes(key as (typeof FORBIDDEN_EXACT)[number])) {
        return true;
      }
      for (const prefix of FORBIDDEN_PREFIXES) {
        if (key.startsWith(prefix)) return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

function bucketAlignedWithEnv(
  envName: HeadlessHostedEnvName,
  bucket: string,
): boolean {
  const lower = bucket.toLowerCase();
  if (envName === "staging") {
    return lower.includes("staging") && !/(^|[-_])prod(uction)?([-_]|$)/.test(lower);
  }
  // production
  return (
    /(^|[-_])prod(uction)?([-_]|$)/.test(lower) && !lower.includes("staging")
  );
}

function classifyBinaryPath(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
):
  | { readonly kind: "absent" }
  | { readonly kind: "ok"; readonly value: string }
  | { readonly kind: "invalid" }
  | { readonly kind: "hostile" } {
  const read = readEnvString(env, key);
  if (read.kind === "hostile") return { kind: "hostile" };
  if (read.kind === "absent") return { kind: "absent" };
  if (!isBoundedPath(read.value)) return { kind: "invalid" };
  return { kind: "ok", value: read.value };
}

function result(
  status: HeadlessHostedWorkerEnvironmentStatus,
  reasonId: HeadlessHostedWorkerEnvironmentReasonId,
  config: HeadlessConfiguredHostedWorkerEnvironment | null = null,
): HeadlessHostedWorkerEnvironmentClassification {
  return Object.freeze({ status, reasonId, config });
}

/**
 * Classify the total hosted-worker environment without provider contact.
 * Partial presence of any required family → invalid (fail closed).
 */
export function classifyHeadlessHostedWorkerEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessHostedWorkerEnvironmentClassification {
  try {
    if (hasForbiddenWebSurface(env)) {
      // Distinguish common families without revealing values.
      for (const key of Object.keys(env as object)) {
        if (
          key.startsWith("CLERK_") ||
          key === "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
        ) {
          return result("invalid", "forbidden_clerk_present");
        }
        if (key.startsWith("VERCEL_") || key.startsWith("NEXT_PUBLIC_")) {
          return result("invalid", "forbidden_vercel_present");
        }
        if (
          key === "UPSTASH_REDIS_REST_URL" ||
          key === "UPSTASH_REDIS_REST_TOKEN"
        ) {
          return result("invalid", "forbidden_upstash_rest_present");
        }
      }
      return result("invalid", "forbidden_web_secret_present");
    }

    const modeRead = readEnvString(env, "HEADLESS_WORKER_MODE");
    const envNameRead = readEnvString(env, "HEADLESS_ENV_NAME");
    const chrome = classifyBinaryPath(env, "HEADLESS_CHROME_PATH");
    const ffmpeg = classifyBinaryPath(env, "HEADLESS_FFMPEG_PATH");
    const ffprobe = classifyBinaryPath(env, "HEADLESS_FFPROBE_PATH");
    const buildIdRead = readEnvString(env, "HEADLESS_RENDERER_BUILD_ID");
    const compatibilityModeRead = readEnvString(
      env,
      HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
    );
    const maintenanceEnabledRead = readEnvString(
      env,
      "HEADLESS_EXPORT_MAINTENANCE_ENABLED",
    );
    const concurrencyRead = readEnvString(env, "HEADLESS_WORKER_CONCURRENCY");
    const shutdownRead = readEnvString(
      env,
      "HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS",
    );
    const isolationRead = readEnvString(
      env,
      "HEADLESS_ALLOW_NO_SANDBOX_WITH_EXTERNAL_ISOLATION",
    );

    if (
      modeRead.kind === "hostile" ||
      envNameRead.kind === "hostile" ||
      chrome.kind === "hostile" ||
      ffmpeg.kind === "hostile" ||
      ffprobe.kind === "hostile" ||
      buildIdRead.kind === "hostile" ||
      compatibilityModeRead.kind === "hostile" ||
      maintenanceEnabledRead.kind === "hostile" ||
      concurrencyRead.kind === "hostile" ||
      shutdownRead.kind === "hostile" ||
      isolationRead.kind === "hostile"
    ) {
      return result("invalid", "hostile_input");
    }

    // Hosted worker is opted in only by HEADLESS_WORKER_MODE. Web Neon/R2/Upstash
    // REST may exist in the same machine env without implying a hosted worker.
    const hostedSurfacePresent = [
      modeRead.kind === "present",
      chrome.kind !== "absent",
      ffmpeg.kind !== "absent",
      ffprobe.kind !== "absent",
      buildIdRead.kind === "present",
      concurrencyRead.kind === "present",
      shutdownRead.kind === "present",
      isolationRead.kind === "present",
    ].filter(Boolean).length;

    if (modeRead.kind === "absent") {
      if (hostedSurfacePresent === 0) {
        return result("unconfigured", "unconfigured");
      }
      return result("invalid", "partial_configuration");
    }

    if (!MODE_SET.has(modeRead.value)) {
      return result("invalid", "invalid_mode");
    }
    const mode = modeRead.value as HeadlessHostedWorkerMode;

    const neonStatus = classifyHeadlessNeonEnvironment(env);
    const r2Status = classifyHeadlessR2Environment(env);
    const upstashConsumerStatus = classifyHeadlessUpstashConsumerEnvironment(env);
    const queueProvider = classifyHeadlessQueueProvider(env);
    const neonQueue =
      queueProvider.status === "configured" &&
      queueProvider.provider === "neon";

    const requiredPresent = [
      envNameRead.kind === "present",
      chrome.kind === "ok",
      ffmpeg.kind === "ok",
      ffprobe.kind === "ok",
      buildIdRead.kind === "present",
      neonStatus === "configured",
      r2Status === "configured",
      neonQueue || upstashConsumerStatus === "configured",
    ];
    if (requiredPresent.some((v) => !v)) {
      return result("invalid", "partial_configuration");
    }

    if (
      envNameRead.kind !== "present" ||
      !HOSTED_ENV_SET.has(envNameRead.value)
    ) {
      return result("invalid", "invalid_env_name");
    }
    const envName = envNameRead.value as HeadlessHostedEnvName;

    if (neonStatus !== "configured") {
      return result("invalid", "invalid_neon");
    }
    if (r2Status !== "configured") {
      return result("invalid", "invalid_r2");
    }
    if (!neonQueue && upstashConsumerStatus !== "configured") {
      return result("invalid", "invalid_upstash_tcp");
    }

    if (
      chrome.kind !== "ok" ||
      ffmpeg.kind !== "ok" ||
      ffprobe.kind !== "ok"
    ) {
      return result("invalid", "invalid_binary_path");
    }

    if (
      buildIdRead.kind !== "present" ||
      buildIdRead.value.length === 0 ||
      buildIdRead.value.length > BUILD_ID_MAX ||
      buildIdRead.value !== buildIdRead.value.trim() ||
      /\s/.test(buildIdRead.value)
    ) {
      return result("invalid", "invalid_renderer_build_id");
    }

    const compatibilityBinding =
      classifyHeadlessSchemaPreflightCompatibilityBinding({
        compatibilityMode:
          compatibilityModeRead.kind === "present"
            ? compatibilityModeRead.value
            : undefined,
        rendererBuildId: buildIdRead.value,
      });
    if (!compatibilityBinding.ok) {
      return result("invalid", "invalid_schema_compatibility_mode");
    }

    const acceptedBuildIds = new Set<string>(
      HEADLESS_HOSTED_ACCEPTED_RENDERER_BUILD_IDS,
    );
    if (!acceptedBuildIds.has(buildIdRead.value)) {
      return result("invalid", "invalid_renderer_build_id");
    }

    const maintenanceDisabled = assertHeadlessExportMaintenanceDisabledForBridge({
      maintenanceEnabledRaw:
        maintenanceEnabledRead.kind === "present"
          ? maintenanceEnabledRead.value
          : undefined,
    });

    if (
      compatibilityBinding.mode ===
        HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE &&
      !maintenanceDisabled
    ) {
      return result("invalid", "maintenance_enabled_forbidden");
    }

    if (
      (buildIdRead.value === HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID ||
        buildIdRead.value === HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID) &&
      compatibilityBinding.mode !== "strict"
    ) {
      return result("invalid", "invalid_schema_compatibility_mode");
    }

    if (
      (buildIdRead.value === HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID ||
        buildIdRead.value === HEADLESS_CAPTION_TRIM_PARITY_RENDERER_BUILD_ID) &&
      !maintenanceDisabled
    ) {
      return result("invalid", "maintenance_enabled_forbidden");
    }

    let concurrency = mode === "render"
      ? DEFAULT_RENDER_CONCURRENCY
      : DEFAULT_VERIFY_CONCURRENCY;
    if (concurrencyRead.kind === "present") {
      const parsed = parseSafeBoundedInteger(
        concurrencyRead.value,
        CONCURRENCY_MIN,
        CONCURRENCY_MAX,
      );
      if (parsed == null) {
        return result("invalid", "invalid_concurrency");
      }
      concurrency = parsed;
    }
    // Render stays one-in-flight for Phase 2E.1.
    if (mode === "render" && concurrency !== 1) {
      return result("invalid", "invalid_concurrency");
    }

    let gracefulShutdownDeadlineMs = DEFAULT_SHUTDOWN_MS;
    if (shutdownRead.kind === "present") {
      const parsed = parseSafeBoundedInteger(
        shutdownRead.value,
        SHUTDOWN_MIN_MS,
        SHUTDOWN_MAX_MS,
      );
      if (parsed == null) {
        return result("invalid", "invalid_shutdown_deadline");
      }
      gracefulShutdownDeadlineMs = parsed;
    }

    let allowNoSandboxWithExternalIsolation = false;
    if (isolationRead.kind === "present") {
      if (isolationRead.value === "1") {
        allowNoSandboxWithExternalIsolation = true;
      } else if (isolationRead.value === "0") {
        allowNoSandboxWithExternalIsolation = false;
      } else {
        return result("invalid", "invalid_isolation_flag");
      }
    }

    const leaseSettings = readHeadlessQueueLeaseSettings(env);
    if (leaseSettings == null) {
      return result("invalid", "lease_settings_invalid");
    }

    const r2 = readConfiguredHeadlessR2Config(env);
    if (r2 == null) {
      return result("invalid", "invalid_r2");
    }
    if (
      !bucketAlignedWithEnv(envName, r2.bucketAssets) ||
      !bucketAlignedWithEnv(envName, r2.bucketArtifacts)
    ) {
      return result("invalid", "mixed_environment_identity");
    }

    return result(
      "configured",
      "ok",
      Object.freeze({
        mode,
        envName,
        chromeExecutable: chrome.value,
        ffmpegExecutable: ffmpeg.value,
        ffprobeExecutable: ffprobe.value,
        rendererBuildId: buildIdRead.value,
        concurrency,
        gracefulShutdownDeadlineMs,
        allowNoSandboxWithExternalIsolation,
        leaseSettings,
        neonStatus,
        r2Status,
        upstashConsumerStatus,
      }),
    );
  } catch {
    return result("invalid", "hostile_input");
  }
}

export function isHeadlessHostedWorkerEnvironmentConfigured(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return classifyHeadlessHostedWorkerEnvironment(env).status === "configured";
}

/**
 * Private configured view. Returns null unless status is configured.
 * Callers MUST never log binary paths as URLs or mix with secret material.
 */
export function readConfiguredHeadlessHostedWorkerEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessConfiguredHostedWorkerEnvironment | null {
  const classified = classifyHeadlessHostedWorkerEnvironment(env);
  return classified.status === "configured" ? classified.config : null;
}

/** Proposed Fly secret / env names (documentation authority — never set here). */
export const HEADLESS_HOSTED_FLY_SECRET_NAMES = Object.freeze([
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

export const HEADLESS_HOSTED_FLY_NONSECRET_ENV_NAMES = Object.freeze([
  "HEADLESS_WORKER_MODE",
  "HEADLESS_ENV_NAME",
  "HEADLESS_CHROME_PATH",
  "HEADLESS_FFMPEG_PATH",
  "HEADLESS_FFPROBE_PATH",
  "HEADLESS_RENDERER_BUILD_ID",
  "HEADLESS_WORKER_CONCURRENCY",
  "HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS",
  "HEADLESS_ALLOW_NO_SANDBOX_WITH_EXTERNAL_ISOLATION",
  "HEADLESS_REDIS_DELIVERY_IDLE_MS",
  "HEADLESS_RENDER_CLAIM_LEASE_MS",
  "HEADLESS_VERIFY_DELIVERY_IDLE_MS",
  "HEADLESS_VERIFY_CLAIM_LEASE_MS",
  "HEADLESS_QUEUE_PROVIDER",
  "HEADLESS_FLY_WAKE_VERIFY_MACHINE_ID",
  HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
  "HEADLESS_EXPORT_MAINTENANCE_ENABLED",
] as const);
