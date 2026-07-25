/**
 * Sprint 11E Phase 2E.2D.8E — safe owned-object finalize substage attribution.
 * Classifications and bounded limits only — never IDs, keys, digests, SQL, or provider text.
 */

import type { HeadlessControlPlaneErrorCode } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import type { HeadlessStoreVersionDeltaClass } from "@/features/headless-renderer/control-plane/services/promotion-attribution";
import { HEADLESS_PG_SQLSTATE } from "@/features/headless-renderer/control-plane/runtime/map-database-failure";

import {
  classifyStagingObjectPurpose,
  classifyStagingSlotKeyClass,
  classifyStagingSlotKeyLengthClass,
  storeClassForPurpose,
  type StagingObjectPurposeClass,
  type StagingSlotKeyClass,
  type StagingSlotKeyLengthClass,
  type StagingStoreClass,
} from "./owned-object-staging-attribution";
import { classifyStoreVersionDelta } from "./coverage-attribution";

export const OWNED_OBJECT_FINALIZE_SUBSTAGE_IDS = Object.freeze([
  "finalize_input_construction",
  "staging_record_reread",
  "r2_upload",
  "r2_revision_observation",
  "finalize_preflight",
  "neon_finalize_connect",
  "neon_finalize_transaction",
  "neon_finalize_update",
  "neon_finalize_returning_map",
  "neon_finalize_reread",
  "finalized_coherence_assertion",
  "cleanup",
] as const);

export type OwnedObjectFinalizeSubstageId =
  (typeof OWNED_OBJECT_FINALIZE_SUBSTAGE_IDS)[number];

export const OWNED_OBJECT_FINALIZE_REASON_IDS = Object.freeze([
  "finalize_input_construction_failed",
  "staging_record_reread_failed",
  "r2_upload_failed",
  "r2_revision_observation_failed",
  "finalize_preflight_failed",
  "neon_finalize_connect_failed",
  "neon_finalize_transaction_failed",
  "neon_finalize_update_failed",
  "neon_finalize_returning_map_failed",
  "neon_finalize_reread_failed",
  "finalized_coherence_assertion_failed",
  "owned_object_finalize_failed",
  "concurrent_finalize_conflict",
  "finalized_idempotent_replay",
] as const);

export type OwnedObjectFinalizeReasonId =
  (typeof OWNED_OBJECT_FINALIZE_REASON_IDS)[number];

export const FINALIZE_RESULT_KINDS = Object.freeze([
  "finalized",
  "idempotent_replay",
  "failed",
] as const);

export type FinalizeResultKind = (typeof FINALIZE_RESULT_KINDS)[number];

export const FINALIZE_FAILURE_BOUNDARY_CLASSES = Object.freeze([
  "provider_connection_unavailable",
  "provider_transaction_unavailable",
  "stale_cas_store_version",
  "malformed_returning_row",
  "post_write_reread_failed",
  "metadata_coherence_rejection",
  "r2_revision_unavailable",
  "r2_revision_mismatch",
  "successful_finalize",
] as const);

export type FinalizeFailureBoundaryClass =
  (typeof FINALIZE_FAILURE_BOUNDARY_CLASSES)[number];

export const R2_REVISION_OUTCOME_CLASSES = Object.freeze([
  "available",
  "unavailable",
  "mismatch",
  "not_observed",
] as const);

export type R2RevisionOutcomeClass =
  (typeof R2_REVISION_OUTCOME_CLASSES)[number];

export const DURABLE_OBJECT_STAGE_CLASSES = Object.freeze([
  "staging",
  "finalized",
  "rejected",
  "cleanup_pending",
  "missing",
  "unexpected",
] as const);

export type DurableObjectStageClass =
  (typeof DURABLE_OBJECT_STAGE_CLASSES)[number];

export type FlyRenderOwnedObjectFinalizeAttributionSnapshot = {
  readonly finalizeSubstage: OwnedObjectFinalizeSubstageId;
  readonly objectPurposeClass: StagingObjectPurposeClass;
  readonly slotKeyClass: StagingSlotKeyClass;
  readonly slotKeyLengthClass: StagingSlotKeyLengthClass;
  readonly storeClass: StagingStoreClass;
  readonly resultKind: FinalizeResultKind;
  readonly failureBoundaryClass?: FinalizeFailureBoundaryClass;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
  readonly allowlistedSqlState?: string;
  readonly allowlistedConstraint?: string;
  readonly storeVersionDelta?: HeadlessStoreVersionDeltaClass;
  readonly durableObjectStageClass?: DurableObjectStageClass;
  readonly r2RevisionOutcomeClass?: R2RevisionOutcomeClass;
  readonly cleanupStatus?:
    | "ok"
    | "failed"
    | "skipped"
    | "preserved"
    | "not_run";
};

const SUBSTAGE_SET = new Set<string>(OWNED_OBJECT_FINALIZE_SUBSTAGE_IDS);
const REASON_SET = new Set<string>(OWNED_OBJECT_FINALIZE_REASON_IDS);
const PURPOSE_SET = new Set<string>([
  "manifest",
  "asset_bundle",
  "asset_bytes",
]);
const SLOT_CLASS_SET = new Set<string>(["null", "hslot_v2"]);
const LENGTH_CLASS_SET = new Set<string>([
  "none",
  "within_neon_varchar_128",
  "within_canonical_sql_max",
  "exceeds_neon_varchar_128_within_ts_max",
  "exceeds_ts_max",
  "malformed",
]);
const STORE_SET = new Set<string>(["assets", "artifacts"]);
const RESULT_SET = new Set<string>(FINALIZE_RESULT_KINDS);
const BOUNDARY_SET = new Set<string>(FINALIZE_FAILURE_BOUNDARY_CLASSES);
const REVISION_SET = new Set<string>(R2_REVISION_OUTCOME_CLASSES);
const STAGE_CLASS_SET = new Set<string>(DURABLE_OBJECT_STAGE_CLASSES);

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

export function substageToFinalizeReasonId(
  substage: OwnedObjectFinalizeSubstageId,
): OwnedObjectFinalizeReasonId {
  switch (substage) {
    case "finalize_input_construction":
      return "finalize_input_construction_failed";
    case "staging_record_reread":
      return "staging_record_reread_failed";
    case "r2_upload":
      return "r2_upload_failed";
    case "r2_revision_observation":
      return "r2_revision_observation_failed";
    case "finalize_preflight":
      return "finalize_preflight_failed";
    case "neon_finalize_connect":
      return "neon_finalize_connect_failed";
    case "neon_finalize_transaction":
      return "neon_finalize_transaction_failed";
    case "neon_finalize_update":
      return "neon_finalize_update_failed";
    case "neon_finalize_returning_map":
      return "neon_finalize_returning_map_failed";
    case "neon_finalize_reread":
      return "neon_finalize_reread_failed";
    case "finalized_coherence_assertion":
      return "finalized_coherence_assertion_failed";
    case "cleanup":
      return "owned_object_finalize_failed";
    default:
      return "owned_object_finalize_failed";
  }
}

export function classifyDurableObjectStageClass(
  stage: string | null | undefined,
): DurableObjectStageClass {
  if (stage == null) return "missing";
  if (stage === "staging") return "staging";
  if (stage === "finalized") return "finalized";
  if (stage === "rejected") return "rejected";
  if (stage === "cleanup_pending") return "cleanup_pending";
  return "unexpected";
}

export function classifyFinalizeFailureBoundary(input: {
  readonly substage: OwnedObjectFinalizeSubstageId;
  readonly safeControlPlaneCode?: string;
  readonly resultKind: FinalizeResultKind;
}): FinalizeFailureBoundaryClass | undefined {
  if (input.resultKind === "finalized" || input.resultKind === "idempotent_replay") {
    return "successful_finalize";
  }
  const code = input.safeControlPlaneCode;
  if (input.substage === "finalized_coherence_assertion") {
    return "metadata_coherence_rejection";
  }
  if (input.substage === "neon_finalize_returning_map") {
    return "malformed_returning_row";
  }
  if (input.substage === "neon_finalize_reread") {
    return "post_write_reread_failed";
  }
  if (input.substage === "r2_revision_observation") {
    if (code === "OBJECT_REVISION_UNAVAILABLE") return "r2_revision_unavailable";
    if (code === "OBJECT_REVISION_MISMATCH") return "r2_revision_mismatch";
  }
  if (
    code === "STALE_TRANSITION" ||
    code === "CLAIM_REJECTED" ||
    input.substage === "neon_finalize_update"
  ) {
    return "stale_cas_store_version";
  }
  if (input.substage === "neon_finalize_connect") {
    return "provider_connection_unavailable";
  }
  if (input.substage === "neon_finalize_transaction") {
    return "provider_transaction_unavailable";
  }
  if (code === "DATABASE_UNAVAILABLE") {
    return input.substage === "staging_record_reread"
      ? "provider_connection_unavailable"
      : "provider_transaction_unavailable";
  }
  return undefined;
}

export function mapVerifyFailureToFinalizeSubstage(input: {
  readonly code?: string;
  readonly stagingRereadSucceeded: boolean;
  readonly revisionObserved: boolean;
}): OwnedObjectFinalizeSubstageId {
  const code = input.code;
  if (code === "OBJECT_REVISION_UNAVAILABLE" || code === "OBJECT_REVISION_MISMATCH") {
    return "r2_revision_observation";
  }
  if (code === "JOB_NOT_FOUND") {
    return input.stagingRereadSucceeded
      ? "neon_finalize_reread"
      : "staging_record_reread";
  }
  if (code === "STALE_TRANSITION" || code === "CLAIM_REJECTED") {
    return "neon_finalize_update";
  }
  if (code === "JOB_STORE_COHERENCE_REJECTED") {
    return "neon_finalize_returning_map";
  }
  if (code === "TERMINAL_IMMUTABLE") {
    return "finalized_coherence_assertion";
  }
  if (code === "DATABASE_UNAVAILABLE") {
    return input.stagingRereadSucceeded && input.revisionObserved
      ? "neon_finalize_transaction"
      : "neon_finalize_connect";
  }
  if (
    code === "ASSET_DIGEST_MISMATCH" ||
    code === "ASSET_LENGTH_MISMATCH" ||
    code === "ASSET_MIME_MISMATCH" ||
    code === "OBJECT_INTEGRITY_FAILED"
  ) {
    return "finalize_preflight";
  }
  return "neon_finalize_transaction";
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

export function buildOwnedObjectFinalizeAttributionSnapshot(input: {
  readonly finalizeSubstage: OwnedObjectFinalizeSubstageId;
  readonly objectPurposeClass: StagingObjectPurposeClass;
  readonly slotKeyClass: StagingSlotKeyClass;
  readonly slotKeyLengthClass: StagingSlotKeyLengthClass;
  readonly storeClass: StagingStoreClass;
  readonly resultKind: FinalizeResultKind;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
  readonly allowlistedSqlState?: string;
  readonly allowlistedConstraint?: string;
  readonly storeVersionBefore?: number;
  readonly storeVersionAfter?: number;
  readonly durableObjectStageClass?: DurableObjectStageClass;
  readonly r2RevisionOutcomeClass?: R2RevisionOutcomeClass;
  readonly cleanupStatus?: FlyRenderOwnedObjectFinalizeAttributionSnapshot["cleanupStatus"];
}): FlyRenderOwnedObjectFinalizeAttributionSnapshot {
  const code = sanitizeControlPlaneCode(input.safeControlPlaneCode);
  const boundary = classifyFinalizeFailureBoundary({
    substage: input.finalizeSubstage,
    safeControlPlaneCode: code,
    resultKind: input.resultKind,
  });
  const delta =
    input.storeVersionBefore != null && input.storeVersionAfter != null
      ? classifyStoreVersionDelta(
          input.storeVersionBefore,
          input.storeVersionAfter,
        )
      : undefined;
  return Object.freeze({
    finalizeSubstage: input.finalizeSubstage,
    objectPurposeClass: input.objectPurposeClass,
    slotKeyClass: input.slotKeyClass,
    slotKeyLengthClass: input.slotKeyLengthClass,
    storeClass: input.storeClass,
    resultKind: input.resultKind,
    ...(boundary != null ? { failureBoundaryClass: boundary } : {}),
    ...(code != null ? { safeControlPlaneCode: code } : {}),
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
    ...(delta != null ? { storeVersionDelta: delta } : {}),
    ...(input.durableObjectStageClass != null &&
    STAGE_CLASS_SET.has(input.durableObjectStageClass)
      ? { durableObjectStageClass: input.durableObjectStageClass }
      : {}),
    ...(input.r2RevisionOutcomeClass != null &&
    REVISION_SET.has(input.r2RevisionOutcomeClass)
      ? { r2RevisionOutcomeClass: input.r2RevisionOutcomeClass }
      : {}),
    ...(input.cleanupStatus != null ? { cleanupStatus: input.cleanupStatus } : {}),
  });
}

export function sanitizeOwnedObjectFinalizeAttributionSnapshot(
  value: unknown,
): FlyRenderOwnedObjectFinalizeAttributionSnapshot | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (
    !SUBSTAGE_SET.has(String(v.finalizeSubstage)) ||
    !PURPOSE_SET.has(String(v.objectPurposeClass)) ||
    !SLOT_CLASS_SET.has(String(v.slotKeyClass)) ||
    !LENGTH_CLASS_SET.has(String(v.slotKeyLengthClass)) ||
    !STORE_SET.has(String(v.storeClass)) ||
    !RESULT_SET.has(String(v.resultKind))
  ) {
    return undefined;
  }
  const boundary =
    v.failureBoundaryClass != null &&
    BOUNDARY_SET.has(String(v.failureBoundaryClass))
      ? (v.failureBoundaryClass as FinalizeFailureBoundaryClass)
      : undefined;
  const delta = v.storeVersionDelta;
  const deltaOk =
    delta === "unchanged" || delta === "plus_one" || delta === "unexpected"
      ? delta
      : undefined;
  const built = buildOwnedObjectFinalizeAttributionSnapshot({
    finalizeSubstage: v.finalizeSubstage as OwnedObjectFinalizeSubstageId,
    objectPurposeClass: v.objectPurposeClass as StagingObjectPurposeClass,
    slotKeyClass: v.slotKeyClass as StagingSlotKeyClass,
    slotKeyLengthClass: v.slotKeyLengthClass as StagingSlotKeyLengthClass,
    storeClass: v.storeClass as StagingStoreClass,
    resultKind: v.resultKind as FinalizeResultKind,
    safeControlPlaneCode: sanitizeControlPlaneCode(v.safeControlPlaneCode),
    allowlistedSqlState: sanitizeSqlState(v.allowlistedSqlState),
    allowlistedConstraint: sanitizeConstraint(v.allowlistedConstraint),
    durableObjectStageClass:
      v.durableObjectStageClass != null &&
      STAGE_CLASS_SET.has(String(v.durableObjectStageClass))
        ? (v.durableObjectStageClass as DurableObjectStageClass)
        : undefined,
    r2RevisionOutcomeClass:
      v.r2RevisionOutcomeClass != null &&
      REVISION_SET.has(String(v.r2RevisionOutcomeClass))
        ? (v.r2RevisionOutcomeClass as R2RevisionOutcomeClass)
        : undefined,
    cleanupStatus:
      v.cleanupStatus === "ok" ||
      v.cleanupStatus === "failed" ||
      v.cleanupStatus === "skipped" ||
      v.cleanupStatus === "preserved" ||
      v.cleanupStatus === "not_run"
        ? v.cleanupStatus
        : undefined,
  });
  return Object.freeze({
    ...built,
    ...(boundary != null ? { failureBoundaryClass: boundary } : {}),
    ...(deltaOk != null ? { storeVersionDelta: deltaOk } : {}),
  });
}

export function isOwnedObjectFinalizeReasonId(
  value: unknown,
): value is OwnedObjectFinalizeReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function isOwnedObjectFinalizeSubstageId(
  value: unknown,
): value is OwnedObjectFinalizeSubstageId {
  return typeof value === "string" && SUBSTAGE_SET.has(value);
}

export function purposeAttributionFromPayload(input: {
  readonly purpose: string;
  readonly slotKey: string | null;
  readonly storeId?: "assets" | "artifacts";
}): {
  readonly objectPurposeClass: StagingObjectPurposeClass;
  readonly slotKeyClass: StagingSlotKeyClass;
  readonly slotKeyLengthClass: StagingSlotKeyLengthClass;
  readonly storeClass: StagingStoreClass;
} {
  return {
    objectPurposeClass:
      classifyStagingObjectPurpose(input.purpose) ?? "manifest",
    slotKeyClass: classifyStagingSlotKeyClass(input.slotKey),
    slotKeyLengthClass: classifyStagingSlotKeyLengthClass({
      slotKey: input.slotKey,
    }),
    storeClass:
      input.storeId != null
        ? input.storeId
        : storeClassForPurpose(input.purpose),
  };
}
