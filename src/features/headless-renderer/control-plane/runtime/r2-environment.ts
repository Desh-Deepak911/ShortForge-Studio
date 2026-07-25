/**
 * Total safe R2 / HEADLESS_ALLOWED_ORIGINS classification — never logs or returns secrets.
 * Classification never opens a network connection.
 *
 * Callers that receive `readConfiguredHeadlessR2Config` MUST never log or return
 * the secret access key, endpoint credentials, or signed URL material.
 */

export type HeadlessR2EnvironmentStatus =
  | "unconfigured"
  | "configured"
  | "invalid";

export const HEADLESS_R2_ACCOUNT_ID_MAX_LENGTH = 128;
export const HEADLESS_R2_ACCESS_KEY_ID_MAX_LENGTH = 256;
export const HEADLESS_R2_SECRET_ACCESS_KEY_MAX_LENGTH = 256;
export const HEADLESS_R2_BUCKET_MAX_LENGTH = 128;
export const HEADLESS_R2_ENDPOINT_MAX_LENGTH = 2048;
export const HEADLESS_R2_ALLOWED_ORIGINS_MAX_LENGTH = 4096;

const REQUIRED_KEYS = Object.freeze([
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_ASSETS",
  "R2_BUCKET_ARTIFACTS",
  "R2_ENDPOINT",
  "HEADLESS_ALLOWED_ORIGINS",
] as const);

/** Private configured config — adapters only. Never log or return to clients. */
export type HeadlessConfiguredR2Config = {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucketAssets: string;
  readonly bucketArtifacts: string;
  readonly endpoint: string;
  readonly allowedOrigins: readonly string[];
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

function looksCredentialLike(value: string): boolean {
  if (
    value.startsWith("sk_") ||
    value.startsWith("AKIA") ||
    value.startsWith("r2_")
  ) {
    return true;
  }
  return value.includes("SECRET");
}

/**
 * DNS-style bucket: lowercase alnum + hyphens, no leading/trailing hyphen,
 * no whitespace, length 3–128 (bounded by HEADLESS_R2_BUCKET_MAX_LENGTH).
 */
function isDnsStyleBucket(value: string): boolean {
  if (value.length < 3 || value.length > HEADLESS_R2_BUCKET_MAX_LENGTH) {
    return false;
  }
  if (value !== value.trim() || /\s/.test(value)) {
    return false;
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value)) {
    return false;
  }
  if (value.includes("..") || value.includes("--")) {
    return false;
  }
  return true;
}

function isValidHttpsEndpoint(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > HEADLESS_R2_ENDPOINT_MAX_LENGTH
  ) {
    return false;
  }
  if (value !== value.trim() || /\s/.test(value)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }
  if (!parsed.hostname || parsed.hostname.length === 0) {
    return false;
  }
  return true;
}

/**
 * Absolute https origin: scheme+host[+port] only — no path/query/hash/userinfo.
 */
function parseAllowedOrigin(segment: string): string | null {
  if (segment.length === 0) return null;
  if (segment.includes("*")) return null;
  if (looksCredentialLike(segment)) return null;
  if (segment !== segment.trim() || /\s/.test(segment)) return null;
  let parsed: URL;
  try {
    parsed = new URL(segment);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname || parsed.hostname.length === 0) return null;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
  if (parsed.search || parsed.hash) return null;
  // Reconstruct canonical origin (no trailing slash path).
  const port =
    parsed.port && parsed.port.length > 0 ? `:${parsed.port}` : "";
  return `https://${parsed.hostname}${port}`;
}

function parseAllowedOrigins(raw: string): readonly string[] | null {
  if (
    raw.length === 0 ||
    raw.length > HEADLESS_R2_ALLOWED_ORIGINS_MAX_LENGTH
  ) {
    return null;
  }
  if (raw !== raw.trim()) {
    return null;
  }
  const parts = raw.split(",");
  if (parts.length === 0) return null;
  const origins: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0) return null;
    // Reject if original segment had surrounding whitespace inconsistency
    // beyond simple comma separation — empty after trim already rejected.
    const origin = parseAllowedOrigin(trimmed);
    if (origin == null) return null;
    if (seen.has(origin)) return null;
    seen.add(origin);
    origins.push(origin);
  }
  return Object.freeze(origins.slice());
}

function isBoundedNonEmpty(
  value: string,
  max: number,
): boolean {
  return (
    value.length > 0 &&
    value.length <= max &&
    value === value.trim() &&
    !/\s/.test(value)
  );
}

type PresentMap = {
  readonly [K in (typeof REQUIRED_KEYS)[number]]: string;
};

function collectPresent(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
):
  | { readonly kind: "hostile" }
  | { readonly kind: "none" }
  | { readonly kind: "partial" }
  | { readonly kind: "all"; readonly values: PresentMap } {
  const values: Record<string, string> = {};
  let presentCount = 0;
  for (const key of REQUIRED_KEYS) {
    const read = readEnvString(env, key);
    if (read.kind === "hostile") return { kind: "hostile" };
    if (read.kind === "present") {
      presentCount += 1;
      values[key] = read.value;
    }
  }
  if (presentCount === 0) return { kind: "none" };
  if (presentCount !== REQUIRED_KEYS.length) return { kind: "partial" };
  return { kind: "all", values: values as PresentMap };
}

function validateConfiguredValues(
  values: PresentMap,
): HeadlessConfiguredR2Config | null {
  const accountId = values.R2_ACCOUNT_ID;
  const accessKeyId = values.R2_ACCESS_KEY_ID;
  const secretAccessKey = values.R2_SECRET_ACCESS_KEY;
  const bucketAssets = values.R2_BUCKET_ASSETS;
  const bucketArtifacts = values.R2_BUCKET_ARTIFACTS;
  const endpoint = values.R2_ENDPOINT;
  const originsRaw = values.HEADLESS_ALLOWED_ORIGINS;

  if (!isBoundedNonEmpty(accountId, HEADLESS_R2_ACCOUNT_ID_MAX_LENGTH)) {
    return null;
  }
  if (!isBoundedNonEmpty(accessKeyId, HEADLESS_R2_ACCESS_KEY_ID_MAX_LENGTH)) {
    return null;
  }
  if (
    !isBoundedNonEmpty(
      secretAccessKey,
      HEADLESS_R2_SECRET_ACCESS_KEY_MAX_LENGTH,
    )
  ) {
    return null;
  }
  if (!isDnsStyleBucket(bucketAssets) || !isDnsStyleBucket(bucketArtifacts)) {
    return null;
  }
  if (bucketAssets === bucketArtifacts) {
    return null;
  }
  if (!isValidHttpsEndpoint(endpoint)) {
    return null;
  }
  const allowedOrigins = parseAllowedOrigins(originsRaw);
  if (allowedOrigins == null || allowedOrigins.length === 0) {
    return null;
  }

  return Object.freeze({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketAssets,
    bucketArtifacts,
    endpoint,
    allowedOrigins,
  });
}

/**
 * Classify R2 + allowed-origins environment without connecting, logging, or
 * returning secret values.
 */
export function classifyHeadlessR2Environment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessR2EnvironmentStatus {
  try {
    const collected = collectPresent(env);
    if (collected.kind === "hostile") return "invalid";
    if (collected.kind === "none") return "unconfigured";
    if (collected.kind === "partial") return "invalid";
    if (validateConfiguredValues(collected.values) == null) {
      return "invalid";
    }
    return "configured";
  } catch {
    return "invalid";
  }
}

/** True only when classification is `configured`. */
export function isHeadlessR2EnvironmentConfigured(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return classifyHeadlessR2Environment(env) === "configured";
}

/**
 * Read private R2 config only after classification is `configured`.
 * Returns null otherwise. Callers MUST never log this value.
 */
export function readConfiguredHeadlessR2Config(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessConfiguredR2Config | null {
  try {
    if (classifyHeadlessR2Environment(env) !== "configured") {
      return null;
    }
    const collected = collectPresent(env);
    if (collected.kind !== "all") return null;
    return validateConfiguredValues(collected.values);
  } catch {
    return null;
  }
}

/**
 * Origins-only view for tests/policy checks that must not touch secrets.
 * Returns null unless classification is `configured`.
 */
export function readConfiguredHeadlessAllowedOrigins(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): readonly string[] | null {
  const config = readConfiguredHeadlessR2Config(env);
  if (config == null) return null;
  return config.allowedOrigins;
}
