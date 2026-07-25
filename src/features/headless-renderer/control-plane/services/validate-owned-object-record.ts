/**
 * Total fail-closed validator for HeadlessOwnedObjectRecordV1.
 * Rejects hostile Proxy/cycles/null prototypes/unknown fields; rebuilds detached frozen results.
 * Never echoes secrets, URLs, signatures, or bucket keys in messages.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import {
  guardHeadlessStructure,
  hasOwnPlainField,
  hasUnknownFields,
  isPlainObject,
} from "../../domain/headless-hostile-guard";
import {
  HEADLESS_MAX_ASSET_BYTES,
  HEADLESS_MAX_ID_LENGTH,
  HEADLESS_MAX_MIME_LENGTH,
} from "../../domain/headless-render-constants";
import {
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
  isCanonicalHeadlessSourceSlotKey,
} from "../../domain/headless-source-coverage";
import { HEADLESS_CONTENT_DIGEST_RE } from "../../domain/headless-stable-hash";
import {
  HEADLESS_OWNED_OBJECT_RECORD_VERSION,
  type HeadlessOwnedObjectPurpose,
  type HeadlessOwnedObjectRecordV1,
  type HeadlessOwnedObjectStoreId,
} from "../types/owned-object-record";

const SAFE_FAIL = "Hostile or unreadable input rejected." as const;

const PURPOSES = Object.freeze([
  "manifest",
  "asset_bundle_record",
  "asset_bytes",
  "artifact",
] as const);

const STORE_IDS = Object.freeze(["assets", "artifacts"] as const);

const COMMON_FIELDS = Object.freeze([
  "version",
  "objectId",
  "ownerId",
  "projectId",
  "jobId",
  "operationId",
  "purpose",
  "slotKey",
  "provider",
  "storeId",
  "objectKey",
  "createdAtMs",
  "updatedAtMs",
  "stage",
  "expectedContentDigestClaim",
  "expectedByteLength",
  "expectedMimeType",
  "uploadCapabilityIssuedAtMs",
  "uploadCapabilityExpiresAtMs",
  "uploadedObservedAtMs",
  "verificationState",
  "verificationClaimToken",
  "verificationClaimedAtMs",
  "verifiedAtMs",
  "expiresAtMs",
  "contentDigest",
  "byteLength",
  "mimeType",
  "finalizedMetadata",
  "terminalReason",
  "cleanupScheduledAtMs",
] as const);

const FINALIZED_METADATA_FIELDS = Object.freeze([
  "verifiedBy",
  "sourceStage",
] as const);

const TERMINAL_REASON_MAX = 64;
const OBJECT_KEY_MAX = 1024;

export type ValidateOwnedObjectRecordResult =
  | { readonly ok: true; readonly record: HeadlessOwnedObjectRecordV1 }
  | { readonly ok: false; readonly message: string };

function fail(message: string = SAFE_FAIL): ValidateOwnedObjectRecordResult {
  return { ok: false, message };
}

function looksLikeSecret(value: string): boolean {
  return (
    /^(?:blob:|data:|https?:)/i.test(value) ||
    value.includes("://") ||
    value.startsWith("cap_") ||
    /signature|signed|token|secret|password|credential/i.test(value)
  );
}

function boundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= HEADLESS_MAX_ID_LENGTH &&
    value === value.trim() &&
    !/\s/.test(value) &&
    !looksLikeSecret(value)
  );
}

function safeTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function safePositiveByteLength(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= HEADLESS_MAX_ASSET_BYTES
  );
}

function boundedMime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= HEADLESS_MAX_MIME_LENGTH &&
    value === value.trim() &&
    !/\s/.test(value) &&
    !looksLikeSecret(value)
  );
}

function boundedObjectKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= OBJECT_KEY_MAX &&
    value === value.trim() &&
    !value.includes("..") &&
    !value.startsWith("/") &&
    !value.includes("//") &&
    !looksLikeSecret(value)
  );
}

function isPurpose(value: unknown): value is HeadlessOwnedObjectPurpose {
  return typeof value === "string" && (PURPOSES as readonly string[]).includes(value);
}

function isStoreId(value: unknown): value is HeadlessOwnedObjectStoreId {
  return typeof value === "string" && (STORE_IDS as readonly string[]).includes(value);
}

function storeMatchesPurpose(
  purpose: HeadlessOwnedObjectPurpose,
  storeId: HeadlessOwnedObjectStoreId,
): boolean {
  if (purpose === "artifact") return storeId === "artifacts";
  return storeId === "assets";
}

function boundedTerminalReason(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= TERMINAL_REASON_MAX &&
    value === value.trim() &&
    /^[a-z][a-z0-9_]*$/.test(value) &&
    !looksLikeSecret(value)
  );
}

function validateClaimPair(
  token: unknown,
  claimedAt: unknown,
):
  | { readonly ok: true; readonly token: string | null; readonly claimedAt: number | null }
  | { readonly ok: false } {
  if (token === null && claimedAt === null) {
    return { ok: true, token: null, claimedAt: null };
  }
  if (
    typeof token === "string" &&
    token.length > 0 &&
    token.length <= HEADLESS_MAX_ID_LENGTH &&
    token === token.trim() &&
    !/\s/.test(token) &&
    !/^(?:blob:|data:|https?:)/i.test(token) &&
    !token.includes("://") &&
    safeTimestamp(claimedAt)
  ) {
    return { ok: true, token, claimedAt };
  }
  return { ok: false };
}

/**
 * Validate and detach a durable owned-object record.
 */
export function validateHeadlessOwnedObjectRecord(
  value: unknown,
): ValidateOwnedObjectRecordResult {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) {
      return fail("Owned object record rejected hostile structure.");
    }
    if (!isPlainObject(value)) {
      return fail("Owned object record must be a plain object.");
    }
    const unknown = hasUnknownFields(value, COMMON_FIELDS);
    if (unknown != null) {
      return fail("Owned object record contains unknown fields.");
    }
    for (const field of COMMON_FIELDS) {
      if (!hasOwnPlainField(value, field)) {
        return fail("Owned object record is missing required fields.");
      }
    }

    if (value.version !== HEADLESS_OWNED_OBJECT_RECORD_VERSION) {
      return fail("Owned object record version rejected.");
    }
    if (!boundedId(value.objectId)) return fail("Owned object identity rejected.");
    if (!boundedId(value.ownerId)) return fail("Owned object owner rejected.");
    if (!boundedId(value.projectId)) return fail("Owned object project rejected.");
    if (!boundedId(value.jobId)) return fail("Owned object job rejected.");
    if (!boundedId(value.operationId)) return fail("Owned object operation rejected.");
    if (!isPurpose(value.purpose)) return fail("Owned object purpose rejected.");
    // Slot keys use hslot:v2 identity (may exceed HEADLESS_MAX_ID_LENGTH).
    if (
      value.slotKey !== null &&
      !(
        typeof value.slotKey === "string" &&
        value.slotKey.trim().length > 0 &&
        value.slotKey === value.slotKey.trim() &&
        value.slotKey.length <= HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH &&
        isCanonicalHeadlessSourceSlotKey(value.slotKey)
      )
    ) {
      return fail("Owned object slot rejected.");
    }
    if (value.provider !== "r2") return fail("Owned object provider rejected.");
    if (!isStoreId(value.storeId)) return fail("Owned object store rejected.");
    if (!storeMatchesPurpose(value.purpose, value.storeId)) {
      return fail("Owned object store/purpose coherence rejected.");
    }
    if (!boundedObjectKey(value.objectKey)) {
      return fail("Owned object key rejected.");
    }
    if (!safeTimestamp(value.createdAtMs) || !safeTimestamp(value.updatedAtMs)) {
      return fail("Owned object timestamps rejected.");
    }
    if (value.updatedAtMs < value.createdAtMs) {
      return fail("Owned object timestamps incoherent.");
    }
    if (
      typeof value.expectedContentDigestClaim !== "string" ||
      !HEADLESS_CONTENT_DIGEST_RE.test(value.expectedContentDigestClaim)
    ) {
      return fail("Owned object digest claim rejected.");
    }
    if (!safePositiveByteLength(value.expectedByteLength)) {
      return fail("Owned object expected length rejected.");
    }
    if (!boundedMime(value.expectedMimeType)) {
      return fail("Owned object expected MIME rejected.");
    }
    if (
      !safeTimestamp(value.uploadCapabilityIssuedAtMs) ||
      !safeTimestamp(value.uploadCapabilityExpiresAtMs)
    ) {
      return fail("Owned object upload capability timestamps rejected.");
    }
    if (
      value.uploadCapabilityExpiresAtMs < value.uploadCapabilityIssuedAtMs &&
      !(
        value.uploadCapabilityIssuedAtMs === 0 &&
        value.uploadCapabilityExpiresAtMs === 0
      )
    ) {
      return fail("Owned object upload capability timestamps incoherent.");
    }
    if (
      value.uploadedObservedAtMs !== null &&
      !safeTimestamp(value.uploadedObservedAtMs)
    ) {
      return fail("Owned object upload observation rejected.");
    }

    const stage = value.stage;
    if (stage === "staging") {
      if (
        value.verificationState !== "unclaimed" &&
        value.verificationState !== "claimed" &&
        value.verificationState !== "failed"
      ) {
        return fail("Staging verification state rejected.");
      }
      const claim = validateClaimPair(
        value.verificationClaimToken,
        value.verificationClaimedAtMs,
      );
      if (!claim.ok) return fail("Staging verification claim pairing rejected.");
      if (value.verificationState === "unclaimed") {
        if (claim.token !== null || claim.claimedAt !== null) {
          return fail("Staging unclaimed must clear verification claim.");
        }
      }
      if (value.verificationState === "claimed") {
        if (claim.token === null || claim.claimedAt === null) {
          return fail("Staging claimed requires verification claim.");
        }
      }
      if (value.verifiedAtMs !== null) return fail("Staging must not be verified.");
      if (value.expiresAtMs !== null && !safeTimestamp(value.expiresAtMs)) {
        return fail("Staging expiry rejected.");
      }
      if (value.contentDigest !== null) return fail("Staging trusted digest must be null.");
      if (value.byteLength !== null) return fail("Staging trusted length must be null.");
      if (value.mimeType !== null) return fail("Staging trusted MIME must be null.");
      if (value.finalizedMetadata !== null) {
        return fail("Staging finalized metadata must be null.");
      }
      if (value.terminalReason !== null) return fail("Staging terminal reason must be null.");
      if (value.cleanupScheduledAtMs !== null) {
        return fail("Staging cleanup schedule must be null.");
      }

      const record: HeadlessOwnedObjectRecordV1 = {
        version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
        objectId: value.objectId,
        ownerId: value.ownerId,
        projectId: value.projectId,
        jobId: value.jobId,
        operationId: value.operationId,
        purpose: value.purpose,
        slotKey: value.slotKey,
        provider: "r2",
        storeId: value.storeId,
        objectKey: value.objectKey,
        createdAtMs: value.createdAtMs,
        updatedAtMs: value.updatedAtMs,
        stage: "staging",
        expectedContentDigestClaim: value.expectedContentDigestClaim,
        expectedByteLength: value.expectedByteLength,
        expectedMimeType: value.expectedMimeType,
        uploadCapabilityIssuedAtMs: value.uploadCapabilityIssuedAtMs,
        uploadCapabilityExpiresAtMs: value.uploadCapabilityExpiresAtMs,
        uploadedObservedAtMs: value.uploadedObservedAtMs,
        verificationState: value.verificationState,
        verificationClaimToken: claim.token,
        verificationClaimedAtMs: claim.claimedAt,
        verifiedAtMs: null,
        expiresAtMs: value.expiresAtMs,
        contentDigest: null,
        byteLength: null,
        mimeType: null,
        finalizedMetadata: null,
        terminalReason: null,
        cleanupScheduledAtMs: null,
      };
      return { ok: true, record: deepFreezeHeadlessValue(record) };
    }

    if (stage === "finalized") {
      if (value.verificationState !== "verified") {
        return fail("Finalized verification state rejected.");
      }
      if (
        value.verificationClaimToken !== null ||
        value.verificationClaimedAtMs !== null
      ) {
        return fail("Finalized must clear verification claim.");
      }
      if (!safeTimestamp(value.verifiedAtMs)) {
        return fail("Finalized verifiedAt rejected.");
      }
      if (!safeTimestamp(value.expiresAtMs)) {
        return fail("Finalized expiry required.");
      }
      if (
        typeof value.contentDigest !== "string" ||
        !HEADLESS_CONTENT_DIGEST_RE.test(value.contentDigest)
      ) {
        return fail("Finalized trusted digest rejected.");
      }
      if (value.contentDigest !== value.expectedContentDigestClaim) {
        return fail("Finalized digest must match historical claim.");
      }
      if (!safePositiveByteLength(value.byteLength)) {
        return fail("Finalized trusted length rejected.");
      }
      if (value.byteLength !== value.expectedByteLength) {
        return fail("Finalized length must match historical claim.");
      }
      if (!boundedMime(value.mimeType)) {
        return fail("Finalized trusted MIME rejected.");
      }
      if (value.mimeType !== value.expectedMimeType) {
        return fail("Finalized MIME must match historical claim.");
      }
      if (!isPlainObject(value.finalizedMetadata)) {
        return fail("Finalized metadata rejected.");
      }
      if (
        hasUnknownFields(value.finalizedMetadata, FINALIZED_METADATA_FIELDS) !=
        null
      ) {
        return fail("Finalized metadata contains unknown fields.");
      }
      if (
        value.finalizedMetadata.verifiedBy !== "full_object_stream" &&
        value.finalizedMetadata.verifiedBy !== "trusted_worker_upload_stream"
      ) {
        return fail("Finalized metadata verifiedBy rejected.");
      }
      if (value.finalizedMetadata.sourceStage !== "staging") {
        return fail("Finalized metadata sourceStage rejected.");
      }
      if (value.terminalReason !== null) {
        return fail("Finalized terminal reason must be null.");
      }
      if (value.cleanupScheduledAtMs !== null) {
        return fail("Finalized cleanup schedule must be null.");
      }

      const record: HeadlessOwnedObjectRecordV1 = {
        version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
        objectId: value.objectId,
        ownerId: value.ownerId,
        projectId: value.projectId,
        jobId: value.jobId,
        operationId: value.operationId,
        purpose: value.purpose,
        slotKey: value.slotKey,
        provider: "r2",
        storeId: value.storeId,
        objectKey: value.objectKey,
        createdAtMs: value.createdAtMs,
        updatedAtMs: value.updatedAtMs,
        stage: "finalized",
        expectedContentDigestClaim: value.expectedContentDigestClaim,
        expectedByteLength: value.expectedByteLength,
        expectedMimeType: value.expectedMimeType,
        uploadCapabilityIssuedAtMs: value.uploadCapabilityIssuedAtMs,
        uploadCapabilityExpiresAtMs: value.uploadCapabilityExpiresAtMs,
        uploadedObservedAtMs: value.uploadedObservedAtMs,
        verificationState: "verified",
        verificationClaimToken: null,
        verificationClaimedAtMs: null,
        verifiedAtMs: value.verifiedAtMs,
        expiresAtMs: value.expiresAtMs,
        contentDigest: value.contentDigest,
        byteLength: value.byteLength,
        mimeType: value.mimeType,
        finalizedMetadata: {
          verifiedBy: value.finalizedMetadata.verifiedBy as
            | "full_object_stream"
            | "trusted_worker_upload_stream",
          sourceStage: "staging",
        },
        terminalReason: null,
        cleanupScheduledAtMs: null,
      };
      return { ok: true, record: deepFreezeHeadlessValue(record) };
    }

    if (stage === "rejected") {
      if (value.verificationState !== "failed") {
        return fail("Rejected verification state rejected.");
      }
      if (
        value.verificationClaimToken !== null ||
        value.verificationClaimedAtMs !== null
      ) {
        return fail("Rejected must clear verification claim.");
      }
      if (value.verifiedAtMs !== null) return fail("Rejected must not be verified.");
      if (value.expiresAtMs !== null && !safeTimestamp(value.expiresAtMs)) {
        return fail("Rejected expiry rejected.");
      }
      if (value.contentDigest !== null || value.byteLength !== null || value.mimeType !== null) {
        return fail("Rejected must not carry trusted facts.");
      }
      if (value.finalizedMetadata !== null) {
        return fail("Rejected finalized metadata must be null.");
      }
      if (!boundedTerminalReason(value.terminalReason)) {
        return fail("Rejected terminal reason rejected.");
      }
      if (value.cleanupScheduledAtMs !== null) {
        return fail("Rejected cleanup schedule must be null.");
      }

      const record: HeadlessOwnedObjectRecordV1 = {
        version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
        objectId: value.objectId,
        ownerId: value.ownerId,
        projectId: value.projectId,
        jobId: value.jobId,
        operationId: value.operationId,
        purpose: value.purpose,
        slotKey: value.slotKey,
        provider: "r2",
        storeId: value.storeId,
        objectKey: value.objectKey,
        createdAtMs: value.createdAtMs,
        updatedAtMs: value.updatedAtMs,
        stage: "rejected",
        expectedContentDigestClaim: value.expectedContentDigestClaim,
        expectedByteLength: value.expectedByteLength,
        expectedMimeType: value.expectedMimeType,
        uploadCapabilityIssuedAtMs: value.uploadCapabilityIssuedAtMs,
        uploadCapabilityExpiresAtMs: value.uploadCapabilityExpiresAtMs,
        uploadedObservedAtMs: value.uploadedObservedAtMs,
        verificationState: "failed",
        verificationClaimToken: null,
        verificationClaimedAtMs: null,
        verifiedAtMs: null,
        expiresAtMs: value.expiresAtMs,
        contentDigest: null,
        byteLength: null,
        mimeType: null,
        finalizedMetadata: null,
        terminalReason: value.terminalReason,
        cleanupScheduledAtMs: null,
      };
      return { ok: true, record: deepFreezeHeadlessValue(record) };
    }

    if (stage === "cleanup_pending") {
      if (value.verificationState !== "failed") {
        return fail("Cleanup-pending verification state rejected.");
      }
      if (
        value.verificationClaimToken !== null ||
        value.verificationClaimedAtMs !== null
      ) {
        return fail("Cleanup-pending must clear verification claim.");
      }
      if (value.verifiedAtMs !== null) {
        return fail("Cleanup-pending must not be verified.");
      }
      if (value.expiresAtMs !== null && !safeTimestamp(value.expiresAtMs)) {
        return fail("Cleanup-pending expiry rejected.");
      }
      if (value.contentDigest !== null || value.byteLength !== null || value.mimeType !== null) {
        return fail("Cleanup-pending must not carry trusted facts.");
      }
      if (value.finalizedMetadata !== null) {
        return fail("Cleanup-pending finalized metadata must be null.");
      }
      if (!boundedTerminalReason(value.terminalReason)) {
        return fail("Cleanup-pending terminal reason rejected.");
      }
      if (!safeTimestamp(value.cleanupScheduledAtMs)) {
        return fail("Cleanup-pending schedule required.");
      }

      const record: HeadlessOwnedObjectRecordV1 = {
        version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
        objectId: value.objectId,
        ownerId: value.ownerId,
        projectId: value.projectId,
        jobId: value.jobId,
        operationId: value.operationId,
        purpose: value.purpose,
        slotKey: value.slotKey,
        provider: "r2",
        storeId: value.storeId,
        objectKey: value.objectKey,
        createdAtMs: value.createdAtMs,
        updatedAtMs: value.updatedAtMs,
        stage: "cleanup_pending",
        expectedContentDigestClaim: value.expectedContentDigestClaim,
        expectedByteLength: value.expectedByteLength,
        expectedMimeType: value.expectedMimeType,
        uploadCapabilityIssuedAtMs: value.uploadCapabilityIssuedAtMs,
        uploadCapabilityExpiresAtMs: value.uploadCapabilityExpiresAtMs,
        uploadedObservedAtMs: value.uploadedObservedAtMs,
        verificationState: "failed",
        verificationClaimToken: null,
        verificationClaimedAtMs: null,
        verifiedAtMs: null,
        expiresAtMs: value.expiresAtMs,
        contentDigest: null,
        byteLength: null,
        mimeType: null,
        finalizedMetadata: null,
        terminalReason: value.terminalReason,
        cleanupScheduledAtMs: value.cleanupScheduledAtMs,
      };
      return { ok: true, record: deepFreezeHeadlessValue(record) };
    }

    return fail("Owned object stage rejected.");
  } catch {
    return fail();
  }
}
