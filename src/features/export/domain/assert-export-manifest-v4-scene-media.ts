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
): ExportManifestV3IntegrityResult {
  const base = validateExportManifestTransitionSceneMedia(manifest, {
    version: EXPORT_MANIFEST_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
    label: "v4",
  });
  if (!base.ok || !isObject(manifest) || !Array.isArray(manifest.scenes)) {
    return base;
  }
  const issues = [...base.issues];
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
