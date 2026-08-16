/**
 * Typed schema-preflight compatibility modes for controlled rollback bridges.
 *
 * Rollback-bridge mode recognizes one exact additive migration (008) while still
 * rejecting unknown future migrations, duplicate ledger rows, and checksum drift
 * on migrations 001–007. This is rollback compatibility, not relaxed validation.
 */

import { embeddedSchemaFingerprintAsPreflightSources } from "../migrations/embedded-schema-fingerprint";
import { HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID } from "../../worker/runtime/renderer-build-id";
import type { HeadlessSchemaPreflightSource } from "./neon-schema-preflight";

export const HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV =
  "HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE" as const;

export type HeadlessSchemaPreflightCompatibilityModeId =
  | "strict"
  | "rollback_bridge_007_008";

export const HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE =
  "rollback_bridge_007_008" as const satisfies HeadlessSchemaPreflightCompatibilityModeId;

export const HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID =
  "008_headless_export_maintenance_lease" as const;

export const HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_009_ID =
  "009_headless_verify_queued_unclaimed" as const;

/** Exact checksum for the additive maintenance lease migration (008). */
export const HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256 =
  "5ed409d7e0bc42b44c38d74ee99f6f94de541c6cce5b31e39c39bd6d2b99f3de" as const;

export { HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID };

const CORE_MIGRATION_SOURCES = Object.freeze(
  embeddedSchemaFingerprintAsPreflightSources().filter(
    (entry) =>
      entry.migrationId !== HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID &&
      entry.migrationId !== HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_009_ID,
  ),
);

const CORE_MIGRATION_ID_SET = new Set<string>(
  CORE_MIGRATION_SOURCES.map((entry) => entry.migrationId),
);

export type HeadlessSchemaPreflightLedgerValidationResult =
  | { readonly ok: true; readonly ledgerMigrationIds: readonly string[] }
  | {
      readonly ok: false;
      readonly code: "SCHEMA_MISSING" | "SCHEMA_DRIFT" | "SCHEMA_INCOHERENT";
      readonly message: string;
    };

export function resolveHeadlessSchemaPreflightCompatibilityMode(
  raw: unknown,
): HeadlessSchemaPreflightCompatibilityModeId {
  if (raw == null || raw === "" || raw === "strict") {
    return "strict";
  }
  if (raw === HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE) {
    return HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE;
  }
  return "strict";
}

/**
 * Binds compatibility mode to renderer build identity. Bridge mode is rejected
 * unless the bridge build ID is present; bridge build ID is rejected without
 * bridge mode.
 */
export function classifyHeadlessSchemaPreflightCompatibilityBinding(input: {
  readonly compatibilityMode: unknown;
  readonly rendererBuildId: unknown;
}):
  | {
      readonly ok: true;
      readonly mode: HeadlessSchemaPreflightCompatibilityModeId;
    }
  | {
      readonly ok: false;
      readonly reasonId:
        | "bridge_mode_without_bridge_build_id"
        | "bridge_build_id_without_bridge_mode"
        | "hostile_input";
    } {
  const mode = resolveHeadlessSchemaPreflightCompatibilityMode(
    input.compatibilityMode,
  );
  const buildId =
    typeof input.rendererBuildId === "string"
      ? input.rendererBuildId.trim()
      : "";
  const isBridgeBuild = buildId === HEADLESS_ROLLBACK_BRIDGE_RENDERER_BUILD_ID;

  if (mode === HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE) {
    if (!isBridgeBuild) {
      return Object.freeze({
        ok: false,
        reasonId: "bridge_mode_without_bridge_build_id",
      });
    }
    return Object.freeze({ ok: true, mode });
  }

  if (isBridgeBuild) {
    return Object.freeze({
      ok: false,
      reasonId: "bridge_build_id_without_bridge_mode",
    });
  }

  return Object.freeze({ ok: true, mode: "strict" });
}

export function validateHeadlessSchemaPreflightLedgerForMode(input: {
  readonly mode: HeadlessSchemaPreflightCompatibilityModeId;
  readonly strictExpectedSources: readonly HeadlessSchemaPreflightSource[];
  readonly ledgerById: ReadonlyMap<string, string>;
}):
  | { readonly ok: true; readonly ledgerMigrationIds: readonly string[] }
  | {
      readonly ok: false;
      readonly code: "SCHEMA_MISSING" | "SCHEMA_DRIFT" | "SCHEMA_INCOHERENT";
      readonly message: string;
    } {
  if (input.mode === "strict") {
    return validateStrictLedger(input.strictExpectedSources, input.ledgerById);
  }
  return validateRollbackBridgeLedger(input.ledgerById);
}

function validateStrictLedger(
  expectedSources: readonly HeadlessSchemaPreflightSource[],
  ledgerById: ReadonlyMap<string, string>,
): HeadlessSchemaPreflightLedgerValidationResult {
  if (ledgerById.size !== expectedSources.length) {
    for (const id of ledgerById.keys()) {
      if (!expectedSources.some((source) => source.migrationId === id)) {
        return Object.freeze({
          ok: false,
          code: "SCHEMA_DRIFT",
          message:
            "Schema readiness failed: unexpected migration ID in ledger.",
        });
      }
    }
  }

  for (const source of expectedSources) {
    const applied = ledgerById.get(source.migrationId);
    if (applied == null) {
      return Object.freeze({
        ok: false,
        code: "SCHEMA_MISSING",
        message:
          "Schema readiness failed: required migration has not been applied.",
      });
    }
    if (applied !== source.checksumSha256) {
      return Object.freeze({
        ok: false,
        code: "SCHEMA_DRIFT",
        message:
          "Schema readiness failed: migration checksum drift detected.",
      });
    }
  }

  return Object.freeze({
    ok: true,
    ledgerMigrationIds: Object.freeze([...ledgerById.keys()].sort()),
  });
}

function validateRollbackBridgeLedger(
  ledgerById: ReadonlyMap<string, string>,
): HeadlessSchemaPreflightLedgerValidationResult {
  for (const source of CORE_MIGRATION_SOURCES) {
    const applied = ledgerById.get(source.migrationId);
    if (applied == null) {
      return Object.freeze({
        ok: false,
        code: "SCHEMA_MISSING",
        message:
          "Schema readiness failed: required migration has not been applied.",
      });
    }
    if (applied !== source.checksumSha256) {
      return Object.freeze({
        ok: false,
        code: "SCHEMA_DRIFT",
        message:
          "Schema readiness failed: migration checksum drift detected.",
      });
    }
  }

  for (const migrationId of ledgerById.keys()) {
    if (CORE_MIGRATION_ID_SET.has(migrationId)) {
      continue;
    }
    if (migrationId === HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID) {
      const checksum = ledgerById.get(migrationId);
      if (checksum !== HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256) {
        return Object.freeze({
          ok: false,
          code: "SCHEMA_DRIFT",
          message:
            "Schema readiness failed: migration checksum drift detected.",
        });
      }
      continue;
    }
    return Object.freeze({
      ok: false,
      code: "SCHEMA_DRIFT",
      message: "Schema readiness failed: unexpected migration ID in ledger.",
    });
  }

  return Object.freeze({
    ok: true,
    ledgerMigrationIds: Object.freeze([...ledgerById.keys()].sort()),
  });
}

export function assertHeadlessExportMaintenanceDisabledForBridge(input: {
  readonly maintenanceEnabledRaw: unknown;
}): boolean {
  if (input.maintenanceEnabledRaw == null) {
    return true;
  }
  if (typeof input.maintenanceEnabledRaw !== "string") {
    return false;
  }
  const normalized = input.maintenanceEnabledRaw.trim().toLowerCase();
  return normalized === "" || normalized === "0" || normalized === "false";
}
