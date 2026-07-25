/**
 * Fail-closed production boundary for Phase 1A / 1A.1 foundation placeholders.
 *
 * HttpHeadlessRenderClient must never accept test-auth:, pending/foundation, or
 * other non-real identities. Testing adapters may accept explicit test-auth only.
 * No production bypass for testing identities.
 */

import type { HeadlessCreateJobClientBody } from "../client/headless-render-client.port";
import type { OwnedUploadRequest } from "../upload/owned-upload.port";

/** Explicit testing-only fingerprint / owner prefix. Never valid for production HTTP. */
export const HEADLESS_TEST_AUTHORITY_PREFIX = "test-auth:" as const;

/** Foundation-only build id used by product UI before real provider wiring. */
export const HEADLESS_FOUNDATION_PLACEHOLDER_BUILD_IDS = Object.freeze([
  "product-dispatch-phase1",
  "product-dispatch-phase1a",
] as const);

const FORBIDDEN_FINGERPRINTS = Object.freeze([
  "pending-prepare",
  "pending-bundle",
] as const);

const FORBIDDEN_OWNER_IDS = Object.freeze(["pending-auth"] as const);

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export function isExplicitTestAuthorityFingerprint(value: string): boolean {
  return (
    typeof value === "string" &&
    value.startsWith(HEADLESS_TEST_AUTHORITY_PREFIX) &&
    value.length > HEADLESS_TEST_AUTHORITY_PREFIX.length
  );
}

export function isExplicitTestAuthorityOwner(ownerId: string): boolean {
  return isExplicitTestAuthorityFingerprint(ownerId);
}

export function isFoundationPlaceholderBuildId(buildId: string): boolean {
  return (
    (HEADLESS_FOUNDATION_PLACEHOLDER_BUILD_IDS as readonly string[]).includes(
      buildId,
    ) || buildId.startsWith("product-dispatch-phase")
  );
}

export function isForbiddenProductionFingerprint(value: string): boolean {
  return (FORBIDDEN_FINGERPRINTS as readonly string[]).includes(value);
}

export function isForbiddenProductionOwnerId(ownerId: string): boolean {
  return (FORBIDDEN_OWNER_IDS as readonly string[]).includes(ownerId);
}

export function isSha256Fingerprint(value: string): boolean {
  return SHA256_HEX.test(value);
}

export function isZeroBytePlaceholderPayload(
  bytes: Uint8Array | ArrayBufferView | null | undefined,
): boolean {
  return !bytes || bytes.byteLength === 0;
}

export type ProductionPlaceholderRejectReason =
  | "pending_fingerprint"
  | "pending_owner"
  | "foundation_build_id"
  | "test_authority"
  | "zero_byte_payload"
  | "invalid_fingerprint"
  | "invalid_owner"
  | "invalid_build_id"
  | "missing_test_authority";

function isRealProductionOwner(ownerId: string): boolean {
  return (
    typeof ownerId === "string" &&
    ownerId.length >= 8 &&
    !isForbiddenProductionOwnerId(ownerId) &&
    !ownerId.startsWith("pending-") &&
    !isExplicitTestAuthorityOwner(ownerId) &&
    !ownerId.startsWith("test-")
  );
}

function isRealProductionBuildId(buildId: string): boolean {
  return (
    typeof buildId === "string" &&
    buildId.length >= 8 &&
    !isFoundationPlaceholderBuildId(buildId) &&
    !buildId.startsWith("test-authority") &&
    !buildId.startsWith("test-")
  );
}

/**
 * Production HTTP create-job gate.
 * Only future real SHA-256 fingerprints, real owner identity, and non-foundation
 * renderer build identity may pass. test-auth: is always rejected here.
 */
export function rejectProductionPlaceholderCreateJobBody(
  body: HeadlessCreateJobClientBody,
): ProductionPlaceholderRejectReason | null {
  if (
    isExplicitTestAuthorityFingerprint(body.manifestFingerprint) ||
    isExplicitTestAuthorityFingerprint(body.assetBundleFingerprint) ||
    isExplicitTestAuthorityOwner(body.ownership.ownerId)
  ) {
    return "test_authority";
  }
  if (
    isForbiddenProductionFingerprint(body.manifestFingerprint) ||
    isForbiddenProductionFingerprint(body.assetBundleFingerprint)
  ) {
    return "pending_fingerprint";
  }
  if (isForbiddenProductionOwnerId(body.ownership.ownerId)) {
    return "pending_owner";
  }
  if (isFoundationPlaceholderBuildId(body.rendererBuildId)) {
    return "foundation_build_id";
  }
  if (
    !isSha256Fingerprint(body.manifestFingerprint) ||
    !isSha256Fingerprint(body.assetBundleFingerprint)
  ) {
    return "invalid_fingerprint";
  }
  if (!isRealProductionOwner(body.ownership.ownerId)) {
    return "invalid_owner";
  }
  if (!isRealProductionBuildId(body.rendererBuildId)) {
    return "invalid_build_id";
  }
  return null;
}

/**
 * Upload request gate for testing adapters (explicit test-auth) and safety checks.
 */
export function rejectPlaceholderOwnedUploadRequest(
  request: OwnedUploadRequest,
  options: { readonly requireExplicitTestAuthority: boolean },
): ProductionPlaceholderRejectReason | null {
  if (
    isForbiddenProductionFingerprint(request.manifestFingerprint) ||
    isForbiddenProductionFingerprint(request.assetBundleFingerprint)
  ) {
    return "pending_fingerprint";
  }
  if (
    isZeroBytePlaceholderPayload(request.manifestBytes) ||
    isZeroBytePlaceholderPayload(request.assetBundleBytes)
  ) {
    return "zero_byte_payload";
  }
  if (options.requireExplicitTestAuthority) {
    if (
      !isExplicitTestAuthorityFingerprint(request.manifestFingerprint) ||
      !isExplicitTestAuthorityFingerprint(request.assetBundleFingerprint)
    ) {
      return "missing_test_authority";
    }
  }
  return null;
}

/** Safe creator-facing message — never echoes internal marker names. */
export const PRODUCTION_PLACEHOLDER_GUARD_MESSAGE =
  "Server export is not ready for this request. You can continue with Browser Export.";
