/**
 * Certification-only scene timing.
 * One cumulative authority: recalculateSceneTimings, then confirm against
 * the export MasterTimeline scene track. Does not invent a second clock.
 */

import { applyMasterTimelineSceneTiming } from "@/features/timeline-intelligence/apply-master-timeline-scenes.utils";
import { buildOptimizedMasterTimeline } from "@/features/timeline-intelligence/build-optimized-master-timeline.utils";
import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import type { FootieScript } from "@/features/story/types";
import {
  getStoryTotalDuration,
  recalculateSceneTimings,
} from "@/features/story/utils";
import { syncFootieScript } from "@/lib/utils/voiceover";

export function buildCertificationExportMasterTimeline(
  script: FootieScript,
): MasterTimeline {
  return buildOptimizedMasterTimeline(script, {
    mode: "export",
    useVoiceoverRefit: true,
    assumeSynced: true,
  });
}

export function buildCertificationPreviewMasterTimeline(
  script: FootieScript,
): MasterTimeline {
  return buildOptimizedMasterTimeline(script, {
    mode: "preview",
    useVoiceoverRefit: true,
    assumeSynced: true,
  });
}

/**
 * Writes coherent start/end/startMs/endMs/duration/durationMs from one
 * cumulative pass. Seconds are derived from milliseconds — never hand-maintained.
 */
export function applyPreviewRuntimeParityCertificationSceneTiming(
  script: FootieScript,
): FootieScript {
  const synced = syncFootieScript(script);
  const cumulative = recalculateSceneTimings(synced.scenes);
  const exportTimeline = buildCertificationExportMasterTimeline({
    ...synced,
    scenes: cumulative,
  });
  const fromExport = applyMasterTimelineSceneTiming(cumulative, exportTimeline);
  return {
    ...synced,
    scenes: fromExport,
    totalDuration: getStoryTotalDuration(fromExport),
  };
}
