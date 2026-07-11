/**
 * Pure Media Motion Engine (4.2C-2).
 * No React, DOM, canvas, trim, playback, or Story Sync coupling.
 */
import type { SceneMediaTransform } from "@/features/story/types";

import {
  composeMediaMotionTransform,
  interpolateMediaMotionDelta,
  normalizeMediaMotionTransform,
  scaleMediaMotionDeltaByIntensity,
} from "./media-motion.compose";
import { normalizeSceneMediaMotionRecord } from "./media-motion.legacy";
import { getMediaMotionPreset } from "./media-motion.presets";
import { applyMediaMotionEasing, resolveSceneMotionProgress } from "./media-motion.progress";
import type { MediaMotionState, ResolveMediaMotionInput } from "./media-motion.types";
import { MEDIA_MOTION_IDENTITY_TRANSFORM } from "./media-motion.types";

export { resolveSceneMotionProgress };

/**
 * Resolve the rendered transform for one scene-progress sample.
 * Progress must be scene progress (0–1), never clip/trim progress.
 */
export function resolveMediaMotionState(
  input: ResolveMediaMotionInput,
): MediaMotionState {
  const motion = normalizeSceneMediaMotionRecord(input.motion);
  const progress = Math.min(1, Math.max(0, input.sceneProgress));
  const presetId = motion.presetId ?? "static";
  const preset = getMediaMotionPreset(presetId);
  const easing = motion.easing ?? preset.defaultEasing;
  const intensity =
    typeof motion.intensity === "number" && Number.isFinite(motion.intensity)
      ? Math.min(2, Math.max(0, motion.intensity))
      : preset.defaultIntensity;

  const baseTransform = normalizeMediaMotionTransform(input.baseTransform);

  const active =
    motion.enabled !== false &&
    presetId !== "static" &&
    intensity > 0 &&
    !(
      presetId === "custom" &&
      transformsAreIdentity(motion.startTransform) &&
      transformsAreIdentity(motion.endTransform)
    );

  if (!active) {
    return {
      active: false,
      progress,
      easedProgress: progress,
      transform: { ...baseTransform },
      presetId: "static",
    };
  }

  const startSource = motion.startTransform ?? preset.startDelta;
  const endSource = motion.endTransform ?? preset.endDelta;

  const startDelta = scaleMediaMotionDeltaByIntensity(startSource, intensity);
  const endDelta = scaleMediaMotionDeltaByIntensity(endSource, intensity);

  const easedProgress = applyMediaMotionEasing(progress, easing);
  const motionDelta = interpolateMediaMotionDelta(startDelta, endDelta, easedProgress);
  const transform = composeMediaMotionTransform(baseTransform, motionDelta);

  return {
    active: true,
    progress,
    easedProgress,
    transform,
    presetId,
  };
}

function transformsAreIdentity(
  value: SceneMediaTransform | null | undefined,
): boolean {
  const t = normalizeMediaMotionTransform(value, MEDIA_MOTION_IDENTITY_TRANSFORM);
  return (
    t.x === 0 &&
    t.y === 0 &&
    t.scale === 1 &&
    (t.rotation ?? 0) === 0
  );
}

/**
 * Convenience: resolve motion from scene progress ms inputs.
 */
export function resolveMediaMotionStateForSceneTiming(input: {
  motion: ResolveMediaMotionInput["motion"];
  baseTransform: SceneMediaTransform;
  sceneElapsedMs: number;
  sceneDurationMs: number;
}): MediaMotionState {
  return resolveMediaMotionState({
    motion: input.motion,
    baseTransform: input.baseTransform,
    sceneProgress: resolveSceneMotionProgress(
      input.sceneElapsedMs,
      input.sceneDurationMs,
    ),
  });
}
