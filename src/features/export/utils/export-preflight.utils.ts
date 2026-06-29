import { getCanonicalVoiceover } from "@/features/audio/utils/canonical-voiceover.utils";
import { applyMasterTimelineSceneTiming } from "@/features/timeline-intelligence/apply-master-timeline-scenes.utils";
import { buildOptimizedMasterTimeline } from "@/features/timeline-intelligence/build-optimized-master-timeline.utils";
import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

import { resolveNarrationVoiceoverMismatchWarning } from "./export-narration-voiceover.utils";

export interface PrepareStoryForExportResult {
  story: FootieScript;
  /** Canonical render/export span from MasterTimeline.renderDurationMs. */
  exportDurationMs: number;
  warnings: string[];
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
  const narrationMismatchWarning = resolveNarrationVoiceoverMismatchWarning(synced);
  if (narrationMismatchWarning) {
    warnings.push(narrationMismatchWarning);
  }

  const refittedScenes = applyMasterTimelineSceneTiming(synced.scenes, masterTimeline);
  const canonicalVoiceover = getCanonicalVoiceover(synced);

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
    warnings,
    masterTimeline,
  };
}
