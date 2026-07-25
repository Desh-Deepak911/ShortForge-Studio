/**
 * Total fail-closed validators for provisional/canonical stored-job records.
 * Detaches and deep-freezes canonical results. Never throws on hostile input.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import {
  parseHeadlessProgress,
  parseHeadlessRendererProfile,
  parseHeadlessTerminalReason,
  isNonEmptyId,
} from "../../domain/headless-field-validators";
import {
  HEADLESS_ALLOWED_AUDIO_MIME_TYPES,
  HEADLESS_ALLOWED_IMAGE_MIME_TYPES,
  HEADLESS_ALLOWED_VIDEO_MIME_TYPES,
  HEADLESS_MAX_ASSETS,
  HEADLESS_MAX_ASSET_BYTES,
  HEADLESS_MAX_ID_LENGTH,
  HEADLESS_MAX_MIME_LENGTH,
  HEADLESS_MAX_OBJECT_KEY_LENGTH,
  HEADLESS_PROVISIONAL_PROGRESS_STAGE_IDS,
} from "../../domain/headless-render-constants";
import { validateHeadlessRenderJobCoherence } from "../../domain/validate-headless-coherence";
import {
  guardHeadlessStructure,
  hasOwnPlainField,
  hasUnknownFields,
  isPlainObject,
} from "../../domain/headless-hostile-guard";
import {
  HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH,
  headlessSourceSlotKey,
  isCanonicalHeadlessSourceSlotKey,
} from "../../domain/headless-source-coverage";
import {
  HEADLESS_CONTENT_DIGEST_RE,
  isHeadlessAuthorityFingerprint,
} from "../../domain/headless-stable-hash";
import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import {
  assertStoredBindingStateRules,
  validateHeadlessArtifactObjectBinding,
} from "./validate-artifact-object-binding";
import {
  HEADLESS_STORED_JOB_RECORD_VERSION,
  type HeadlessCanonicalStoredJobRecord,
  type HeadlessProvisionalSnapshotClaimV1,
  type HeadlessProvisionalSlotClaimV1,
  type HeadlessProvisionalStagingObjectRefV1,
  type HeadlessProvisionalStoredJobRecord,
  type HeadlessProvisionalVerificationCoverageV1,
  type HeadlessStoredJobRecord,
} from "../types/stored-job-record";
import {
  coverageCompleteFromSets,
  deriveRequiredVerificationTargets,
  isHeadlessVerificationTargetId,
  stagingTargetsPresent,
} from "./provisional-verification-targets";
import { assertStagingRefsBoundToSnapshot } from "./provisional-staging-monotonicity";

const SAFE_FAIL = "Hostile or unreadable input rejected." as const;

const MAX_SLOT_KEY_LENGTH = HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH;
const MAX_STAGING_REFS = HEADLESS_MAX_ASSETS + 2;

const SNAPSHOT_CLAIM_FIELDS = Object.freeze([
  "manifestPayloadDigestClaim",
  "assetBundleFingerprintClaim",
  "expectedSlotClaims",
] as const);

const SLOT_CLAIM_FIELDS = Object.freeze([
  "slotKey",
  "role",
  "sceneId",
  "mediaItemId",
  "sourceDigestClaim",
  "contentDigestClaim",
  "byteLengthClaim",
  "mimeTypeClaim",
] as const);

const STAGING_REF_FIELDS = Object.freeze([
  "purpose",
  "slotKey",
  "locator",
  "contentDigestClaim",
  "byteLengthClaim",
  "mimeTypeClaim",
] as const);

const VERIFICATION_COVERAGE_FIELDS = Object.freeze([
  "requiredTargets",
  "verifiedTargets",
  "complete",
] as const);

const PROVISIONAL_RECORD_FIELDS = Object.freeze([
  "version",
  "stage",
  "storeVersion",
  "jobId",
  "ownerId",
  "projectId",
  "createdAtMs",
  "updatedAtMs",
  "idempotencyAuthorityKey",
  "state",
  "operationId",
  "creatorIdempotencyKey",
  "requestedRendererProfile",
  "requestedRendererBuildId",
  "snapshotClaim",
  "stagingObjectRefs",
  "verificationCoverage",
  "verificationClaimToken",
  "verificationClaimedAtMs",
  "expiresAtMs",
  "progress",
  "terminalReason",
  "canonicalJob",
  "canonicalRequest",
  "artifactObjectBinding",
  "claimToken",
  "claimedAtMs",
] as const);

const PROVISIONAL_WRITE_FIELDS = Object.freeze(
  PROVISIONAL_RECORD_FIELDS.filter((field) => field !== "storeVersion"),
);

const CANONICAL_RECORD_FIELDS = Object.freeze([
  "version",
  "stage",
  "storeVersion",
  "jobId",
  "ownerId",
  "projectId",
  "createdAtMs",
  "updatedAtMs",
  "idempotencyAuthorityKey",
  "operationId",
  "canonicalJob",
  "canonicalRequest",
  "claimToken",
  "claimedAtMs",
  "artifactObjectBinding",
] as const);

const LOCATOR_FIELDS = Object.freeze(["kind", "storeId", "objectKey"] as const);

function looksLikeUrl(value: string): boolean {
  return /^(?:blob:|data:|https?:)/i.test(value) || value.includes("://");
}

function looksLikeSecret(value: string): boolean {
  return (
    looksLikeUrl(value) ||
    value.startsWith("cap_") ||
    /signature|signed|token|secret|password|credential/i.test(value)
  );
}

function boundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    isNonEmptyId(value) &&
    value.length <= HEADLESS_MAX_ID_LENGTH
  );
}

function boundedObjectKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= HEADLESS_MAX_OBJECT_KEY_LENGTH &&
    value === value.trim() &&
    !/\s/.test(value) &&
    !value.includes("..") &&
    !value.startsWith("/") &&
    !value.endsWith("/")
  );
}

function boundedSlotKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value === value.trim() &&
    value.length <= MAX_SLOT_KEY_LENGTH &&
    isCanonicalHeadlessSourceSlotKey(value)
  );
}

function safeTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function safePositiveInt(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= max
  );
}

function validateMimeClaim(
  mime: unknown,
  role: HeadlessProvisionalSlotClaimV1["role"],
): boolean {
  if (
    typeof mime !== "string" ||
    mime.trim() !== mime ||
    mime.length < 3 ||
    mime.length > HEADLESS_MAX_MIME_LENGTH ||
    !/^[a-z0-9]+\/[a-z0-9.+-]+$/i.test(mime)
  ) {
    return false;
  }
  if (role === "scene_media") {
    return (
      (HEADLESS_ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime) ||
      (HEADLESS_ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(mime)
    );
  }
  return (HEADLESS_ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);
}

function validateOpaqueLocator(
  value: unknown,
):
  | { readonly ok: true; readonly locator: HeadlessStorageLocatorIdentity }
  | { readonly ok: false; readonly message: string } {
  if (!isPlainObject(value)) {
    return { ok: false, message: "storageLocator must be a plain object." };
  }
  if (hasUnknownFields(value, LOCATOR_FIELDS)) {
    return { ok: false, message: "storageLocator has unknown fields." };
  }
  for (const key of LOCATOR_FIELDS) {
    if (!hasOwnPlainField(value, key)) {
      return { ok: false, message: "storageLocator missing required field." };
    }
  }
  if (value.kind !== "object_storage") {
    return { ok: false, message: "storageLocator.kind must be object_storage." };
  }
  if (!boundedId(value.storeId) || !boundedObjectKey(value.objectKey)) {
    return { ok: false, message: "storageLocator ids invalid." };
  }
  if (looksLikeUrl(value.storeId) || looksLikeUrl(value.objectKey)) {
    return { ok: false, message: "storageLocator must not be a URL." };
  }
  if (
    value.storeId.startsWith("cap_") ||
    value.objectKey.startsWith("cap_") ||
    /signature|signed|token/i.test(value.storeId) ||
    /signature|signed|token/i.test(value.objectKey)
  ) {
    return {
      ok: false,
      message: "storageLocator must not carry capability or signed URL material.",
    };
  }
  return {
    ok: true,
    locator: {
      kind: "object_storage",
      storeId: value.storeId,
      objectKey: value.objectKey,
    },
  };
}

function validateBoundedStringArray(
  value: unknown,
  label: string,
  maxItems: number,
  itemValidator: (item: unknown) => boolean,
):
  | { readonly ok: true; readonly items: readonly string[] }
  | { readonly ok: false; readonly message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: `${label} must be an array.` };
  }
  if (value.length > maxItems) {
    return { ok: false, message: `${label} exceeds maximum length.` };
  }
  const items: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!itemValidator(item)) {
      return { ok: false, message: `${label} item invalid at index ${i}.` };
    }
    if (seen.has(item)) {
      return { ok: false, message: `${label} contains duplicate entries.` };
    }
    seen.add(item);
    items.push(item);
  }
  return { ok: true, items };
}

export function validateHeadlessProvisionalSnapshotClaim(
  value: unknown,
):
  | { readonly ok: true; readonly claim: HeadlessProvisionalSnapshotClaimV1 }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return { ok: false, message: SAFE_FAIL };
    if (!isPlainObject(value)) {
      return { ok: false, message: "Snapshot claim must be a plain object." };
    }
    if (hasUnknownFields(value, SNAPSHOT_CLAIM_FIELDS)) {
      return { ok: false, message: "Snapshot claim has unknown fields." };
    }
    for (const key of SNAPSHOT_CLAIM_FIELDS) {
      if (!hasOwnPlainField(value, key)) {
        return { ok: false, message: "Snapshot claim missing required field." };
      }
    }
    if (
      typeof value.manifestPayloadDigestClaim !== "string" ||
      !HEADLESS_CONTENT_DIGEST_RE.test(value.manifestPayloadDigestClaim)
    ) {
      return { ok: false, message: "manifestPayloadDigestClaim invalid." };
    }
    if (
      typeof value.assetBundleFingerprintClaim !== "string" ||
      !isHeadlessAuthorityFingerprint(value.assetBundleFingerprintClaim, "hab")
    ) {
      return { ok: false, message: "assetBundleFingerprintClaim invalid." };
    }
    if (!Array.isArray(value.expectedSlotClaims)) {
      return { ok: false, message: "expectedSlotClaims must be an array." };
    }
    if (value.expectedSlotClaims.length > HEADLESS_MAX_ASSETS) {
      return { ok: false, message: "expectedSlotClaims exceeds maximum assets." };
    }

    const expectedSlotClaims: HeadlessProvisionalSlotClaimV1[] = [];
    const seenSlotKeys = new Set<string>();

    for (let i = 0; i < value.expectedSlotClaims.length; i++) {
      const slotValue = value.expectedSlotClaims[i];
      if (!isPlainObject(slotValue)) {
        return { ok: false, message: `Slot claim at index ${i} must be a plain object.` };
      }
      if (hasUnknownFields(slotValue, SLOT_CLAIM_FIELDS)) {
        return { ok: false, message: `Slot claim has unknown fields (${i}).` };
      }
      for (const key of SLOT_CLAIM_FIELDS) {
        if (!hasOwnPlainField(slotValue, key)) {
          return { ok: false, message: `Slot claim missing required field (${i}).` };
        }
      }

      const role = slotValue.role;
      if (role !== "scene_media" && role !== "voiceover" && role !== "music") {
        return { ok: false, message: `Invalid slot role (${i}).` };
      }

      if (!boundedSlotKey(slotValue.slotKey)) {
        return { ok: false, message: `Invalid slotKey (${i}).` };
      }
      if (seenSlotKeys.has(slotValue.slotKey)) {
        return { ok: false, message: "Duplicate slotKey in expectedSlotClaims." };
      }
      seenSlotKeys.add(slotValue.slotKey);

      const sceneId = slotValue.sceneId;
      const mediaItemId = slotValue.mediaItemId;
      if (role === "scene_media") {
        if (!boundedId(sceneId) || !boundedId(mediaItemId)) {
          return {
            ok: false,
            message: `scene_media requires sceneId and mediaItemId (${i}).`,
          };
        }
      } else if (sceneId !== null || mediaItemId !== null) {
        return {
          ok: false,
          message: `Audio slot claims must use null scene/media ids (${i}).`,
        };
      }

      if (
        typeof slotValue.sourceDigestClaim !== "string" ||
        !isHeadlessAuthorityFingerprint(slotValue.sourceDigestClaim, "hsrc")
      ) {
        return { ok: false, message: `sourceDigestClaim invalid (${i}).` };
      }
      if (
        typeof slotValue.contentDigestClaim !== "string" ||
        !HEADLESS_CONTENT_DIGEST_RE.test(slotValue.contentDigestClaim)
      ) {
        return { ok: false, message: `contentDigestClaim invalid (${i}).` };
      }
      if (
        !safePositiveInt(slotValue.byteLengthClaim, HEADLESS_MAX_ASSET_BYTES)
      ) {
        return { ok: false, message: `byteLengthClaim invalid (${i}).` };
      }
      if (!validateMimeClaim(slotValue.mimeTypeClaim, role)) {
        return { ok: false, message: `mimeTypeClaim invalid (${i}).` };
      }

      const expectedSlotKey = headlessSourceSlotKey({
        role,
        sceneId,
        mediaItemId,
        sourceDigest: slotValue.sourceDigestClaim,
      });
      if (slotValue.slotKey !== expectedSlotKey) {
        return { ok: false, message: `slotKey does not match claim identity (${i}).` };
      }

      expectedSlotClaims.push({
        slotKey: slotValue.slotKey,
        role,
        sceneId: role === "scene_media" ? (sceneId as string) : null,
        mediaItemId: role === "scene_media" ? (mediaItemId as string) : null,
        sourceDigestClaim: slotValue.sourceDigestClaim,
        contentDigestClaim: slotValue.contentDigestClaim,
        byteLengthClaim: slotValue.byteLengthClaim,
        mimeTypeClaim: slotValue.mimeTypeClaim as string,
      });
    }

    const claim = deepFreezeHeadlessValue({
      manifestPayloadDigestClaim: value.manifestPayloadDigestClaim,
      assetBundleFingerprintClaim: value.assetBundleFingerprintClaim,
      expectedSlotClaims,
    } satisfies HeadlessProvisionalSnapshotClaimV1);

    return { ok: true, claim };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

export function validateHeadlessProvisionalStagingObjectRef(
  value: unknown,
):
  | { readonly ok: true; readonly ref: HeadlessProvisionalStagingObjectRefV1 }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return { ok: false, message: SAFE_FAIL };
    if (!isPlainObject(value)) {
      return { ok: false, message: "Staging object ref must be a plain object." };
    }
    if (hasUnknownFields(value, STAGING_REF_FIELDS)) {
      return { ok: false, message: "Staging object ref has unknown fields." };
    }
    for (const key of STAGING_REF_FIELDS) {
      if (!hasOwnPlainField(value, key)) {
        return { ok: false, message: "Staging object ref missing required field." };
      }
    }

    const purpose = value.purpose;
    if (
      purpose !== "manifest" &&
      purpose !== "asset_bundle_record" &&
      purpose !== "asset_bytes"
    ) {
      return { ok: false, message: "Invalid staging object purpose." };
    }

    const slotKey = value.slotKey;
    if (purpose === "asset_bytes") {
      if (!boundedSlotKey(slotKey)) {
        return { ok: false, message: "asset_bytes staging ref requires slotKey." };
      }
    } else if (slotKey !== null) {
      return { ok: false, message: "Non asset_bytes staging ref must use null slotKey." };
    }

    const locator = validateOpaqueLocator(value.locator);
    if (!locator.ok) return locator;

    if (
      typeof value.contentDigestClaim !== "string" ||
      !HEADLESS_CONTENT_DIGEST_RE.test(value.contentDigestClaim)
    ) {
      return { ok: false, message: "Staging contentDigestClaim invalid." };
    }
    if (!safePositiveInt(value.byteLengthClaim, HEADLESS_MAX_ASSET_BYTES)) {
      return { ok: false, message: "Staging byteLengthClaim invalid." };
    }
    if (
      typeof value.mimeTypeClaim !== "string" ||
      value.mimeTypeClaim.trim() !== value.mimeTypeClaim ||
      value.mimeTypeClaim.length < 3 ||
      value.mimeTypeClaim.length > HEADLESS_MAX_MIME_LENGTH ||
      !/^[a-z0-9]+\/[a-z0-9.+-]+$/i.test(value.mimeTypeClaim)
    ) {
      return { ok: false, message: "Staging mimeTypeClaim invalid." };
    }

    const ref = deepFreezeHeadlessValue({
      purpose,
      slotKey,
      locator: locator.locator,
      contentDigestClaim: value.contentDigestClaim,
      byteLengthClaim: value.byteLengthClaim,
      mimeTypeClaim: value.mimeTypeClaim,
    } satisfies HeadlessProvisionalStagingObjectRefV1);

    return { ok: true, ref };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

export function validateHeadlessProvisionalStagingObjectRefs(
  value: unknown,
  expectedSlotKeys: ReadonlySet<string>,
):
  | { readonly ok: true; readonly refs: readonly HeadlessProvisionalStagingObjectRefV1[] }
  | { readonly ok: false; readonly message: string } {
  try {
    if (!Array.isArray(value)) {
      return { ok: false, message: "stagingObjectRefs must be an array." };
    }
    if (value.length > MAX_STAGING_REFS) {
      return { ok: false, message: "stagingObjectRefs exceeds maximum length." };
    }

    const refs: HeadlessProvisionalStagingObjectRefV1[] = [];
    const seenObjectClaims = new Set<string>();
    const seenAssetBytesSlots = new Set<string>();
    let manifestCount = 0;
    let bundleRecordCount = 0;

    for (let i = 0; i < value.length; i++) {
      const parsed = validateHeadlessProvisionalStagingObjectRef(value[i]);
      if (!parsed.ok) return parsed;
      const ref = parsed.ref;

      if (ref.purpose === "manifest") {
        manifestCount += 1;
        if (manifestCount > 1) {
          return { ok: false, message: "Duplicate manifest staging object ref." };
        }
      } else if (ref.purpose === "asset_bundle_record") {
        bundleRecordCount += 1;
        if (bundleRecordCount > 1) {
          return {
            ok: false,
            message: "Duplicate asset_bundle_record staging object ref.",
          };
        }
      } else if (ref.slotKey != null) {
        if (seenAssetBytesSlots.has(ref.slotKey)) {
          return { ok: false, message: "Duplicate asset_bytes slotKey staging ref." };
        }
        seenAssetBytesSlots.add(ref.slotKey);
        if (!expectedSlotKeys.has(ref.slotKey)) {
          return { ok: false, message: "Unknown asset_bytes slotKey in staging refs." };
        }
      }

      const objectClaimKey = [
        ref.purpose,
        ref.slotKey ?? "",
        ref.locator.storeId,
        ref.locator.objectKey,
      ].join("\0");
      if (seenObjectClaims.has(objectClaimKey)) {
        return { ok: false, message: "Duplicate staging object claim." };
      }
      seenObjectClaims.add(objectClaimKey);

      refs.push(ref);
    }

    return { ok: true, refs: deepFreezeHeadlessValue(refs) };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

export function validateHeadlessProvisionalVerificationCoverage(
  value: unknown,
  snapshot: HeadlessProvisionalSnapshotClaimV1,
  stagingObjectRefs: readonly HeadlessProvisionalStagingObjectRefV1[],
):
  | { readonly ok: true; readonly coverage: HeadlessProvisionalVerificationCoverageV1 }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return { ok: false, message: SAFE_FAIL };
    if (!isPlainObject(value)) {
      return { ok: false, message: "Verification coverage must be a plain object." };
    }
    if (hasUnknownFields(value, VERIFICATION_COVERAGE_FIELDS)) {
      return { ok: false, message: "Verification coverage has unknown fields." };
    }
    for (const key of VERIFICATION_COVERAGE_FIELDS) {
      if (!hasOwnPlainField(value, key)) {
        return { ok: false, message: "Verification coverage missing required field." };
      }
    }
    if (typeof value.complete !== "boolean") {
      return { ok: false, message: "Verification complete must be boolean." };
    }

    const derivedRequired = deriveRequiredVerificationTargets(snapshot);
    // +2 for manifest + bundle beyond asset slots
    const maxTargets = HEADLESS_MAX_ASSETS + 2;

    const required = validateBoundedStringArray(
      value.requiredTargets,
      "requiredTargets",
      maxTargets,
      (item) => typeof item === "string" && isHeadlessVerificationTargetId(item),
    );
    if (!required.ok) return required;

    const verified = validateBoundedStringArray(
      value.verifiedTargets,
      "verifiedTargets",
      maxTargets,
      (item) => typeof item === "string" && isHeadlessVerificationTargetId(item),
    );
    if (!verified.ok) return verified;

    if (
      required.items.length !== derivedRequired.length ||
      required.items.some((t, i) => t !== derivedRequired[i])
    ) {
      return {
        ok: false,
        message:
          "requiredTargets must be exactly the derived snapshot verification targets.",
      };
    }

    const requiredLookup = new Set(required.items);
    if (requiredLookup.size !== required.items.length) {
      return { ok: false, message: "requiredTargets must not contain duplicates." };
    }
    if (new Set(verified.items).size !== verified.items.length) {
      return { ok: false, message: "verifiedTargets must not contain duplicates." };
    }

    for (const target of verified.items) {
      if (!requiredLookup.has(target)) {
        return {
          ok: false,
          message: "verifiedTargets contains a target outside requiredTargets.",
        };
      }
    }

    const stagingPresent = stagingTargetsPresent(stagingObjectRefs);
    for (const target of verified.items) {
      if (!stagingPresent.has(target)) {
        return {
          ok: false,
          message:
            "A target can be verified only when its exact staging reference exists.",
        };
      }
    }

    const expectedComplete = coverageCompleteFromSets(
      required.items,
      verified.items,
    );
    if (value.complete !== expectedComplete) {
      return {
        ok: false,
        message: "complete must equal exact required/verified set equality.",
      };
    }

    const coverage = deepFreezeHeadlessValue({
      requiredTargets: required.items,
      verifiedTargets: verified.items,
      complete: expectedComplete,
    } satisfies HeadlessProvisionalVerificationCoverageV1);

    return { ok: true, coverage };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

function validateProvisionalProgress(
  value: unknown,
  state: HeadlessProvisionalStoredJobRecord["state"],
):
  | { readonly ok: true; readonly progress: HeadlessProvisionalStoredJobRecord["progress"] }
  | { readonly ok: false; readonly message: string } {
  if (state !== "materializing") {
    if (value !== null) {
      return { ok: false, message: "Terminal provisional records cannot carry progress." };
    }
    return { ok: true, progress: null };
  }

  const parsed = parseHeadlessProgress(value);
  if (!parsed.ok) {
    return { ok: false, message: parsed.issues[0]?.message ?? "Invalid progress." };
  }
  if (
    parsed.progress?.stage != null &&
    !(HEADLESS_PROVISIONAL_PROGRESS_STAGE_IDS as readonly string[]).includes(
      parsed.progress.stage,
    )
  ) {
    return {
      ok: false,
      message: "Provisional progress stage must be materializing, uploading, or verifying.",
    };
  }
  return { ok: true, progress: parsed.progress };
}

function validateProvisionalTerminalInvariants(input: {
  state: HeadlessProvisionalStoredJobRecord["state"];
  terminalReason: unknown;
}):
  | { readonly ok: true; readonly terminalReason: HeadlessProvisionalStoredJobRecord["terminalReason"] }
  | { readonly ok: false; readonly message: string } {
  if (input.state === "materializing") {
    if (input.terminalReason !== null) {
      return { ok: false, message: "Active provisional record cannot carry terminalReason." };
    }
    return { ok: true, terminalReason: null };
  }

  const parsed = parseHeadlessTerminalReason(input.terminalReason);
  if (!parsed.ok) {
    return {
      ok: false,
      message: parsed.issues[0]?.message ?? "Invalid terminalReason.",
    };
  }

  if (input.state === "cancelled" && parsed.reason.reasonId !== "CANCELLED_BY_USER") {
    return { ok: false, message: "cancelled provisional record requires CANCELLED_BY_USER." };
  }
  if (input.state === "expired" && parsed.reason.reasonId !== "EXPIRED") {
    return { ok: false, message: "expired provisional record requires EXPIRED." };
  }

  return { ok: true, terminalReason: parsed.reason };
}

export function validateHeadlessProvisionalStoredJobRecord(
  value: unknown,
  options?: { readonly requireStoreVersion?: boolean },
):
  | { readonly ok: true; readonly record: HeadlessProvisionalStoredJobRecord }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return { ok: false, message: SAFE_FAIL };
    if (!isPlainObject(value)) {
      return { ok: false, message: "Provisional stored record must be a plain object." };
    }

    const requireStoreVersion = options?.requireStoreVersion ?? true;
    const allowedFields = requireStoreVersion
      ? PROVISIONAL_RECORD_FIELDS
      : PROVISIONAL_WRITE_FIELDS;

    if (hasUnknownFields(value, allowedFields)) {
      return { ok: false, message: "Provisional stored record has unknown fields." };
    }
    for (const key of allowedFields) {
      if (!hasOwnPlainField(value, key)) {
        return { ok: false, message: "Provisional stored record missing required field." };
      }
    }

    if (requireStoreVersion) {
      if (
        typeof value.storeVersion !== "number" ||
        !Number.isSafeInteger(value.storeVersion) ||
        value.storeVersion < 1
      ) {
        return { ok: false, message: "storeVersion invalid." };
      }
    }

    if (value.version !== HEADLESS_STORED_JOB_RECORD_VERSION) {
      return { ok: false, message: "Unsupported stored record version." };
    }
    if (value.stage !== "provisional") {
      return { ok: false, message: "stage must be provisional." };
    }

    if (
      !boundedId(value.jobId) ||
      !boundedId(value.ownerId) ||
      !boundedId(value.projectId) ||
      !boundedId(value.operationId) ||
      !boundedId(value.creatorIdempotencyKey) ||
      !boundedId(value.requestedRendererBuildId)
    ) {
      return { ok: false, message: "Provisional identity ids invalid." };
    }

    if (
      typeof value.idempotencyAuthorityKey !== "string" ||
      !isHeadlessAuthorityFingerprint(value.idempotencyAuthorityKey, "hid") ||
      looksLikeSecret(value.idempotencyAuthorityKey)
    ) {
      return { ok: false, message: "idempotencyAuthorityKey invalid." };
    }

    if (
      !safeTimestamp(value.createdAtMs) ||
      !safeTimestamp(value.updatedAtMs) ||
      !safeTimestamp(value.expiresAtMs) ||
      value.updatedAtMs < value.createdAtMs ||
      value.expiresAtMs <= value.createdAtMs
    ) {
      return { ok: false, message: "Provisional timestamps invalid." };
    }

    const state = value.state;
    if (
      state !== "materializing" &&
      state !== "failed" &&
      state !== "cancelled" &&
      state !== "expired"
    ) {
      return { ok: false, message: "Invalid provisional state." };
    }

    const profileParsed = parseHeadlessRendererProfile(value.requestedRendererProfile);
    if (!profileParsed.ok) {
      return {
        ok: false,
        message: profileParsed.issues[0]?.message ?? "Invalid requestedRendererProfile.",
      };
    }

    const snapshotParsed = validateHeadlessProvisionalSnapshotClaim(value.snapshotClaim);
    if (!snapshotParsed.ok) return snapshotParsed;
    const expectedSlotKeys = snapshotParsed.claim.expectedSlotClaims.map(
      (slot) => slot.slotKey,
    );
    const expectedSlotKeySet = new Set(expectedSlotKeys);

    const stagingParsed = validateHeadlessProvisionalStagingObjectRefs(
      value.stagingObjectRefs,
      expectedSlotKeySet,
    );
    if (!stagingParsed.ok) return stagingParsed;

    // Shared create + CAS authority — mismatched initial refs never persist.
    const stagingBound = assertStagingRefsBoundToSnapshot({
      snapshot: snapshotParsed.claim,
      stagingObjectRefs: stagingParsed.refs,
    });
    if (!stagingBound.ok) return stagingBound;

    const coverageParsed = validateHeadlessProvisionalVerificationCoverage(
      value.verificationCoverage,
      snapshotParsed.claim,
      stagingParsed.refs,
    );
    if (!coverageParsed.ok) return coverageParsed;

    const claimToken = value.verificationClaimToken;
    const claimedAtMs = value.verificationClaimedAtMs;
    if (
      (claimToken === null && claimedAtMs !== null) ||
      (claimToken !== null && claimedAtMs === null)
    ) {
      return {
        ok: false,
        message: "verificationClaimToken and verificationClaimedAtMs must be paired.",
      };
    }
    if (claimToken !== null) {
      if (!boundedId(claimToken) || looksLikeSecret(claimToken)) {
        return { ok: false, message: "verificationClaimToken invalid." };
      }
      if (!safeTimestamp(claimedAtMs) || claimedAtMs! < value.createdAtMs) {
        return { ok: false, message: "verificationClaimedAtMs invalid." };
      }
    }

    const terminalParsed = validateProvisionalTerminalInvariants({
      state,
      terminalReason: value.terminalReason,
    });
    if (!terminalParsed.ok) return terminalParsed;

    const progressParsed = validateProvisionalProgress(value.progress, state);
    if (!progressParsed.ok) return progressParsed;

    if (value.canonicalJob !== null) {
      return { ok: false, message: "Provisional record cannot carry canonicalJob." };
    }
    if (value.canonicalRequest !== null) {
      return { ok: false, message: "Provisional record cannot carry canonicalRequest." };
    }
    if (value.artifactObjectBinding !== null) {
      return { ok: false, message: "Provisional record cannot carry artifactObjectBinding." };
    }
    if (value.claimToken !== null || value.claimedAtMs !== null) {
      return { ok: false, message: "Provisional record cannot carry render claim fields." };
    }

    const verificationClaimToken =
      claimToken === null ? null : (claimToken as string);
    const verificationClaimedAtMs =
      claimedAtMs === null ? null : (claimedAtMs as number);

    const record = deepFreezeHeadlessValue({
      version: HEADLESS_STORED_JOB_RECORD_VERSION,
      stage: "provisional",
      storeVersion:
        requireStoreVersion && typeof value.storeVersion === "number"
          ? value.storeVersion
          : 1,
      jobId: value.jobId,
      ownerId: value.ownerId,
      projectId: value.projectId,
      createdAtMs: value.createdAtMs,
      updatedAtMs: value.updatedAtMs,
      idempotencyAuthorityKey: value.idempotencyAuthorityKey,
      state,
      operationId: value.operationId,
      creatorIdempotencyKey: value.creatorIdempotencyKey,
      requestedRendererProfile: profileParsed.profile,
      requestedRendererBuildId: value.requestedRendererBuildId,
      snapshotClaim: snapshotParsed.claim,
      stagingObjectRefs: stagingParsed.refs,
      verificationCoverage: coverageParsed.coverage,
      verificationClaimToken,
      verificationClaimedAtMs,
      expiresAtMs: value.expiresAtMs,
      progress: progressParsed.progress,
      terminalReason: terminalParsed.terminalReason,
      canonicalJob: null,
      canonicalRequest: null,
      artifactObjectBinding: null,
      claimToken: null,
      claimedAtMs: null,
    } satisfies HeadlessProvisionalStoredJobRecord);

    return { ok: true, record };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

export function validateHeadlessCanonicalStoredJobRecord(
  value: unknown,
):
  | { readonly ok: true; readonly record: HeadlessCanonicalStoredJobRecord }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return { ok: false, message: SAFE_FAIL };
    if (!isPlainObject(value)) {
      return { ok: false, message: "Canonical stored record must be a plain object." };
    }
    if (hasUnknownFields(value, CANONICAL_RECORD_FIELDS)) {
      return { ok: false, message: "Canonical stored record has unknown fields." };
    }
    for (const key of CANONICAL_RECORD_FIELDS) {
      if (!hasOwnPlainField(value, key)) {
        return { ok: false, message: "Canonical stored record missing required field." };
      }
    }

    if (value.version !== HEADLESS_STORED_JOB_RECORD_VERSION) {
      return { ok: false, message: "Unsupported stored record version." };
    }
    if (value.stage !== "canonical") {
      return { ok: false, message: "stage must be canonical." };
    }
    if (
      typeof value.storeVersion !== "number" ||
      !Number.isSafeInteger(value.storeVersion) ||
      value.storeVersion < 1
    ) {
      return { ok: false, message: "storeVersion invalid." };
    }

    if (
      !boundedId(value.jobId) ||
      !boundedId(value.ownerId) ||
      !boundedId(value.projectId) ||
      !boundedId(value.operationId)
    ) {
      return { ok: false, message: "Canonical identity ids invalid." };
    }

    if (
      typeof value.idempotencyAuthorityKey !== "string" ||
      !isHeadlessAuthorityFingerprint(value.idempotencyAuthorityKey, "hid") ||
      looksLikeSecret(value.idempotencyAuthorityKey)
    ) {
      return { ok: false, message: "idempotencyAuthorityKey invalid." };
    }

    if (
      !safeTimestamp(value.createdAtMs) ||
      !safeTimestamp(value.updatedAtMs) ||
      value.updatedAtMs < value.createdAtMs
    ) {
      return { ok: false, message: "Canonical timestamps invalid." };
    }

    const coherent = validateHeadlessRenderJobCoherence(
      value.canonicalJob,
      value.canonicalRequest,
    );
    if (!coherent.ok) {
      return {
        ok: false,
        message: coherent.issues[0]?.message ?? "Canonical job/request coherence failed.",
      };
    }

    if (coherent.job.jobId !== value.jobId) {
      return { ok: false, message: "canonicalJob.jobId mismatch." };
    }
    if (
      coherent.job.ownership.ownerId !== value.ownerId ||
      coherent.job.ownership.projectId !== value.projectId ||
      coherent.request.ownership.ownerId !== value.ownerId ||
      coherent.request.ownership.projectId !== value.projectId
    ) {
      return { ok: false, message: "Canonical ownership mismatch." };
    }

    const claimToken = value.claimToken;
    const claimedAtMs = value.claimedAtMs;
    if (
      (claimToken === null && claimedAtMs !== null) ||
      (claimToken !== null && claimedAtMs === null)
    ) {
      return { ok: false, message: "claimToken and claimedAtMs must be paired." };
    }
    if (claimToken !== null) {
      if (!boundedId(claimToken) || looksLikeSecret(claimToken)) {
        return { ok: false, message: "claimToken invalid." };
      }
      if (!safeTimestamp(claimedAtMs) || claimedAtMs! < value.createdAtMs) {
        return { ok: false, message: "claimedAtMs invalid." };
      }
    }

    let binding = null;
    if (value.artifactObjectBinding !== null) {
      const bindingParsed = validateHeadlessArtifactObjectBinding(
        value.artifactObjectBinding,
      );
      if (!bindingParsed.ok) return bindingParsed;
      binding = bindingParsed.binding;
    }

    const bindingRules = assertStoredBindingStateRules({
      job: coherent.job,
      request: coherent.request,
      binding,
    });
    if (!bindingRules.ok) return bindingRules;

    const renderClaimToken = claimToken === null ? null : (claimToken as string);
    const renderClaimedAtMs = claimedAtMs === null ? null : (claimedAtMs as number);

    const record = deepFreezeHeadlessValue({
      version: HEADLESS_STORED_JOB_RECORD_VERSION,
      stage: "canonical",
      storeVersion: value.storeVersion,
      jobId: value.jobId,
      ownerId: value.ownerId,
      projectId: value.projectId,
      createdAtMs: value.createdAtMs,
      updatedAtMs: value.updatedAtMs,
      idempotencyAuthorityKey: value.idempotencyAuthorityKey,
      operationId: value.operationId as string,
      canonicalJob: coherent.job,
      canonicalRequest: coherent.request,
      claimToken: renderClaimToken,
      claimedAtMs: renderClaimedAtMs,
      artifactObjectBinding: bindingRules.binding,
    } satisfies HeadlessCanonicalStoredJobRecord);

    return { ok: true, record };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

export function validateHeadlessStoredJobRecord(
  value: unknown,
):
  | { readonly ok: true; readonly record: HeadlessStoredJobRecord }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return { ok: false, message: SAFE_FAIL };
    if (!isPlainObject(value)) {
      return { ok: false, message: "Stored record must be a plain object." };
    }
    if (!hasOwnPlainField(value, "stage")) {
      return { ok: false, message: "Stored record missing stage discriminator." };
    }

    if (value.stage === "provisional") {
      const provisional = validateHeadlessProvisionalStoredJobRecord(value, {
        requireStoreVersion: true,
      });
      if (!provisional.ok) return provisional;
      return { ok: true, record: provisional.record };
    }

    if (value.stage === "canonical") {
      const canonical = validateHeadlessCanonicalStoredJobRecord(value);
      if (!canonical.ok) return canonical;
      return { ok: true, record: canonical.record };
    }

    return { ok: false, message: "Unknown stored record stage." };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}
