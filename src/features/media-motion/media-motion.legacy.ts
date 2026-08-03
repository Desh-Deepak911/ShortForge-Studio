/**
 * Legacy imageMotion → SceneMediaMotion adapter (4.2C-2).
 * Does not rewrite existing presets — maps them into the shared model.
 */
import type {
  SceneImageMotion,
  SceneImageMotionIntensity,
  SceneMediaMotion,
} from "@/features/story/types";
import { normalizeSceneImageMotion } from "@/features/story/utils/scene.utils";
import { SCENE_IMAGE_MOTION_INTENSITY_MAX_SCALE } from "@/features/story/utils/scene-image-motion.utils";

import { normalizeMediaMotionKeyframes } from "./domain/media-motion-keyframes";
import { getMediaMotionPreset, MEDIA_MOTION_MAX_ZOOM_DELTA } from "./media-motion.presets";
import {
  MEDIA_MOTION_STATIC,
  MEDIA_MOTION_VERSION,
  MEDIA_MOTION_IDENTITY_TRANSFORM,
} from "./media-motion.types";
import { normalizeMediaMotionTransform } from "./media-motion.compose";

/** Maps legacy intensity labels onto 0–1 so peak scales match SCENE_IMAGE_MOTION_INTENSITY_MAX_SCALE. */
export function legacyIntensityToUnit(
  intensity: SceneImageMotionIntensity,
): number {
  const peak = SCENE_IMAGE_MOTION_INTENSITY_MAX_SCALE[intensity];
  if (!(MEDIA_MOTION_MAX_ZOOM_DELTA > 0)) {
    return 1;
  }
  return Math.min(1, Math.max(0, (peak - 1) / MEDIA_MOTION_MAX_ZOOM_DELTA));
}

/** Maps editor/legacy imageMotion.type onto a shared preset id. */
export function mapLegacyImageMotionTypeToPresetId(
  type: SceneImageMotion["type"],
): string | null {
  switch (type) {
    case "none":
      return null;
    case "zoom-in":
      return "slow-zoom-in";
    case "zoom-out":
      return "slow-zoom-out";
    case "static":
      return "static";
    default:
      return getMediaMotionPreset(type).id === type ? type : null;
  }
}

/**
 * Converts legacy SceneImageMotion into SceneMediaMotion.
 * Static / none → disabled static motion.
 */
export function mapLegacyImageMotionToSceneMediaMotion(
  imageMotion: SceneImageMotion | null | undefined,
): SceneMediaMotion {
  const normalized = normalizeSceneImageMotion(imageMotion);
  const presetId = mapLegacyImageMotionTypeToPresetId(normalized.type);

  if (!presetId || presetId === "static" || normalized.type === "none") {
    return { ...MEDIA_MOTION_STATIC };
  }

  const preset = getMediaMotionPreset(presetId);
  const intensity = legacyIntensityToUnit(normalized.intensity);

  return {
    version: MEDIA_MOTION_VERSION,
    enabled: true,
    presetId,
    easing: preset.defaultEasing,
    intensity,
    startTransform: normalizeMediaMotionTransform(preset.startDelta),
    endTransform: normalizeMediaMotionTransform(preset.endDelta),
  };
}

/** Ensures a motion record has version + safe transforms. */
export function normalizeSceneMediaMotionRecord(
  value: unknown,
): SceneMediaMotion {
  if (!value || typeof value !== "object") {
    return { ...MEDIA_MOTION_STATIC };
  }

  const record = value as Record<string, unknown>;
  const presetId =
    typeof record.presetId === "string" && record.presetId.trim()
      ? record.presetId.trim()
      : "static";
  const preset = getMediaMotionPreset(presetId);

  const enabled =
    typeof record.enabled === "boolean"
      ? record.enabled
      : presetId !== "static" && presetId !== "custom"
        ? true
        : Boolean(record.enabled);

  const easing =
    record.easing === "linear" ||
    record.easing === "ease-in" ||
    record.easing === "ease-out" ||
    record.easing === "ease-in-out"
      ? record.easing
      : preset.defaultEasing;

  let intensity =
    typeof record.intensity === "number" && Number.isFinite(record.intensity)
      ? Math.min(2, Math.max(0, record.intensity))
      : preset.defaultIntensity;

  if (presetId === "static" && record.intensity == null) {
    intensity = 0;
  }

  const startTransform = normalizeMediaMotionTransform(
    record.startTransform as SceneMediaMotion["startTransform"],
    preset.startDelta,
  );
  const endTransform = normalizeMediaMotionTransform(
    record.endTransform as SceneMediaMotion["endTransform"],
    preset.endDelta,
  );

  // Custom with identical identity transforms and no explicit enable → static.
  // Exception: explicitly enabled custom motion with ≥2 usable keyframes stays
  // enabled so keyframed authority is not stripped before capability gating.
  const isCustomIdentity =
    presetId === "custom" &&
    startTransform.scale === 1 &&
    endTransform.scale === 1 &&
    startTransform.x === 0 &&
    endTransform.x === 0 &&
    startTransform.y === 0 &&
    endTransform.y === 0 &&
    (startTransform.rotation ?? 0) === 0 &&
    (endTransform.rotation ?? 0) === 0;

  const keyframes = normalizeMediaMotionKeyframes(record.keyframes);
  const keepEnabledForAuthoredKeyframes =
    enabled === true && Boolean(keyframes && keyframes.length >= 2);
  const normalized: SceneMediaMotion = {
    version: MEDIA_MOTION_VERSION,
    enabled:
      isCustomIdentity && !keepEnabledForAuthoredKeyframes ? false : enabled,
    presetId,
    easing,
    intensity,
    startTransform,
    endTransform,
  };
  if (keyframes) {
    normalized.keyframes = [...keyframes];
  }
  return normalized;
}

export { MEDIA_MOTION_IDENTITY_TRANSFORM };
