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
  EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS,
  EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
  EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
  EXPORT_RENDERER_CAPABILITY_SHORTFORGE_BRAND_STING,
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
  const required = Array.isArray(manifest.requiredCapabilities)
    ? manifest.requiredCapabilities
    : [];
  const requiresKeyframed = required.includes(
    EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
  );
  const requiresEngagement = required.includes(
    EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS,
  );
  const requiresBrandSting = required.includes(
    EXPORT_RENDERER_CAPABILITY_SHORTFORGE_BRAND_STING,
  );
  const requiresBlurredFillBackground = required.includes(
    EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
  );
  if (
    required.length < 1 ||
    (!requiresKeyframed &&
      !requiresEngagement &&
      !requiresBrandSting &&
      !requiresBlurredFillBackground)
  ) {
    issues.push({
      code: "MISSING_REQUIRED_CAPABILITY",
      message:
        "ExportManifest v5 must require keyframed-visual-effects-v1, engagement-overlays-v1, shortforge-brand-sting-v1, and/or media-background-treatment-blurred-fill-v1.",
    });
  }

  let authoritativeKeyframeItems = 0;
  let authoritativeEffectItems = 0;
  let authoritativeEngagementScenes = 0;
  let authoritativeBrandSting = 0;
  let authoritativeBlurredFillItems = 0;
  const sceneIds = new Set<string>();

  if (manifest.brandSting !== undefined) {
    if (!requiresBrandSting) {
      issues.push({
        code: "UNSUPPORTED_BRAND_STING",
        message: "brandSting requires shortforge-brand-sting-v1.",
      });
    } else if (!isObject(manifest.brandSting)) {
      issues.push({
        code: "INVALID_BRAND_STING",
        message: "brandSting must be an object.",
      });
    } else {
      const sting = manifest.brandSting;
      let stingOk = true;
      if (sting.version !== 1) {
        issues.push({
          code: "INVALID_BRAND_STING",
          message: "brandSting.version must be 1.",
        });
        stingOk = false;
      }
      if (sting.title !== "ShortForge Studio") {
        issues.push({
          code: "INVALID_BRAND_STING",
          message: "brandSting.title must be exactly ShortForge Studio.",
        });
        stingOk = false;
      }
      if (
        sting.durationMs !== 2000 &&
        sting.durationMs !== 2500 &&
        sting.durationMs !== 3000
      ) {
        issues.push({
          code: "INVALID_BRAND_STING",
          message: "brandSting.durationMs must be 2000, 2500, or 3000.",
        });
        stingOk = false;
      }
      if (
        typeof sting.presetId !== "string" ||
        !sting.presetId.trim() ||
        sting.narrationPolicy !== "none" ||
        sting.captionPolicy !== "none" ||
        sting.playbackSpeedPolicy !== "fixed" ||
        !isFiniteNumber(sting.startMs) ||
        sting.startMs < 0
      ) {
        issues.push({
          code: "INVALID_BRAND_STING",
          message: "brandSting contract fields are invalid.",
        });
        stingOk = false;
      }
      if (
        isObject(manifest.project) &&
        isFiniteNumber(manifest.project.contentDurationMs) &&
        isFiniteNumber(sting.startMs) &&
        isFiniteNumber(sting.durationMs) &&
        Math.round(sting.startMs + sting.durationMs) !==
          Math.round(manifest.project.contentDurationMs)
      ) {
        issues.push({
          code: "INVALID_BRAND_STING",
          message:
            "brandSting.startMs + durationMs must equal project.contentDurationMs.",
        });
        stingOk = false;
      }
      // Sting must never appear as a narration scene id/title.
      if (
        Array.isArray(manifest.scenes) &&
        manifest.scenes.some(
          (scene) =>
            isObject(scene) &&
            (scene.id === "shortforge-brand-sting" ||
              scene.id === "brand-sting"),
        )
      ) {
        issues.push({
          code: "INVALID_BRAND_STING",
          message: "brandSting must not be represented as a narration scene.",
        });
        stingOk = false;
      }
      if (stingOk) {
        authoritativeBrandSting += 1;
      }
    }
  }

  for (let sceneIndex = 0; sceneIndex < manifest.scenes.length; sceneIndex += 1) {
    const scene = isObject(manifest.scenes[sceneIndex])
      ? manifest.scenes[sceneIndex]
      : null;
    if (scene && typeof scene.id === "string" && scene.id.trim()) {
      sceneIds.add(scene.id.trim());
    }

    if (scene && scene.engagementOverlays !== undefined) {
      if (!requiresEngagement) {
        issues.push({
          code: "UNSUPPORTED_ENGAGEMENT_OVERLAY",
          message: `scenes[${sceneIndex}].engagementOverlays requires engagement-overlays-v1.`,
        });
      } else if (!Array.isArray(scene.engagementOverlays)) {
        issues.push({
          code: "INVALID_ENGAGEMENT_OVERLAY",
          message: `scenes[${sceneIndex}].engagementOverlays must be an array.`,
        });
      } else {
        for (let overlayIndex = 0; overlayIndex < scene.engagementOverlays.length; overlayIndex += 1) {
          const overlay = scene.engagementOverlays[overlayIndex];
          const location = `scenes[${sceneIndex}].engagementOverlays[${overlayIndex}]`;
          if (!isObject(overlay) || overlay.version !== 1) {
            issues.push({
              code: "INVALID_ENGAGEMENT_OVERLAY",
              message: `${location} must be a version 1 object.`,
            });
            continue;
          }
          let overlayOk = true;
          if (
            typeof overlay.id !== "string" ||
            !overlay.id.trim() ||
            typeof overlay.presetId !== "string" ||
            !overlay.presetId.trim()
          ) {
            issues.push({
              code: "INVALID_ENGAGEMENT_OVERLAY",
              message: `${location} id/presetId are required.`,
            });
            overlayOk = false;
          }
          if (
            overlay.kind !== "like" &&
            overlay.kind !== "share" &&
            overlay.kind !== "subscribe" &&
            overlay.kind !== "combined"
          ) {
            issues.push({
              code: "INVALID_ENGAGEMENT_OVERLAY",
              message: `${location}.kind is unknown.`,
            });
            overlayOk = false;
          }
          const positions = new Set([
            "top-left",
            "top-center",
            "top-right",
            "center",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ]);
          if (!positions.has(overlay.position as string)) {
            issues.push({
              code: "INVALID_ENGAGEMENT_OVERLAY",
              message: `${location}.position is unknown.`,
            });
            overlayOk = false;
          }
          if (
            !isFiniteNumber(overlay.startOffsetMs) ||
            overlay.startOffsetMs < 0 ||
            !isFiniteNumber(overlay.durationMs) ||
            overlay.durationMs < 250 ||
            overlay.durationMs > 10_000
          ) {
            issues.push({
              code: "INVALID_ENGAGEMENT_OVERLAY",
              message: `${location} timing is invalid.`,
            });
            overlayOk = false;
          } else if (
            isFiniteNumber(scene?.durationMs) &&
            overlay.startOffsetMs + overlay.durationMs > scene.durationMs + 1e-6
          ) {
            issues.push({
              code: "INVALID_ENGAGEMENT_OVERLAY",
              message: `${location} exceeds scene duration.`,
            });
            overlayOk = false;
          }
          if (overlayOk) {
            authoritativeEngagementScenes += 1;
          }
        }
      }
    }

    const timeline = scene && isObject(scene.mediaTimeline) ? scene.mediaTimeline : null;
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

      if (media.backgroundTreatment !== undefined) {
        const treatmentLocation =
          `scenes[${sceneIndex}].mediaTimeline.items[${itemIndex}].media.backgroundTreatment`;
        if (!requiresBlurredFillBackground) {
          issues.push({
            code: "UNSUPPORTED_MEDIA_BACKGROUND_TREATMENT",
            message: `${treatmentLocation} requires media-background-treatment-blurred-fill-v1.`,
          });
        } else if (media.backgroundTreatment !== "blurred_fill") {
          issues.push({
            code: "INVALID_MEDIA_BACKGROUND_TREATMENT",
            message: `${treatmentLocation} must be "blurred_fill" when present.`,
          });
        } else if (media.fitMode !== "fit") {
          issues.push({
            code: "INVALID_MEDIA_BACKGROUND_TREATMENT",
            message: `${treatmentLocation} requires fitMode "fit".`,
          });
        } else {
          authoritativeBlurredFillItems += 1;
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
    requiresKeyframed &&
    authoritativeKeyframeItems + authoritativeEffectItems < 1
  ) {
    issues.push({
      code: "MISSING_AUTHORITATIVE_ENHANCEMENT",
      message:
        "ExportManifest v5 with keyframed-visual-effects-v1 requires authoritative keyframes or an active visual effect.",
    });
  }

  if (requiresEngagement && authoritativeEngagementScenes < 1) {
    issues.push({
      code: "MISSING_AUTHORITATIVE_ENHANCEMENT",
      message:
        "ExportManifest v5 with engagement-overlays-v1 requires at least one usable engagement overlay.",
    });
  }

  if (requiresBrandSting && authoritativeBrandSting < 1) {
    issues.push({
      code: "MISSING_AUTHORITATIVE_ENHANCEMENT",
      message:
        "ExportManifest v5 with shortforge-brand-sting-v1 requires a valid brandSting payload.",
    });
  }

  if (requiresBlurredFillBackground && authoritativeBlurredFillItems < 1) {
    issues.push({
      code: "MISSING_AUTHORITATIVE_ENHANCEMENT",
      message:
        "ExportManifest v5 with media-background-treatment-blurred-fill-v1 requires Fit media with backgroundTreatment blurred_fill.",
    });
  }

  void sceneIds;

  return { ok: issues.length === 0, issues };
}

export function assertExportManifestV5SceneMedia(manifest: unknown): void {
  const result = validateExportManifestV5SceneMedia(manifest);
  if (!result.ok) {
    const first = result.issues[0]!;
    throw new Error(`ExportManifest v5 integrity failed (${first.code}): ${first.message}`);
  }
}
