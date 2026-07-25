/**
 * Sprint 11E Phase 2E.2D.8G — provider-backed source binding resolution authority.
 * Safe classifications only — never IDs, locators, keys, digests, MIME values, or credentials.
 */

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import type { HeadlessOwnedObjectStorePort } from "../../control-plane/ports/owned-object-store.port";
import type { HeadlessControlPlaneErrorCode } from "../../control-plane/types/control-plane.types";
import type {
  HeadlessFinalizedOwnedObjectRecordV1,
  HeadlessOwnedObjectPurpose,
} from "../../control-plane/types/owned-object-record";
import { deriveAttemptBoundArtifactObjectId } from "../../control-plane/services/attempt-bound-artifact-key";
import { cpFail, cpOk } from "../../control-plane/types/control-plane.types";
import type { HeadlessObjectMetadata } from "../../control-plane/ports/storage.port";

export const SOURCE_BINDING_SUBSTAGE_IDS = Object.freeze([
  "canonical_binding_input",
  "binding_record_load",
  "binding_authority_validation",
  "owned_object_load",
  "owned_object_coherence",
  "locator_construction",
  "source_stream_open",
  "source_stream_ready",
  "binding_resolution_complete",
] as const);

export type SourceBindingSubstageId =
  (typeof SOURCE_BINDING_SUBSTAGE_IDS)[number];

export const SOURCE_BINDING_RESULT_CLASSES = Object.freeze([
  "resolved",
  "binding_missing",
  "authority_rejected",
  "record_missing",
  "record_incoherent",
  "locator_rejected",
  "stream_unavailable",
  "stream_integrity_failed",
  "lease_expired",
  "adapter_capability_mismatch",
] as const);

export type SourceBindingResultClass =
  (typeof SOURCE_BINDING_RESULT_CLASSES)[number];

export const SOURCE_BINDING_AUTHORITY_CLASSES = Object.freeze([
  "canonical_bundle_allowlist",
  "artifact_shortcut",
  "forged_locator",
  "not_applicable",
] as const);

export type SourceBindingAuthorityClass =
  (typeof SOURCE_BINDING_AUTHORITY_CLASSES)[number];

export const SOURCE_BINDING_COUNT_CLASSES = Object.freeze([
  "none",
  "single",
  "small",
  "large",
] as const);

export type SourceBindingCountClass =
  (typeof SOURCE_BINDING_COUNT_CLASSES)[number];

export const SOURCE_BINDING_PURPOSE_CLASSES = Object.freeze([
  "manifest",
  "asset_bundle",
  "asset_bytes",
  "artifact",
  "unknown",
] as const);

export type SourceBindingPurposeClass =
  (typeof SOURCE_BINDING_PURPOSE_CLASSES)[number];

export const SOURCE_BINDING_STORE_CLASSES = Object.freeze([
  "assets",
  "artifacts",
  "unsupported",
] as const);

export type SourceBindingStoreClass =
  (typeof SOURCE_BINDING_STORE_CLASSES)[number];

export const SOURCE_BINDING_OBJECT_STAGE_CLASSES = Object.freeze([
  "finalized",
  "staging",
  "provisional",
  "missing",
  "unsupported",
] as const);

export type SourceBindingObjectStageClass =
  (typeof SOURCE_BINDING_OBJECT_STAGE_CLASSES)[number];

export const SOURCE_BINDING_COHERENCE_CLASSES = Object.freeze([
  "coherent",
  "owner_mismatch",
  "project_mismatch",
  "job_mismatch",
  "operation_mismatch",
  "attempt_mismatch",
  "purpose_mismatch",
  "not_reached",
] as const);

export type SourceBindingCoherenceClass =
  (typeof SOURCE_BINDING_COHERENCE_CLASSES)[number];

export const SOURCE_BINDING_SLOT_COVERAGE_CLASSES = Object.freeze([
  "complete",
  "incomplete",
  "not_applicable",
] as const);

export type SourceBindingSlotCoverageClass =
  (typeof SOURCE_BINDING_SLOT_COVERAGE_CLASSES)[number];

export const SOURCE_BINDING_LOCATOR_CLASSES = Object.freeze([
  "object_storage_assets",
  "object_storage_artifacts",
  "unsupported",
] as const);

export type SourceBindingLocatorClass =
  (typeof SOURCE_BINDING_LOCATOR_CLASSES)[number];

export const SOURCE_BINDING_DIGEST_CLASSES = Object.freeze([
  "matched",
  "mismatch",
  "not_reached",
] as const);

export type SourceBindingDigestClass =
  (typeof SOURCE_BINDING_DIGEST_CLASSES)[number];

export const SOURCE_BINDING_LENGTH_CLASSES = Object.freeze([
  "matched",
  "mismatch",
  "not_reached",
] as const);

export type SourceBindingLengthClass =
  (typeof SOURCE_BINDING_LENGTH_CLASSES)[number];

export const SOURCE_BINDING_MIME_CLASSES = Object.freeze([
  "matched",
  "mismatch",
  "not_reached",
] as const);

export type SourceBindingMimeClass =
  (typeof SOURCE_BINDING_MIME_CLASSES)[number];

export const SOURCE_STREAM_CAPABILITY_CLASSES = Object.freeze([
  "ready",
  "unavailable",
  "not_reached",
] as const);

export type SourceStreamCapabilityClass =
  (typeof SOURCE_STREAM_CAPABILITY_CLASSES)[number];

export type SourceBindingAttributionSnapshot = Readonly<{
  readonly sourceBindingSubstage: SourceBindingSubstageId;
  readonly sourceBindingResultClass: SourceBindingResultClass;
  readonly sourceBindingAuthorityClass: SourceBindingAuthorityClass;
  readonly sourceBindingCountClass: SourceBindingCountClass;
  readonly sourceBindingPurposeClass: SourceBindingPurposeClass;
  readonly sourceBindingStoreClass: SourceBindingStoreClass;
  readonly sourceBindingObjectStageClass: SourceBindingObjectStageClass;
  readonly sourceBindingJobCoherenceClass: SourceBindingCoherenceClass;
  readonly sourceBindingOwnerCoherenceClass: SourceBindingCoherenceClass;
  readonly sourceBindingAttemptCoherenceClass: SourceBindingCoherenceClass;
  readonly sourceBindingSlotCoverageClass: SourceBindingSlotCoverageClass;
  readonly sourceBindingLocatorClass: SourceBindingLocatorClass;
  readonly sourceBindingDigestClass: SourceBindingDigestClass;
  readonly sourceBindingLengthClass: SourceBindingLengthClass;
  readonly sourceBindingMimeClass: SourceBindingMimeClass;
  readonly sourceStreamCapabilityClass: SourceStreamCapabilityClass;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
}>;

const ALLOWLISTED_CP_CODES = new Set<string>([
  "MANIFEST_NOT_FOUND",
  "OBJECT_INTEGRITY_FAILED",
  "OBJECT_OWNERSHIP_MISMATCH",
  "MANIFEST_EXPIRED",
  "MANIFEST_DIGEST_MISMATCH",
  "BODY_TOO_LARGE",
  "OPERATION_ABORTED",
  "HOSTILE_INPUT",
  "INTERNAL_ERROR",
  "FORBIDDEN",
  "STALE_TRANSITION",
]);

function pickAllowlisted<T extends string>(
  value: unknown,
  set: ReadonlySet<string>,
): T | undefined {
  return typeof value === "string" && set.has(value) ? (value as T) : undefined;
}

export function locatorKeyForSourceBinding(
  locator: HeadlessStorageLocatorIdentity,
): string {
  return JSON.stringify({
    kind: locator.kind,
    storeId: locator.storeId,
    objectKey: locator.objectKey,
  });
}

export function classifySourceBindingLocator(
  locator: HeadlessStorageLocatorIdentity,
): SourceBindingLocatorClass {
  if (locator.kind !== "object_storage") return "unsupported";
  if (locator.storeId === "assets") return "object_storage_assets";
  if (locator.storeId === "artifacts") return "object_storage_artifacts";
  return "unsupported";
}

export function classifySourceBindingPurpose(
  purpose: HeadlessOwnedObjectPurpose | null | undefined,
): SourceBindingPurposeClass {
  switch (purpose) {
    case "manifest":
      return "manifest";
    case "asset_bundle_record":
      return "asset_bundle";
    case "asset_bytes":
      return "asset_bytes";
    case "artifact":
      return "artifact";
    default:
      return "unknown";
  }
}

export function classifySourceBindingCount(
  allowlistedLocatorCount: number,
): SourceBindingCountClass {
  if (allowlistedLocatorCount <= 0) return "none";
  if (allowlistedLocatorCount === 1) return "single";
  if (allowlistedLocatorCount <= 8) return "small";
  return "large";
}

function freezeMetadata(meta: HeadlessObjectMetadata): HeadlessObjectMetadata {
  return Object.freeze({
    ...meta,
    locator: Object.freeze({ ...meta.locator }),
  });
}

export function sourceBindingAttributionToTelemetryFacts(
  snapshot: SourceBindingAttributionSnapshot,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {
    source_binding_substage: snapshot.sourceBindingSubstage,
    source_binding_result_class: snapshot.sourceBindingResultClass,
    source_binding_authority_class: snapshot.sourceBindingAuthorityClass,
    source_binding_count_class: snapshot.sourceBindingCountClass,
    source_binding_purpose_class: snapshot.sourceBindingPurposeClass,
    source_binding_store_class: snapshot.sourceBindingStoreClass,
    source_binding_object_stage_class: snapshot.sourceBindingObjectStageClass,
    source_binding_job_coherence_class: snapshot.sourceBindingJobCoherenceClass,
    source_binding_owner_coherence_class:
      snapshot.sourceBindingOwnerCoherenceClass,
    source_binding_attempt_coherence_class:
      snapshot.sourceBindingAttemptCoherenceClass,
    source_binding_slot_coverage_class:
      snapshot.sourceBindingSlotCoverageClass,
    source_binding_locator_class: snapshot.sourceBindingLocatorClass,
    source_binding_digest_class: snapshot.sourceBindingDigestClass,
    source_binding_length_class: snapshot.sourceBindingLengthClass,
    source_binding_mime_class: snapshot.sourceBindingMimeClass,
    source_stream_capability_class: snapshot.sourceStreamCapabilityClass,
  };
  if (snapshot.safeControlPlaneCode != null) {
    out.safe_control_plane_code = snapshot.safeControlPlaneCode;
  }
  return Object.freeze(out);
}

export function buildSourceBindingAttribution(input: {
  readonly substage: SourceBindingSubstageId;
  readonly resultClass: SourceBindingResultClass;
  readonly authorityClass?: SourceBindingAuthorityClass;
  readonly allowlistedCount?: number;
  readonly purpose?: HeadlessOwnedObjectPurpose | null;
  readonly storeId?: string | null;
  readonly objectStage?: SourceBindingObjectStageClass;
  readonly jobCoherence?: SourceBindingCoherenceClass;
  readonly ownerCoherence?: SourceBindingCoherenceClass;
  readonly attemptCoherence?: SourceBindingCoherenceClass;
  readonly slotCoverage?: SourceBindingSlotCoverageClass;
  readonly locator?: HeadlessStorageLocatorIdentity;
  readonly digestClass?: SourceBindingDigestClass;
  readonly lengthClass?: SourceBindingLengthClass;
  readonly mimeClass?: SourceBindingMimeClass;
  readonly streamCapability?: SourceStreamCapabilityClass;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
}): SourceBindingAttributionSnapshot {
  const storeClass = pickAllowlisted<SourceBindingStoreClass>(
    input.storeId,
    new Set(SOURCE_BINDING_STORE_CLASSES),
  );
  return Object.freeze({
    sourceBindingSubstage: input.substage,
    sourceBindingResultClass: input.resultClass,
    sourceBindingAuthorityClass:
      input.authorityClass ?? "not_applicable",
    sourceBindingCountClass: classifySourceBindingCount(
      input.allowlistedCount ?? 0,
    ),
    sourceBindingPurposeClass: classifySourceBindingPurpose(input.purpose),
    sourceBindingStoreClass: storeClass ?? "unsupported",
    sourceBindingObjectStageClass: input.objectStage ?? "missing",
    sourceBindingJobCoherenceClass: input.jobCoherence ?? "not_reached",
    sourceBindingOwnerCoherenceClass: input.ownerCoherence ?? "not_reached",
    sourceBindingAttemptCoherenceClass: input.attemptCoherence ?? "not_reached",
    sourceBindingSlotCoverageClass: input.slotCoverage ?? "not_applicable",
    sourceBindingLocatorClass: input.locator
      ? classifySourceBindingLocator(input.locator)
      : "unsupported",
    sourceBindingDigestClass: input.digestClass ?? "not_reached",
    sourceBindingLengthClass: input.lengthClass ?? "not_reached",
    sourceBindingMimeClass: input.mimeClass ?? "not_reached",
    sourceStreamCapabilityClass: input.streamCapability ?? "not_reached",
    ...(input.safeControlPlaneCode != null
      ? { safeControlPlaneCode: input.safeControlPlaneCode }
      : {}),
  });
}

/** Aggregate success snapshot after every required asset stream is ready. */
export function buildAggregateSourceBindingSuccessSnapshot(input: {
  readonly resolvedAssetCount: number;
  readonly allowlistedCount: number;
}): SourceBindingAttributionSnapshot {
  return buildSourceBindingAttribution({
    substage: "binding_resolution_complete",
    resultClass: "resolved",
    authorityClass: "canonical_bundle_allowlist",
    allowlistedCount: input.allowlistedCount,
    purpose: "asset_bytes",
    storeId: "assets",
    objectStage: "finalized",
    jobCoherence: "coherent",
    ownerCoherence: "coherent",
    attemptCoherence: "coherent",
    slotCoverage: "complete",
    digestClass: "matched",
    lengthClass: "matched",
    mimeClass: "matched",
    streamCapability: "ready",
  });
}

export function classifySourceBindingFailureFromControlPlaneCode(input: {
  readonly code: HeadlessControlPlaneErrorCode | string;
  readonly substage?: SourceBindingSubstageId;
  readonly locator?: HeadlessStorageLocatorIdentity;
  readonly allowlistedCount?: number;
  readonly expectedPurpose?: HeadlessOwnedObjectPurpose;
}): SourceBindingAttributionSnapshot {
  const code = pickAllowlisted<HeadlessControlPlaneErrorCode>(
    input.code,
    ALLOWLISTED_CP_CODES,
  );
  const substage = input.substage ?? "owned_object_load";
  if (code === "MANIFEST_NOT_FOUND") {
    return buildSourceBindingAttribution({
      substage,
      resultClass: "record_missing",
      authorityClass: "canonical_bundle_allowlist",
      allowlistedCount: input.allowlistedCount,
      locator: input.locator,
      safeControlPlaneCode: code,
    });
  }
  if (code === "OBJECT_INTEGRITY_FAILED" || code === "MANIFEST_DIGEST_MISMATCH") {
    return buildSourceBindingAttribution({
      substage: "owned_object_coherence",
      resultClass: "record_incoherent",
      allowlistedCount: input.allowlistedCount,
      locator: input.locator,
      digestClass: "mismatch",
      safeControlPlaneCode: code,
    });
  }
  if (code === "OBJECT_OWNERSHIP_MISMATCH" || code === "FORBIDDEN") {
    return buildSourceBindingAttribution({
      substage: "binding_authority_validation",
      resultClass: "authority_rejected",
      ownerCoherence: "owner_mismatch",
      allowlistedCount: input.allowlistedCount,
      locator: input.locator,
      safeControlPlaneCode: code,
    });
  }
  if (code === "MANIFEST_EXPIRED") {
    return buildSourceBindingAttribution({
      substage: "binding_authority_validation",
      resultClass: "lease_expired",
      allowlistedCount: input.allowlistedCount,
      locator: input.locator,
      safeControlPlaneCode: code,
    });
  }
  if (code === "HOSTILE_INPUT") {
    return buildSourceBindingAttribution({
      substage: "locator_construction",
      resultClass: "locator_rejected",
      allowlistedCount: input.allowlistedCount,
      locator: input.locator,
      safeControlPlaneCode: code,
    });
  }
  if (code === "BODY_TOO_LARGE") {
    return buildSourceBindingAttribution({
      substage: "source_stream_open",
      resultClass: "stream_integrity_failed",
      lengthClass: "mismatch",
      allowlistedCount: input.allowlistedCount,
      locator: input.locator,
      safeControlPlaneCode: code,
    });
  }
  if (code === "OPERATION_ABORTED") {
    return buildSourceBindingAttribution({
      substage: input.substage ?? "source_stream_open",
      resultClass: "stream_unavailable",
      streamCapability: "unavailable",
      allowlistedCount: input.allowlistedCount,
      locator: input.locator,
      safeControlPlaneCode: code,
    });
  }
  return buildSourceBindingAttribution({
    substage,
    resultClass: "stream_unavailable",
    purpose: input.expectedPurpose,
    allowlistedCount: input.allowlistedCount,
    locator: input.locator,
    streamCapability: "unavailable",
    safeControlPlaneCode: code,
  });
}

export type ProviderBackedSourceBindingContext = Readonly<{
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly attempt: number;
  readonly allowedSourceLocators: readonly HeadlessStorageLocatorIdentity[];
  readonly expectedPurpose: HeadlessOwnedObjectPurpose;
}>;

export async function resolveProviderBackedSourceBinding(input: {
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly ownerId: string;
  readonly nowMs: number;
  readonly context: ProviderBackedSourceBindingContext;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
}): Promise<
  | {
      readonly ok: true;
      readonly metadata: HeadlessObjectMetadata;
      readonly attribution: SourceBindingAttributionSnapshot;
    }
  | {
      readonly ok: false;
      readonly attribution: SourceBindingAttributionSnapshot;
    }
> {
  const allowlistedCount = input.context.allowedSourceLocators.length;
  const slotCoverage: SourceBindingSlotCoverageClass =
    allowlistedCount > 0 ? "complete" : "incomplete";
  const locatorClass = classifySourceBindingLocator(input.locator);

  if (input.ownerId !== input.context.ownerId) {
    return {
      ok: false,
      attribution: buildSourceBindingAttribution({
        substage: "binding_authority_validation",
        resultClass: "authority_rejected",
        ownerCoherence: "owner_mismatch",
        allowlistedCount,
        slotCoverage,
        locator: input.locator,
        safeControlPlaneCode: "OBJECT_OWNERSHIP_MISMATCH",
      }),
    };
  }

  if (locatorClass === "unsupported") {
    return {
      ok: false,
      attribution: buildSourceBindingAttribution({
        substage: "locator_construction",
        resultClass: "locator_rejected",
        allowlistedCount,
        slotCoverage,
        locator: input.locator,
        safeControlPlaneCode: "HOSTILE_INPUT",
      }),
    };
  }

  const allowlist = new Set(
    input.context.allowedSourceLocators.map(locatorKeyForSourceBinding),
  );
  const inAllowlist = allowlist.has(locatorKeyForSourceBinding(input.locator));

  const artifactObjectId = deriveAttemptBoundArtifactObjectId({
    jobId: input.context.jobId,
    operationId: input.context.operationId,
    attempt: input.context.attempt,
  });
  if (artifactObjectId != null) {
    const byId = await input.ownedObjectStore.getByObjectIdAndOwner({
      objectId: artifactObjectId,
      ownerId: input.ownerId,
    });
    if (!byId.ok) {
      return {
        ok: false,
        attribution: classifySourceBindingFailureFromControlPlaneCode({
          code: byId.issues[0]?.code ?? "INTERNAL_ERROR",
          substage: "binding_record_load",
          locator: input.locator,
          allowlistedCount,
        }),
      };
    }
    if (
      byId.value != null &&
      byId.value.record.stage === "finalized" &&
      byId.value.record.storeId === input.locator.storeId &&
      byId.value.record.objectKey === input.locator.objectKey
    ) {
      const match = byId.value.record as HeadlessFinalizedOwnedObjectRecordV1;
      if (input.nowMs > match.expiresAtMs) {
        return {
          ok: false,
          attribution: buildSourceBindingAttribution({
            substage: "binding_authority_validation",
            resultClass: "lease_expired",
            authorityClass: "artifact_shortcut",
            purpose: match.purpose,
            storeId: match.storeId,
            objectStage: "finalized",
            allowlistedCount,
            slotCoverage,
            locator: input.locator,
            safeControlPlaneCode: "MANIFEST_EXPIRED",
          }),
        };
      }
      return {
        ok: true,
        metadata: freezeMetadata({
          locator: input.locator,
          ownerId: match.ownerId,
          projectId: match.projectId,
          purpose: match.purpose,
          contentDigest: match.contentDigest,
          byteLength: match.byteLength,
          mimeType: match.mimeType,
          expiresAtMs: match.expiresAtMs,
          finalized: true,
        }),
        attribution: buildSourceBindingAttribution({
          substage: "binding_resolution_complete",
          resultClass: "resolved",
          authorityClass: "artifact_shortcut",
          purpose: match.purpose,
          storeId: match.storeId,
          objectStage: "finalized",
          jobCoherence: "coherent",
          ownerCoherence: "coherent",
          attemptCoherence: "coherent",
          slotCoverage,
          locator: input.locator,
          digestClass: "matched",
          lengthClass: "matched",
          mimeClass: "matched",
          streamCapability: "not_reached",
        }),
      };
    }
  }

  if (!inAllowlist) {
    return {
      ok: false,
      attribution: buildSourceBindingAttribution({
        substage: "binding_authority_validation",
        resultClass: "binding_missing",
        authorityClass: "forged_locator",
        allowlistedCount,
        slotCoverage,
        locator: input.locator,
        safeControlPlaneCode: "MANIFEST_NOT_FOUND",
      }),
    };
  }

  const listed = await input.ownedObjectStore.listByJobIdAndOwner({
    jobId: input.context.jobId,
    ownerId: input.ownerId,
  });
  if (!listed.ok) {
    return {
      ok: false,
      attribution: classifySourceBindingFailureFromControlPlaneCode({
        code: listed.issues[0]?.code ?? "INTERNAL_ERROR",
        substage: "binding_record_load",
        locator: input.locator,
        allowlistedCount,
      }),
    };
  }

  let match: HeadlessFinalizedOwnedObjectRecordV1 | null = null;
  let objectStage: SourceBindingObjectStageClass = "missing";
  for (const stored of listed.value) {
    const record = stored.record;
    objectStage =
      record.stage === "finalized"
        ? "finalized"
        : record.stage === "staging"
          ? "staging"
          : "unsupported";
    if (record.stage !== "finalized") continue;
    if (record.ownerId !== input.ownerId) continue;
    if (record.projectId !== input.context.projectId) continue;
    if (record.jobId !== input.context.jobId) continue;
    if (record.operationId !== input.context.operationId) continue;
    if (
      record.storeId === input.locator.storeId &&
      record.objectKey === input.locator.objectKey
    ) {
      match = record;
      break;
    }
  }

  if (match == null) {
    return {
      ok: false,
      attribution: buildSourceBindingAttribution({
        substage: "owned_object_load",
        resultClass: "record_missing",
        authorityClass: "canonical_bundle_allowlist",
        objectStage,
        jobCoherence: "coherent",
        ownerCoherence: "coherent",
        allowlistedCount,
        slotCoverage,
        locator: input.locator,
        safeControlPlaneCode: "MANIFEST_NOT_FOUND",
      }),
    };
  }

  if (match.purpose !== input.context.expectedPurpose) {
    return {
      ok: false,
      attribution: buildSourceBindingAttribution({
        substage: "owned_object_coherence",
        resultClass: "record_incoherent",
        purpose: match.purpose,
        storeId: match.storeId,
        objectStage: "finalized",
        jobCoherence: "purpose_mismatch",
        ownerCoherence: "coherent",
        allowlistedCount,
        slotCoverage,
        locator: input.locator,
        safeControlPlaneCode: "OBJECT_INTEGRITY_FAILED",
      }),
    };
  }

  if (
    match.byteLength !== match.expectedByteLength ||
    match.contentDigest !== match.expectedContentDigestClaim ||
    match.mimeType !== match.expectedMimeType
  ) {
    return {
      ok: false,
      attribution: buildSourceBindingAttribution({
        substage: "owned_object_coherence",
        resultClass: "record_incoherent",
        purpose: match.purpose,
        storeId: match.storeId,
        objectStage: "finalized",
        jobCoherence: "coherent",
        ownerCoherence: "coherent",
        allowlistedCount,
        slotCoverage,
        locator: input.locator,
        digestClass: "mismatch",
        lengthClass: "mismatch",
        mimeClass: "mismatch",
        safeControlPlaneCode: "OBJECT_INTEGRITY_FAILED",
      }),
    };
  }

  if (input.nowMs > match.expiresAtMs) {
    return {
      ok: false,
      attribution: buildSourceBindingAttribution({
        substage: "binding_authority_validation",
        resultClass: "lease_expired",
        purpose: match.purpose,
        storeId: match.storeId,
        objectStage: "finalized",
        jobCoherence: "coherent",
        ownerCoherence: "coherent",
        allowlistedCount,
        slotCoverage,
        locator: input.locator,
        safeControlPlaneCode: "MANIFEST_EXPIRED",
      }),
    };
  }

  return {
    ok: true,
    metadata: freezeMetadata({
      locator: input.locator,
      ownerId: match.ownerId,
      projectId: match.projectId,
      purpose: match.purpose,
      contentDigest: match.contentDigest,
      byteLength: match.byteLength,
      mimeType: match.mimeType,
      expiresAtMs: match.expiresAtMs,
      finalized: true,
    }),
    attribution: buildSourceBindingAttribution({
      substage: "binding_resolution_complete",
      resultClass: "resolved",
      authorityClass: "canonical_bundle_allowlist",
      purpose: match.purpose,
      storeId: match.storeId,
      objectStage: "finalized",
      jobCoherence: "coherent",
      ownerCoherence: "coherent",
      attemptCoherence: "coherent",
      slotCoverage,
      locator: input.locator,
      digestClass: "matched",
      lengthClass: "matched",
      mimeClass: "matched",
      streamCapability: "ready",
    }),
  };
}

export function mapSourceBindingSubstageToExecutionSubstage(
  substage: SourceBindingSubstageId,
): "source_binding_resolution" {
  void substage;
  return "source_binding_resolution";
}

const SOURCE_BINDING_SUBSTAGE_SET = new Set<string>(SOURCE_BINDING_SUBSTAGE_IDS);
const SOURCE_BINDING_RESULT_SET = new Set<string>(SOURCE_BINDING_RESULT_CLASSES);
const SOURCE_BINDING_AUTHORITY_SET = new Set<string>(
  SOURCE_BINDING_AUTHORITY_CLASSES,
);
const SOURCE_BINDING_COUNT_SET = new Set<string>(SOURCE_BINDING_COUNT_CLASSES);
const SOURCE_BINDING_PURPOSE_SET = new Set<string>(SOURCE_BINDING_PURPOSE_CLASSES);
const SOURCE_BINDING_STORE_SET = new Set<string>(SOURCE_BINDING_STORE_CLASSES);
const SOURCE_BINDING_OBJECT_STAGE_SET = new Set<string>(
  SOURCE_BINDING_OBJECT_STAGE_CLASSES,
);
const SOURCE_BINDING_COHERENCE_SET = new Set<string>(
  SOURCE_BINDING_COHERENCE_CLASSES,
);
const SOURCE_BINDING_SLOT_COVERAGE_SET = new Set<string>(
  SOURCE_BINDING_SLOT_COVERAGE_CLASSES,
);
const SOURCE_BINDING_LOCATOR_SET = new Set<string>(SOURCE_BINDING_LOCATOR_CLASSES);
const SOURCE_BINDING_DIGEST_SET = new Set<string>(SOURCE_BINDING_DIGEST_CLASSES);
const SOURCE_BINDING_LENGTH_SET = new Set<string>(SOURCE_BINDING_LENGTH_CLASSES);
const SOURCE_BINDING_MIME_SET = new Set<string>(SOURCE_BINDING_MIME_CLASSES);
const SOURCE_BINDING_STREAM_SET = new Set<string>(SOURCE_STREAM_CAPABILITY_CLASSES);

export function sanitizeSourceBindingAttributionSnapshot(
  value: unknown,
): SourceBindingAttributionSnapshot | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  const substage = pickAllowlisted<SourceBindingSubstageId>(
    v.sourceBindingSubstage,
    SOURCE_BINDING_SUBSTAGE_SET,
  );
  const resultClass = pickAllowlisted<SourceBindingResultClass>(
    v.sourceBindingResultClass,
    SOURCE_BINDING_RESULT_SET,
  );
  if (substage == null || resultClass == null) return undefined;
  const code = pickAllowlisted<HeadlessControlPlaneErrorCode>(
    v.safeControlPlaneCode,
    ALLOWLISTED_CP_CODES,
  );
  return Object.freeze({
    sourceBindingSubstage: substage,
    sourceBindingResultClass: resultClass,
    sourceBindingAuthorityClass:
      pickAllowlisted<SourceBindingAuthorityClass>(
        v.sourceBindingAuthorityClass,
        SOURCE_BINDING_AUTHORITY_SET,
      ) ?? "not_applicable",
    sourceBindingCountClass:
      pickAllowlisted<SourceBindingCountClass>(
        v.sourceBindingCountClass,
        SOURCE_BINDING_COUNT_SET,
      ) ?? "none",
    sourceBindingPurposeClass:
      pickAllowlisted<SourceBindingPurposeClass>(
        v.sourceBindingPurposeClass,
        SOURCE_BINDING_PURPOSE_SET,
      ) ?? "unknown",
    sourceBindingStoreClass:
      pickAllowlisted<SourceBindingStoreClass>(
        v.sourceBindingStoreClass,
        SOURCE_BINDING_STORE_SET,
      ) ?? "unsupported",
    sourceBindingObjectStageClass:
      pickAllowlisted<SourceBindingObjectStageClass>(
        v.sourceBindingObjectStageClass,
        SOURCE_BINDING_OBJECT_STAGE_SET,
      ) ?? "missing",
    sourceBindingJobCoherenceClass:
      pickAllowlisted<SourceBindingCoherenceClass>(
        v.sourceBindingJobCoherenceClass,
        SOURCE_BINDING_COHERENCE_SET,
      ) ?? "not_reached",
    sourceBindingOwnerCoherenceClass:
      pickAllowlisted<SourceBindingCoherenceClass>(
        v.sourceBindingOwnerCoherenceClass,
        SOURCE_BINDING_COHERENCE_SET,
      ) ?? "not_reached",
    sourceBindingAttemptCoherenceClass:
      pickAllowlisted<SourceBindingCoherenceClass>(
        v.sourceBindingAttemptCoherenceClass,
        SOURCE_BINDING_COHERENCE_SET,
      ) ?? "not_reached",
    sourceBindingSlotCoverageClass:
      pickAllowlisted<SourceBindingSlotCoverageClass>(
        v.sourceBindingSlotCoverageClass,
        SOURCE_BINDING_SLOT_COVERAGE_SET,
      ) ?? "not_applicable",
    sourceBindingLocatorClass:
      pickAllowlisted<SourceBindingLocatorClass>(
        v.sourceBindingLocatorClass,
        SOURCE_BINDING_LOCATOR_SET,
      ) ?? "unsupported",
    sourceBindingDigestClass:
      pickAllowlisted<SourceBindingDigestClass>(
        v.sourceBindingDigestClass,
        SOURCE_BINDING_DIGEST_SET,
      ) ?? "not_reached",
    sourceBindingLengthClass:
      pickAllowlisted<SourceBindingLengthClass>(
        v.sourceBindingLengthClass,
        SOURCE_BINDING_LENGTH_SET,
      ) ?? "not_reached",
    sourceBindingMimeClass:
      pickAllowlisted<SourceBindingMimeClass>(
        v.sourceBindingMimeClass,
        SOURCE_BINDING_MIME_SET,
      ) ?? "not_reached",
    sourceStreamCapabilityClass:
      pickAllowlisted<SourceStreamCapabilityClass>(
        v.sourceStreamCapabilityClass,
        SOURCE_BINDING_STREAM_SET,
      ) ?? "not_reached",
    ...(code != null ? { safeControlPlaneCode: code } : {}),
  });
}

export function sanitizeSourceBindingAttributionFromTelemetryFacts(
  facts: Readonly<Record<string, string | number | boolean | null>> | undefined,
): SourceBindingAttributionSnapshot | undefined {
  if (facts == null) return undefined;
  return sanitizeSourceBindingAttributionSnapshot({
    sourceBindingSubstage: facts.source_binding_substage,
    sourceBindingResultClass: facts.source_binding_result_class,
    sourceBindingAuthorityClass: facts.source_binding_authority_class,
    sourceBindingCountClass: facts.source_binding_count_class,
    sourceBindingPurposeClass: facts.source_binding_purpose_class,
    sourceBindingStoreClass: facts.source_binding_store_class,
    sourceBindingObjectStageClass: facts.source_binding_object_stage_class,
    sourceBindingJobCoherenceClass: facts.source_binding_job_coherence_class,
    sourceBindingOwnerCoherenceClass: facts.source_binding_owner_coherence_class,
    sourceBindingAttemptCoherenceClass:
      facts.source_binding_attempt_coherence_class,
    sourceBindingSlotCoverageClass: facts.source_binding_slot_coverage_class,
    sourceBindingLocatorClass: facts.source_binding_locator_class,
    sourceBindingDigestClass: facts.source_binding_digest_class,
    sourceBindingLengthClass: facts.source_binding_length_class,
    sourceBindingMimeClass: facts.source_binding_mime_class,
    sourceStreamCapabilityClass: facts.source_stream_capability_class,
    safeControlPlaneCode: facts.safe_control_plane_code,
  });
}

export function consumeSourceBindingAttributionFromStorage(
  storage: import("../../control-plane/ports/storage.port").HeadlessStoragePort,
): SourceBindingAttributionSnapshot | null {
  const consumer = storage as {
    consumeLastSourceBindingAttribution?: () => SourceBindingAttributionSnapshot | null;
  };
  return consumer.consumeLastSourceBindingAttribution?.() ?? null;
}
