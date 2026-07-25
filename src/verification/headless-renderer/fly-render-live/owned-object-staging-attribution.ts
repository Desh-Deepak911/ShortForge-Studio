/**
 * Sprint 11E Phase 2E.2D.8C.1 — safe owned-object staging substage attribution.
 * Classifications and bounded limits only — never IDs, keys, digests, SQL, or provider text.
 */

import type { HeadlessControlPlaneErrorCode } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH } from "@/features/headless-renderer/domain/headless-source-slot-key";
import { HEADLESS_PG_SQLSTATE } from "@/features/headless-renderer/control-plane/runtime/map-database-failure";

/** Mirrors 004 initial VARCHAR(128) — pre-007 diagnostic attribution only. */
export const NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT = 128 as const;

/** Post-007 effective SQL capacity aligned with TypeScript canonical max. */
export const NEON_OWNED_OBJECT_SLOT_KEY_POST_007_SQL_LIMIT =
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH;

export const OWNED_OBJECT_STAGING_SUBSTAGE_IDS = Object.freeze([
  "staging_input_construction",
  "purpose_store_authority",
  "slot_key_validation",
  "object_key_derivation",
  "staging_record_validation",
  "neon_staging_insert",
  "neon_staging_returning_map",
  "neon_staging_reread",
  "staging_coherence_assertion",
  "cleanup",
] as const);

export type OwnedObjectStagingSubstageId =
  (typeof OWNED_OBJECT_STAGING_SUBSTAGE_IDS)[number];

export const OWNED_OBJECT_STAGING_REASON_IDS = Object.freeze([
  "staging_input_construction_failed",
  "purpose_store_authority_failed",
  "slot_key_validation_failed",
  "object_key_derivation_failed",
  "staging_record_validation_failed",
  "neon_staging_insert_failed",
  "neon_staging_returning_map_failed",
  "neon_staging_reread_failed",
  "staging_coherence_assertion_failed",
  "staging_hostile_input_rejected",
  "staging_idempotency_conflict",
] as const);

export type OwnedObjectStagingReasonId =
  (typeof OWNED_OBJECT_STAGING_REASON_IDS)[number];

export const STAGING_OBJECT_PURPOSE_CLASSES = Object.freeze([
  "manifest",
  "asset_bundle",
  "asset_bytes",
] as const);

export type StagingObjectPurposeClass =
  (typeof STAGING_OBJECT_PURPOSE_CLASSES)[number];

export const STAGING_SLOT_KEY_CLASSES = Object.freeze([
  "null",
  "hslot_v2",
] as const);

export type StagingSlotKeyClass = (typeof STAGING_SLOT_KEY_CLASSES)[number];

export const STAGING_SLOT_KEY_LENGTH_CLASSES = Object.freeze([
  "none",
  "within_neon_varchar_128",
  "within_canonical_sql_max",
  "exceeds_neon_varchar_128_within_ts_max",
  "exceeds_ts_max",
  "malformed",
] as const);

export type StagingSlotKeyLengthClass =
  (typeof STAGING_SLOT_KEY_LENGTH_CLASSES)[number];

export const STAGING_STORE_CLASSES = Object.freeze(["assets", "artifacts"] as const);

export type StagingStoreClass = (typeof STAGING_STORE_CLASSES)[number];

export const STAGING_RESULT_KINDS = Object.freeze([
  "created",
  "idempotent_replay",
  "failed",
] as const);

export type StagingResultKind = (typeof STAGING_RESULT_KINDS)[number];

export type FlyRenderOwnedObjectStagingAttributionSnapshot = {
  readonly stagingSubstage: OwnedObjectStagingSubstageId;
  readonly objectPurposeClass: StagingObjectPurposeClass;
  readonly slotKeyClass: StagingSlotKeyClass;
  readonly slotKeyLengthClass: StagingSlotKeyLengthClass;
  readonly storeClass: StagingStoreClass;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
  readonly allowlistedSqlState?: string;
  readonly allowlistedConstraint?: string;
  readonly resultKind: StagingResultKind;
  readonly cleanupStatus?: "ok" | "failed" | "skipped" | "preserved" | "not_run";
};

const SUBSTAGE_SET = new Set<string>(OWNED_OBJECT_STAGING_SUBSTAGE_IDS);
const REASON_SET = new Set<string>(OWNED_OBJECT_STAGING_REASON_IDS);
const PURPOSE_SET = new Set<string>(STAGING_OBJECT_PURPOSE_CLASSES);
const SLOT_CLASS_SET = new Set<string>(STAGING_SLOT_KEY_CLASSES);
const LENGTH_CLASS_SET = new Set<string>(STAGING_SLOT_KEY_LENGTH_CLASSES);
const STORE_SET = new Set<string>(STAGING_STORE_CLASSES);
const RESULT_SET = new Set<string>(STAGING_RESULT_KINDS);

const ALLOWLISTED_SQLSTATES = new Set<string>([
  ...Object.values(HEADLESS_PG_SQLSTATE),
  "22001",
  "0A000",
  "25006",
  "25P01",
  "3F000",
  "42P01",
  "42703",
  "42883",
  "42P10",
  "XX000",
]);

const ALLOWLISTED_CONSTRAINTS = new Set<string>([
  "headless_owned_objects_pkey",
  "headless_owned_objects_fk_project_owner",
  "headless_owned_objects_stage_valid",
  "headless_owned_objects_staging_payload",
  "headless_owned_objects_finalized_payload",
  "headless_owned_objects_store_key_unique",
]);

export function classifyStagingObjectPurpose(
  purpose: string,
): StagingObjectPurposeClass | null {
  if (purpose === "manifest") return "manifest";
  if (purpose === "asset_bundle_record") return "asset_bundle";
  if (purpose === "asset_bytes") return "asset_bytes";
  return null;
}

export function classifyStagingSlotKeyClass(
  slotKey: string | null | undefined,
): StagingSlotKeyClass {
  if (slotKey == null || slotKey === "") return "null";
  if (slotKey.startsWith("hslot:v2:")) return "hslot_v2";
  return "hslot_v2";
}

export function classifyStagingSlotKeyLengthClass(input: {
  readonly slotKey: string | null | undefined;
  readonly malformed?: boolean;
  /** Defaults to 128 — live pre-007 Neon boundary for diagnostic attribution. */
  readonly neonSqlVarcharLimit?: number;
}): StagingSlotKeyLengthClass {
  if (input.malformed === true) return "malformed";
  if (input.slotKey == null || input.slotKey === "") return "none";
  const len = input.slotKey.length;
  if (len > HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH) return "exceeds_ts_max";
  const neonLimit =
    input.neonSqlVarcharLimit ?? NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT;
  if (neonLimit === NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT && len > neonLimit) {
    return "exceeds_neon_varchar_128_within_ts_max";
  }
  if (len > neonLimit) return "exceeds_ts_max";
  if (len > NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT) {
    return "within_canonical_sql_max";
  }
  return "within_neon_varchar_128";
}

export function storeClassForPurpose(purpose: string): StagingStoreClass {
  return purpose === "artifact" ? "artifacts" : "assets";
}

export function substageToReasonId(
  substage: OwnedObjectStagingSubstageId,
): OwnedObjectStagingReasonId {
  switch (substage) {
    case "staging_input_construction":
      return "staging_input_construction_failed";
    case "purpose_store_authority":
      return "purpose_store_authority_failed";
    case "slot_key_validation":
      return "slot_key_validation_failed";
    case "object_key_derivation":
      return "object_key_derivation_failed";
    case "staging_record_validation":
      return "staging_record_validation_failed";
    case "neon_staging_insert":
      return "neon_staging_insert_failed";
    case "neon_staging_returning_map":
      return "neon_staging_returning_map_failed";
    case "neon_staging_reread":
      return "neon_staging_reread_failed";
    case "staging_coherence_assertion":
      return "staging_coherence_assertion_failed";
    case "cleanup":
      return "staging_coherence_assertion_failed";
    default:
      return "neon_staging_insert_failed";
  }
}

function sanitizeControlPlaneCode(
  value: unknown,
): HeadlessControlPlaneErrorCode | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return undefined;
  }
  if (/[\0-\x1f\x7f`<>|\\\s]/.test(value)) return undefined;
  return value as HeadlessControlPlaneErrorCode;
}

function sanitizeSqlState(value: unknown): string | undefined {
  if (typeof value !== "string" || !ALLOWLISTED_SQLSTATES.has(value)) {
    return undefined;
  }
  return value;
}

function sanitizeConstraint(value: unknown): string | undefined {
  if (typeof value !== "string" || !ALLOWLISTED_CONSTRAINTS.has(value)) {
    return undefined;
  }
  return value;
}

export function buildOwnedObjectStagingAttributionSnapshot(input: {
  readonly stagingSubstage: OwnedObjectStagingSubstageId;
  readonly objectPurposeClass: StagingObjectPurposeClass;
  readonly slotKeyClass: StagingSlotKeyClass;
  readonly slotKeyLengthClass: StagingSlotKeyLengthClass;
  readonly storeClass: StagingStoreClass;
  readonly resultKind: StagingResultKind;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
  readonly allowlistedSqlState?: string;
  readonly allowlistedConstraint?: string;
  readonly cleanupStatus?: FlyRenderOwnedObjectStagingAttributionSnapshot["cleanupStatus"];
}): FlyRenderOwnedObjectStagingAttributionSnapshot {
  return Object.freeze({
    stagingSubstage: input.stagingSubstage,
    objectPurposeClass: input.objectPurposeClass,
    slotKeyClass: input.slotKeyClass,
    slotKeyLengthClass: input.slotKeyLengthClass,
    storeClass: input.storeClass,
    resultKind: input.resultKind,
    ...(sanitizeControlPlaneCode(input.safeControlPlaneCode) != null
      ? {
          safeControlPlaneCode: sanitizeControlPlaneCode(
            input.safeControlPlaneCode,
          )!,
        }
      : {}),
    ...(sanitizeSqlState(input.allowlistedSqlState) != null
      ? { allowlistedSqlState: sanitizeSqlState(input.allowlistedSqlState)! }
      : {}),
    ...(sanitizeConstraint(input.allowlistedConstraint) != null
      ? {
          allowlistedConstraint: sanitizeConstraint(
            input.allowlistedConstraint,
          )!,
        }
      : {}),
    ...(input.cleanupStatus != null ? { cleanupStatus: input.cleanupStatus } : {}),
  });
}

export function sanitizeOwnedObjectStagingAttributionSnapshot(
  value: unknown,
): FlyRenderOwnedObjectStagingAttributionSnapshot | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (
    !SUBSTAGE_SET.has(String(v.stagingSubstage)) ||
    !PURPOSE_SET.has(String(v.objectPurposeClass)) ||
    !SLOT_CLASS_SET.has(String(v.slotKeyClass)) ||
    !LENGTH_CLASS_SET.has(String(v.slotKeyLengthClass)) ||
    !STORE_SET.has(String(v.storeClass)) ||
    !RESULT_SET.has(String(v.resultKind))
  ) {
    return undefined;
  }
  return buildOwnedObjectStagingAttributionSnapshot({
    stagingSubstage: v.stagingSubstage as OwnedObjectStagingSubstageId,
    objectPurposeClass: v.objectPurposeClass as StagingObjectPurposeClass,
    slotKeyClass: v.slotKeyClass as StagingSlotKeyClass,
    slotKeyLengthClass: v.slotKeyLengthClass as StagingSlotKeyLengthClass,
    storeClass: v.storeClass as StagingStoreClass,
    resultKind: v.resultKind as StagingResultKind,
    safeControlPlaneCode: sanitizeControlPlaneCode(v.safeControlPlaneCode),
    allowlistedSqlState: sanitizeSqlState(v.allowlistedSqlState),
    allowlistedConstraint: sanitizeConstraint(v.allowlistedConstraint),
    cleanupStatus:
      v.cleanupStatus === "ok" ||
      v.cleanupStatus === "failed" ||
      v.cleanupStatus === "skipped" ||
      v.cleanupStatus === "preserved" ||
      v.cleanupStatus === "not_run"
        ? v.cleanupStatus
        : undefined,
  });
}

export function isOwnedObjectStagingReasonId(
  value: unknown,
): value is OwnedObjectStagingReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function isOwnedObjectStagingSubstageId(
  value: unknown,
): value is OwnedObjectStagingSubstageId {
  return typeof value === "string" && SUBSTAGE_SET.has(value);
}

/** Published validation-limit audit — TS vs Neon vs R2 vs mapper (no weakening). */
export const OWNED_OBJECT_STAGING_VALIDATION_LIMIT_AUDIT = Object.freeze([
  {
    layer: "typescript_validator",
    field: "slot_key",
    limit: HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
    note: "validate-owned-object-record accepts canonical hslot:v2 up to 1024.",
  },
  {
    layer: "neon_sql_schema",
    field: "slot_key",
    limit: NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT,
    note: "004_headless_owned_objects.sql initial VARCHAR(128); unchanged by 007 file.",
  },
  {
    layer: "neon_sql_schema_post_007",
    field: "slot_key",
    limit: NEON_OWNED_OBJECT_SLOT_KEY_POST_007_SQL_LIMIT,
    note: "007_headless_owned_object_slot_key_capacity.sql widens to VARCHAR(1024) after apply.",
  },
  {
    layer: "r2_object_key_deriver",
    field: "slotKey_input",
    limit: 128,
    note: "deriveHeadlessR2ObjectKey rejects slotKey length > 128; QA deriveStagingKey hashes long hslot:v2.",
  },
  {
    layer: "typescript_validator",
    field: "object_key",
    limit: 1024,
    note: "OBJECT_KEY_MAX in validate-owned-object-record.",
  },
  {
    layer: "neon_sql_schema",
    field: "object_key",
    limit: 1024,
    note: "VARCHAR(1024) in 004_headless_owned_objects.sql.",
  },
  {
    layer: "sql_row_mapper",
    field: "slot_key",
    limit: null,
    note: "map-headless-owned-object-sql-row validates canonical hslot:v2 via TS validator — no separate VARCHAR cap.",
  },
  {
    layer: "memory_adapter",
    field: "slot_key",
    limit: HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
    note: "Memory store follows TS validator only — does not enforce Neon VARCHAR(128).",
  },
] as const);
