/**
 * Deterministic media-motion keyframe resolution (dormant).
 *
 * Not connected to preview, export, canvas, ExportManifest, or UI.
 * When unavailable, callers must keep preset/startTransform/endTransform
 * authority.
 */

import type { MediaMotionKeyframe } from "@/features/story/types";

import { applyMediaMotionEasing } from "../media-motion.progress";
import {
  normalizeMediaMotionKeyframes,
  type NormalizeMediaMotionKeyframesOptions,
} from "./media-motion-keyframes";

/** Sample produced when keyframe resolution is available. */
export interface ResolvedMediaMotionKeyframeSample {
  readonly offsetMs: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly opacity: number;
}

export type ResolveMediaMotionKeyframesUnavailableReason =
  | "absent-keyframes"
  | "insufficient-keyframes"
  | "invalid-media-window-duration"
  | "non-finite-elapsed";

export type ResolveMediaMotionKeyframesResult =
  | {
      readonly available: true;
      readonly sample: ResolvedMediaMotionKeyframeSample;
    }
  | {
      readonly available: false;
      readonly reason: ResolveMediaMotionKeyframesUnavailableReason;
    };

export interface ResolveMediaMotionKeyframesInput {
  /** Raw or previously normalized keyframes. */
  readonly keyframes: unknown;
  /** Item-local elapsed time within the projected media window. */
  readonly itemElapsedMs: number;
  /** Projected media-window duration (single-media or mixed-media item). */
  readonly mediaWindowDurationMs: number;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function sampleFromKeyframe(
  keyframe: MediaMotionKeyframe,
): ResolvedMediaMotionKeyframeSample {
  return {
    offsetMs: keyframe.offsetMs,
    x: keyframe.x,
    y: keyframe.y,
    scale: keyframe.scale,
    rotation: keyframe.rotation,
    opacity: keyframe.opacity,
  };
}

function interpolateKeyframes(
  left: MediaMotionKeyframe,
  right: MediaMotionKeyframe,
  itemElapsedMs: number,
): ResolvedMediaMotionKeyframeSample {
  const span = right.offsetMs - left.offsetMs;
  const rawProgress =
    span > 0 ? (itemElapsedMs - left.offsetMs) / span : 0;
  const progress = Math.min(1, Math.max(0, rawProgress));
  const eased = applyMediaMotionEasing(progress, left.easing);

  if (!Number.isFinite(eased)) {
    return sampleFromKeyframe(left);
  }

  const x = lerp(left.x, right.x, eased);
  const y = lerp(left.y, right.y, eased);
  const scale = lerp(left.scale, right.scale, eased);
  const rotation = lerp(left.rotation, right.rotation, eased);
  const opacity = lerp(left.opacity, right.opacity, eased);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(scale) ||
    !Number.isFinite(rotation) ||
    !Number.isFinite(opacity)
  ) {
    return sampleFromKeyframe(left);
  }

  return {
    offsetMs: itemElapsedMs,
    x,
    y,
    scale,
    rotation,
    opacity,
  };
}

/**
 * Resolve a dormant keyframe sample at an item-local media-window clock.
 *
 * Behavior:
 * - hold the first keyframe before the first offset;
 * - hold the last keyframe after the last offset;
 * - interpolate between neighbors using the left keyframe’s outgoing easing;
 * - return unavailable when fewer than two usable keyframes remain, or when
 *   the media-window duration / elapsed clock is invalid.
 */
export function resolveMediaMotionKeyframes(
  input: ResolveMediaMotionKeyframesInput,
): ResolveMediaMotionKeyframesResult {
  const { mediaWindowDurationMs, itemElapsedMs } = input;

  if (
    !Number.isFinite(mediaWindowDurationMs) ||
    !(mediaWindowDurationMs > 0)
  ) {
    return { available: false, reason: "invalid-media-window-duration" };
  }

  if (!Number.isFinite(itemElapsedMs)) {
    return { available: false, reason: "non-finite-elapsed" };
  }

  const normalizeOptions: NormalizeMediaMotionKeyframesOptions = {
    mediaWindowDurationMs,
  };
  const keyframes = normalizeMediaMotionKeyframes(
    input.keyframes,
    normalizeOptions,
  );

  if (!keyframes || keyframes.length === 0) {
    return { available: false, reason: "absent-keyframes" };
  }

  if (keyframes.length < 2) {
    return { available: false, reason: "insufficient-keyframes" };
  }

  const clampedElapsed = Math.min(
    mediaWindowDurationMs,
    Math.max(0, itemElapsedMs),
  );

  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;

  if (clampedElapsed <= first.offsetMs) {
    return { available: true, sample: sampleFromKeyframe(first) };
  }

  if (clampedElapsed >= last.offsetMs) {
    return { available: true, sample: sampleFromKeyframe(last) };
  }

  let rightIndex = 1;
  while (
    rightIndex < keyframes.length &&
    keyframes[rightIndex]!.offsetMs < clampedElapsed
  ) {
    rightIndex += 1;
  }

  const right = keyframes[rightIndex]!;
  const left = keyframes[rightIndex - 1]!;
  return {
    available: true,
    sample: interpolateKeyframes(left, right, clampedElapsed),
  };
}
