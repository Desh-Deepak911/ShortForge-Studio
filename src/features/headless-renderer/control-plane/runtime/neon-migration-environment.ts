/**
 * Migration-only environment classification for DATABASE_URL_UNPOOLED.
 *
 * Never used by application startup, route handling, or runtime Neon adapters.
 * Never returns, logs, or serializes the connection string.
 */

import { HEADLESS_DATABASE_URL_MAX_LENGTH } from "./neon-environment";

export type HeadlessNeonMigrationEnvironmentStatus =
  | "unconfigured"
  | "configured"
  | "invalid"
  | "pooler_rejected";

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
 * Neon / PgBouncer pooler hostnames must not be used for DDL migrations.
 * Detection is hostname-shape only — never inspects credentials.
 */
export function isPostgresPoolerHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host.includes("-pooler.")) return true;
  if (host.startsWith("pooler.")) return true;
  if (host.includes(".pooler.")) return true;
  return false;
}

function isStructurallyValidDirectPostgresUrl(value: string): boolean {
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
  const dbName = parsed.pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (dbName.length === 0) {
    return false;
  }
  if (!parsed.username || parsed.username.length === 0) {
    return false;
  }
  return true;
}

/**
 * Classify DATABASE_URL_UNPOOLED without connecting or returning secrets.
 */
export function classifyHeadlessNeonMigrationEnvironment(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): HeadlessNeonMigrationEnvironmentStatus {
  try {
    const db = readEnvString(env, "DATABASE_URL_UNPOOLED");
    if (db.kind === "hostile") {
      return "invalid";
    }
    if (db.kind === "absent") {
      return "unconfigured";
    }
    if (!isStructurallyValidDirectPostgresUrl(db.value)) {
      return "invalid";
    }
    let hostname: string;
    try {
      hostname = new URL(db.value).hostname;
    } catch {
      return "invalid";
    }
    if (isPostgresPoolerHostname(hostname)) {
      return "pooler_rejected";
    }
    return "configured";
  } catch {
    return "invalid";
  }
}

export function isHeadlessNeonMigrationEnvironmentConfigured(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  return classifyHeadlessNeonMigrationEnvironment(env) === "configured";
}

/**
 * Read DATABASE_URL_UNPOOLED only after classification is `configured`.
 * Never falls back to DATABASE_URL.
 */
export function readConfiguredHeadlessMigrationDatabaseUrl(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): string | null {
  if (classifyHeadlessNeonMigrationEnvironment(env) !== "configured") {
    return null;
  }
  const db = readEnvString(env, "DATABASE_URL_UNPOOLED");
  if (db.kind !== "present") {
    return null;
  }
  return db.value;
}

/** Operator gate for the explicit migration command. */
export function isHeadlessNeonMigrateGateEnabled(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): boolean {
  try {
    const raw = readEnvString(env, "HEADLESS_NEON_MIGRATE");
    return raw.kind === "present" && raw.value === "1";
  } catch {
    return false;
  }
}
