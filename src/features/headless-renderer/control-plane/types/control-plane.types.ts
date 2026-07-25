/**
 * Sprint 11C — Control-plane transport and safe public views.
 * Compact bodies only — no media/data URLs or manifest bytes in job routes.
 */

import type {
  HeadlessAdvisoryProgress,
  HeadlessJobState,
  HeadlessReasonId,
  HeadlessRendererProfile,
  HeadlessStorageLocatorIdentity,
} from "../../domain/headless-render.types";

export const HEADLESS_CONTROL_PLANE_TRANSPORT_VERSION = 1 as const;

/** Explicit ceilings for owned manifest objects (control plane). */
export const HEADLESS_MANIFEST_MAX_BYTES = 8 * 1024 * 1024; // 8 MiB
export const HEADLESS_MANIFEST_MAX_JSON_DEPTH = 48;
export const HEADLESS_MANIFEST_MAX_JSON_NODES = 50_000;
export const HEADLESS_JOB_REQUEST_MAX_BYTES = 32 * 1024; // compact transport only (UTF-8 bytes)
export const HEADLESS_BUNDLE_RECORD_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Minimum remaining lifetime required on every owned source object (asset_bytes)
 * and on the owned manifest/bundle records at job acceptance.
 * Deterministic — control plane never silently extends expiry.
 */
export const HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Compact create-job transport. Client never sends ownerId, raw manifest,
 * media bytes, storage credentials, or authoritative fingerprints beyond
 * digests the server re-verifies against owned objects.
 */
export interface HeadlessCreateJobTransportV1 {
  readonly version: typeof HEADLESS_CONTROL_PLANE_TRANSPORT_VERSION;
  /** Project the principal claims access to — server verifies, never trusts alone. */
  readonly projectId: string;
  readonly manifestObject: HeadlessStorageLocatorIdentity;
  /** Cryptographic digest of exact uploaded manifest payload bytes (UTF-8 JSON). */
  readonly manifestPayloadDigest: string;
  readonly assetBundleObject: HeadlessStorageLocatorIdentity;
  /** Expected bundle fingerprint — recomputed after load; mismatch fails. */
  readonly assetBundleFingerprint: string;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly rendererBuildId: string;
  readonly idempotencyKey: string;
}

export interface HeadlessPublicOutputSummary {
  readonly resolution: HeadlessRendererProfile["resolution"];
  readonly format: HeadlessRendererProfile["format"];
  readonly fps: HeadlessRendererProfile["fps"];
  readonly quality: HeadlessRendererProfile["quality"];
}

/**
 * Safe public job view — no manifest, sources, locators, digests, or credentials.
 */
export interface HeadlessPublicJobViewV1 {
  readonly jobId: string;
  readonly state: HeadlessJobState;
  readonly progress: HeadlessAdvisoryProgress | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly retryable: boolean;
  readonly reasonId: HeadlessReasonId | null;
  readonly artifactAvailable: boolean;
  readonly output: HeadlessPublicOutputSummary;
}

export type HeadlessControlPlaneErrorCode =
  | "CONFIGURATION_UNAVAILABLE"
  | "UNAUTHENTICATED"
  /** Clerk SDK/provider/integration failure — not a normal signed-out session. */
  | "AUTHENTICATION_FAILED"
  | "FORBIDDEN"
  | "INVALID_TRANSPORT"
  | "UNKNOWN_FIELD"
  | "BODY_TOO_LARGE"
  | "MANIFEST_NOT_FOUND"
  | "MANIFEST_DIGEST_MISMATCH"
  | "MANIFEST_EXPIRED"
  | "MANIFEST_TOO_LARGE"
  | "MANIFEST_MALFORMED"
  | "BUNDLE_NOT_FOUND"
  | "BUNDLE_FINGERPRINT_MISMATCH"
  | "BUNDLE_EXPIRED"
  | "OBJECT_OWNERSHIP_MISMATCH"
  | "REMOTE_FETCH_FORBIDDEN"
  | "IDEMPOTENCY_CONFLICT"
  | "JOB_NOT_FOUND"
  | "STALE_TRANSITION"
  | "TERMINAL_IMMUTABLE"
  | "CANCEL_REJECTED"
  | "CLAIM_REJECTED"
  | "HOSTILE_INPUT"
  | "INTERNAL_ERROR"
  | "ASSET_NOT_FOUND"
  | "ASSET_PURPOSE_MISMATCH"
  | "ASSET_DIGEST_MISMATCH"
  | "ASSET_LENGTH_MISMATCH"
  | "ASSET_MIME_MISMATCH"
  | "ASSET_LOCATOR_MISMATCH"
  | "ASSET_EXPIRED"
  | "ASSET_LEASE_INSUFFICIENT"
  | "ASSET_BYTES_OVERFLOW"
  | "ASSET_EXPIRY_MISMATCH"
  | "ASSET_EXPIRY_UNSAFE"
  | "ASSET_LEASE_OVERFLOW"
  | "OBJECT_INTEGRITY_FAILED"
  /** R2 HeadObject lacked ETag and VersionId — TOCTOU bind unavailable. */
  | "OBJECT_REVISION_UNAVAILABLE"
  /** Conditional GetObject precondition failed — object mutated after HEAD. */
  | "OBJECT_REVISION_MISMATCH"
  | "JOB_STORE_COHERENCE_REJECTED"
  /**
   * Durable database connection/transaction/provider outage.
   * Not authentication failure — map to temporary/unavailable product behavior.
   * Never include provider error text in messages.
   */
  | "DATABASE_UNAVAILABLE"
  | "QUEUE_ENQUEUE_FAILED"
  | "DISPATCH_RECOVERY_REJECTED"
  /** Provider-neutral abort of an in-flight storage open/read. */
  | "OPERATION_ABORTED"
  /** Immediate orphan delete failed and cleanup-intent persistence also failed. */
  | "ARTIFACT_CLEANUP_UNCONFIRMED";

export interface HeadlessControlPlaneIssue {
  readonly code: HeadlessControlPlaneErrorCode;
  readonly message: string;
}

export type HeadlessControlPlaneResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly HeadlessControlPlaneIssue[] };

/**
 * Create-job / dispatch-recovery result.
 * `recoverableJob` is only present when `recoverDispatch` can authorize a new attempt
 * (failed with QUEUE_ENQUEUE_FAILED, retryable:true).
 */
export type HeadlessCreateJobResult =
  | { readonly ok: true; readonly value: HeadlessPublicJobViewV1 }
  | {
      readonly ok: false;
      readonly issues: readonly HeadlessControlPlaneIssue[];
      readonly recoverableJob?: HeadlessPublicJobViewV1;
    };

export function cpFail(
  code: HeadlessControlPlaneErrorCode,
  message: string,
): { readonly ok: false; readonly issues: readonly HeadlessControlPlaneIssue[] } {
  return { ok: false, issues: [{ code, message }] };
}

export function cpFailRecoverable(
  code: HeadlessControlPlaneErrorCode,
  message: string,
  recoverableJob: HeadlessPublicJobViewV1,
): HeadlessCreateJobResult {
  return {
    ok: false,
    issues: [{ code, message }],
    recoverableJob,
  };
}

export function cpOk<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}
