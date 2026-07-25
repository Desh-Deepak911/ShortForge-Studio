/**
 * Discriminated private durable owned-object records (Design B staging → finalize).
 * Never include bucket names, presigned URLs, or provider diagnostics in public views.
 */

export const HEADLESS_OWNED_OBJECT_RECORD_VERSION = 1 as const;

export type HeadlessOwnedObjectPurpose =
  | "manifest"
  | "asset_bundle_record"
  | "asset_bytes"
  | "artifact";

export type HeadlessOwnedObjectStoreId = "assets" | "artifacts";

export type HeadlessOwnedObjectVerificationState =
  | "unclaimed"
  | "claimed"
  | "failed"
  | "verified";

/**
 * Finalize authority:
 * - `full_object_stream` — Design B verifier streamed the full R2 object
 * - `trusted_worker_upload_stream` — render worker hashed the upload stream
 *   during PutObject (not a post-upload R2 re-read verification)
 */
export type HeadlessOwnedObjectVerifiedBy =
  | "full_object_stream"
  | "trusted_worker_upload_stream";

export type HeadlessOwnedObjectFinalizedMetadataV1 = {
  readonly verifiedBy: HeadlessOwnedObjectVerifiedBy;
  readonly sourceStage: "staging";
};

type HeadlessOwnedObjectIdentityV1 = {
  readonly version: typeof HEADLESS_OWNED_OBJECT_RECORD_VERSION;
  readonly objectId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly purpose: HeadlessOwnedObjectPurpose;
  readonly slotKey: string | null;
  readonly provider: "r2";
  /** Opaque bucket role — never the raw bucket name. */
  readonly storeId: HeadlessOwnedObjectStoreId;
  /** Private storage key — never public. */
  readonly objectKey: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
};

export type HeadlessStagingOwnedObjectRecordV1 = HeadlessOwnedObjectIdentityV1 & {
  readonly stage: "staging";
  readonly expectedContentDigestClaim: string;
  readonly expectedByteLength: number;
  readonly expectedMimeType: string;
  readonly uploadCapabilityIssuedAtMs: number;
  readonly uploadCapabilityExpiresAtMs: number;
  readonly uploadedObservedAtMs: number | null;
  readonly verificationState: "unclaimed" | "claimed" | "failed";
  readonly verificationClaimToken: string | null;
  readonly verificationClaimedAtMs: number | null;
  readonly verifiedAtMs: null;
  readonly expiresAtMs: number | null;
  readonly contentDigest: null;
  readonly byteLength: null;
  readonly mimeType: null;
  readonly finalizedMetadata: null;
  readonly terminalReason: null;
  readonly cleanupScheduledAtMs: null;
};

export type HeadlessFinalizedOwnedObjectRecordV1 = HeadlessOwnedObjectIdentityV1 & {
  readonly stage: "finalized";
  readonly expectedContentDigestClaim: string;
  readonly expectedByteLength: number;
  readonly expectedMimeType: string;
  readonly uploadCapabilityIssuedAtMs: number;
  readonly uploadCapabilityExpiresAtMs: number;
  readonly uploadedObservedAtMs: number | null;
  readonly verificationState: "verified";
  readonly verificationClaimToken: null;
  readonly verificationClaimedAtMs: null;
  readonly verifiedAtMs: number;
  readonly expiresAtMs: number;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly finalizedMetadata: HeadlessOwnedObjectFinalizedMetadataV1;
  readonly terminalReason: null;
  readonly cleanupScheduledAtMs: null;
};

export type HeadlessRejectedOwnedObjectRecordV1 = HeadlessOwnedObjectIdentityV1 & {
  readonly stage: "rejected";
  readonly expectedContentDigestClaim: string;
  readonly expectedByteLength: number;
  readonly expectedMimeType: string;
  readonly uploadCapabilityIssuedAtMs: number;
  readonly uploadCapabilityExpiresAtMs: number;
  readonly uploadedObservedAtMs: number | null;
  readonly verificationState: "failed";
  readonly verificationClaimToken: null;
  readonly verificationClaimedAtMs: null;
  readonly verifiedAtMs: null;
  readonly expiresAtMs: number | null;
  readonly contentDigest: null;
  readonly byteLength: null;
  readonly mimeType: null;
  readonly finalizedMetadata: null;
  /** Bounded reason code — never provider/raw message text. */
  readonly terminalReason: string;
  readonly cleanupScheduledAtMs: null;
};

export type HeadlessCleanupPendingOwnedObjectRecordV1 =
  HeadlessOwnedObjectIdentityV1 & {
    readonly stage: "cleanup_pending";
    readonly expectedContentDigestClaim: string;
    readonly expectedByteLength: number;
    readonly expectedMimeType: string;
    readonly uploadCapabilityIssuedAtMs: number;
    readonly uploadCapabilityExpiresAtMs: number;
    readonly uploadedObservedAtMs: number | null;
    readonly verificationState: "failed";
    readonly verificationClaimToken: null;
    readonly verificationClaimedAtMs: null;
    readonly verifiedAtMs: null;
    readonly expiresAtMs: number | null;
    readonly contentDigest: null;
    readonly byteLength: null;
    readonly mimeType: null;
    readonly finalizedMetadata: null;
    readonly terminalReason: string;
    readonly cleanupScheduledAtMs: number;
  };

export type HeadlessOwnedObjectRecordV1 =
  | HeadlessStagingOwnedObjectRecordV1
  | HeadlessFinalizedOwnedObjectRecordV1
  | HeadlessRejectedOwnedObjectRecordV1
  | HeadlessCleanupPendingOwnedObjectRecordV1;

/**
 * Creator-safe public view — never includes bucket/key/locator/capability/digest/provider.
 */
export type HeadlessPublicOwnedObjectViewV1 = {
  readonly objectId: string;
  readonly purpose: HeadlessOwnedObjectPurpose;
  readonly slotKey: string | null;
  readonly stage: "pending" | "ready" | "failed";
  readonly expiresAtMs: number | null;
};

export function toHeadlessPublicOwnedObjectView(
  record: HeadlessOwnedObjectRecordV1,
): HeadlessPublicOwnedObjectViewV1 {
  let stage: HeadlessPublicOwnedObjectViewV1["stage"];
  switch (record.stage) {
    case "staging":
      stage = "pending";
      break;
    case "finalized":
      stage = "ready";
      break;
    case "rejected":
    case "cleanup_pending":
      stage = "failed";
      break;
    default: {
      const _exhaustive: never = record;
      void _exhaustive;
      stage = "failed";
    }
  }
  return Object.freeze({
    objectId: record.objectId,
    purpose: record.purpose,
    slotKey: record.slotKey,
    stage,
    expiresAtMs: record.expiresAtMs,
  });
}
