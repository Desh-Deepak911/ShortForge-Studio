/**
 * Sprint 11E Phase 2E.2D.6C — trusted Fly staging public environment authority.
 *
 * Public/non-secret staging configuration is established from accepted local
 * topology — never from the nine-name credential bridge.
 */

import { classifyHeadlessNeonEnvironment } from "../../../control-plane/runtime/neon-environment";
import { classifyHeadlessR2Environment } from "../../../control-plane/runtime/r2-environment";
import { classifyHeadlessUpstashConsumerEnvironment } from "../../../control-plane/runtime/upstash-environment";
import { classifyHeadlessHostedWorkerEnvironment } from "../hosted-environment";
import {
  HEADLESS_FLY_STAGING_PUBLIC_ENV,
  type HeadlessFlyStagingPublicEnvKey,
} from "./fly-staging-env-ledger";
import {
  HEADLESS_FLY_STAGING_GATE_IDS,
  headlessFlyStagingGateEnvName,
} from "./fly-staging-deployment-plan";

/** Exact public env keys pinned for all staging orchestrators. */
export const HEADLESS_FLY_STAGING_PUBLIC_ENV_NAMES = Object.freeze(
  Object.keys(HEADLESS_FLY_STAGING_PUBLIC_ENV) as HeadlessFlyStagingPublicEnvKey[],
);

/** Process-bound keys that must never appear in the credential bridge. */
export const HEADLESS_FLY_STAGING_BRIDGE_FORBIDDEN_NON_SECRET_KEYS = Object.freeze([
  ...HEADLESS_FLY_STAGING_PUBLIC_ENV_NAMES,
  "HEADLESS_WORKER_MODE",
  "HEADLESS_FLY_STAGING_EXECUTION_AUTHORIZED",
  ...HEADLESS_FLY_STAGING_GATE_IDS.map((gate) =>
    headlessFlyStagingGateEnvName(gate),
  ),
] as const);

export const HEADLESS_FLY_STAGING_TRUSTED_ENV_NAME = "staging" as const;

export type HeadlessFlyStagingPublicEnvReasonId =
  | "ok"
  | "blank"
  | "production"
  | "local_env"
  | "hostile"
  | "mismatch";

export type HeadlessFlyStagingPublicEnvClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingPublicEnvReasonId;
};

export type HeadlessFlyStagingPreflightReasonId =
  | "ok"
  | "public_env_invalid"
  | "public_env_not_initialized"
  | "neon_unconfigured"
  | "r2_unconfigured"
  | "upstash_unconfigured"
  | "hosted_unconfigured"
  | "hostile_input";

export type HeadlessFlyStagingPreflightClassification = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingPreflightReasonId;
  readonly neonStatus: string;
  readonly r2Status: string;
  readonly upstashStatus: string;
  readonly hostedStatus: string;
  readonly hostedReasonId: string;
};

export type HeadlessFlyStagingWorkerModeBoundary = "verify" | "render";

/**
 * Build the trusted public staging environment from local authority (not bridge).
 */
export function buildHeadlessFlyStagingPublicEnvironment(): Readonly<
  Record<HeadlessFlyStagingPublicEnvKey, string>
> {
  return HEADLESS_FLY_STAGING_PUBLIC_ENV;
}

/**
 * Validate a candidate HEADLESS_ENV_NAME — must be exactly staging.
 */
export function classifyHeadlessFlyStagingEnvNameValue(
  candidate: unknown,
): HeadlessFlyStagingPublicEnvClassification {
  try {
    if (candidate == null) {
      return Object.freeze({ status: "invalid", reasonId: "blank" });
    }
    if (typeof candidate !== "string") {
      return Object.freeze({ status: "invalid", reasonId: "hostile" });
    }
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
      return Object.freeze({ status: "invalid", reasonId: "blank" });
    }
    if (trimmed === HEADLESS_FLY_STAGING_TRUSTED_ENV_NAME) {
      return Object.freeze({ status: "ok", reasonId: "ok" });
    }
    if (trimmed === "production") {
      return Object.freeze({ status: "invalid", reasonId: "production" });
    }
    if (trimmed === "local") {
      return Object.freeze({ status: "invalid", reasonId: "local_env" });
    }
    return Object.freeze({ status: "invalid", reasonId: "mismatch" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile" });
  }
}

/**
 * True when every pinned public env key matches trusted local authority.
 */
export function isHeadlessFlyStagingPublicEnvironmentInitialized(
  env: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(
    HEADLESS_FLY_STAGING_PUBLIC_ENV,
  )) {
    if (env[key] !== expected) return false;
  }
  return classifyHeadlessFlyStagingEnvNameValue(env.HEADLESS_ENV_NAME).status === "ok";
}

/**
 * Merge bridge-sourced secrets with trusted public staging env.
 * `HEADLESS_WORKER_MODE` is applied only at the orchestrator process boundary.
 */
export function mergeHeadlessFlyStagingOperatorPreflightEnvironment(
  secretEnv: Record<string, unknown>,
  options: {
    readonly workerMode?: HeadlessFlyStagingWorkerModeBoundary;
    readonly applyPublicEnvironment?: boolean;
  } = {},
): Record<string, unknown> {
  const applyPublic = options.applyPublicEnvironment !== false;
  const merged: Record<string, unknown> = { ...secretEnv };
  if (applyPublic) {
    Object.assign(merged, buildHeadlessFlyStagingPublicEnvironment());
  }
  if (options.workerMode != null) {
    merged.HEADLESS_WORKER_MODE = options.workerMode;
  }
  return merged;
}

/**
 * Classify Neon/R2/Upstash/hosted readiness for staging orchestrator preflight.
 * Requires trusted public environment to be initialized first.
 */
export function classifyHeadlessFlyStagingOperatorPreflight(
  env: Record<string, unknown>,
): HeadlessFlyStagingPreflightClassification {
  try {
    if (!isHeadlessFlyStagingPublicEnvironmentInitialized(env)) {
      const envName = classifyHeadlessFlyStagingEnvNameValue(env.HEADLESS_ENV_NAME);
      return Object.freeze({
        status: "invalid",
        reasonId:
          env.HEADLESS_ENV_NAME == null ||
          (typeof env.HEADLESS_ENV_NAME === "string" &&
            env.HEADLESS_ENV_NAME.trim().length === 0)
            ? "public_env_not_initialized"
            : envName.status === "ok"
              ? "public_env_not_initialized"
              : "public_env_invalid",
        neonStatus: "skipped",
        r2Status: "skipped",
        upstashStatus: "skipped",
        hostedStatus: "skipped",
        hostedReasonId:
          env.HEADLESS_ENV_NAME == null ||
          (typeof env.HEADLESS_ENV_NAME === "string" &&
            env.HEADLESS_ENV_NAME.trim().length === 0)
            ? "public_env_not_initialized"
            : envName.reasonId,
      });
    }

    const envName = classifyHeadlessFlyStagingEnvNameValue(env.HEADLESS_ENV_NAME);
    if (envName.status !== "ok") {
      return Object.freeze({
        status: "invalid",
        reasonId: "public_env_invalid",
        neonStatus: "skipped",
        r2Status: "skipped",
        upstashStatus: "skipped",
        hostedStatus: "skipped",
        hostedReasonId: envName.reasonId,
      });
    }

    const neon = classifyHeadlessNeonEnvironment(env);
    const r2 = classifyHeadlessR2Environment(env);
    const upstash = classifyHeadlessUpstashConsumerEnvironment(env);
    const hosted = classifyHeadlessHostedWorkerEnvironment(env);

    if (neon !== "configured") {
      return Object.freeze({
        status: "invalid",
        reasonId: "neon_unconfigured",
        neonStatus: neon,
        r2Status: r2,
        upstashStatus: upstash,
        hostedStatus: hosted.status,
        hostedReasonId: hosted.reasonId,
      });
    }
    if (r2 !== "configured") {
      return Object.freeze({
        status: "invalid",
        reasonId: "r2_unconfigured",
        neonStatus: neon,
        r2Status: r2,
        upstashStatus: upstash,
        hostedStatus: hosted.status,
        hostedReasonId: hosted.reasonId,
      });
    }
    if (upstash !== "configured") {
      return Object.freeze({
        status: "invalid",
        reasonId: "upstash_unconfigured",
        neonStatus: neon,
        r2Status: r2,
        upstashStatus: upstash,
        hostedStatus: hosted.status,
        hostedReasonId: hosted.reasonId,
      });
    }
    if (hosted.status !== "configured") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hosted_unconfigured",
        neonStatus: neon,
        r2Status: r2,
        upstashStatus: upstash,
        hostedStatus: hosted.status,
        hostedReasonId: hosted.reasonId,
      });
    }

    return Object.freeze({
      status: "ok",
      reasonId: "ok",
      neonStatus: neon,
      r2Status: r2,
      upstashStatus: upstash,
      hostedStatus: hosted.status,
      hostedReasonId: hosted.reasonId,
    });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      neonStatus: "error",
      r2Status: "error",
      upstashStatus: "error",
      hostedStatus: "error",
      hostedReasonId: "hostile_input",
    });
  }
}

export const HEADLESS_FLY_STAGING_PUBLIC_ENVIRONMENT_CONTRACT = Object.freeze({
  trustedEnvName: HEADLESS_FLY_STAGING_TRUSTED_ENV_NAME,
  neverFromBridge: true,
  applyBeforeClassification: true,
  workerModeOutsideBridge: true,
  gateEnvOutsideBridge: true,
  publicEnvKeyCount: HEADLESS_FLY_STAGING_PUBLIC_ENV_NAMES.length,
} as const);
