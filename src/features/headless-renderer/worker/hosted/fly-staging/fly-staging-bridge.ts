/**
 * Sprint 11E Phase 2E.2D.4 — operator-safe 0600 Fly staging secret bridge.
 *
 * Values are accepted for membership/emptiness checks only when provided by the
 * operator process. This module never reads `.env.local`, never prints values,
 * and never contacts Fly.
 */

import { createHash } from "node:crypto";

import { HEADLESS_FLY_STAGING_SECRET_NAMES } from "./fly-staging-env-ledger";
import {
  HEADLESS_FLY_STAGING_BRIDGE_FORBIDDEN_NON_SECRET_KEYS,
  HEADLESS_FLY_STAGING_PUBLIC_ENV_NAMES,
} from "./fly-staging-public-environment";
import { headlessFlyStagingGateEnvName, HEADLESS_FLY_STAGING_GATE_IDS } from "./fly-staging-deployment-plan";

export const HEADLESS_FLY_STAGING_BRIDGE_MODE = 0o600;

export type HeadlessFlyStagingBridgeStatus =
  | "ok"
  | "invalid"
  | "hostile_input";

export type HeadlessFlyStagingBridgeReasonId =
  | "ok"
  | "empty_bridge"
  | "missing_key"
  | "unknown_key"
  | "empty_value"
  | "duplicate_key"
  | "invalid_line"
  | "env_local_fallback_forbidden"
  | "public_env_in_bridge"
  | "wrong_mode"
  | "hostile_input";

export type HeadlessFlyStagingBridgeClassification = {
  readonly status: HeadlessFlyStagingBridgeStatus;
  readonly reasonId: HeadlessFlyStagingBridgeReasonId;
  /** Present keys only — never values. */
  readonly keysPresent: readonly string[];
  /** SHA-256 of sorted key names (not values). */
  readonly keySetFingerprintSha256: string | null;
};

const KEY_VALUE_RE = /^([A-Z][A-Z0-9_]*)=(.*)$/;

function fingerprintKeys(keys: readonly string[]): string {
  return createHash("sha256").update([...keys].sort().join("\n")).digest("hex");
}

function freezeBridge(
  status: HeadlessFlyStagingBridgeStatus,
  reasonId: HeadlessFlyStagingBridgeReasonId,
  keysPresent: readonly string[],
): HeadlessFlyStagingBridgeClassification {
  const sorted = Object.freeze([...keysPresent].sort());
  return Object.freeze({
    status,
    reasonId,
    keysPresent: sorted,
    keySetFingerprintSha256:
      status === "ok" ? fingerprintKeys(sorted) : null,
  });
}

/**
 * Parse a bridge file body (`KEY=value` lines). Values are not returned.
 * Rejects empty/duplicate/unknown keys and `.env.local` references.
 */
export function classifyHeadlessFlyStagingBridgeBody(
  body: unknown,
  options: { readonly fileMode?: number } = {},
): HeadlessFlyStagingBridgeClassification {
  try {
    if (typeof body !== "string") {
      return freezeBridge("hostile_input", "hostile_input", []);
    }
    if (
      options.fileMode !== undefined &&
      options.fileMode !== HEADLESS_FLY_STAGING_BRIDGE_MODE
    ) {
      return freezeBridge("invalid", "wrong_mode", []);
    }
    if (/\.env\.local\b/i.test(body)) {
      return freezeBridge("invalid", "env_local_fallback_forbidden", []);
    }
    const lines = body.split(/\r?\n/);
    const map = new Map<string, string>();
    for (const line of lines) {
      if (line.length === 0 || line.startsWith("#")) continue;
      if (/^\s/.test(line) || /\s$/.test(line)) {
        return freezeBridge("invalid", "invalid_line", []);
      }
      const match = KEY_VALUE_RE.exec(line);
      if (!match) {
        return freezeBridge("invalid", "invalid_line", []);
      }
      const key = match[1]!;
      const value = match[2]!;
      if (map.has(key)) {
        return freezeBridge("invalid", "duplicate_key", [...map.keys()]);
      }
      if (
        (HEADLESS_FLY_STAGING_BRIDGE_FORBIDDEN_NON_SECRET_KEYS as readonly string[]).includes(
          key,
        )
      ) {
        return freezeBridge("invalid", "public_env_in_bridge", [...map.keys(), key]);
      }
      if (
        !(HEADLESS_FLY_STAGING_SECRET_NAMES as readonly string[]).includes(key)
      ) {
        return freezeBridge("invalid", "unknown_key", [...map.keys()]);
      }
      if (value.length === 0) {
        return freezeBridge("invalid", "empty_value", [...map.keys(), key]);
      }
      map.set(key, value);
    }
    if (map.size === 0) {
      return freezeBridge("invalid", "empty_bridge", []);
    }
    const keys = [...map.keys()];
    for (const required of HEADLESS_FLY_STAGING_SECRET_NAMES) {
      if (!map.has(required)) {
        return freezeBridge("invalid", "missing_key", keys);
      }
    }
    // Drop values immediately — only keys survive classification.
    map.clear();
    return freezeBridge("ok", "ok", keys);
  } catch {
    return freezeBridge("hostile_input", "hostile_input", []);
  }
}

/**
 * Classify a Record of secret values without echoing them.
 * Used by tests and future operator loaders (never `.env.local`).
 */
export function classifyHeadlessFlyStagingBridgeRecord(
  record: unknown,
): HeadlessFlyStagingBridgeClassification {
  try {
    if (record == null || typeof record !== "object") {
      return freezeBridge("hostile_input", "hostile_input", []);
    }
    const obj = record as Record<string, unknown>;
    const lines: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== "string") {
        return freezeBridge("hostile_input", "hostile_input", []);
      }
      // Encode as KEY=value without validating content beyond emptiness later.
      lines.push(`${key}=${value}`);
    }
    return classifyHeadlessFlyStagingBridgeBody(lines.join("\n"), {
      fileMode: HEADLESS_FLY_STAGING_BRIDGE_MODE,
    });
  } catch {
    return freezeBridge("hostile_input", "hostile_input", []);
  }
}

/**
 * Documented EXIT-trap cleanup contract for operator shells.
 * Scripts must delete the bridge file and unset secret names.
 */
export const HEADLESS_FLY_STAGING_BRIDGE_CLEANUP_CONTRACT = Object.freeze({
  deleteBridgeFile: true,
  unsetSecretNames: HEADLESS_FLY_STAGING_SECRET_NAMES,
  unsetPublicEnvNames: HEADLESS_FLY_STAGING_PUBLIC_ENV_NAMES,
  unsetProcessBoundaryEnvNames: Object.freeze(["HEADLESS_WORKER_MODE"] as const),
  unsetGateEnvNames: Object.freeze(
    HEADLESS_FLY_STAGING_GATE_IDS.map((gate) => headlessFlyStagingGateEnvName(gate)),
  ),
  forbidEnvLocalFallback: true,
  requiredMode: HEADLESS_FLY_STAGING_BRIDGE_MODE,
  forbiddenBridgeNonSecretKeys: HEADLESS_FLY_STAGING_BRIDGE_FORBIDDEN_NON_SECRET_KEYS,
} as const);
