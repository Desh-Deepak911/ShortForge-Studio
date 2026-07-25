/**
 * Total safe Neon / DATABASE_URL classification — never logs or returns the URL.
 * Classification never opens a connection.
 */

export type HeadlessNeonEnvironmentStatus =
  | "unconfigured"
  | "configured"
  | "invalid";

/** Safe ceiling — reject hostile oversized env values without inspecting content. */
export const HEADLESS_DATABASE_URL_MAX_LENGTH = 2048;

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

function isSupportedPostgresProtocol(protocol: string): boolean {
  return protocol === "postgres:" || protocol === "postgresql:";
}

/**
 * Structurally validate a postgres connection URL without revealing which
 * component failed and without rewriting or connecting.
 */
function isStructurallyValidPostgresUrl(value: string): boolean {
  if (value.length === 0 || value.length > HEADLESS_DATABASE_URL_MAX_LENGTH) {
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
  if (!isSupportedPostgresProtocol(parsed.protocol)) {
    return false;
  }
  if (!parsed.hostname || parsed.hostname.length === 0) {
    return false;
  }
  // Database name is the first path segment (optional leading slash).
  const dbName = parsed.pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (dbName.length === 0) {
    return false;
  }
  // Credentials-free invalid form: require a non-empty username.
  if (!parsed.username || parsed.username.length === 0) {
    return false;
  }
  return true;
}

/**
 * Classify DATABASE_URL without connecting, logging, or returning secrets.
 */
export function classifyHeadlessNeonEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessNeonEnvironmentStatus {
  try {
    const db = readEnvString(env, "DATABASE_URL");
    if (db.kind === "hostile") {
      return "invalid";
    }
    if (db.kind === "absent") {
      return "unconfigured";
    }
    if (!isStructurallyValidPostgresUrl(db.value)) {
      return "invalid";
    }
    return "configured";
  } catch {
    return "invalid";
  }
}

/** True only when classification is `configured`. */
export function isHeadlessNeonEnvironmentConfigured(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return classifyHeadlessNeonEnvironment(env) === "configured";
}

/**
 * Read DATABASE_URL only after classification is `configured`.
 * Returns null on any other status — never throws the URL outward.
 */
export function readConfiguredHeadlessDatabaseUrl(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): string | null {
  if (classifyHeadlessNeonEnvironment(env) !== "configured") {
    return null;
  }
  const db = readEnvString(env, "DATABASE_URL");
  if (db.kind !== "present") {
    return null;
  }
  return db.value;
}
