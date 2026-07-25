/**
 * Provider-neutral durable owned-object metadata store.
 * CAS authority is storeVersion. Never persists presigned URLs.
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type {
  HeadlessOwnedObjectPurpose,
  HeadlessOwnedObjectRecordV1,
  HeadlessOwnedObjectStoreId,
} from "../types/owned-object-record";

export type HeadlessStoredOwnedObject = {
  readonly record: HeadlessOwnedObjectRecordV1;
  readonly storeVersion: number;
};

export type HeadlessCreateStagingOwnedObjectInput = {
  readonly objectId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly purpose: HeadlessOwnedObjectPurpose;
  readonly slotKey: string | null;
  readonly storeId: HeadlessOwnedObjectStoreId;
  readonly objectKey: string;
  readonly expectedContentDigestClaim: string;
  readonly expectedByteLength: number;
  readonly expectedMimeType: string;
  readonly uploadCapabilityIssuedAtMs: number;
  readonly uploadCapabilityExpiresAtMs: number;
  readonly expiresAtMs: number | null;
  readonly createdAtMs: number;
};

export type HeadlessFinalizeStagingOwnedObjectInput = {
  readonly objectId: string;
  readonly ownerId: string;
  readonly expectedStoreVersion: number;
  readonly verificationClaimToken: string;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly verifiedAtMs: number;
  readonly expiresAtMs: number;
  readonly nowMs: number;
  /**
   * Default `full_object_stream` (Design B verifier).
   * Worker artifact path must pass `trusted_worker_upload_stream`.
   */
  readonly verifiedBy?:
    | "full_object_stream"
    | "trusted_worker_upload_stream";
};

export interface HeadlessOwnedObjectStorePort {
  createStagingRecord(
    input: HeadlessCreateStagingOwnedObjectInput,
  ): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject>>;

  getByObjectIdAndOwner(input: {
    objectId: string;
    ownerId: string;
  }): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject | null>>;

  /**
   * Acquire or reclaim a verification claim.
   * When `verificationState === "claimed"` and
   * `nowMs - verificationClaimedAtMs >= claimLeaseMs`, the prior claim is
   * treated as stale and may be reclaimed (fail-closed otherwise).
   */
  acquireVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    nowMs: number;
    expectedStoreVersion: number;
    /** Default 120_000ms when omitted by adapters. */
    claimLeaseMs?: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject>>;

  releaseVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    expectedStoreVersion: number;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject>>;

  failVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    expectedStoreVersion: number;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject>>;

  finalizeStagingRecord(
    input: HeadlessFinalizeStagingOwnedObjectInput,
  ): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject>>;

  markRejected(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    terminalReason: string;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject>>;

  markCleanupPending(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    terminalReason: string;
    cleanupScheduledAtMs: number;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject>>;

  /**
   * Delete the durable metadata row after `cleanup_pending` only.
   * CAS on expectedStoreVersion. Never deletes finalized rows.
   */
  completeCleanup(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<true>>;

  /**
   * Staging verifier candidates: uploaded-observed staging, or unclaimed/failed
   * staging eligible for claim. Bound `limit` to <= 100.
   */
  listVerifierCandidates(input: {
    ownerId?: string;
    limit: number;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<readonly HeadlessStoredOwnedObject[]>>;

  /**
   * Cleanup sweep candidates: `cleanup_pending` or expired staging.
   * Bound `limit` to <= 100.
   */
  listCleanupCandidates(input: {
    limit: number;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<readonly HeadlessStoredOwnedObject[]>>;

  listByJobIdAndOwner(input: {
    jobId: string;
    ownerId: string;
  }): Promise<HeadlessControlPlaneResult<readonly HeadlessStoredOwnedObject[]>>;

  /**
   * Optional harness helper — mark staging upload observed (does not trust bytes).
   */
  markUploadedObserved?(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    uploadedObservedAtMs: number;
    nowMs: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessStoredOwnedObject>>;
}
