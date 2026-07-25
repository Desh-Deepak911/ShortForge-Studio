/**
 * Discriminated provisional/canonical stored-job authority (Phase 2B Phase 1).
 * HeadlessRenderJobV1 / HeadlessRenderJobRequestV1 are canonical-only.
 */

import type {
  HeadlessAdvisoryProgress,
  HeadlessJobState,
  HeadlessReasonId,
  HeadlessRenderJobRequestV1,
  HeadlessRenderJobV1,
  HeadlessRendererProfile,
  HeadlessStorageLocatorIdentity,
  HeadlessTerminalReason,
} from "../../domain/headless-render.types";
import type { HeadlessArtifactObjectBindingV1 } from "./artifact-object-binding";

export const HEADLESS_STORED_JOB_RECORD_VERSION = 1 as const;

export type HeadlessStoredJobStage = "provisional" | "canonical";

export type HeadlessProvisionalJobState =
  | "materializing"
  | "failed"
  | "cancelled"
  | "expired";

/** Creator-supplied snapshot claims — not trusted verification authority. */
export interface HeadlessProvisionalSnapshotClaimV1 {
  readonly manifestPayloadDigestClaim: string;
  readonly assetBundleFingerprintClaim: string;
  readonly expectedSlotClaims: readonly HeadlessProvisionalSlotClaimV1[];
}

export interface HeadlessProvisionalSlotClaimV1 {
  readonly slotKey: string;
  readonly role: "scene_media" | "voiceover" | "music";
  readonly sceneId: string | null;
  readonly mediaItemId: string | null;
  readonly sourceDigestClaim: string;
  readonly contentDigestClaim: string;
  readonly byteLengthClaim: number;
  readonly mimeTypeClaim: string;
}

export interface HeadlessProvisionalStagingObjectRefV1 {
  readonly purpose: "manifest" | "asset_bundle_record" | "asset_bytes";
  readonly slotKey: string | null;
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly contentDigestClaim: string;
  readonly byteLengthClaim: number;
  readonly mimeTypeClaim: string;
}

/**
 * Verification coverage over canonical target identities:
 * `manifest` | `asset_bundle_record` | `asset_bytes:<slotKey>`.
 * `requiredTargets` must be derived from the frozen snapshot claim.
 * `complete` is true only when verifiedTargets equals requiredTargets exactly.
 */
export interface HeadlessProvisionalVerificationCoverageV1 {
  readonly requiredTargets: readonly string[];
  readonly verifiedTargets: readonly string[];
  readonly complete: boolean;
}

export interface HeadlessStoredJobRecordBase {
  readonly version: typeof HEADLESS_STORED_JOB_RECORD_VERSION;
  readonly stage: HeadlessStoredJobStage;
  readonly storeVersion: number;
  readonly jobId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly idempotencyAuthorityKey: string;
}

export interface HeadlessProvisionalStoredJobRecord
  extends HeadlessStoredJobRecordBase {
  readonly stage: "provisional";
  readonly state: HeadlessProvisionalJobState;
  readonly operationId: string;
  readonly creatorIdempotencyKey: string;
  readonly requestedRendererProfile: HeadlessRendererProfile;
  readonly requestedRendererBuildId: string;
  readonly snapshotClaim: HeadlessProvisionalSnapshotClaimV1;
  readonly stagingObjectRefs: readonly HeadlessProvisionalStagingObjectRefV1[];
  readonly verificationCoverage: HeadlessProvisionalVerificationCoverageV1;
  readonly verificationClaimToken: string | null;
  readonly verificationClaimedAtMs: number | null;
  readonly expiresAtMs: number;
  readonly progress: HeadlessAdvisoryProgress | null;
  readonly terminalReason: HeadlessTerminalReason | null;
  readonly canonicalJob: null;
  readonly canonicalRequest: null;
  readonly artifactObjectBinding: null;
  /** Render claim never applies to provisional records. */
  readonly claimToken: null;
  readonly claimedAtMs: null;
}

export interface HeadlessCanonicalStoredJobRecord
  extends HeadlessStoredJobRecordBase {
  readonly stage: "canonical";
  /**
   * Private operation lineage preserved across provisional → canonical
   * promotion (and supplied coherently for legacy canonical-only creates).
   */
  readonly operationId: string;
  readonly canonicalJob: HeadlessRenderJobV1;
  readonly canonicalRequest: HeadlessRenderJobRequestV1;
  readonly claimToken: string | null;
  readonly claimedAtMs: number | null;
  readonly artifactObjectBinding: HeadlessArtifactObjectBindingV1 | null;
}

export type HeadlessStoredJobRecord =
  | HeadlessProvisionalStoredJobRecord
  | HeadlessCanonicalStoredJobRecord;

export type HeadlessProvisionalStoreWrite = Omit<
  HeadlessProvisionalStoredJobRecord,
  "storeVersion"
>;

export type HeadlessCanonicalStoreWrite = Omit<
  HeadlessCanonicalStoredJobRecord,
  "storeVersion"
>;

/** Legacy canonical create shape used by existing control-plane/worker fixtures. */
export type HeadlessCanonicalCreateLegacyWrite = {
  readonly job: HeadlessRenderJobV1;
  readonly request: HeadlessRenderJobRequestV1;
  readonly idempotencyAuthorityKey: string;
  readonly claimToken: string | null;
  readonly claimedAtMs: number | null;
  readonly artifactObjectBinding: HeadlessArtifactObjectBindingV1 | null;
  /**
   * Explicit private operation lineage from the creation authority.
   * Required — adapters must not invent fallback values such as canon_op_<jobId>.
   */
  readonly operationId: string;
};

export function isProvisionalStoredJobRecord(
  record: HeadlessStoredJobRecord,
): record is HeadlessProvisionalStoredJobRecord {
  return record.stage === "provisional";
}

export function isCanonicalStoredJobRecord(
  record: HeadlessStoredJobRecord,
): record is HeadlessCanonicalStoredJobRecord {
  return record.stage === "canonical";
}

export function narrowCanonicalStoredJobRecord(
  record: HeadlessStoredJobRecord,
): HeadlessCanonicalStoredJobRecord | null {
  return record.stage === "canonical" ? record : null;
}

export function canonicalJobState(
  record: HeadlessCanonicalStoredJobRecord,
): HeadlessJobState {
  return record.canonicalJob.state;
}

/** Provisional terminals use the shared HeadlessReasonId registry only. */
export type HeadlessProvisionalReasonId = HeadlessReasonId;
