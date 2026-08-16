import {
  MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
  MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT,
  MEDIA_VISUAL_SHADOW_MAX_BLUR,
  MEDIA_VISUAL_SHADOW_MAX_OFFSET,
} from "@/features/media-visual-adjustments/media-visual-adjustments.defaults";

import {
  validateExportManifestTransitionSceneMedia,
  type ExportManifestV3IntegrityResult,
} from "./assert-export-manifest-v3-scene-media";
import {
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
} from "./export-manifest.types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBounded(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validateAdjustments(
  value: unknown,
  location: string,
): ExportManifestV3IntegrityResult["issues"] {
  if (value === undefined) return [];
  if (!isObject(value)) {
    return [{ code: "INVALID_MEDIA_VISUAL_ADJUSTMENTS", message: `${location} must be an object.` }];
  }
  const issues: ExportManifestV3IntegrityResult["issues"][number][] = [];
  if (value.version !== 1) {
    issues.push({ code: "INVALID_MEDIA_VISUAL_ADJUSTMENTS", message: `${location}.version must be 1.` });
  }
  for (const key of ["brightness", "contrast", "saturation"] as const) {
    if (!isBounded(value[key], MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT, MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT)) {
      issues.push({ code: "INVALID_MEDIA_VISUAL_ADJUSTMENTS", message: `${location}.${key} is out of range.` });
    }
  }
  if (typeof value.shadowEnabled !== "boolean") {
    issues.push({ code: "INVALID_MEDIA_VISUAL_ADJUSTMENTS", message: `${location}.shadowEnabled must be boolean.` });
  }
  if (typeof value.shadowColor !== "string" || !/^#[0-9a-f]{6}$/i.test(value.shadowColor)) {
    issues.push({ code: "INVALID_MEDIA_VISUAL_ADJUSTMENTS", message: `${location}.shadowColor is invalid.` });
  }
  if (!isBounded(value.shadowOpacity, 0, 1)) {
    issues.push({ code: "INVALID_MEDIA_VISUAL_ADJUSTMENTS", message: `${location}.shadowOpacity is out of range.` });
  }
  if (!isBounded(value.shadowBlur, 0, MEDIA_VISUAL_SHADOW_MAX_BLUR)) {
    issues.push({ code: "INVALID_MEDIA_VISUAL_ADJUSTMENTS", message: `${location}.shadowBlur is out of range.` });
  }
  for (const key of ["shadowOffsetX", "shadowOffsetY"] as const) {
    if (!isBounded(value[key], -MEDIA_VISUAL_SHADOW_MAX_OFFSET, MEDIA_VISUAL_SHADOW_MAX_OFFSET)) {
      issues.push({ code: "INVALID_MEDIA_VISUAL_ADJUSTMENTS", message: `${location}.${key} is out of range.` });
    }
  }
  return issues;
}

export function validateExportManifestV4SceneMedia(
  manifest: unknown,
  contract: {
    readonly version: number;
    readonly rendererContractVersion: string;
    readonly label: string;
    readonly transitionTimingModel?: "legacy" | "centered-continuous";
  } = {
    version: EXPORT_MANIFEST_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
    label: "v4",
  },
): ExportManifestV3IntegrityResult {
  const base = validateExportManifestTransitionSceneMedia(manifest, {
    ...contract,
  });
  if (!base.ok || !isObject(manifest) || !Array.isArray(manifest.scenes)) {
    return base;
  }
  const issues = [...base.issues];
  const audio = isObject(manifest.audio) ? manifest.audio : null;
  const voiceover = audio && isObject(audio.voiceover) ? audio.voiceover : null;
  if (
    contract.version === EXPORT_MANIFEST_VERSION &&
    voiceover?.masteringProfile !== undefined
  ) {
    issues.push({
      code: "UNSUPPORTED_VOICE_MASTERING",
      message:
        "audio.voiceover.masteringProfile is capability-gated and unsupported on ExportManifest v4.",
    });
  }
  for (let sceneIndex = 0; sceneIndex < manifest.scenes.length; sceneIndex += 1) {
    const scene = manifest.scenes[sceneIndex];
    if (!isObject(scene)) continue;
    if (isObject(scene.media)) {
      issues.push(
        ...validateAdjustments(
          scene.media.visualAdjustments,
          `scenes[${sceneIndex}].media.visualAdjustments`,
        ),
      );
      if (
        contract.version === EXPORT_MANIFEST_VERSION &&
        isObject(scene.media.motion) &&
        (scene.media.motion.keyframes !== undefined ||
          scene.media.motion.keyframeSchemaVersion !== undefined)
      ) {
        issues.push({
          code: "UNSUPPORTED_MEDIA_MOTION_KEYFRAMES",
          message: `scenes[${sceneIndex}].media.motion must not include keyframes on ExportManifest v4.`,
        });
      }
      if (
        contract.version === EXPORT_MANIFEST_VERSION &&
        scene.media.visualEffect !== undefined
      ) {
        issues.push({
          code: "UNSUPPORTED_MEDIA_VISUAL_EFFECT",
          message: `scenes[${sceneIndex}].media must not include visualEffect on ExportManifest v4.`,
        });
      }
      if (
        contract.version === EXPORT_MANIFEST_VERSION &&
        scene.media.backgroundTreatment !== undefined
      ) {
        issues.push({
          code: "UNSUPPORTED_MEDIA_BACKGROUND_TREATMENT",
          message: `scenes[${sceneIndex}].media must not include backgroundTreatment on ExportManifest v4.`,
        });
      }
      if (
        contract.version === EXPORT_MANIFEST_VERSION &&
        scene.engagementOverlays !== undefined
      ) {
        issues.push({
          code: "UNSUPPORTED_ENGAGEMENT_OVERLAY",
          message: `scenes[${sceneIndex}] must not include engagementOverlays on ExportManifest v4.`,
        });
      }
    }
    const timeline = isObject(scene.mediaTimeline) ? scene.mediaTimeline : null;
    const items = Array.isArray(timeline?.items) ? timeline.items : [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      const media = isObject(item) && isObject(item.media) ? item.media : null;
      if (media) {
        issues.push(
          ...validateAdjustments(
            media.visualAdjustments,
            `scenes[${sceneIndex}].mediaTimeline.items[${itemIndex}].media.visualAdjustments`,
          ),
        );
        // v4 must never carry render-authoritative keyframes (v5 / 9E only).
        if (
          contract.version === EXPORT_MANIFEST_VERSION &&
          isObject(media.motion) &&
          (media.motion.keyframes !== undefined ||
            media.motion.keyframeSchemaVersion !== undefined)
        ) {
          issues.push({
            code: "UNSUPPORTED_MEDIA_MOTION_KEYFRAMES",
            message: `scenes[${sceneIndex}].mediaTimeline.items[${itemIndex}].media.motion must not include keyframes on ExportManifest v4.`,
          });
        }
        if (
          contract.version === EXPORT_MANIFEST_VERSION &&
          media.visualEffect !== undefined
        ) {
          issues.push({
            code: "UNSUPPORTED_MEDIA_VISUAL_EFFECT",
            message: `scenes[${sceneIndex}].mediaTimeline.items[${itemIndex}].media must not include visualEffect on ExportManifest v4.`,
          });
        }
        if (
          contract.version === EXPORT_MANIFEST_VERSION &&
          media.backgroundTreatment !== undefined
        ) {
          issues.push({
            code: "UNSUPPORTED_MEDIA_BACKGROUND_TREATMENT",
            message: `scenes[${sceneIndex}].mediaTimeline.items[${itemIndex}].media must not include backgroundTreatment on ExportManifest v4.`,
          });
        }
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

export function assertExportManifestV4SceneMedia(manifest: unknown): void {
  const result = validateExportManifestV4SceneMedia(manifest);
  if (!result.ok) {
    const first = result.issues[0]!;
    throw new Error(`ExportManifest v4 integrity failed (${first.code}): ${first.message}`);
  }
}
