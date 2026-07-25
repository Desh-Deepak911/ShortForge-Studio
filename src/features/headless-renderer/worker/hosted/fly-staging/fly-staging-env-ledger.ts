/**
 * Sprint 11E Phase 2E.2D.4 — Fly staging environment ledger (names only).
 * Separates public/non-secret config, Fly secret names, and forbidden values.
 * Never returns or logs secret values.
 */

import {
  HEADLESS_HOSTED_FLY_NONSECRET_ENV_NAMES,
  HEADLESS_HOSTED_FLY_SECRET_NAMES,
} from "../hosted-environment";
import {
  HEADLESS_FLY_STAGING_BINARY_PATHS,
  HEADLESS_FLY_STAGING_GRACEFUL_SHUTDOWN_MS,
  HEADLESS_FLY_STAGING_IMAGE_CLASS,
  HEADLESS_FLY_STAGING_RENDERER_BUILD_ID,
} from "./fly-staging-topology";

/**
 * Exact Fly secret-name ledger for hosted staging workers.
 * Matches approved hosted adapters only — no Upstash REST.
 */
export const HEADLESS_FLY_STAGING_SECRET_NAMES = Object.freeze([
  ...HEADLESS_HOSTED_FLY_SECRET_NAMES,
] as const);

export type HeadlessFlyStagingSecretName =
  (typeof HEADLESS_FLY_STAGING_SECRET_NAMES)[number];

/**
 * Public / non-secret Fly [env] keys for staging.
 * HEADLESS_WORKER_MODE is intentionally ABSENT — supplied only by process command.
 */
export const HEADLESS_FLY_STAGING_PUBLIC_ENV = Object.freeze({
  HEADLESS_ENV_NAME: "staging",
  HEADLESS_CHROME_PATH: HEADLESS_FLY_STAGING_BINARY_PATHS.chrome,
  HEADLESS_FFMPEG_PATH: HEADLESS_FLY_STAGING_BINARY_PATHS.ffmpeg,
  HEADLESS_FFPROBE_PATH: HEADLESS_FLY_STAGING_BINARY_PATHS.ffprobe,
  HEADLESS_RENDERER_BUILD_ID: HEADLESS_FLY_STAGING_RENDERER_BUILD_ID,
  HEADLESS_WORKER_CONCURRENCY: "1",
  HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS: String(
    HEADLESS_FLY_STAGING_GRACEFUL_SHUTDOWN_MS,
  ),
  HEADLESS_WORKER_WORKSPACE_ROOT: HEADLESS_FLY_STAGING_BINARY_PATHS.workspaceRoot,
  HEADLESS_HOSTED_IMAGE_CLASS: HEADLESS_FLY_STAGING_IMAGE_CLASS,
} as const);

export type HeadlessFlyStagingPublicEnvKey =
  keyof typeof HEADLESS_FLY_STAGING_PUBLIC_ENV;

/** Forbidden on Fly staging workers (names only). */
export const HEADLESS_FLY_STAGING_FORBIDDEN_ENV_NAMES = Object.freeze([
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "DATABASE_URL_UNPOOLED",
  "HEADLESS_WORKER_MODE",
] as const);

export const HEADLESS_FLY_STAGING_FORBIDDEN_ENV_PREFIXES = Object.freeze([
  "NEXT_PUBLIC_",
  "VERCEL_",
  "CLERK_",
] as const);

/**
 * Optional non-secret lease overrides (defaults apply when absent).
 * Never required as Fly secrets.
 */
export const HEADLESS_FLY_STAGING_OPTIONAL_LEASE_ENV_NAMES = Object.freeze([
  "HEADLESS_REDIS_DELIVERY_IDLE_MS",
  "HEADLESS_RENDER_CLAIM_LEASE_MS",
  "HEADLESS_VERIFY_DELIVERY_IDLE_MS",
  "HEADLESS_VERIFY_CLAIM_LEASE_MS",
] as const);

export type HeadlessFlyStagingEnvSurfaceKind =
  | "public_nonsecret"
  | "fly_secret"
  | "process_command_only"
  | "optional_lease_nonsecret"
  | "forbidden"
  | "unknown";

export function classifyHeadlessFlyStagingEnvName(
  name: unknown,
): HeadlessFlyStagingEnvSurfaceKind {
  try {
    if (typeof name !== "string" || name.length === 0) return "unknown";
    if (name === "HEADLESS_WORKER_MODE") return "process_command_only";
    if (
      (HEADLESS_FLY_STAGING_FORBIDDEN_ENV_NAMES as readonly string[]).includes(
        name,
      )
    ) {
      return "forbidden";
    }
    for (const prefix of HEADLESS_FLY_STAGING_FORBIDDEN_ENV_PREFIXES) {
      if (name.startsWith(prefix)) return "forbidden";
    }
    if (
      (HEADLESS_FLY_STAGING_SECRET_NAMES as readonly string[]).includes(name)
    ) {
      return "fly_secret";
    }
    if (
      Object.prototype.hasOwnProperty.call(HEADLESS_FLY_STAGING_PUBLIC_ENV, name)
    ) {
      return "public_nonsecret";
    }
    if (
      (
        HEADLESS_FLY_STAGING_OPTIONAL_LEASE_ENV_NAMES as readonly string[]
      ).includes(name)
    ) {
      return "optional_lease_nonsecret";
    }
    if (
      (HEADLESS_HOSTED_FLY_NONSECRET_ENV_NAMES as readonly string[]).includes(
        name,
      )
    ) {
      // Known hosted non-secret not pinned in public staging [env].
      return "optional_lease_nonsecret";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export type HeadlessFlyStagingEnvLedgerStatus =
  | "ok"
  | "invalid"
  | "hostile_input";

export type HeadlessFlyStagingEnvLedgerReasonId =
  | "ok"
  | "missing_secret_name"
  | "unknown_secret_name"
  | "empty_secret_name"
  | "duplicate_secret_name"
  | "forbidden_name_present"
  | "worker_mode_in_env"
  | "public_env_mismatch"
  | "rest_credentials_present"
  | "hostile_input";

export type HeadlessFlyStagingEnvLedgerClassification = {
  readonly status: HeadlessFlyStagingEnvLedgerStatus;
  readonly reasonId: HeadlessFlyStagingEnvLedgerReasonId;
  /** Present secret NAMES only — never values. */
  readonly secretNamesPresent: readonly string[];
  readonly forbiddenNamesPresent: readonly string[];
};

/**
 * Validate a proposed secret-name set and optional env key set (names only).
 */
export function classifyHeadlessFlyStagingEnvLedger(input: {
  readonly secretNames: readonly unknown[];
  readonly envNames?: readonly unknown[];
  readonly publicEnv?: Record<string, unknown>;
}): HeadlessFlyStagingEnvLedgerClassification {
  try {
    const secretNames: string[] = [];
    const seen = new Set<string>();
    for (const raw of input.secretNames) {
      if (typeof raw !== "string") {
        return freezeLedger("invalid", "hostile_input", [], []);
      }
      if (raw.length === 0) {
        return freezeLedger("invalid", "empty_secret_name", [], []);
      }
      if (seen.has(raw)) {
        return freezeLedger("invalid", "duplicate_secret_name", [], []);
      }
      seen.add(raw);
      if (
        !(HEADLESS_FLY_STAGING_SECRET_NAMES as readonly string[]).includes(raw)
      ) {
        return freezeLedger("invalid", "unknown_secret_name", [], []);
      }
      secretNames.push(raw);
    }
    for (const required of HEADLESS_FLY_STAGING_SECRET_NAMES) {
      if (!seen.has(required)) {
        return freezeLedger(
          "invalid",
          "missing_secret_name",
          secretNames,
          [],
        );
      }
    }

    const envNames = input.envNames ?? [];
    const forbidden: string[] = [];
    for (const raw of envNames) {
      if (typeof raw !== "string") {
        return freezeLedger("invalid", "hostile_input", secretNames, []);
      }
      const kind = classifyHeadlessFlyStagingEnvName(raw);
      if (kind === "forbidden") {
        forbidden.push(raw);
      }
      if (raw === "HEADLESS_WORKER_MODE") {
        return freezeLedger(
          "invalid",
          "worker_mode_in_env",
          secretNames,
          forbidden,
        );
      }
      if (
        raw === "UPSTASH_REDIS_REST_URL" ||
        raw === "UPSTASH_REDIS_REST_TOKEN"
      ) {
        return freezeLedger(
          "invalid",
          "rest_credentials_present",
          secretNames,
          forbidden,
        );
      }
    }
    if (forbidden.length > 0) {
      return freezeLedger(
        "invalid",
        "forbidden_name_present",
        secretNames,
        forbidden,
      );
    }

    if (input.publicEnv) {
      for (const [key, expected] of Object.entries(
        HEADLESS_FLY_STAGING_PUBLIC_ENV,
      )) {
        const actual = input.publicEnv[key];
        if (actual !== expected) {
          return freezeLedger(
            "invalid",
            "public_env_mismatch",
            secretNames,
            forbidden,
          );
        }
      }
      if (
        Object.prototype.hasOwnProperty.call(
          input.publicEnv,
          "HEADLESS_WORKER_MODE",
        )
      ) {
        return freezeLedger(
          "invalid",
          "worker_mode_in_env",
          secretNames,
          forbidden,
        );
      }
    }

    return freezeLedger("ok", "ok", secretNames, forbidden);
  } catch {
    return freezeLedger("invalid", "hostile_input", [], []);
  }
}

function freezeLedger(
  status: HeadlessFlyStagingEnvLedgerStatus,
  reasonId: HeadlessFlyStagingEnvLedgerReasonId,
  secretNamesPresent: readonly string[],
  forbiddenNamesPresent: readonly string[],
): HeadlessFlyStagingEnvLedgerClassification {
  return Object.freeze({
    status,
    reasonId,
    secretNamesPresent: Object.freeze([...secretNamesPresent]),
    forbiddenNamesPresent: Object.freeze([...forbiddenNamesPresent]),
  });
}
