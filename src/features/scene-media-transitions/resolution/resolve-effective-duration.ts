import { INTRA_SCENE_TRANSITION_WINDOW_FRACTION } from "../domain/constants";

/**
 * Effective overlay duration without mutating the stored requested duration.
 * effectiveDurationMs = min(requested, floor(0.4×from), floor(0.4×to))
 */
export function resolveEffectiveIntraSceneTransitionDurationMs(input: {
  requestedDurationMs: number;
  fromWindowDurationMs: number;
  toWindowDurationMs: number;
}): number {
  const { requestedDurationMs, fromWindowDurationMs, toWindowDurationMs } = input;
  if (
    !Number.isFinite(requestedDurationMs) ||
    requestedDurationMs <= 0 ||
    !Number.isFinite(fromWindowDurationMs) ||
    !Number.isFinite(toWindowDurationMs) ||
    fromWindowDurationMs <= 0 ||
    toWindowDurationMs <= 0
  ) {
    return 0;
  }

  const fromCap = Math.floor(INTRA_SCENE_TRANSITION_WINDOW_FRACTION * fromWindowDurationMs);
  const toCap = Math.floor(INTRA_SCENE_TRANSITION_WINDOW_FRACTION * toWindowDurationMs);
  const effective = Math.min(requestedDurationMs, fromCap, toCap);
  if (!Number.isFinite(effective) || effective <= 0) {
    return 0;
  }
  return effective;
}
