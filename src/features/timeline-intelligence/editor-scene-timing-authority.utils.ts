import type { FootieScene } from "@/features/story/types";
import { getStoryTotalDuration } from "@/features/story/utils/scene.utils";

const TIMELINE_VOICEOVER_SYNC_TOLERANCE_MS = 50;

export const STORY_DURATION_NARRATION_MISMATCH_WARNING =
  "Story duration changed after narration. Regenerate narration for perfect voiceover sync.";

export function resolveEditorSceneDurationMs(scenes: FootieScene[]): number {
  return Math.max(0, Math.round(getStoryTotalDuration(scenes) * 1000));
}

export function hasManualSceneDuration(scenes: FootieScene[]): boolean {
  return scenes.some((scene) => scene.durationSource === "manual");
}

/** When true, preview/export should use editor scene windows instead of voiceover refit. */
export function shouldPreferEditorSceneTimingAuthority(
  scenes: FootieScene[],
  voiceoverDurationMs: number,
  toleranceMs = TIMELINE_VOICEOVER_SYNC_TOLERANCE_MS,
): boolean {
  if (hasManualSceneDuration(scenes)) {
    return true;
  }

  if (voiceoverDurationMs <= 0) {
    return false;
  }

  const editorDurationMs = resolveEditorSceneDurationMs(scenes);
  return editorDurationMs > voiceoverDurationMs + toleranceMs;
}
