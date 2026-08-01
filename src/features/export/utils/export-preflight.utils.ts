import { applyVisualSequenceAuthorityToStory } from "@/features/mixed-media-scenes/adapters/reconcile-visual-sequence-authority";
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
import { resolveVisualPacingExportGuidance } from "@/features/visual-beat-density/adapters/resolve-visual-pacing-export-guidance";
import { syncFootieScript } from "@/lib/utils/voiceover";

import {
  formatExportMediaValidationWarnings,
  validateExportStoryMedia,
} from "./export-media-validation.utils";
import { resolveNarrationVoiceoverMismatchWarning } from "./export-narration-voiceover.utils";

export interface PrepareStoryForExportOptions {
  /**
   * Explicit mixed-media scenes capability decision. Default false (fail-closed).
   * Must be resolved by the caller from the server gate / client capability
   * snapshot — this module never reads environment variables.
   */
  readonly mixedMediaScenesEnabled?: boolean;
  /**
   * Explicit Visual pacing authoring capability. Default ignored/fail-closed.
   * Guidance only — never a render requirement and never read from env here.
   */
  readonly visualBeatDensityEnabled?: boolean;
}

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
 *
 * Order (mixed-media scenes):
 * 1. sync
 * 2. MasterTimeline + voiceover scene-duration refit
 * 3. visualSequence ↔ mediaTimeline reconcile against **final** scene durations
 * 4. media validation on the repaired export copy
 * 5. final sync
 */
export function prepareStoryForExport(
  story: FootieScript,
  options: PrepareStoryForExportOptions = {},
): PrepareStoryForExportResult {
  const mixedMediaScenesEnabled = options.mixedMediaScenesEnabled === true;
  const visualBeatDensityEnabled = options.visualBeatDensityEnabled === true;
  const syncedBase = syncFootieScript(story);
  const masterTimeline = buildOptimizedMasterTimeline(syncedBase, {
    mode: "export",
    useVoiceoverRefit: true,
  });

  const warnings = [...masterTimeline.warnings];
  const canonicalVoiceover = getCanonicalVoiceover(syncedBase);
  const voiceoverDurationMs =
    canonicalVoiceover?.durationMs != null && canonicalVoiceover.durationMs > 0
      ? Math.round(canonicalVoiceover.durationMs)
      : 0;

  if (
    voiceoverDurationMs > 0 &&
    shouldPreferEditorSceneTimingAuthority(syncedBase.scenes, voiceoverDurationMs) &&
    !warnings.includes(STORY_DURATION_NARRATION_MISMATCH_WARNING)
  ) {
    warnings.push(STORY_DURATION_NARRATION_MISMATCH_WARNING);
  }

  const narrationMismatchWarning = resolveNarrationVoiceoverMismatchWarning(syncedBase);
  if (narrationMismatchWarning) {
    warnings.push(narrationMismatchWarning);
  }

  const refittedScenes = applyMasterTimelineSceneTiming(
    syncedBase.scenes,
    masterTimeline,
  );

  const durationNormalized = syncFootieScript({
    ...syncedBase,
    scenes: refittedScenes,
    ...(canonicalVoiceover?.url ? { voiceoverUrl: canonicalVoiceover.url } : {}),
    ...(canonicalVoiceover?.durationMs != null && canonicalVoiceover.durationMs > 0
      ? { voiceoverDurationMs: Math.round(canonicalVoiceover.durationMs) }
      : {}),
  });

  // Reconcile after refit so visual windows use final narration-authoritative durations.
  const visualAuthority = applyVisualSequenceAuthorityToStory(durationNormalized, {
    mixedMediaScenesEnabled,
  });
  warnings.push(...visualAuthority.warnings);

  const mediaIssues = validateExportStoryMedia(visualAuthority.story);
  warnings.push(...formatExportMediaValidationWarnings(mediaIssues));

  const normalizedStory = syncFootieScript(visualAuthority.story);

  // Authoring guidance only — evaluated on the final export copy after refit.
  const pacingGuidance = resolveVisualPacingExportGuidance(normalizedStory, {
    visualBeatDensityEnabled,
  });
  for (const item of pacingGuidance) {
    warnings.push(item.message);
  }

  return {
    story: normalizedStory,
    exportDurationMs: masterTimeline.renderDurationMs,
    contentEndMs: masterTimeline.contentEndMs,
    warnings,
    mediaIssues,
    masterTimeline,
  };
}
