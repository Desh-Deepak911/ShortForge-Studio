import { getCanonicalVoiceover } from "@/features/audio/utils/canonical-voiceover.utils";
import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import { validateNarrationRebuildSources } from "@/features/story-sync/story-narration-rebuild.utils";
import type { FootieScript } from "@/features/story/types";
import { getStoryTotalDuration } from "@/features/story/utils";

export interface VoiceNarrationDebugSummary {
  scriptNarrationLength: number;
  voiceoverNarrationLength: number;
  voiceoverDurationMs: number;
  sumSceneDurationMs: number;
  masterTimelineRenderDurationMs: number;
  masterTimelineNarrationDurationMs: number;
  contributingSceneCount: number;
  skippedSceneCount: number;
  timingAuthority: "editor-scene-timing" | "export-refit-timing" | "none";
}

/** Dev-only voice/narration timing diagnostics — no production logging. */
export function buildVoiceNarrationDebugSummary(
  script: FootieScript | null | undefined,
): VoiceNarrationDebugSummary | null {
  if (!script) {
    return null;
  }

  const validation = validateNarrationRebuildSources(script);
  const canonical = getCanonicalVoiceover(script);
  const voiceoverDurationMs = canonical?.durationMs ?? script.voiceoverDurationMs ?? 0;
  const sumSceneDurationMs = Math.round(getStoryTotalDuration(script.scenes) * 1000);
  const previewTimeline = buildPreviewMasterTimeline(script, { assumeSynced: true });

  return {
    scriptNarrationLength: script.narration.trim().length,
    voiceoverNarrationLength: script.voiceoverNarration?.trim().length ?? 0,
    voiceoverDurationMs,
    sumSceneDurationMs,
    masterTimelineRenderDurationMs: previewTimeline?.renderDurationMs ?? 0,
    masterTimelineNarrationDurationMs: previewTimeline?.narrationDurationMs ?? 0,
    contributingSceneCount: validation.diagnostics.contributingSceneCount,
    skippedSceneCount: validation.diagnostics.skippedSceneCount,
    timingAuthority: previewTimeline?.authority ?? "none",
  };
}

export function logVoiceNarrationDebugSummary(
  script: FootieScript | null | undefined,
  label = "voice-narration-debug",
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const summary = buildVoiceNarrationDebugSummary(script);
  if (!summary) {
    return;
  }

  console.info(`[FootieBitz ${label}]`, summary);
}
