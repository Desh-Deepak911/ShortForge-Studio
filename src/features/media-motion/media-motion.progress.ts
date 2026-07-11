/**
 * Scene-progress authority for media motion (4.2C-2).
 * Scene elapsed / scene duration only — never clip, trim, or playback clocks.
 */

/** Clamped scene progress in [0, 1]. */
export function resolveSceneMotionProgress(
  sceneElapsedMs: number,
  sceneDurationMs: number,
): number {
  if (!(sceneDurationMs > 0) || !Number.isFinite(sceneDurationMs)) {
    return 0;
  }
  if (!Number.isFinite(sceneElapsedMs)) {
    return 0;
  }
  return Math.min(1, Math.max(0, sceneElapsedMs / sceneDurationMs));
}

export function applyMediaMotionEasing(
  progress: number,
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" = "linear",
): number {
  const t = Math.min(1, Math.max(0, progress));
  switch (easing) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "linear":
    default:
      return t;
  }
}
