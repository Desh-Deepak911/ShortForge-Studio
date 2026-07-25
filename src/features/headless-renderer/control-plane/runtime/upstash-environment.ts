/**
 * Total-safe Upstash producer/consumer environment classification.
 * Never opens a network connection. Never logs or returns secrets.
 */

export type HeadlessEnvName = "local" | "staging" | "production";

export type HeadlessUpstashProducerEnvironmentStatus =
  | "unconfigured"
  | "configured"
  | "invalid";

export type HeadlessUpstashConsumerEnvironmentStatus =
  | "unconfigured"
  | "configured"
  | "invalid";

/** Protocol stamp for dual-lease Streams authority. */
export const HEADLESS_QUEUE_PROTOCOL_VERSION = "hfq-dual-lease-v1" as const;

export const HEADLESS_UPSTASH_REST_URL_MAX_LENGTH = 2048;
export const HEADLESS_UPSTASH_REST_TOKEN_MAX_LENGTH = 512;
export const HEADLESS_UPSTASH_TCP_URL_MAX_LENGTH = 2048;

const ENV_NAMES = Object.freeze([
  "local",
  "staging",
  "production",
] as const) satisfies readonly HeadlessEnvName[];

const ENV_NAME_SET = new Set<string>(ENV_NAMES);

/** Defaults per PHASE2 §9.1A / user Phase 2D.1. */
export const HEADLESS_DEFAULT_DELIVERY_IDLE_MS = 90_000;
export const HEADLESS_DEFAULT_RENDER_CLAIM_MS = 1_800_000;
export const HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS = 90_000;
export const HEADLESS_DEFAULT_VERIFY_CLAIM_MS = 600_000;

const DELIVERY_IDLE_MIN_MS = 5_000;
const DELIVERY_IDLE_MAX_MS = 30 * 60_000;
const CLAIM_MIN_MS = 30_000;
const CLAIM_MAX_MS = 2 * 60 * 60_000;

/** Private producer config — adapters only. Never log or return to clients. */
export type HeadlessConfiguredUpstashProducerConfig = {
  readonly restUrl: string;
  readonly restToken: string;
  readonly envName: HeadlessEnvName;
};

/** Private consumer config — worker adapters only. Never log or return. */
export type HeadlessConfiguredUpstashConsumerConfig = {
  readonly tcpUrl: string;
  readonly envName: HeadlessEnvName;
};

export type HeadlessQueueLeaseSettings = {
  readonly deliveryIdleMs: number;
  readonly renderClaimMs: number;
  readonly verifyDeliveryIdleMs: number;
  readonly verifyClaimMs: number;
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

function isBoundedNonEmpty(value: string, max: number): boolean {
  return (
    value.length > 0 &&
    value.length <= max &&
    value === value.trim() &&
    !/\s/.test(value)
  );
}

function isExactEnvName(value: string): value is HeadlessEnvName {
  return ENV_NAME_SET.has(value);
}

function isValidHttpsRestUrl(value: string): boolean {
  if (!isBoundedNonEmpty(value, HEADLESS_UPSTASH_REST_URL_MAX_LENGTH)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (!parsed.hostname || parsed.hostname.length === 0) return false;
  return true;
}

/** TLS Redis URL only — rediss:// (never redis://). */
function isValidRedissTcpUrl(value: string): boolean {
  if (!isBoundedNonEmpty(value, HEADLESS_UPSTASH_TCP_URL_MAX_LENGTH)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "rediss:") return false;
  if (!parsed.hostname || parsed.hostname.length === 0) return false;
  return true;
}

function readEnvName(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
):
  | { readonly kind: "absent" }
  | { readonly kind: "present"; readonly value: HeadlessEnvName }
  | { readonly kind: "invalid" }
  | { readonly kind: "hostile" } {
  const read = readEnvString(env, "HEADLESS_ENV_NAME");
  if (read.kind === "hostile") return { kind: "hostile" };
  if (read.kind === "absent") return { kind: "absent" };
  if (!isExactEnvName(read.value)) return { kind: "invalid" };
  return { kind: "present", value: read.value };
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

function readOptionalLeaseMs(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
):
  | { readonly kind: "ok"; readonly value: number }
  | { readonly kind: "invalid" }
  | { readonly kind: "hostile" } {
  const read = readEnvString(env, key);
  if (read.kind === "hostile") return { kind: "hostile" };
  if (read.kind === "absent") return { kind: "ok", value: fallback };
  const parsed = parseSafeBoundedInteger(read.value, min, max);
  if (parsed == null) return { kind: "invalid" };
  return { kind: "ok", value: parsed };
}

/**
 * Classify Upstash REST producer env (web enqueue).
 * Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN + HEADLESS_ENV_NAME.
 * Partial presence → invalid. No network.
 */
export function classifyHeadlessUpstashProducerEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessUpstashProducerEnvironmentStatus {
  try {
    const url = readEnvString(env, "UPSTASH_REDIS_REST_URL");
    const token = readEnvString(env, "UPSTASH_REDIS_REST_TOKEN");
    const envName = readEnvName(env);
    if (
      url.kind === "hostile" ||
      token.kind === "hostile" ||
      envName.kind === "hostile"
    ) {
      return "invalid";
    }
    const presentCount =
      (url.kind === "present" ? 1 : 0) +
      (token.kind === "present" ? 1 : 0) +
      (envName.kind === "present" ? 1 : 0);
    if (presentCount === 0) return "unconfigured";
    if (presentCount !== 3) return "invalid";
    if (envName.kind !== "present") return "invalid";
    if (url.kind !== "present" || token.kind !== "present") return "invalid";
    if (!isValidHttpsRestUrl(url.value)) return "invalid";
    if (
      !isBoundedNonEmpty(token.value, HEADLESS_UPSTASH_REST_TOKEN_MAX_LENGTH)
    ) {
      return "invalid";
    }
    return "configured";
  } catch {
    return "invalid";
  }
}

/**
 * Classify Upstash TCP consumer env (worker).
 * Requires UPSTASH_REDIS_TCP_URL + HEADLESS_ENV_NAME. rediss:// only.
 */
export function classifyHeadlessUpstashConsumerEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessUpstashConsumerEnvironmentStatus {
  try {
    const tcp = readEnvString(env, "UPSTASH_REDIS_TCP_URL");
    const envName = readEnvName(env);
    if (tcp.kind === "hostile" || envName.kind === "hostile") {
      return "invalid";
    }
    const presentCount =
      (tcp.kind === "present" ? 1 : 0) + (envName.kind === "present" ? 1 : 0);
    if (presentCount === 0) return "unconfigured";
    if (presentCount !== 2) return "invalid";
    if (envName.kind !== "present") return "invalid";
    if (tcp.kind !== "present") return "invalid";
    if (!isValidRedissTcpUrl(tcp.value)) return "invalid";
    return "configured";
  } catch {
    return "invalid";
  }
}

export function isHeadlessUpstashProducerEnvironmentConfigured(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return classifyHeadlessUpstashProducerEnvironment(env) === "configured";
}

export function isHeadlessUpstashConsumerEnvironmentConfigured(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return classifyHeadlessUpstashConsumerEnvironment(env) === "configured";
}

/**
 * Private producer config. Returns null unless classification is configured.
 * Callers MUST never log this value.
 */
export function readConfiguredHeadlessUpstashProducerConfig(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessConfiguredUpstashProducerConfig | null {
  try {
    if (classifyHeadlessUpstashProducerEnvironment(env) !== "configured") {
      return null;
    }
    const url = readEnvString(env, "UPSTASH_REDIS_REST_URL");
    const token = readEnvString(env, "UPSTASH_REDIS_REST_TOKEN");
    const envName = readEnvName(env);
    if (
      url.kind !== "present" ||
      token.kind !== "present" ||
      envName.kind !== "present"
    ) {
      return null;
    }
    return Object.freeze({
      restUrl: url.value,
      restToken: token.value,
      envName: envName.value,
    });
  } catch {
    return null;
  }
}

/**
 * Private consumer config. Returns null unless classification is configured.
 * Callers MUST never log this value.
 */
export function readConfiguredHeadlessUpstashConsumerConfig(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessConfiguredUpstashConsumerConfig | null {
  try {
    if (classifyHeadlessUpstashConsumerEnvironment(env) !== "configured") {
      return null;
    }
    const tcp = readEnvString(env, "UPSTASH_REDIS_TCP_URL");
    const envName = readEnvName(env);
    if (tcp.kind !== "present" || envName.kind !== "present") {
      return null;
    }
    return Object.freeze({
      tcpUrl: tcp.value,
      envName: envName.value,
    });
  } catch {
    return null;
  }
}

/**
 * Read dual-lease settings with safe-integer bounds.
 * Invalid optional overrides yield null (caller treats as configuration invalid).
 */
export function readHeadlessQueueLeaseSettings(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessQueueLeaseSettings | null {
  try {
    const deliveryIdle = readOptionalLeaseMs(
      env,
      "HEADLESS_REDIS_DELIVERY_IDLE_MS",
      HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
      DELIVERY_IDLE_MIN_MS,
      DELIVERY_IDLE_MAX_MS,
    );
    const renderClaim = readOptionalLeaseMs(
      env,
      "HEADLESS_RENDER_CLAIM_LEASE_MS",
      HEADLESS_DEFAULT_RENDER_CLAIM_MS,
      CLAIM_MIN_MS,
      CLAIM_MAX_MS,
    );
    const verifyIdle = readOptionalLeaseMs(
      env,
      "HEADLESS_VERIFY_DELIVERY_IDLE_MS",
      HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
      DELIVERY_IDLE_MIN_MS,
      DELIVERY_IDLE_MAX_MS,
    );
    const verifyClaim = readOptionalLeaseMs(
      env,
      "HEADLESS_VERIFY_CLAIM_LEASE_MS",
      HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
      CLAIM_MIN_MS,
      CLAIM_MAX_MS,
    );
    if (
      deliveryIdle.kind === "hostile" ||
      renderClaim.kind === "hostile" ||
      verifyIdle.kind === "hostile" ||
      verifyClaim.kind === "hostile"
    ) {
      return null;
    }
    if (
      deliveryIdle.kind === "invalid" ||
      renderClaim.kind === "invalid" ||
      verifyIdle.kind === "invalid" ||
      verifyClaim.kind === "invalid"
    ) {
      return null;
    }
    return Object.freeze({
      deliveryIdleMs: deliveryIdle.value,
      renderClaimMs: renderClaim.value,
      verifyDeliveryIdleMs: verifyIdle.value,
      verifyClaimMs: verifyClaim.value,
    });
  } catch {
    return null;
  }
}
