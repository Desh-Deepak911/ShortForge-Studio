/**
 * Sprint 11B — Headless render job + asset authority contracts (v1).
 * Provider-neutral pure domain. No storage, workers, or UI.
 */

import type { ExportManifest } from "@/features/export/domain/headless-safe";

export const HEADLESS_RENDER_CONTRACT_VERSION = 1 as const;
export const HEADLESS_ASSET_BUNDLE_VERSION = 1 as const;
export const HEADLESS_ASSET_DESCRIPTOR_VERSION = 1 as const;
export const HEADLESS_RENDER_JOB_REQUEST_VERSION = 1 as const;
export const HEADLESS_RENDER_JOB_VERSION = 1 as const;
export const HEADLESS_RENDER_ARTIFACT_VERSION = 1 as const;

/**
 * Cryptographic authority fingerprint prefixes (SHA-256).
 * Distinct kinds — never reuse request prefix for jobs.
 */
export const HEADLESS_SOURCE_DIGEST_PREFIX = "hsrc:sha256:" as const;
export const HEADLESS_ASSET_BUNDLE_FINGERPRINT_PREFIX = "hab:sha256:" as const;
export const HEADLESS_REQUEST_FINGERPRINT_PREFIX = "hrr:sha256:" as const;
export const HEADLESS_JOB_FINGERPRINT_PREFIX = "hrj:sha256:" as const;
export const HEADLESS_ARTIFACT_META_FINGERPRINT_PREFIX = "hra:sha256:" as const;
export const HEADLESS_IDEMPOTENCY_AUTHORITY_PREFIX = "hid:sha256:" as const;

/** @deprecated Use HEADLESS_REQUEST_FINGERPRINT_PREFIX — removed dual-use of hrj. */
export const HEADLESS_JOB_REQUEST_FINGERPRINT_PREFIX =
  HEADLESS_REQUEST_FINGERPRINT_PREFIX;

/** Content byte digest (file bytes) — separate from authority kinds. */
export const HEADLESS_CONTENT_DIGEST_PREFIX = "sha256:" as const;

export type HeadlessMediaKind = "image" | "video" | "audio";

export type HeadlessSourceClassification =
  | "blob"
  | "data"
  | "http"
  | "https"
  | "local"
  | "other";

export type HeadlessSourceRole = "scene_media" | "voiceover" | "music";

export type HeadlessJobState =
  | "created"
  | "materializing"
  | "queued"
  | "rendering"
  | "encoding"
  | "validating"
  | "uploading"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export type HeadlessTerminalJobState =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export type HeadlessActiveJobState = Exclude<
  HeadlessJobState,
  HeadlessTerminalJobState
>;

/** Stable bounded reason IDs only — never embed URLs, captions, or secrets. */
export type HeadlessReasonId =
  | "INVALID_REQUEST"
  | "INVALID_MANIFEST"
  | "MANIFEST_FINGERPRINT_MISMATCH"
  | "UNSUPPORTED_MANIFEST_VERSION"
  | "ASSET_COVERAGE_INCOMPLETE"
  | "ASSET_COVERAGE_EXTRA"
  | "ASSET_COVERAGE_DUPLICATE"
  | "ASSET_COVERAGE_CONFLICT"
  | "INVALID_ASSET_DESCRIPTOR"
  | "INVALID_ASSET_BUNDLE"
  | "INVALID_DIGEST"
  | "INVALID_MIME"
  | "ASSET_LIMIT_EXCEEDED"
  | "INVALID_OWNERSHIP"
  | "INVALID_RENDERER_PROFILE"
  | "INVALID_RENDERER_BUILD"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_JOB"
  | "ILLEGAL_STATE_TRANSITION"
  | "STALE_ATTEMPT"
  | "TERMINAL_STATE_IMMUTABLE"
  | "ARTIFACT_REQUIRED"
  | "ARTIFACT_FORBIDDEN"
  | "ARTIFACT_FINGERPRINT_MISMATCH"
  | "ARTIFACT_REQUEST_COHERENCE_MISMATCH"
  | "JOB_REQUEST_COHERENCE_MISMATCH"
  | "INVALID_ARTIFACT"
  | "INVALID_PROGRESS"
  | "INVALID_TERMINAL_REASON"
  | "INVALID_CANONICAL_ENCODING"
  | "TIMESTAMP_REGRESSION"
  | "UNKNOWN_FIELD"
  | "HOSTILE_INPUT"
  | "CANCELLED_BY_USER"
  | "WORKER_FAILED"
  | "QUEUE_ENQUEUE_FAILED"
  | "ENCODE_FAILED"
  | "ARTIFACT_PROBE_MISMATCH"
  | "WORKER_TIMEOUT"
  | "UNSUPPORTED_CAPABILITY"
  | "WORKSPACE_QUOTA_EXCEEDED"
  | "CLAIM_LEASE_EXPIRED"
  | "EXPIRED"
  /** Orphan artifact delete failed and durable cleanup intent could not be confirmed. */
  | "ARTIFACT_CLEANUP_UNCONFIRMED";

export interface HeadlessIntegrityIssue {
  readonly code: HeadlessReasonId;
  readonly message: string;
}

export interface HeadlessIntegrityResult {
  readonly ok: boolean;
  readonly issues: readonly HeadlessIntegrityIssue[];
}

/**
 * Source-binding identity. Matches required manifest sources via sourceDigest
 * (hash of exact original source string) — never trusted as a fetch URL.
 */
export interface HeadlessSourceIdentity {
  readonly role: HeadlessSourceRole;
  readonly sceneId: string | null;
  readonly mediaItemId: string | null;
  /** Deterministic digest of the exact original manifest source string. */
  readonly sourceDigest: string;
  readonly classification: HeadlessSourceClassification;
}

/**
 * Durable locator identity — opaque storage keys only.
 * Raw unrestricted URLs are never worker fetch authority.
 */
export interface HeadlessStorageLocatorIdentity {
  readonly kind: "object_storage";
  readonly storeId: string;
  readonly objectKey: string;
}

export interface HeadlessAssetDescriptorV1 {
  readonly version: typeof HEADLESS_ASSET_DESCRIPTOR_VERSION;
  readonly assetId: string;
  readonly sourceIdentity: HeadlessSourceIdentity;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly mediaKind: HeadlessMediaKind;
  readonly storageLocator: HeadlessStorageLocatorIdentity;
  readonly expiresAtMs: number;
}

export interface HeadlessAssetBundleV1 {
  readonly version: typeof HEADLESS_ASSET_BUNDLE_VERSION;
  readonly bundleId: string;
  readonly assets: readonly HeadlessAssetDescriptorV1[];
  readonly fingerprint: string;
}

/** Server-bound ownership — domain fixtures supply this; clients must not self-assert. */
export interface HeadlessOwnershipBinding {
  readonly ownerId: string;
  readonly projectId: string;
}

export interface HeadlessRendererProfile {
  readonly resolution: "720p" | "1080p" | "4k";
  readonly format: "webm" | "mp4";
  readonly fps: 30;
  readonly quality: "standard" | "high";
}

export interface HeadlessRenderJobRequestV1 {
  readonly version: typeof HEADLESS_RENDER_JOB_REQUEST_VERSION;
  readonly ownership: HeadlessOwnershipBinding;
  readonly manifest: ExportManifest;
  readonly manifestFingerprint: string;
  readonly assetBundle: HeadlessAssetBundleV1;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly rendererBuildId: string;
  readonly idempotencyKey: string;
  /** Deterministic request identity (semantic; excludes timestamps). */
  readonly requestFingerprint: string;
}

export interface HeadlessAdvisoryProgress {
  readonly percent: number | null;
  readonly stage: string | null;
  readonly updatedAtMs: number | null;
  /** Frame-aware rendering progress — never identity-bearing. */
  readonly completedFrames?: number | null;
  readonly totalFrames?: number | null;
}

export interface HeadlessTerminalReason {
  readonly reasonId: HeadlessReasonId;
  readonly retryable: boolean;
}

export interface HeadlessProbedAudioFacts {
  readonly present: boolean;
  readonly codec: string | null;
  readonly channels: number | null;
  readonly sampleRateHz: number | null;
}

export interface HeadlessProbedVideoFacts {
  readonly present: boolean;
  readonly codec: string | null;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export interface HeadlessRenderArtifactV1 {
  readonly version: typeof HEADLESS_RENDER_ARTIFACT_VERSION;
  readonly artifactId: string;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly format: "webm" | "mp4";
  readonly width: number;
  readonly height: number;
  readonly fps: 30;
  readonly durationMs: number;
  readonly audio: HeadlessProbedAudioFacts;
  readonly video: HeadlessProbedVideoFacts;
  readonly rendererBuildId: string;
  readonly manifestFingerprint: string;
  readonly assetBundleFingerprint: string;
  readonly renderJobFingerprint: string;
  readonly expiresAtMs: number;
  /** Semantic metadata fingerprint — not a signed download URL. */
  readonly fingerprint: string;
}

export interface HeadlessRenderJobV1 {
  readonly version: typeof HEADLESS_RENDER_JOB_VERSION;
  readonly jobId: string;
  readonly contractVersion: typeof HEADLESS_RENDER_CONTRACT_VERSION;
  readonly ownership: HeadlessOwnershipBinding;
  readonly state: HeadlessJobState;
  readonly attempt: number;
  readonly progress: HeadlessAdvisoryProgress | null;
  readonly manifestFingerprint: string;
  readonly assetBundleFingerprint: string;
  readonly requestFingerprint: string;
  readonly renderJobFingerprint: string;
  readonly rendererBuildId: string;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly idempotencyKey: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly terminalReason: HeadlessTerminalReason | null;
  readonly artifact: HeadlessRenderArtifactV1 | null;
}

/** Required source slot extracted from a frozen ExportManifest (internal coverage). */
export interface HeadlessRequiredSourceSlot {
  readonly role: HeadlessSourceRole;
  readonly sceneId: string | null;
  readonly mediaItemId: string | null;
  readonly sourceDigest: string;
  readonly classification: HeadlessSourceClassification;
  readonly expectedMediaKind: HeadlessMediaKind;
}
