/**
 * Base transform × motion delta composition (4.2C-2).
 * Crop/base and motion remain independent write domains.
 */
import type { SceneMediaTransform } from "@/features/story/types";

import { MEDIA_MOTION_IDENTITY_TRANSFORM } from "./media-motion.types";

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/** Normalize a transform with safe defaults. */
export function normalizeMediaMotionTransform(
  value: SceneMediaTransform | null | undefined,
  fallback: SceneMediaTransform = MEDIA_MOTION_IDENTITY_TRANSFORM,
): SceneMediaTransform {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }

  const scale =
    typeof value.scale === "number" && Number.isFinite(value.scale) && value.scale > 0
      ? value.scale
      : fallback.scale;
  const x =
    typeof value.x === "number" && Number.isFinite(value.x) ? value.x : fallback.x;
  const y =
    typeof value.y === "number" && Number.isFinite(value.y) ? value.y : fallback.y;
  const rotation =
    typeof value.rotation === "number" && Number.isFinite(value.rotation)
      ? value.rotation
      : (fallback.rotation ?? 0);

  return { x, y, scale, rotation };
}

/**
 * Compose user base framing with a motion delta.
 * scale multiplies; x/y/rotation add.
 */
export function composeMediaMotionTransform(
  baseTransform: SceneMediaTransform,
  motionDelta: SceneMediaTransform,
): SceneMediaTransform {
  const base = normalizeMediaMotionTransform(baseTransform);
  const delta = normalizeMediaMotionTransform(motionDelta);

  return {
    x: base.x + delta.x,
    y: base.y + delta.y,
    scale: base.scale * delta.scale,
    rotation: (base.rotation ?? 0) + (delta.rotation ?? 0),
  };
}

/** Interpolate two motion deltas by eased progress. */
export function interpolateMediaMotionDelta(
  start: SceneMediaTransform,
  end: SceneMediaTransform,
  easedProgress: number,
): SceneMediaTransform {
  const a = normalizeMediaMotionTransform(start);
  const b = normalizeMediaMotionTransform(end);
  const t = Math.min(1, Math.max(0, easedProgress));

  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scale: lerp(a.scale, b.scale, t),
    rotation: lerp(a.rotation ?? 0, b.rotation ?? 0, t),
  };
}

/**
 * Scale a preset delta by intensity (0 = identity, 1 = full preset, up to 2 = 2×).
 */
export function scaleMediaMotionDeltaByIntensity(
  delta: SceneMediaTransform,
  intensity: number,
): SceneMediaTransform {
  const amount = Math.min(2, Math.max(0, intensity));
  const normalized = normalizeMediaMotionTransform(delta);
  return {
    x: lerp(0, normalized.x, amount),
    y: lerp(0, normalized.y, amount),
    scale: 1 + (normalized.scale - 1) * amount,
    rotation: lerp(0, normalized.rotation ?? 0, amount),
  };
}
