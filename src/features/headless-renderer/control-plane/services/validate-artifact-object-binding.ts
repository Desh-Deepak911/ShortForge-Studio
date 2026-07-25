/**
 * Exact-key, total, fail-closed validator for private artifact-object bindings.
 * Detaches and deep-freezes the canonical result. Never throws on hostile input.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { isNonEmptyId } from "../../domain/headless-field-validators";
import {
  HEADLESS_MAX_ATTEMPT,
  HEADLESS_MAX_ID_LENGTH,
  HEADLESS_MAX_MIME_LENGTH,
  HEADLESS_MAX_OBJECT_KEY_LENGTH,
} from "../../domain/headless-render-constants";
import {
  guardHeadlessStructure,
  hasOwnPlainField,
  hasUnknownFields,
  isPlainObject,
} from "../../domain/headless-hostile-guard";
import {
  HEADLESS_CONTENT_DIGEST_RE,
  isHeadlessAuthorityFingerprint,
} from "../../domain/headless-stable-hash";
import type {
  HeadlessRenderArtifactV1,
  HeadlessRenderJobRequestV1,
  HeadlessRenderJobV1,
  HeadlessStorageLocatorIdentity,
} from "../../domain/headless-render.types";
import type { HeadlessObjectMetadata } from "../ports/storage.port";
import { evaluateArtifactObjectBindingCoherence } from "./evaluate-artifact-object-binding-coherence";
import {
  HEADLESS_ARTIFACT_OBJECT_BINDING_FIELDS,
  HEADLESS_ARTIFACT_OBJECT_BINDING_VERSION,
  type HeadlessArtifactObjectBindingV1,
} from "../types/artifact-object-binding";

const LOCATOR_FIELDS = Object.freeze(["kind", "storeId", "objectKey"] as const);

const SAFE_FAIL = "Hostile or unreadable input rejected." as const;

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
    value.length <= HEADLESS_MAX_OBJECT_KEY_LENGTH &&
    value === value.trim() &&
    !/\s/.test(value) &&
    !value.includes("..") &&
    !value.startsWith("/") &&
    !value.endsWith("/")
  );
}

/** Privacy-safe locator schema check aligned with validateOpaqueLocator. */
export function classifyStorageLocatorSchemaField(
  locator: HeadlessStorageLocatorIdentity,
): "match" | "invalid" {
  return validateOpaqueLocator(locator).ok ? "match" : "invalid";
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

export function validateHeadlessArtifactObjectBinding(
  value: unknown,
):
  | { readonly ok: true; readonly binding: HeadlessArtifactObjectBindingV1 }
  | { readonly ok: false; readonly message: string } {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) {
      return { ok: false, message: SAFE_FAIL };
    }
    if (!isPlainObject(value)) {
      return { ok: false, message: "Binding must be a plain object." };
    }
    if (hasUnknownFields(value, HEADLESS_ARTIFACT_OBJECT_BINDING_FIELDS)) {
      return { ok: false, message: "Binding has unknown fields." };
    }
    for (const key of HEADLESS_ARTIFACT_OBJECT_BINDING_FIELDS) {
      if (!hasOwnPlainField(value, key)) {
        return { ok: false, message: "Binding missing required field." };
      }
    }
    if (value.version !== HEADLESS_ARTIFACT_OBJECT_BINDING_VERSION) {
      return { ok: false, message: "Unsupported binding version." };
    }
    if (
      !boundedId(value.jobId) ||
      !boundedId(value.ownerId) ||
      !boundedId(value.projectId)
    ) {
      return { ok: false, message: "Binding identity ids invalid." };
    }
    if (
      typeof value.attempt !== "number" ||
      !Number.isSafeInteger(value.attempt) ||
      value.attempt < 1 ||
      value.attempt > HEADLESS_MAX_ATTEMPT
    ) {
      return { ok: false, message: "Binding attempt invalid." };
    }
    if (
      typeof value.contentDigest !== "string" ||
      value.contentDigest.length > HEADLESS_MAX_ID_LENGTH + 16 ||
      !HEADLESS_CONTENT_DIGEST_RE.test(value.contentDigest)
    ) {
      return { ok: false, message: "Binding contentDigest invalid." };
    }
    if (
      typeof value.byteLength !== "number" ||
      !Number.isSafeInteger(value.byteLength) ||
      value.byteLength < 1
    ) {
      return { ok: false, message: "Binding byteLength invalid." };
    }
    if (
      typeof value.mimeType !== "string" ||
      value.mimeType.length < 3 ||
      value.mimeType.length > HEADLESS_MAX_MIME_LENGTH
    ) {
      return { ok: false, message: "Binding mimeType invalid." };
    }
    if (
      typeof value.artifactFingerprint !== "string" ||
      value.artifactFingerprint.length > HEADLESS_MAX_ID_LENGTH + 32 ||
      !isHeadlessAuthorityFingerprint(value.artifactFingerprint, "hra")
    ) {
      return { ok: false, message: "Binding artifactFingerprint invalid." };
    }
    if (
      typeof value.requestFingerprint !== "string" ||
      value.requestFingerprint.length > HEADLESS_MAX_ID_LENGTH + 32 ||
      !isHeadlessAuthorityFingerprint(value.requestFingerprint, "hrr")
    ) {
      return { ok: false, message: "Binding requestFingerprint invalid." };
    }
    if (
      typeof value.expiresAtMs !== "number" ||
      !Number.isSafeInteger(value.expiresAtMs) ||
      value.expiresAtMs < 0
    ) {
      return { ok: false, message: "Binding expiresAtMs invalid." };
    }
    const locator = validateOpaqueLocator(value.storageLocator);
    if (!locator.ok) return locator;

    const binding = deepFreezeHeadlessValue({
      version: HEADLESS_ARTIFACT_OBJECT_BINDING_VERSION,
      jobId: value.jobId,
      attempt: value.attempt,
      ownerId: value.ownerId,
      projectId: value.projectId,
      storageLocator: locator.locator,
      contentDigest: value.contentDigest,
      byteLength: value.byteLength,
      mimeType: value.mimeType,
      artifactFingerprint: value.artifactFingerprint,
      requestFingerprint: value.requestFingerprint,
      expiresAtMs: value.expiresAtMs,
    } satisfies HeadlessArtifactObjectBindingV1);

    return { ok: true, binding };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

/**
 * Coherence: binding ↔ succeeded job ↔ request ↔ public artifact
 * (+ optional finalized storage metadata). Recomputed from canonical inputs.
 */
export function assertArtifactObjectBindingCoherence(input: {
  binding: HeadlessArtifactObjectBindingV1;
  job: HeadlessRenderJobV1;
  request: HeadlessRenderJobRequestV1;
  artifact: HeadlessRenderArtifactV1;
  finalized?: HeadlessObjectMetadata | null;
  nowMs?: number;
}): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  try {
    const bindingCheck = validateHeadlessArtifactObjectBinding(input.binding);
    if (!bindingCheck.ok) return bindingCheck;
    const binding = bindingCheck.binding;
    const { job, request, artifact } = input;
    if (job.state !== "succeeded" || job.artifact == null) {
      return { ok: false, message: "Binding requires succeeded job with artifact." };
    }
    if (binding.jobId !== job.jobId) {
      return { ok: false, message: "Binding jobId mismatch." };
    }
    if (binding.attempt !== job.attempt) {
      return { ok: false, message: "Binding attempt mismatch." };
    }
    if (
      binding.ownerId !== job.ownership.ownerId ||
      binding.ownerId !== request.ownership.ownerId
    ) {
      return { ok: false, message: "Binding owner mismatch." };
    }
    if (
      binding.projectId !== job.ownership.projectId ||
      binding.projectId !== request.ownership.projectId
    ) {
      return { ok: false, message: "Binding project mismatch." };
    }
    if (
      binding.contentDigest !== artifact.contentDigest ||
      binding.contentDigest !== job.artifact.contentDigest
    ) {
      return { ok: false, message: "Binding digest mismatch." };
    }
    if (
      binding.byteLength !== artifact.byteLength ||
      binding.byteLength !== job.artifact.byteLength
    ) {
      return { ok: false, message: "Binding byteLength mismatch." };
    }
    if (
      binding.mimeType !== artifact.mimeType ||
      binding.mimeType !== job.artifact.mimeType
    ) {
      return { ok: false, message: "Binding mimeType mismatch." };
    }
    if (
      binding.artifactFingerprint !== artifact.fingerprint ||
      binding.artifactFingerprint !== job.artifact.fingerprint
    ) {
      return { ok: false, message: "Binding artifactFingerprint mismatch." };
    }
    if (
      binding.requestFingerprint !== request.requestFingerprint ||
      binding.requestFingerprint !== job.requestFingerprint
    ) {
      return { ok: false, message: "Binding requestFingerprint mismatch." };
    }
    if (
      binding.expiresAtMs !== artifact.expiresAtMs ||
      binding.expiresAtMs !== job.artifact.expiresAtMs
    ) {
      return { ok: false, message: "Binding expiresAtMs mismatch." };
    }
    if (input.nowMs != null && binding.expiresAtMs < input.nowMs) {
      return { ok: false, message: "Binding expired." };
    }

    if (input.finalized) {
      const meta = input.finalized;
      if (!meta.finalized) {
        return { ok: false, message: "Storage object not finalized." };
      }
      if (meta.purpose !== "artifact") {
        return { ok: false, message: "Storage purpose must be artifact." };
      }
      if (meta.ownerId !== binding.ownerId || meta.projectId !== binding.projectId) {
        return { ok: false, message: "Finalized ownership mismatch." };
      }
      if (
        meta.locator.kind !== binding.storageLocator.kind ||
        meta.locator.storeId !== binding.storageLocator.storeId ||
        meta.locator.objectKey !== binding.storageLocator.objectKey
      ) {
        return { ok: false, message: "Finalized locator mismatch." };
      }
      if (
        meta.contentDigest !== binding.contentDigest ||
        meta.byteLength !== binding.byteLength ||
        meta.mimeType !== binding.mimeType
      ) {
        return { ok: false, message: "Finalized metadata mismatch." };
      }
      if (meta.expiresAtMs !== binding.expiresAtMs) {
        return { ok: false, message: "Finalized expiry mismatch." };
      }
    }

    return { ok: true };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

export function buildValidatedArtifactObjectBinding(input: {
  job: HeadlessRenderJobV1;
  request: HeadlessRenderJobRequestV1;
  artifact: HeadlessRenderArtifactV1;
  finalized: HeadlessObjectMetadata;
  nowMs?: number;
  storeVersion?: number | null;
}):
  | { readonly ok: true; readonly binding: HeadlessArtifactObjectBindingV1 }
  | { readonly ok: false; readonly message: string } {
  try {
    const evaluated = evaluateArtifactObjectBindingCoherence(input);
    if (!evaluated.ok) {
      return { ok: false, message: evaluated.message };
    }
    return { ok: true, binding: evaluated.binding };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}

/** Store-side rule: binding presence must match job state. */
export function assertStoredBindingStateRules(input: {
  job: HeadlessRenderJobV1;
  request: HeadlessRenderJobRequestV1;
  binding: HeadlessArtifactObjectBindingV1 | null | undefined;
}):
  | { readonly ok: true; readonly binding: HeadlessArtifactObjectBindingV1 | null }
  | { readonly ok: false; readonly message: string } {
  try {
    if (input.job.state === "succeeded") {
      if (input.binding == null) {
        return {
          ok: false,
          message: "Succeeded job requires artifact-object binding.",
        };
      }
      if (input.job.artifact == null) {
        return { ok: false, message: "Succeeded job requires public artifact." };
      }
      const validated = validateHeadlessArtifactObjectBinding(input.binding);
      if (!validated.ok) return validated;
      const coherent = assertArtifactObjectBindingCoherence({
        binding: validated.binding,
        job: input.job,
        request: input.request,
        artifact: input.job.artifact,
      });
      if (!coherent.ok) return coherent;
      return { ok: true, binding: validated.binding };
    }
    if (input.binding != null) {
      return {
        ok: false,
        message: "Non-succeeded job cannot carry artifact-object binding.",
      };
    }
    return { ok: true, binding: null };
  } catch {
    return { ok: false, message: SAFE_FAIL };
  }
}
