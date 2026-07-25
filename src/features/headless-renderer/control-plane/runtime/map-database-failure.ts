/**
 * Convert provider/database failures to bounded control-plane results.
 * Carry only allowlisted SQLSTATE — never provider messages, SQL, URLs, or credentials.
 */

import { cpFail } from "../types/control-plane.types";
import {
  HeadlessSqlExecutorError,
  isHeadlessSqlExecutorError,
} from "./sql-client";

/** Allowlisted PostgreSQL SQLSTATEs the adapters may branch on. */
export const HEADLESS_PG_SQLSTATE = Object.freeze({
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  INVALID_TEXT_REPRESENTATION: "22P02",
  NUMERIC_VALUE_OUT_OF_RANGE: "22003",
  /** JSONB/text cannot store U+0000 — common when NUL-delimited composites are persisted. */
  UNTRANSLATABLE_CHARACTER: "22P05",
  IN_FAILED_SQL_TRANSACTION: "25P02",
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK_DETECTED: "40P01",
} as const);

export type HeadlessPgSqlState =
  (typeof HEADLESS_PG_SQLSTATE)[keyof typeof HEADLESS_PG_SQLSTATE];

const ALLOWLISTED = new Set<string>(Object.values(HEADLESS_PG_SQLSTATE));

/**
 * Bounded Postgres error — only an allowlisted SQLSTATE, never provider text.
 */
export class HeadlessPostgresSqlError extends Error {
  readonly sqlState: string;

  constructor(sqlState: string) {
    super("postgres_error");
    this.name = "HeadlessPostgresSqlError";
    this.sqlState = sqlState;
  }
}

export function isHeadlessPostgresSqlError(
  value: unknown,
): value is HeadlessPostgresSqlError {
  return value instanceof HeadlessPostgresSqlError;
}

function readRawSqlState(error: unknown): string | null {
  if (error == null || typeof error !== "object") return null;
  try {
    const code = (error as { code?: unknown }).code;
    if (typeof code !== "string" || code.length === 0 || code.length > 8) {
      return null;
    }
    if (!/^[0-9A-Z]{5}$/.test(code) && !/^08/.test(code)) {
      // Allow 5-char SQLSTATE or connection-class 08…
      if (!/^[0-9A-Z]+$/.test(code)) return null;
    }
    return code;
  } catch {
    return null;
  }
}

/**
 * Extract an allowlisted SQLSTATE (or connection-class prefix) without
 * retaining provider messages.
 */
export function extractHeadlessPgSqlState(error: unknown): string | null {
  if (isHeadlessPostgresSqlError(error)) {
    return error.sqlState;
  }
  const raw = readRawSqlState(error);
  if (raw == null) return null;
  if (ALLOWLISTED.has(raw)) return raw;
  if (raw.startsWith("08")) return raw; // connection exception class
  return null;
}

/**
 * Extract a repository-owned constraint / unique-index name when present.
 * Returns null for unknown names — never returns provider message text.
 */
export function extractHeadlessPgConstraintId(
  error: unknown,
  allowlist: ReadonlySet<string>,
): string | null {
  if (error == null || typeof error !== "object") return null;
  try {
    const raw = (error as { constraint?: unknown }).constraint;
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 128) {
      return null;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(raw)) return null;
    return allowlist.has(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return extractHeadlessPgSqlState(error) === HEADLESS_PG_SQLSTATE.UNIQUE_VIOLATION;
}

export function isPostgresInFailedSqlTransaction(error: unknown): boolean {
  return (
    extractHeadlessPgSqlState(error) ===
    HEADLESS_PG_SQLSTATE.IN_FAILED_SQL_TRANSACTION
  );
}

/**
 * Wrap a provider error into a bounded error for adapter / executor use.
 * Unknown codes become DATABASE_UNAVAILABLE executor errors.
 */
export function toBoundedPostgresError(error: unknown): Error {
  if (isHeadlessSqlExecutorError(error) || isHeadlessPostgresSqlError(error)) {
    return error;
  }
  const state = extractHeadlessPgSqlState(error);
  if (state != null && ALLOWLISTED.has(state)) {
    return new HeadlessPostgresSqlError(state);
  }
  if (state != null && state.startsWith("08")) {
    return new HeadlessSqlExecutorError(
      "DATABASE_UNAVAILABLE",
      "Durable database is temporarily unavailable.",
    );
  }
  return new HeadlessSqlExecutorError(
    "DATABASE_UNAVAILABLE",
    "Durable database is temporarily unavailable.",
  );
}

/**
 * Map any thrown value from SQL execution into a safe control-plane failure.
 * Provider text and SQLSTATEs are never returned to creators.
 */
export function mapHeadlessDatabaseFailure(
  error: unknown,
): ReturnType<typeof cpFail> {
  if (isHeadlessSqlExecutorError(error)) {
    if (error.code === "INTERNAL_ERROR") {
      return cpFail("INTERNAL_ERROR", "Internal database invariant failed.");
    }
    return cpFail(
      "DATABASE_UNAVAILABLE",
      "Durable database is temporarily unavailable.",
    );
  }

  const state = extractHeadlessPgSqlState(error);
  if (state === HEADLESS_PG_SQLSTATE.UNIQUE_VIOLATION) {
    // Adapters must handle 23505 before mapping; escaping here is an outage.
    return cpFail(
      "DATABASE_UNAVAILABLE",
      "Durable database is temporarily unavailable.",
    );
  }
  if (
    state === HEADLESS_PG_SQLSTATE.FOREIGN_KEY_VIOLATION ||
    state === HEADLESS_PG_SQLSTATE.CHECK_VIOLATION ||
    state === HEADLESS_PG_SQLSTATE.INVALID_TEXT_REPRESENTATION ||
    state === HEADLESS_PG_SQLSTATE.NUMERIC_VALUE_OUT_OF_RANGE ||
    state === HEADLESS_PG_SQLSTATE.UNTRANSLATABLE_CHARACTER
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Persisted database row failed coherence checks.",
    );
  }
  if (state === HEADLESS_PG_SQLSTATE.IN_FAILED_SQL_TRANSACTION) {
    return cpFail(
      "INTERNAL_ERROR",
      "Database transaction was left in a failed state.",
    );
  }
  if (
    state === HEADLESS_PG_SQLSTATE.SERIALIZATION_FAILURE ||
    state === HEADLESS_PG_SQLSTATE.DEADLOCK_DETECTED ||
    (state != null && state.startsWith("08"))
  ) {
    return cpFail(
      "DATABASE_UNAVAILABLE",
      "Durable database is temporarily unavailable.",
    );
  }

  return cpFail(
    "DATABASE_UNAVAILABLE",
    "Durable database is temporarily unavailable.",
  );
}

export function databaseUnavailableFail(): ReturnType<typeof cpFail> {
  return cpFail(
    "DATABASE_UNAVAILABLE",
    "Durable database is temporarily unavailable.",
  );
}

export function throwDatabaseUnavailable(): never {
  throw new HeadlessSqlExecutorError(
    "DATABASE_UNAVAILABLE",
    "Durable database is temporarily unavailable.",
  );
}

/** Fixed internal savepoint name for create-if-absent insert recovery. */
export const HEADLESS_CREATE_INSERT_SAVEPOINT = "headless_create_insert";
