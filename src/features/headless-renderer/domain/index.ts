/**
 * Sprint 11B.1A — Headless render job + asset authority (pure domain).
 *
 * Public API classes: see HEADLESS_PUBLIC_API_CLASSIFICATION.
 * Structural TypeScript typing never establishes authority — validators reassert.
 */

export {
  HEADLESS_RENDER_CONTRACT_VERSION,
  HEADLESS_ASSET_BUNDLE_VERSION,
  HEADLESS_ASSET_DESCRIPTOR_VERSION,
  HEADLESS_RENDER_JOB_REQUEST_VERSION,
  HEADLESS_RENDER_JOB_VERSION,
  HEADLESS_RENDER_ARTIFACT_VERSION,
  HEADLESS_SOURCE_DIGEST_PREFIX,
  HEADLESS_ASSET_BUNDLE_FINGERPRINT_PREFIX,
  HEADLESS_REQUEST_FINGERPRINT_PREFIX,
  HEADLESS_JOB_FINGERPRINT_PREFIX,
  HEADLESS_ARTIFACT_META_FINGERPRINT_PREFIX,
  HEADLESS_IDEMPOTENCY_AUTHORITY_PREFIX,
  HEADLESS_JOB_REQUEST_FINGERPRINT_PREFIX,
  HEADLESS_CONTENT_DIGEST_PREFIX,
  type HeadlessMediaKind,
  type HeadlessSourceClassification,
  type HeadlessSourceRole,
  type HeadlessJobState,
  type HeadlessTerminalJobState,
  type HeadlessActiveJobState,
  type HeadlessReasonId,
  type HeadlessIntegrityIssue,
  type HeadlessIntegrityResult,
  type HeadlessSourceIdentity,
  type HeadlessStorageLocatorIdentity,
  type HeadlessAssetDescriptorV1,
  type HeadlessAssetBundleV1,
  type HeadlessOwnershipBinding,
  type HeadlessRendererProfile,
  type HeadlessRenderJobRequestV1,
  type HeadlessAdvisoryProgress,
  type HeadlessTerminalReason,
  type HeadlessProbedAudioFacts,
  type HeadlessProbedVideoFacts,
  type HeadlessRenderArtifactV1,
  type HeadlessRenderJobV1,
  type HeadlessRequiredSourceSlot,
} from "./headless-render.types";

export {
  HEADLESS_MAX_ASSETS,
  HEADLESS_MAX_ASSET_BYTES,
  HEADLESS_MAX_TOTAL_ASSET_BYTES,
  HEADLESS_ALLOWED_IMAGE_MIME_TYPES,
  HEADLESS_ALLOWED_VIDEO_MIME_TYPES,
  HEADLESS_ALLOWED_AUDIO_MIME_TYPES,
  HEADLESS_ALLOWED_ARTIFACT_MIME_TYPES,
  HEADLESS_ACTIVE_STATES,
  HEADLESS_TERMINAL_STATES,
  HEADLESS_ALL_STATES,
  HEADLESS_LEGAL_TRANSITIONS,
  HEADLESS_ARTIFACT_DURATION_TOLERANCE_MS,
  HEADLESS_CLAIM_LEASE_MS,
  HEADLESS_RESOLUTION_PIXELS,
  HEADLESS_PROGRESS_STAGE_IDS,
  isHeadlessTerminalState,
  isHeadlessActiveState,
} from "./headless-render-constants";

export { HEADLESS_REASON_IDS, isHeadlessReasonId } from "./headless-reason-registry";

export {
  HEADLESS_PUBLIC_API_CLASSIFICATION,
  HEADLESS_FORBIDDEN_PUBLIC_EXPORTS,
  type HeadlessPublicApiClass,
} from "./headless-public-api-classification";

export {
  deepFreezeHeadlessValue,
  deepFreezeInPlace,
} from "./headless-deep-freeze";
export {
  headlessCanonicalEncode,
  headlessStableStringify,
  headlessSourceDigest,
  headlessSha256OfCanonical,
  buildHeadlessAuthorityFingerprint,
  isHeadlessAuthorityFingerprint,
  HEADLESS_AUTHORITY_PREFIX,
  HEADLESS_CONTENT_DIGEST_RE,
} from "./headless-stable-hash";
export { headlessSha256Hex, HEADLESS_SHA256_MAX_SAFE_BYTES } from "./headless-sha256";
export { headlessIssue, sanitizeDiagnosticMessage } from "./headless-diagnostics";

export {
  classifyHeadlessSource,
  extractRequiredHeadlessSourceSlots,
  HEADLESS_MEDIA_ITEM_DEDUPE_PREFIX,
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
  HEADLESS_SOURCE_SLOT_KEY_PREFIX,
  HEADLESS_SOURCE_SLOT_KEY_VERSION,
  headlessMediaItemDedupeKey,
  headlessSourceSlotKey,
  isCanonicalHeadlessSourceSlotKey,
  parseHeadlessSourceSlotKey,
  buildHeadlessSourceDigest,
} from "./headless-source-coverage";

export {
  buildHeadlessAssetBundleFingerprint,
  buildHeadlessManifestPayloadDigest,
  buildHeadlessRenderJobRequestFingerprint,
  buildHeadlessRenderJobFingerprint,
  buildHeadlessArtifactMetadataFingerprint,
  buildHeadlessIdempotencyAuthorityKey,
  verifyHeadlessAssetBundleFingerprintCoherence,
  assertHeadlessFingerprintKind,
} from "./headless-fingerprints";

export {
  validateHeadlessAssetBundle,
  finalizeHeadlessAssetBundle,
  type ValidateHeadlessAssetBundleResult,
} from "./validate-headless-asset-bundle";

export {
  validateHeadlessRenderJobRequest,
  finalizeHeadlessRenderJobRequest,
  headlessRequestsSemanticallyEqual,
  type ValidateHeadlessRenderJobRequestResult,
} from "./validate-headless-job-request";

export {
  validateHeadlessRenderArtifact,
  finalizeHeadlessRenderArtifact,
  type ValidateHeadlessRenderArtifactResult,
} from "./validate-headless-artifact";

export {
  validateHeadlessRenderJob,
  type ValidateHeadlessRenderJobResult,
} from "./validate-headless-job";

export {
  validateHeadlessRenderJobCoherence,
  validateHeadlessArtifactRequestCoherence,
  createAcceptedHeadlessRenderJob,
  type ValidateHeadlessRenderJobCoherenceResult,
  type ValidateHeadlessArtifactChainResult,
  type CreateAcceptedHeadlessRenderJobResult,
} from "./validate-headless-coherence";

export {
  isLegalHeadlessJobTransition,
  resolveHeadlessJobTransition,
  applyHeadlessJobTransition,
  type HeadlessTransitionRequest,
  type HeadlessTransitionDecision,
  type ApplyHeadlessJobTransitionInput,
  type ApplyHeadlessJobTransitionResult,
} from "./headless-job-lifecycle";
