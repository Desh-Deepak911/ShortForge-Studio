/**
 * Compact create-job transport validation — reject unknown fields and large bodies.
 */

import {
  HEADLESS_CONTROL_PLANE_TRANSPORT_VERSION,
  HEADLESS_JOB_REQUEST_MAX_BYTES,
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
  type HeadlessCreateJobTransportV1,
} from "../types/control-plane.types";

const TRANSPORT_FIELDS = [
  "version",
  "projectId",
  "manifestObject",
  "manifestPayloadDigest",
  "assetBundleObject",
  "assetBundleFingerprint",
  "rendererProfile",
  "rendererBuildId",
  "idempotencyKey",
] as const;

const LOCATOR_FIELDS = ["kind", "storeId", "objectKey"] as const;
const PROFILE_FIELDS = ["resolution", "format", "fps", "quality"] as const;

const FORBIDDEN_BODY_KEYS = [
  "ownerId",
  "ownership",
  "manifest",
  "assetBundle",
  "requestFingerprint",
  "renderJobFingerprint",
  "dataUrl",
  "data:",
  "blob:",
  "previewUrl",
  "fullResolutionUrl",
  "signedUrl",
  "capabilityToken",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).some((k) => !allowed.includes(k));
}

function parseLocator(
  value: unknown,
  label: string,
): HeadlessControlPlaneResult<HeadlessCreateJobTransportV1["manifestObject"]> {
  if (!isPlainObject(value) || hasUnknownFields(value, LOCATOR_FIELDS)) {
    return cpFail("INVALID_TRANSPORT", `Invalid ${label} locator.`);
  }
  if (
    value.kind !== "object_storage" ||
    typeof value.storeId !== "string" ||
    typeof value.objectKey !== "string" ||
    value.storeId.length === 0 ||
    value.objectKey.length === 0 ||
    value.storeId.length > 128 ||
    value.objectKey.length > 512
  ) {
    return cpFail("INVALID_TRANSPORT", `Malformed ${label} locator.`);
  }
  return cpOk({
    kind: "object_storage",
    storeId: value.storeId,
    objectKey: value.objectKey,
  });
}

/** Reject bodies that embed media/data URL payloads. UTF-8 byte length is authority. */
export function rejectMediaPayloadInTransportBody(
  rawText: string,
): HeadlessControlPlaneResult<true> {
  const utf8Bytes = new TextEncoder().encode(rawText).byteLength;
  if (utf8Bytes > HEADLESS_JOB_REQUEST_MAX_BYTES) {
    return cpFail(
      "BODY_TOO_LARGE",
      "Job transport body exceeds compact UTF-8 byte ceiling.",
    );
  }
  const lower = rawText.toLowerCase();
  if (
    lower.includes("data:image") ||
    lower.includes("data:audio") ||
    lower.includes("data:video") ||
    lower.includes("blob:") ||
    /"previewurl"\s*:/.test(lower) ||
    /"fullresolutionurl"\s*:/.test(lower)
  ) {
    return cpFail(
      "INVALID_TRANSPORT",
      "Media/data URL payloads are forbidden in the job transport body.",
    );
  }
  return cpOk(true as const);
}

export function parseHeadlessCreateJobTransport(
  value: unknown,
): HeadlessControlPlaneResult<HeadlessCreateJobTransportV1> {
  try {
    if (!isPlainObject(value)) {
      return cpFail("INVALID_TRANSPORT", "Transport must be a plain object.");
    }
    for (const forbidden of FORBIDDEN_BODY_KEYS) {
      if (forbidden in value) {
        return cpFail(
          "UNKNOWN_FIELD",
          `Forbidden transport field: ${forbidden}.`,
        );
      }
    }
    if (hasUnknownFields(value, TRANSPORT_FIELDS)) {
      return cpFail("UNKNOWN_FIELD", "Transport has an unknown field.");
    }
    if (value.version !== HEADLESS_CONTROL_PLANE_TRANSPORT_VERSION) {
      return cpFail("INVALID_TRANSPORT", "Unsupported transport version.");
    }
    if (typeof value.projectId !== "string" || value.projectId.length === 0) {
      return cpFail("INVALID_TRANSPORT", "Invalid projectId.");
    }
    if (
      typeof value.manifestPayloadDigest !== "string" ||
      !/^sha256:[a-f0-9]{64}$/.test(value.manifestPayloadDigest)
    ) {
      return cpFail("INVALID_TRANSPORT", "Invalid manifestPayloadDigest.");
    }
    if (
      typeof value.assetBundleFingerprint !== "string" ||
      !/^hab:sha256:[a-f0-9]{64}$/.test(value.assetBundleFingerprint)
    ) {
      return cpFail("INVALID_TRANSPORT", "Invalid assetBundleFingerprint.");
    }
    if (
      typeof value.rendererBuildId !== "string" ||
      value.rendererBuildId.length === 0 ||
      value.rendererBuildId.length > 128
    ) {
      return cpFail("INVALID_TRANSPORT", "Invalid rendererBuildId.");
    }
    if (
      typeof value.idempotencyKey !== "string" ||
      value.idempotencyKey.length === 0 ||
      value.idempotencyKey.length > 128
    ) {
      return cpFail("INVALID_TRANSPORT", "Invalid idempotencyKey.");
    }

    const manifestObject = parseLocator(value.manifestObject, "manifest");
    if (!manifestObject.ok) return manifestObject;
    const assetBundleObject = parseLocator(value.assetBundleObject, "bundle");
    if (!assetBundleObject.ok) return assetBundleObject;

    if (
      !isPlainObject(value.rendererProfile) ||
      hasUnknownFields(value.rendererProfile, PROFILE_FIELDS)
    ) {
      return cpFail("INVALID_TRANSPORT", "Invalid rendererProfile.");
    }
    const profile = value.rendererProfile;
    if (
      (profile.resolution !== "720p" &&
        profile.resolution !== "1080p" &&
        profile.resolution !== "4k") ||
      (profile.format !== "webm" && profile.format !== "mp4") ||
      profile.fps !== 30 ||
      (profile.quality !== "standard" && profile.quality !== "high")
    ) {
      return cpFail("INVALID_TRANSPORT", "Malformed rendererProfile.");
    }

    return cpOk({
      version: HEADLESS_CONTROL_PLANE_TRANSPORT_VERSION,
      projectId: value.projectId,
      manifestObject: manifestObject.value,
      manifestPayloadDigest: value.manifestPayloadDigest,
      assetBundleObject: assetBundleObject.value,
      assetBundleFingerprint: value.assetBundleFingerprint,
      rendererProfile: {
        resolution: profile.resolution,
        format: profile.format,
        fps: 30,
        quality: profile.quality,
      },
      rendererBuildId: value.rendererBuildId,
      idempotencyKey: value.idempotencyKey,
    });
  } catch {
    return cpFail("HOSTILE_INPUT", "Hostile transport input rejected.");
  }
}
