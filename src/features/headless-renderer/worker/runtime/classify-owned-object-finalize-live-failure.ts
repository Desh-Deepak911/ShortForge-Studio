/**
 * Privacy-safe classifier for live owned-object finalization failures.
 * Maps sanitized probe/provider evidence into bounded substage and field classes
 * without exposing object keys, ownership identifiers, or raw binding values.
 */

import type { ArtifactFinalizeSubstageClass } from "./provider-backed-boundary-telemetry";
import { classifyStorageFinalizeFailureSubstage } from "./classify-storage-finalize-failure";

export type OwnedObjectFinalizeDurableStageClass =
  | "missing"
  | "staging"
  | "staging_with_verification_claim"
  | "finalized"
  | "terminal_non_finalized";

export type OwnedObjectFinalizeRevisionOutcomeClass =
  | "not_reached"
  | "stale_transition"
  | "coherence_rejected"
  | "integrity_rejected"
  | "claim_rejected"
  | "provider_unavailable"
  | "succeeded";

export type OwnedObjectFinalizeSchemaDecodeOutcomeClass =
  | "not_applicable"
  | "succeeded"
  | "coherence_rejected";

export type OwnedObjectFinalizeLiveFailureClassification = {
  readonly exceptionClass: "control_plane_result" | "unhandled_provider_exception";
  readonly finalizeSubstage: ArtifactFinalizeSubstageClass;
  readonly mismatchFieldClass:
    | "none"
    | "content_digest"
    | "byte_length"
    | "mime_type"
    | "store_version"
    | "verification_claim"
    | "schema_row_coherence"
    | "unknown";
  readonly mismatchAuthority: "neon_owned_object_store" | "upload_session" | "none";
  readonly expectedLifecycleClass: "staging_to_finalized";
  readonly actualLifecycleClass: OwnedObjectFinalizeDurableStageClass;
  readonly revisionOutcome: OwnedObjectFinalizeRevisionOutcomeClass;
  readonly schemaDecodeOutcome: OwnedObjectFinalizeSchemaDecodeOutcomeClass;
  readonly requiredFieldClass:
    | "none"
    | "absent"
    | "invalid"
    | "stale"
    | "inconsistent";
};

const REVISION_BY_CODE: Readonly<
  Partial<Record<string, OwnedObjectFinalizeRevisionOutcomeClass>>
> = Object.freeze({
  STALE_TRANSITION: "stale_transition",
  JOB_STORE_COHERENCE_REJECTED: "coherence_rejected",
  OBJECT_INTEGRITY_FAILED: "integrity_rejected",
  CLAIM_REJECTED: "claim_rejected",
  DATABASE_UNAVAILABLE: "provider_unavailable",
});

const FIELD_BY_CODE: Readonly<
  Partial<
    Record<
      string,
      OwnedObjectFinalizeLiveFailureClassification["mismatchFieldClass"]
    >
  >
> = Object.freeze({
  OBJECT_INTEGRITY_FAILED: "content_digest",
  STALE_TRANSITION: "store_version",
  CLAIM_REJECTED: "verification_claim",
  JOB_STORE_COHERENCE_REJECTED: "schema_row_coherence",
  MANIFEST_DIGEST_MISMATCH: "content_digest",
  ASSET_LENGTH_MISMATCH: "byte_length",
  ASSET_MIME_MISMATCH: "mime_type",
});

/**
 * Classifies a live or fixture finalization failure from privacy-safe inputs only.
 */
export function classifyOwnedObjectFinalizeLiveFailure(input: {
  readonly safeControlPlaneCode?: string;
  readonly threwUnhandledException?: boolean;
  readonly durableStageClass: OwnedObjectFinalizeDurableStageClass;
  readonly boundarySequenceIncludesFinalizeStarted?: boolean;
  readonly boundarySequenceIncludesFinalizeCompleted?: boolean;
}): OwnedObjectFinalizeLiveFailureClassification {
  const code = input.safeControlPlaneCode;
  const revisionOutcome =
    code != null && code in REVISION_BY_CODE
      ? REVISION_BY_CODE[code]!
      : input.threwUnhandledException === true
        ? "not_reached"
        : "not_reached";

  const schemaDecodeOutcome =
    code === "JOB_STORE_COHERENCE_REJECTED"
      ? "coherence_rejected"
      : "not_applicable";

  const mismatchFieldClass =
    code != null && code in FIELD_BY_CODE ? FIELD_BY_CODE[code]! : "unknown";

  const finalizeSubstage =
    input.threwUnhandledException === true
      ? "provider_finalize"
      : classifyStorageFinalizeFailureSubstage(code);

  const requiredFieldClass =
    code === "JOB_STORE_COHERENCE_REJECTED"
      ? "inconsistent"
      : code === "STALE_TRANSITION"
        ? "stale"
        : code === "OBJECT_INTEGRITY_FAILED"
          ? "inconsistent"
          : input.threwUnhandledException === true
            ? "invalid"
            : "none";

  return Object.freeze({
    exceptionClass:
      input.threwUnhandledException === true
        ? "unhandled_provider_exception"
        : "control_plane_result",
    finalizeSubstage,
    mismatchFieldClass,
    mismatchAuthority:
      mismatchFieldClass === "none"
        ? "none"
        : mismatchFieldClass === "content_digest" &&
            code === "MANIFEST_DIGEST_MISMATCH"
          ? "upload_session"
          : "neon_owned_object_store",
    expectedLifecycleClass: "staging_to_finalized",
    actualLifecycleClass: input.durableStageClass,
    revisionOutcome,
    schemaDecodeOutcome,
    requiredFieldClass,
  });
}

/**
 * Authoritative privacy-safe classification recovered from the rejected e022 live probe.
 */
export function classifyRejectedCleanupRuntimeLiveFinalizationFailure(): OwnedObjectFinalizeLiveFailureClassification {
  return classifyOwnedObjectFinalizeLiveFailure({
    threwUnhandledException: true,
    durableStageClass: "staging_with_verification_claim",
    boundarySequenceIncludesFinalizeStarted: false,
    boundarySequenceIncludesFinalizeCompleted: false,
  });
}
