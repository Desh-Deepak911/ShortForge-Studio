import { applyMasterTimelineSceneTiming } from "@/features/timeline-intelligence/apply-master-timeline-scenes.utils";
import { buildOptimizedMasterTimeline } from "@/features/timeline-intelligence/build-optimized-master-timeline.utils";
import {
  shouldPreferEditorSceneTimingAuthority,
  STORY_DURATION_NARRATION_MISMATCH_WARNING,
} from "@/features/timeline-intelligence/editor-scene-timing-authority.utils";
import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import type { FootieScript } from "@/features/story/types";
import { getCanonicalVoiceover } from "@/features/audio/utils/canonical-voiceover.utils";
import type { MediaPlaybackValidationIssue } from "@/features/media-playback";
import { syncFootieScript } from "@/lib/utils/voiceover";

import {
  formatExportMediaValidationWarnings,
  validateExportStoryMedia,
} from "./export-media-validation.utils";
import { resolveNarrationVoiceoverMismatchWarning } from "./export-narration-voiceover.utils";

export interface PrepareStoryForExportResult {
  story: FootieScript;
  /** Canonical render/export span from MasterTimeline.renderDurationMs. */
  exportDurationMs: number;
  /** Latest active visual moment before the final render hold buffer. */
  contentEndMs: number;
  warnings: string[];
  /** SceneMedia validation issues — surfaced as warnings; renderer unchanged. */
  mediaIssues: MediaPlaybackValidationIssue[];
  masterTimeline: MasterTimeline;
}

/**
 * Builds an export-normalized story copy without mutating editor state.
 * Scene timing and export duration are derived from MasterTimeline (export authority).
 */
export function prepareStoryForExport(story: FootieScript): PrepareStoryForExportResult {
  const synced = syncFootieScript(story);
  const masterTimeline = buildOptimizedMasterTimeline(synced, {
    mode: "export",
    useVoiceoverRefit: true,
  });

  const warnings = [...masterTimeline.warnings];
  const canonicalVoiceover = getCanonicalVoiceover(synced);
  const voiceoverDurationMs =
    canonicalVoiceover?.durationMs != null && canonicalVoiceover.durationMs > 0
      ? Math.round(canonicalVoiceover.durationMs)
      : 0;

  if (
    voiceoverDurationMs > 0 &&
    shouldPreferEditorSceneTimingAuthority(synced.scenes, voiceoverDurationMs) &&
    !warnings.includes(STORY_DURATION_NARRATION_MISMATCH_WARNING)
  ) {
    warnings.push(STORY_DURATION_NARRATION_MISMATCH_WARNING);
  }

  const narrationMismatchWarning = resolveNarrationVoiceoverMismatchWarning(synced);
  if (narrationMismatchWarning) {
    warnings.push(narrationMismatchWarning);
  }

  const mediaIssues = validateExportStoryMedia(synced);
  warnings.push(...formatExportMediaValidationWarnings(mediaIssues));

  const refittedScenes = applyMasterTimelineSceneTiming(synced.scenes, masterTimeline);

  const normalizedStory = syncFootieScript({
    ...synced,
    scenes: refittedScenes,
    ...(canonicalVoiceover?.url ? { voiceoverUrl: canonicalVoiceover.url } : {}),
    ...(canonicalVoiceover?.durationMs != null && canonicalVoiceover.durationMs > 0
      ? { voiceoverDurationMs: Math.round(canonicalVoiceover.durationMs) }
      : {}),
  });

  return {
    story: normalizedStory,
    exportDurationMs: masterTimeline.renderDurationMs,
    contentEndMs: masterTimeline.contentEndMs,
    warnings,
    mediaIssues,
    masterTimeline,
  };
}
