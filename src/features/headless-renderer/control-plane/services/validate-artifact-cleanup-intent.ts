/**
 * Exact-key, total, fail-closed validator for private cleanup intents.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { isNonEmptyId } from "../../domain/headless-field-validators";
import {
  HEADLESS_MAX_ATTEMPT,
  HEADLESS_MAX_ID_LENGTH,
} from "../../domain/headless-render-constants";
import {
  guardHeadlessStructure,
  hasOwnPlainField,
  hasUnknownFields,
  isPlainObject,
} from "../../domain/headless-hostile-guard";
import { HEADLESS_CONTENT_DIGEST_RE } from "../../domain/headless-stable-hash";
import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import {
  HEADLESS_ARTIFACT_CLEANUP_INTENT_FIELDS,
  HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
  HEADLESS_ARTIFACT_CLEANUP_REASON_IDS,
  type HeadlessArtifactCleanupIntentV1,
  type HeadlessArtifactCleanupReasonId,
} from "../types/artifact-cleanup-intent";

const LOCATOR_FIELDS = Object.freeze(["kind", "storeId", "objectKey"] as const);
const SAFE_FAIL = "Hostile or unreadable input rejected." as const;
const REASON_SET = new Set<string>(HEADLESS_ARTIFACT_CLEANUP_REASON_IDS);
/** Matches R2 object-key authority ceiling (not general ID length). */
const MAX_OBJECT_KEY_LENGTH = 1024;

function looksLikeUrl(value: string): boolean {
  return /^(?:blob:|data:|https?:)/i.test(value) || value.includes("://");
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
    value === value.trim() &&
    value.length <= MAX_OBJECT_KEY_LENGTH &&
    !looksLikeUrl(value) &&
    !value.startsWith("cap_") &&
    !/signature|signed|token/i.test(value)
  );
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
  if (looksLikeUrl(value.storeId)) {
    return { ok: false, message: "storageLocator must not be a URL." };
  }
  if (
    value.storeId.startsWith("cap_") ||
    /signature|signed|token/i.test(value.storeId)
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

export function validateHeadlessArtifactCleanupIntent(
  value: unknown,
):
  | { readonly ok: true; readonly intent: HeadlessArtifactCleanupIntentV1 }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) {
      return { ok: false, message: SAFE_FAIL };
    }
    if (!isPlainObject(value)) {
      return { ok: false, message: "Cleanup intent must be a plain object." };
    }
    if (hasUnknownFields(value, HEADLESS_ARTIFACT_CLEANUP_INTENT_FIELDS)) {
      return { ok: false, message: "Cleanup intent has unknown fields." };
    }
    for (const key of HEADLESS_ARTIFACT_CLEANUP_INTENT_FIELDS) {
      if (!hasOwnPlainField(value, key)) {
        return { ok: false, message: "Cleanup intent missing required field." };
      }
    }
    if (value.version !== HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION) {
      return { ok: false, message: "Unsupported cleanup intent version." };
    }
    if (
      typeof value.cleanupId !== "string" ||
      value.cleanupId.trim() !== value.cleanupId ||
      value.cleanupId.length < 8 ||
      value.cleanupId.length > 512 ||
      looksLikeUrl(value.cleanupId) ||
      value.cleanupId.startsWith("cap_") ||
      /signature|signed|token/i.test(value.cleanupId)
    ) {
      return { ok: false, message: "Cleanup intent cleanupId invalid." };
    }
    if (
      !boundedId(value.jobId) ||
      !boundedId(value.ownerId) ||
      !boundedId(value.projectId) ||
      !boundedId(value.objectId)
    ) {
      return { ok: false, message: "Cleanup intent identity ids invalid." };
    }
    if (
      looksLikeUrl(value.objectId as string) ||
      (value.objectId as string).startsWith("cap_") ||
      /signature|signed|token/i.test(value.objectId as string)
    ) {
      return { ok: false, message: "Cleanup intent objectId invalid." };
    }
    if (
      typeof value.attempt !== "number" ||
      !Number.isSafeInteger(value.attempt) ||
      value.attempt < 1 ||
      value.attempt > HEADLESS_MAX_ATTEMPT
    ) {
      return { ok: false, message: "Cleanup intent attempt invalid." };
    }
    if (
      typeof value.contentDigest !== "string" ||
      !HEADLESS_CONTENT_DIGEST_RE.test(value.contentDigest)
    ) {
      return { ok: false, message: "Cleanup intent contentDigest invalid." };
    }
    if (
      typeof value.reasonId !== "string" ||
      !REASON_SET.has(value.reasonId)
    ) {
      return { ok: false, message: "Cleanup intent reasonId invalid." };
    }
    if (
      typeof value.createdAtMs !== "number" ||
      !Number.isSafeInteger(value.createdAtMs) ||
      value.createdAtMs < 0
    ) {
      return { ok: false, message: "Cleanup intent createdAtMs invalid." };
    }
    if (
      typeof value.expiresAtMs !== "number" ||
      !Number.isSafeInteger(value.expiresAtMs) ||
      value.expiresAtMs < value.createdAtMs
    ) {
      return { ok: false, message: "Cleanup intent expiresAtMs invalid." };
    }
    const locator = validateOpaqueLocator(value.storageLocator);
    if (!locator.ok) return locator;

    const intent = deepFreezeHeadlessValue({
      version: HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
      cleanupId: value.cleanupId as string,
      jobId: value.jobId,
      attempt: value.attempt,
      ownerId: value.ownerId,
      projectId: value.projectId,
      objectId: value.objectId as string,
      storageLocator: locator.locator,
      contentDigest: value.contentDigest,
      reasonId: value.reasonId as HeadlessArtifactCleanupReasonId,
      createdAtMs: value.createdAtMs,
      expiresAtMs: value.expiresAtMs,
    } satisfies HeadlessArtifactCleanupIntentV1);

    return { ok: true, intent };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}
