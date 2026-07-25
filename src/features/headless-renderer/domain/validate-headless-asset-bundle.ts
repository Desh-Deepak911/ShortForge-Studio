/**
 * Total fail-closed HeadlessAssetBundle / descriptor validation + coverage.
 */

import type { ExportManifest } from "@/features/export/domain/headless-safe";

import {
  HEADLESS_ALLOWED_AUDIO_MIME_TYPES,
  HEADLESS_ALLOWED_IMAGE_MIME_TYPES,
  HEADLESS_ALLOWED_VIDEO_MIME_TYPES,
  HEADLESS_MAX_ASSETS,
  HEADLESS_MAX_ASSET_BYTES,
  HEADLESS_MAX_ID_LENGTH,
  HEADLESS_MAX_MIME_LENGTH,
  HEADLESS_MAX_TOTAL_ASSET_BYTES,
} from "./headless-render-constants";
import {
  HEADLESS_ASSET_DESCRIPTOR_VERSION,
  HEADLESS_ASSET_BUNDLE_VERSION,
  HEADLESS_CONTENT_DIGEST_PREFIX,
  type HeadlessAssetBundleV1,
  type HeadlessAssetDescriptorV1,
  type HeadlessIntegrityResult,
  type HeadlessMediaKind,
} from "./headless-render.types";
import { deepFreezeHeadlessValue } from "./headless-deep-freeze";
import { headlessFail, headlessIssue } from "./headless-diagnostics";
import { buildHeadlessAssetBundleFingerprint } from "./headless-fingerprints";
import {
  guardHeadlessStructure,
  hasUnknownFields,
  isPlainObject,
} from "./headless-hostile-guard";
import {
  extractRequiredHeadlessSourceSlots,
  headlessSourceSlotKey,
} from "./headless-source-coverage";
import {
  HEADLESS_CONTENT_DIGEST_RE,
  isHeadlessAuthorityFingerprint,
} from "./headless-stable-hash";

const DESCRIPTOR_FIELDS = [
  "version",
  "assetId",
  "sourceIdentity",
  "contentDigest",
  "byteLength",
  "mimeType",
  "mediaKind",
  "storageLocator",
  "expiresAtMs",
] as const;

const SOURCE_IDENTITY_FIELDS = [
  "role",
  "sceneId",
  "mediaItemId",
  "sourceDigest",
  "classification",
] as const;

const STORAGE_FIELDS = ["kind", "storeId", "objectKey"] as const;

const BUNDLE_FIELDS = ["version", "bundleId", "assets", "fingerprint"] as const;

function isNonEmptyId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= HEADLESS_MAX_ID_LENGTH &&
    value === value.trim()
  );
}

function mimeAllowedForKind(mime: string, kind: HeadlessMediaKind): boolean {
  if (kind === "image") {
    return (HEADLESS_ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
  }
  if (kind === "video") {
    return (HEADLESS_ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(mime);
  }
  return (HEADLESS_ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);
}

function validateDescriptor(
  value: unknown,
  index: number,
):
  | { ok: true; asset: HeadlessAssetDescriptorV1 }
  | { ok: false; issues: HeadlessIntegrityResult["issues"] } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Asset at index ${index} must be a plain object.`,
        ),
      ],
    };
  }

  const unknown = hasUnknownFields(value, DESCRIPTOR_FIELDS);
  if (unknown) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "UNKNOWN_FIELD",
          `Asset descriptor has unknown field (${index}).`,
        ),
      ],
    };
  }

  if (value.version !== HEADLESS_ASSET_DESCRIPTOR_VERSION) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Unsupported asset descriptor version at index ${index}.`,
        ),
      ],
    };
  }

  if (!isNonEmptyId(value.assetId)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Invalid assetId at index ${index}.`,
        ),
      ],
    };
  }

  if (!isPlainObject(value.sourceIdentity)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Invalid sourceIdentity at index ${index}.`,
        ),
      ],
    };
  }

  const siUnknown = hasUnknownFields(value.sourceIdentity, SOURCE_IDENTITY_FIELDS);
  if (siUnknown) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "UNKNOWN_FIELD",
          `sourceIdentity has unknown field at index ${index}.`,
        ),
      ],
    };
  }

  const role = value.sourceIdentity.role;
  if (role !== "scene_media" && role !== "voiceover" && role !== "music") {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Invalid source role at index ${index}.`,
        ),
      ],
    };
  }

  const sceneId = value.sourceIdentity.sceneId;
  const mediaItemId = value.sourceIdentity.mediaItemId;
  if (role === "scene_media") {
    if (!isNonEmptyId(sceneId) || !isNonEmptyId(mediaItemId)) {
      return {
        ok: false,
        issues: [
          headlessIssue(
            "INVALID_ASSET_DESCRIPTOR",
            `scene_media binding requires sceneId and mediaItemId (${index}).`,
          ),
        ],
      };
    }
  } else if (sceneId !== null || mediaItemId !== null) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Audio binding must use null scene/media ids (${index}).`,
        ),
      ],
    };
  }

  const sourceDigest = value.sourceIdentity.sourceDigest;
  if (!isHeadlessAuthorityFingerprint(sourceDigest, "hsrc")) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_DIGEST",
          `sourceDigest must be hsrc:sha256:<64 hex> (${index}).`,
        ),
      ],
    };
  }

  const classification = value.sourceIdentity.classification;
  if (
    classification !== "blob" &&
    classification !== "data" &&
    classification !== "http" &&
    classification !== "https" &&
    classification !== "local" &&
    classification !== "other"
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Invalid source classification at index ${index}.`,
        ),
      ],
    };
  }

  const contentDigest = value.contentDigest;
  if (
    typeof contentDigest !== "string" ||
    !HEADLESS_CONTENT_DIGEST_RE.test(contentDigest)
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_DIGEST",
          `contentDigest must be ${HEADLESS_CONTENT_DIGEST_PREFIX}<64 hex> (${index}).`,
        ),
      ],
    };
  }

  const byteLength = value.byteLength;
  if (
    typeof byteLength !== "number" ||
    !Number.isInteger(byteLength) ||
    byteLength < 1 ||
    byteLength > HEADLESS_MAX_ASSET_BYTES
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "ASSET_LIMIT_EXCEEDED",
          `byteLength out of bounds at index ${index}.`,
        ),
      ],
    };
  }

  const mimeType = value.mimeType;
  if (
    typeof mimeType !== "string" ||
    mimeType.trim() !== mimeType ||
    mimeType.length < 3 ||
    mimeType.length > HEADLESS_MAX_MIME_LENGTH ||
    !/^[a-z0-9]+\/[a-z0-9.+-]+$/i.test(mimeType)
  ) {
    return {
      ok: false,
      issues: [headlessIssue("INVALID_MIME", `Invalid mimeType at index ${index}.`)],
    };
  }

  const mediaKind = value.mediaKind;
  if (mediaKind !== "image" && mediaKind !== "video" && mediaKind !== "audio") {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Invalid mediaKind at index ${index}.`,
        ),
      ],
    };
  }

  if (!mimeAllowedForKind(mimeType.toLowerCase(), mediaKind)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_MIME",
          `MIME not allowed for mediaKind at index ${index}.`,
        ),
      ],
    };
  }

  if (role === "scene_media" && mediaKind === "audio") {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "ASSET_COVERAGE_CONFLICT",
          `scene_media cannot be audio (${index}).`,
        ),
      ],
    };
  }
  if ((role === "voiceover" || role === "music") && mediaKind !== "audio") {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "ASSET_COVERAGE_CONFLICT",
          `Audio role requires audio mediaKind (${index}).`,
        ),
      ],
    };
  }

  if (!isPlainObject(value.storageLocator)) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Invalid storageLocator at index ${index}.`,
        ),
      ],
    };
  }
  const locUnknown = hasUnknownFields(value.storageLocator, STORAGE_FIELDS);
  if (locUnknown) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "UNKNOWN_FIELD",
          `storageLocator has unknown field at index ${index}.`,
        ),
      ],
    };
  }
  if (value.storageLocator.kind !== "object_storage") {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `storageLocator.kind must be object_storage (${index}).`,
        ),
      ],
    };
  }
  if (
    !isNonEmptyId(value.storageLocator.storeId) ||
    !isNonEmptyId(value.storageLocator.objectKey)
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Invalid storage locator ids at index ${index}.`,
        ),
      ],
    };
  }
  // Reject locator values that look like raw fetch URLs
  const storeId = value.storageLocator.storeId;
  const objectKey = value.storageLocator.objectKey;
  if (
    /^(?:blob:|data:|https?:)/i.test(storeId) ||
    /^(?:blob:|data:|https?:)/i.test(objectKey)
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `storageLocator must not be a raw URL (${index}).`,
        ),
      ],
    };
  }

  const expiresAtMs = value.expiresAtMs;
  if (
    typeof expiresAtMs !== "number" ||
    !Number.isFinite(expiresAtMs) ||
    !Number.isSafeInteger(expiresAtMs) ||
    expiresAtMs < 0
  ) {
    return {
      ok: false,
      issues: [
        headlessIssue(
          "INVALID_ASSET_DESCRIPTOR",
          `Invalid expiresAtMs at index ${index}.`,
        ),
      ],
    };
  }

  const asset: HeadlessAssetDescriptorV1 = {
    version: HEADLESS_ASSET_DESCRIPTOR_VERSION,
    assetId: value.assetId,
    sourceIdentity: {
      role,
      sceneId: role === "scene_media" ? (sceneId as string) : null,
      mediaItemId: role === "scene_media" ? (mediaItemId as string) : null,
      sourceDigest,
      classification,
    },
    contentDigest,
    byteLength,
    mimeType: mimeType.toLowerCase(),
    mediaKind,
    storageLocator: {
      kind: "object_storage",
      storeId,
      objectKey,
    },
    expiresAtMs,
  };

  return { ok: true, asset };
}

export interface ValidateHeadlessAssetBundleSuccess {
  readonly ok: true;
  readonly issues: readonly [];
  readonly bundle: HeadlessAssetBundleV1;
}

export type ValidateHeadlessAssetBundleResult =
  | ValidateHeadlessAssetBundleSuccess
  | { readonly ok: false; readonly issues: HeadlessIntegrityResult["issues"] };

/**
 * Validate bundle shape + exact coverage against a coherent ExportManifest.
 */
export function validateHeadlessAssetBundle(
  value: unknown,
  manifest: ExportManifest,
): ValidateHeadlessAssetBundleResult {
  try {
    const hostile = guardHeadlessStructure(value);
    if (hostile) return hostile;

    if (!isPlainObject(value)) {
      return headlessFail(
        headlessIssue("INVALID_ASSET_BUNDLE", "Asset bundle must be a plain object."),
      );
    }

    const unknown = hasUnknownFields(value, BUNDLE_FIELDS);
    if (unknown) {
      return headlessFail(
        headlessIssue("UNKNOWN_FIELD", "Asset bundle has an unknown field."),
      );
    }

    if (value.version !== HEADLESS_ASSET_BUNDLE_VERSION) {
      return headlessFail(
        headlessIssue("INVALID_ASSET_BUNDLE", "Unsupported asset bundle version."),
      );
    }

    if (!isNonEmptyId(value.bundleId)) {
      return headlessFail(
        headlessIssue("INVALID_ASSET_BUNDLE", "Invalid bundleId."),
      );
    }

    if (!Array.isArray(value.assets)) {
      return headlessFail(
        headlessIssue("INVALID_ASSET_BUNDLE", "assets must be an array."),
      );
    }

    if (value.assets.length > HEADLESS_MAX_ASSETS) {
      return headlessFail(
        headlessIssue("ASSET_LIMIT_EXCEEDED", "Too many assets in bundle."),
      );
    }

    const assets: HeadlessAssetDescriptorV1[] = [];
    const assetIds = new Set<string>();
    const bindingKeys = new Set<string>();
    let totalBytes = 0;

    for (let i = 0; i < value.assets.length; i++) {
      const parsed = validateDescriptor(value.assets[i], i);
      if (!parsed.ok) {
        return { ok: false, issues: parsed.issues };
      }
      if (assetIds.has(parsed.asset.assetId)) {
        return headlessFail(
          headlessIssue(
            "ASSET_COVERAGE_DUPLICATE",
            "Duplicate assetId in bundle.",
          ),
        );
      }
      assetIds.add(parsed.asset.assetId);

      const key = headlessSourceSlotKey(parsed.asset.sourceIdentity);
      if (bindingKeys.has(key)) {
        return headlessFail(
          headlessIssue(
            "ASSET_COVERAGE_DUPLICATE",
            "Duplicate source binding in bundle.",
          ),
        );
      }
      bindingKeys.add(key);

      totalBytes += parsed.asset.byteLength;
      if (totalBytes > HEADLESS_MAX_TOTAL_ASSET_BYTES) {
        return headlessFail(
          headlessIssue("ASSET_LIMIT_EXCEEDED", "Total asset bytes exceed ceiling."),
        );
      }
      assets.push(parsed.asset);
    }

    const required = extractRequiredHeadlessSourceSlots(manifest);
    const requiredKeys = new Map(
      required.map((slot) => [headlessSourceSlotKey(slot), slot]),
    );

    for (const slot of required) {
      const key = headlessSourceSlotKey(slot);
      if (!bindingKeys.has(key)) {
        return headlessFail(
          headlessIssue(
            "ASSET_COVERAGE_INCOMPLETE",
            "Required manifest source has no asset binding.",
          ),
        );
      }
    }

    for (const asset of assets) {
      const key = headlessSourceSlotKey(asset.sourceIdentity);
      const slot = requiredKeys.get(key);
      if (!slot) {
        return headlessFail(
          headlessIssue(
            "ASSET_COVERAGE_EXTRA",
            "Asset binding does not match a required manifest source.",
          ),
        );
      }
      if (asset.mediaKind !== slot.expectedMediaKind) {
        return headlessFail(
          headlessIssue(
            "ASSET_COVERAGE_CONFLICT",
            "Asset mediaKind conflicts with manifest source kind.",
          ),
        );
      }
      if (asset.sourceIdentity.classification !== slot.classification) {
        return headlessFail(
          headlessIssue(
            "ASSET_COVERAGE_CONFLICT",
            "Asset source classification conflicts with manifest source.",
          ),
        );
      }
    }

    if (assets.length !== required.length) {
      return headlessFail(
        headlessIssue(
          "ASSET_COVERAGE_CONFLICT",
          "Asset binding count does not match required source count.",
        ),
      );
    }

    const fingerprintResult = buildHeadlessAssetBundleFingerprint(
      value.bundleId,
      assets,
    );
    if (!fingerprintResult.ok) return fingerprintResult;
    if (
      typeof value.fingerprint !== "string" ||
      value.fingerprint !== fingerprintResult.fingerprint
    ) {
      return headlessFail(
        headlessIssue(
          "INVALID_ASSET_BUNDLE",
          "Asset bundle fingerprint mismatch.",
        ),
      );
    }

    const bundle = deepFreezeHeadlessValue({
      version: HEADLESS_ASSET_BUNDLE_VERSION,
      bundleId: value.bundleId,
      assets,
      fingerprint: fingerprintResult.fingerprint,
    } satisfies HeadlessAssetBundleV1);

    return { ok: true, issues: [], bundle };
  } catch {
    return headlessFail(
      headlessIssue("HOSTILE_INPUT", "Hostile asset bundle input rejected."),
    );
  }
}

/**
 * Validate assets + coverage against manifest + attach coherent fingerprint.
 * Never manufactures authority by fingerprint attachment alone.
 */
export function finalizeHeadlessAssetBundle(input: {
  bundleId: string;
  assets: readonly HeadlessAssetDescriptorV1[];
  manifest: ExportManifest;
}): ValidateHeadlessAssetBundleResult {
  const fingerprintResult = buildHeadlessAssetBundleFingerprint(
    input.bundleId,
    input.assets,
  );
  if (!fingerprintResult.ok) return fingerprintResult;
  return validateHeadlessAssetBundle(
    {
      version: HEADLESS_ASSET_BUNDLE_VERSION,
      bundleId: input.bundleId,
      assets: input.assets,
      fingerprint: fingerprintResult.fingerprint,
    },
    input.manifest,
  );
}
