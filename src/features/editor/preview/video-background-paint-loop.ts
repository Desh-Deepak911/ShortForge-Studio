/**
 * Preview Fit-with-background paint-loop policy.
 * One loop per active video; cancelled when inactive, paused, hidden, or unmounted.
 */

export type VideoBackgroundPaintMode = "stop" | "once" | "continuous";

export function resolveVideoBackgroundPaintMode(input: {
  readonly fitWithBackground: boolean;
  readonly isActive: boolean;
  readonly shouldPlay: boolean;
  readonly documentHidden: boolean;
}): VideoBackgroundPaintMode {
  if (!input.fitWithBackground || !input.isActive || input.documentHidden) {
    return "stop";
  }
  if (!input.shouldPlay) {
    return "once";
  }
  return "continuous";
}
