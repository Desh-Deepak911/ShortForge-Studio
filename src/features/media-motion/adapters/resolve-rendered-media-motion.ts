/**
 * Shared rendered-motion resolution seam for Preview, Browser, and Headless.
 *
 * Keyframes are authoritative only when all are true:
 * - `keyframedVisualEffectsEnabled === true` (explicit; omit/false = fail-closed)
 * - `motion` exists and `motion.enabled === true`
 * - at least two usable keyframes remain for the item-local media window
 *
 * Otherwise preset/start/end (or disabled identity) remains the motion authority.
 */

import type {
  SceneMediaMotion,
  SceneMediaTransform,
} from "@/features/story/types";

import { composeMediaMotionTransform } from "../media-motion.compose";
import { resolveMediaMotionStateForSceneTiming } from "../media-motion.engine";
import { resolveMediaMotionKeyframes } from "../domain/resolve-media-motion-keyframes";
import type { MediaMotionState } from "../media-motion.types";

export interface ResolveRenderedMediaMotionInput {
  readonly motion: SceneMediaMotion;
  readonly baseTransform: SceneMediaTransform;
  /** Item-local elapsed within the projected media window. */
  readonly itemElapsedMs: number;
  /** Projected media-window duration (single-media or mixed-media item). */
  readonly mediaWindowDurationMs: number;
  /**
   * Explicit creator/renderer capability decision.
   * Must be supplied by the caller — never inferred from env/story alone.
   */
  readonly keyframedVisualEffectsEnabled: boolean;
}

export interface RenderedMediaMotionState {
  readonly active: boolean;
  readonly progress: number;
  readonly easedProgress: number;
  /** Composed framing × motion delta in reference-frame units. */
  readonly transform: SceneMediaTransform;
  /** Motion-channel opacity (identity 1). Multiply with layer/transition opacity. */
  readonly opacity: number;
  readonly presetId: string;
  readonly authority: "keyframes" | "preset";
}

/**
 * True when motion itself may host keyframe authority (enabled record present).
 * Capability and usable-keyframe checks are separate.
 */
export function mediaMotionRecordAllowsKeyframeAuthority(
  motion: SceneMediaMotion | null | undefined,
): boolean {
  return Boolean(motion && motion.enabled === true);
}

/**
 * Resolve one deterministic rendered-motion sample.
 * Pure — no DOM, clock, or capability environment reads.
 */
export function resolveRenderedMediaMotion(
  input: ResolveRenderedMediaMotionInput,
): RenderedMediaMotionState {
  const keyframesEnabled =
    input.keyframedVisualEffectsEnabled === true &&
    mediaMotionRecordAllowsKeyframeAuthority(input.motion);

  if (keyframesEnabled) {
    const keyframed = resolveMediaMotionKeyframes({
      keyframes: input.motion.keyframes,
      itemElapsedMs: input.itemElapsedMs,
      mediaWindowDurationMs: input.mediaWindowDurationMs,
    });

    if (keyframed.available) {
      const delta: SceneMediaTransform = {
        x: keyframed.sample.x,
        y: keyframed.sample.y,
        scale: keyframed.sample.scale,
        rotation: keyframed.sample.rotation,
      };
      const composed = composeMediaMotionTransform(input.baseTransform, delta);
      const duration =
        Number.isFinite(input.mediaWindowDurationMs) &&
        input.mediaWindowDurationMs > 0
          ? input.mediaWindowDurationMs
          : 0;
      const elapsed = Number.isFinite(input.itemElapsedMs)
        ? Math.min(duration, Math.max(0, input.itemElapsedMs))
        : 0;
      const progress = duration > 0 ? elapsed / duration : 0;
      const opacity = Number.isFinite(keyframed.sample.opacity)
        ? Math.min(1, Math.max(0, keyframed.sample.opacity))
        : 1;

      return {
        active: true,
        progress,
        easedProgress: progress,
        transform: composed,
        opacity,
        presetId: input.motion.presetId ?? "custom",
        authority: "keyframes",
      };
    }
  }

  const legacy: MediaMotionState = resolveMediaMotionStateForSceneTiming({
    motion: input.motion,
    baseTransform: input.baseTransform,
    sceneElapsedMs: input.itemElapsedMs,
    sceneDurationMs: input.mediaWindowDurationMs,
  });

  return {
    active: legacy.active,
    progress: legacy.progress,
    easedProgress: legacy.easedProgress,
    transform: legacy.transform,
    opacity: 1,
    presetId: legacy.presetId,
    authority: "preset",
  };
}
