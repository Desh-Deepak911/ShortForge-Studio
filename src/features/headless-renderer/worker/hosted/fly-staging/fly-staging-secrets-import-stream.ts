/**
 * Sprint 11E Phase 2E.2D.6H — decoded Fly secrets import stream authority.
 * Builds stdin for `fly secrets import` from decoded values only.
 * Never logs or returns secret values in diagnostics.
 */

import { HEADLESS_FLY_STAGING_SECRET_NAMES } from "./fly-staging-env-ledger";

export const HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT = 9 as const;

export type HeadlessFlyStagingSecretsImportReasonId =
  | "ok"
  | "missing_secret_name"
  | "unknown_secret_name"
  | "duplicate_secret_name"
  | "empty_value"
  | "unsafe_byte_nul"
  | "unsafe_byte_cr"
  | "unsafe_byte_lf"
  | "shell_quoted_representation"
  | "percent_q_representation"
  | "raw_bridge_line_representation"
  | "invalid_import_line"
  | "record_count_mismatch"
  | "round_trip_mismatch"
  | "hostile_input";

export type HeadlessFlyStagingSecretsImportValidation = {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingSecretsImportReasonId;
};

export type HeadlessFlyStagingSecretsImportStreamResult =
  | {
      readonly status: "ok";
      readonly reasonId: "ok";
      readonly recordCount: typeof HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT;
      /** Exact bytes written to provider stdin — handle only in-process. */
      readonly stream: string;
    }
  | {
      readonly status: "invalid";
      readonly reasonId: Exclude<
        HeadlessFlyStagingSecretsImportReasonId,
        "ok"
      >;
      readonly recordCount: number;
      readonly stream: null;
    };

export type HeadlessFlyStagingSecretsImportRoundTripResult =
  | {
      readonly status: "ok";
      readonly reasonId: "ok";
      readonly recordCount: typeof HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT;
    }
  | {
      readonly status: "invalid";
      readonly reasonId:
        | "round_trip_mismatch"
        | HeadlessFlyStagingSecretsImportReasonId;
      readonly recordCount: number;
      readonly mismatchedKeys: readonly string[];
    };

/** Forbidden shell patterns — bridge file must never be piped to Fly import. */
export const HEADLESS_FLY_STAGING_FORBIDDEN_BRIDGE_IMPORT_SOURCE_RE =
  /<[[:space:]]*"\$\{HEADLESS_FLY_STAGING_BRIDGE_FILE\}"/;

export const HEADLESS_FLY_STAGING_FORBIDDEN_BRIDGE_IMPORT_PATTERNS = Object.freeze([
  HEADLESS_FLY_STAGING_FORBIDDEN_BRIDGE_IMPORT_SOURCE_RE,
  /fly[[:space:]]+secrets[[:space:]]+import[^\n]*HEADLESS_FLY_STAGING_BRIDGE_FILE/,
  /fly[[:space:]]+secrets[[:space:]]+import[^\n]*<\s*"\$\{HEADLESS_FLY_STAGING_BRIDGE_FILE\}"/,
  /fly[[:space:]]+secrets[[:space:]]+import[^\n]*<\s*"\$\{?HEADLESS_FLY_STAGING_BRIDGE_FILE/,
] as const);

const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

function containsUnsafeImportBytes(value: string): HeadlessFlyStagingSecretsImportReasonId | "ok" {
  if (value.includes("\0")) return "unsafe_byte_nul";
  if (value.includes("\r")) return "unsafe_byte_cr";
  if (value.includes("\n")) return "unsafe_byte_lf";
  return "ok";
}

/**
 * Reject shell-serialized bridge tokens mistaken for decoded provider values.
 */
export function rejectShellSerializedSecretValue(
  value: unknown,
): HeadlessFlyStagingSecretsImportValidation {
  if (typeof value !== "string") {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
  const unsafe = containsUnsafeImportBytes(value);
  if (unsafe !== "ok") {
    return Object.freeze({ status: "invalid", reasonId: unsafe });
  }
  if (value.length === 0) {
    return Object.freeze({ status: "invalid", reasonId: "empty_value" });
  }
  if (/%q/.test(value)) {
    return Object.freeze({ status: "invalid", reasonId: "percent_q_representation" });
  }
  if (/^\$'/.test(value) && value.endsWith("'")) {
    return Object.freeze({ status: "invalid", reasonId: "shell_quoted_representation" });
  }
  if (
    value.startsWith("'") &&
    value.endsWith("'") &&
    value.length >= 2 &&
    /\\['\\$`]/.test(value.slice(1, -1))
  ) {
    return Object.freeze({
      status: "invalid",
      reasonId: "shell_quoted_representation",
    });
  }
  return Object.freeze({ status: "ok", reasonId: "ok" });
}

/**
 * Validate decoded secret map membership without echoing values.
 */
export function validateHeadlessFlyStagingDecodedSecretsRecord(
  record: unknown,
): HeadlessFlyStagingSecretsImportValidation {
  try {
    if (record == null || typeof record !== "object") {
      return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
    }
    const obj = record as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length !== HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT) {
      return Object.freeze({ status: "invalid", reasonId: "record_count_mismatch" });
    }
    for (const required of HEADLESS_FLY_STAGING_SECRET_NAMES) {
      if (!(required in obj)) {
        return Object.freeze({ status: "invalid", reasonId: "missing_secret_name" });
      }
    }
    for (const key of keys) {
      if (!(HEADLESS_FLY_STAGING_SECRET_NAMES as readonly string[]).includes(key)) {
        return Object.freeze({ status: "invalid", reasonId: "unknown_secret_name" });
      }
      const valCheck = rejectShellSerializedSecretValue(obj[key]);
      if (valCheck.status !== "ok") {
        return valCheck;
      }
    }
    return Object.freeze({ status: "ok", reasonId: "ok" });
  } catch {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
}

/**
 * Build Fly import stdin from decoded values (never from bridge file bytes).
 */
export function buildHeadlessFlyStagingSecretsImportStream(
  record: unknown,
): HeadlessFlyStagingSecretsImportStreamResult {
  const validation = validateHeadlessFlyStagingDecodedSecretsRecord(record);
  if (validation.status !== "ok") {
    const reasonId =
      validation.reasonId === "ok" ? "hostile_input" : validation.reasonId;
    return Object.freeze({
      status: "invalid",
      reasonId,
      recordCount: 0,
      stream: null,
    });
  }
  const obj = record as Record<string, string>;
  const lines: string[] = [];
  for (const name of HEADLESS_FLY_STAGING_SECRET_NAMES) {
    const value = obj[name]!;
    lines.push(`${name}=${value}`);
  }
  if (lines.length !== HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT) {
    return Object.freeze({
      status: "invalid",
      reasonId: "record_count_mismatch",
      recordCount: lines.length,
      stream: null,
    });
  }
  return Object.freeze({
    status: "ok",
    reasonId: "ok",
    recordCount: HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT,
    stream: `${lines.join("\n")}\n`,
  });
}

/**
 * Parse Fly secrets import stdin format — first `=` separates name and value.
 */
export function parseHeadlessFlyStagingSecretsImportStream(
  body: unknown,
): {
  readonly status: "ok" | "invalid";
  readonly reasonId: HeadlessFlyStagingSecretsImportReasonId;
  readonly values: ReadonlyMap<string, string> | null;
} {
  try {
    if (typeof body !== "string") {
      return Object.freeze({
        status: "invalid",
        reasonId: "hostile_input",
        values: null,
      });
    }
    const map = new Map<string, string>();
    for (const rawLine of body.split(/\n/)) {
      const line = rawLine.replace(/\r$/, "");
      if (line.length === 0 || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) {
        return Object.freeze({
          status: "invalid",
          reasonId: "invalid_import_line",
          values: null,
        });
      }
      const name = line.slice(0, eq);
      const value = line.slice(eq + 1);
      if (!SECRET_NAME_RE.test(name)) {
        return Object.freeze({
          status: "invalid",
          reasonId: "invalid_import_line",
          values: null,
        });
      }
      if (map.has(name)) {
        return Object.freeze({
          status: "invalid",
          reasonId: "duplicate_secret_name",
          values: null,
        });
      }
      const valCheck = rejectShellSerializedSecretValue(value);
      if (valCheck.status !== "ok") {
        return Object.freeze({
          status: "invalid",
          reasonId: valCheck.reasonId,
          values: null,
        });
      }
      map.set(name, value);
    }
    if (map.size !== HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT) {
      return Object.freeze({
        status: "invalid",
        reasonId: "record_count_mismatch",
        values: null,
      });
    }
    for (const required of HEADLESS_FLY_STAGING_SECRET_NAMES) {
      if (!map.has(required)) {
        return Object.freeze({
          status: "invalid",
          reasonId: "missing_secret_name",
          values: null,
        });
      }
    }
    return Object.freeze({ status: "ok", reasonId: "ok", values: map });
  } catch {
    return Object.freeze({
      status: "invalid",
      reasonId: "hostile_input",
      values: null,
    });
  }
}

/** Prove decoded source bytes equal import-parser output byte-for-byte. */
export function assertHeadlessFlyStagingSecretsImportRoundTrip(
  decoded: unknown,
): HeadlessFlyStagingSecretsImportRoundTripResult {
  const built = buildHeadlessFlyStagingSecretsImportStream(decoded);
  if (built.status !== "ok" || built.stream == null) {
    return Object.freeze({
      status: "invalid",
      reasonId: built.reasonId,
      recordCount: built.recordCount,
      mismatchedKeys: Object.freeze([]),
    });
  }
  const parsed = parseHeadlessFlyStagingSecretsImportStream(built.stream);
  if (parsed.status !== "ok" || parsed.values == null) {
    return Object.freeze({
      status: "invalid",
      reasonId: parsed.reasonId,
      recordCount: 0,
      mismatchedKeys: Object.freeze([]),
    });
  }
  const obj = decoded as Record<string, string>;
  const mismatched: string[] = [];
  for (const name of HEADLESS_FLY_STAGING_SECRET_NAMES) {
    const source = obj[name]!;
    const roundTripped = parsed.values.get(name)!;
    if (source !== roundTripped) {
      mismatched.push(name);
    }
  }
  if (mismatched.length > 0) {
    return Object.freeze({
      status: "invalid",
      reasonId: "round_trip_mismatch",
      recordCount: HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT,
      mismatchedKeys: Object.freeze([...mismatched].sort()),
    });
  }
  return Object.freeze({
    status: "ok",
    reasonId: "ok",
    recordCount: HEADLESS_FLY_STAGING_SECRETS_IMPORT_RECORD_COUNT,
  });
}

/**
 * Detect raw bridge line text mistaken for a decoded provider value.
 */
export function classifyRawBridgeLineAsProviderValue(
  rawLineValue: unknown,
  decodedValue: unknown,
): HeadlessFlyStagingSecretsImportValidation {
  if (typeof rawLineValue !== "string" || typeof decodedValue !== "string") {
    return Object.freeze({ status: "invalid", reasonId: "hostile_input" });
  }
  if (rawLineValue === decodedValue && /\\['"$`\\]/.test(rawLineValue)) {
    return Object.freeze({
      status: "invalid",
      reasonId: "raw_bridge_line_representation",
    });
  }
  return rejectShellSerializedSecretValue(decodedValue);
}

export const HEADLESS_FLY_STAGING_SECRETS_SYNC_CONTRACT = Object.freeze({
  decodedImportStreamOnly: true,
  forbidBridgeFilePipeToImport: true,
  forbidPercentQAsProviderValue: true,
  exactNineRecords: true,
  requiresSecretsInstallGate: true,
  requiresZeroMachinesBeforeSync: true,
  requiresPostSyncClassificationBeforeMachine: true,
  neverPrintValues: true,
} as const);
