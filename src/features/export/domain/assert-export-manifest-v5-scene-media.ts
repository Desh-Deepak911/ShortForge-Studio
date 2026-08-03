import {
  MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
  MEDIA_MOTION_KEYFRAME_MAX_OPACITY,
  MEDIA_MOTION_KEYFRAME_MAX_SCALE,
  MEDIA_MOTION_KEYFRAME_MIN_OPACITY,
  MEDIA_MOTION_KEYFRAME_MIN_SCALE,
} from "@/features/media-motion/domain/media-motion-keyframes";
import {
  MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
  MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT,
} from "@/features/media-visual-adjustments/media-visual-adjustments.defaults";

import type { ExportManifestV3IntegrityResult } from "./assert-export-manifest-v3-scene-media";
import { validateExportManifestV4SceneMedia } from "./assert-export-manifest-v4-scene-media";
import {
  EXPORT_MANIFEST_V5_VERSION,
  EXPORT_MEDIA_MOTION_KEYFRAME_SCHEMA_VERSION,
  EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
  EXPORT_RENDERER_CONTRACT_V5,
} from "./export-manifest.types";

const SUPPORTED_EASINGS = new Set([
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
]);

const SUPPORTED_EFFECT_PRESETS = new Set(["vivid", "cinematic", "monochrome"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function validateVisualEffect(
  value: unknown,
  location: string,
): { ok: boolean; issues: ExportManifestV3IntegrityResult["issues"][number][] } {
  if (value === undefined) {
    return { ok: false, issues: [] };
  }
  if (!isObject(value)) {
    return {
      ok: false,
      issues: [{
        code: "INVALID_MEDIA_VISUAL_EFFECT",
        message: `${location} must be an object.`,
      }],
    };
  }
  const issues: ExportManifestV3IntegrityResult["issues"][number][] = [];
  if (value.version !== 1) {
    issues.push({
      code: "INVALID_MEDIA_VISUAL_EFFECT",
      message: `${location}.version must be 1.`,
    });
  }
  if (typeof value.presetId !== "string" || !SUPPORTED_EFFECT_PRESETS.has(value.presetId)) {
    issues.push({
      code: "INVALID_MEDIA_VISUAL_EFFECT",
      message: `${location}.presetId is unknown.`,
    });
  }
  if (!isFiniteNumber(value.intensity) || !(value.intensity > 0) || value.intensity > 1) {
    issues.push({
      code: "INVALID_MEDIA_VISUAL_EFFECT",
      message: `${location}.intensity must be in (0, 1].`,
    });
  }
  for (const key of ["brightness", "contrast", "saturation"] as const) {
    if (
      !isFiniteNumber(value[key]) ||
      !isInRange(
        value[key],
        MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT,
        MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
      )
    ) {
      issues.push({
        code: "INVALID_MEDIA_VISUAL_EFFECT",
        message: `${location}.${key} is out of range.`,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateExportManifestV5SceneMedia(
  manifest: unknown,
): ExportManifestV3IntegrityResult {
  const base = validateExportManifestV4SceneMedia(manifest, {
    version: EXPORT_MANIFEST_V5_VERSION,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_V5,
    label: "v5",
  });
  if (!isObject(manifest) || !Array.isArray(manifest.scenes)) return base;

  const issues = [...base.issues];
  if (
    !Array.isArray(manifest.requiredCapabilities) ||
    !manifest.requiredCapabilities.includes(
      EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
    )
  ) {
    issues.push({
      code: "MISSING_REQUIRED_CAPABILITY",
      message: "ExportManifest v5 must require keyframed-visual-effects-v1.",
    });
  }

  let authoritativeKeyframeItems = 0;
  let authoritativeEffectItems = 0;

  for (let sceneIndex = 0; sceneIndex < manifest.scenes.length; sceneIndex += 1) {
    const timeline = isObject(manifest.scenes[sceneIndex]) &&
      isObject(manifest.scenes[sceneIndex].mediaTimeline)
      ? manifest.scenes[sceneIndex].mediaTimeline
      : null;
    const items = Array.isArray(timeline?.items) ? timeline.items : [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const media = isObject(items[itemIndex]) && isObject(items[itemIndex].media)
        ? items[itemIndex].media
        : null;
      if (!media) continue;

      const effectLocation =
        `scenes[${sceneIndex}].mediaTimeline.items[${itemIndex}].media.visualEffect`;
      if (media.visualEffect !== undefined) {
        const effectResult = validateVisualEffect(media.visualEffect, effectLocation);
        issues.push(...effectResult.issues);
        if (effectResult.ok) {
          authoritativeEffectItems += 1;
        }
      }

      const motion = isObject(media.motion) ? media.motion : null;
      if (!motion) continue;

      const location = `scenes[${sceneIndex}].mediaTimeline.items[${itemIndex}].media.motion`;
      const hasKeyframes = motion.keyframes !== undefined;
      const hasSchema = motion.keyframeSchemaVersion !== undefined;

      if (!hasKeyframes && !hasSchema) {
        // Ordinary legacy-motion item inside a mixed v5 scene — allowed.
        continue;
      }

      if (motion.enabled !== true) {
        issues.push({
          code: "INVALID_MEDIA_MOTION_KEYFRAMES",
          message: `${location} keyframes require motion.enabled === true.`,
        });
        continue;
      }

      if (motion.keyframeSchemaVersion !== EXPORT_MEDIA_MOTION_KEYFRAME_SCHEMA_VERSION) {
        issues.push({
          code: "INVALID_MEDIA_MOTION_KEYFRAMES",
          message: `${location}.keyframeSchemaVersion must be ${EXPORT_MEDIA_MOTION_KEYFRAME_SCHEMA_VERSION}.`,
        });
      }

      if (!Array.isArray(motion.keyframes)) {
        issues.push({
          code: "INVALID_MEDIA_MOTION_KEYFRAMES",
          message: `${location}.keyframes must be an array.`,
        });
        continue;
      }

      if (motion.keyframes.length < 2) {
        issues.push({
          code: "INVALID_MEDIA_MOTION_KEYFRAMES",
          message: `${location}.keyframes must contain at least two frames.`,
        });
        continue;
      }

      let previousOffset = Number.NEGATIVE_INFINITY;
      let framesOk = true;
      for (let frameIndex = 0; frameIndex < motion.keyframes.length; frameIndex += 1) {
        const frame = motion.keyframes[frameIndex];
        const frameLoc = `${location}.keyframes[${frameIndex}]`;
        if (!isObject(frame)) {
          issues.push({
            code: "INVALID_MEDIA_MOTION_KEYFRAMES",
            message: `${frameLoc} must be an object.`,
          });
          framesOk = false;
          break;
        }
        const offsetMs = frame.offsetMs;
        const x = frame.x;
        const y = frame.y;
        const scale = frame.scale;
        const rotation = frame.rotation;
        const opacity = frame.opacity;
        const easing = frame.easing;
        if (
          !isFiniteNumber(offsetMs) ||
          !isFiniteNumber(x) ||
          !isFiniteNumber(y) ||
          !isFiniteNumber(scale) ||
          !isFiniteNumber(rotation) ||
          !isFiniteNumber(opacity) ||
          typeof easing !== "string"
        ) {
          issues.push({
            code: "INVALID_MEDIA_MOTION_KEYFRAMES",
            message: `${frameLoc} must contain finite normalized fields.`,
          });
          framesOk = false;
          break;
        }
        if (!SUPPORTED_EASINGS.has(easing)) {
          issues.push({
            code: "INVALID_MEDIA_MOTION_KEYFRAMES",
            message: `${frameLoc}.easing is unsupported.`,
          });
          framesOk = false;
          break;
        }
        if (
          !isInRange(x, -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X, MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X) ||
          !isInRange(y, -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y, MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y) ||
          !isInRange(scale, MEDIA_MOTION_KEYFRAME_MIN_SCALE, MEDIA_MOTION_KEYFRAME_MAX_SCALE) ||
          !isInRange(rotation, -MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG, MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG) ||
          !isInRange(opacity, MEDIA_MOTION_KEYFRAME_MIN_OPACITY, MEDIA_MOTION_KEYFRAME_MAX_OPACITY) ||
          offsetMs < 0
        ) {
          issues.push({
            code: "INVALID_MEDIA_MOTION_KEYFRAMES",
            message: `${frameLoc} is out of the reference-frame contract.`,
          });
          framesOk = false;
          break;
        }
        if (!(offsetMs > previousOffset)) {
          issues.push({
            code: "INVALID_MEDIA_MOTION_KEYFRAMES",
            message: `${location}.keyframes offsets must be strictly monotonic after dedupe.`,
          });
          framesOk = false;
          break;
        }
        previousOffset = offsetMs;
      }

      if (framesOk) {
        authoritativeKeyframeItems += 1;
      }
    }
  }

  if (
    Array.isArray(manifest.requiredCapabilities) &&
    manifest.requiredCapabilities.includes(
      EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
    ) &&
    authoritativeKeyframeItems + authoritativeEffectItems < 1
  ) {
    issues.push({
      code: "MISSING_AUTHORITATIVE_ENHANCEMENT",
      message:
        "ExportManifest v5 requires at least one media item with authoritative keyframes or an active visual effect.",
    });
  }

  return { ok: issues.length === 0, issues };
}

export function assertExportManifestV5SceneMedia(manifest: unknown): void {
  const result = validateExportManifestV5SceneMedia(manifest);
  if (!result.ok) {
    const first = result.issues[0]!;
    throw new Error(`ExportManifest v5 integrity failed (${first.code}): ${first.message}`);
  }
}
