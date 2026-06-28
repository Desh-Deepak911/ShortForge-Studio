import type { FootieScript } from "@/features/story/types";
import { estimateTypewriterRevealDurationMs } from "@/features/story/utils/subtitle-effect.utils";

import { buildOptimizedMasterTimeline } from "./build-optimized-master-timeline.utils";
import { getTimelineTrackByType } from "./timeline-utils";
import type {
  CaptionAnimationTimelineEvent,
  MasterTimeline,
  MasterTimelineBuildMode,
  SubtitleTimelineEvent,
} from "./timeline.types";

export interface TimelineDevBuildSummary {
  mode: MasterTimelineBuildMode;
  authority: string;
  exportDurationSource?: string;
  previewDurationSource?: string;
  renderDurationMs: number;
  audioDurationMs: number;
  narrationDurationMs: number;
  sceneDurationMs: number;
  subtitleDurationMs: number;
  animationDurationMs: number;
  transitionDurationMs: number;
  lastSubtitleEndMs: number;
  finalRenderEndMs: number;
  endBufferMs: number;
  exportRefitApplied: boolean;
  previewExportTimingMismatchRisk: boolean;
  optimizerAppliedChangeCount: number;
  optimizerWarningCount: number;
  optimizerFindings: string[];
  warnings: string[];
}

export interface TimelineDevDiagnosticsSnapshot {
  preview: TimelineDevBuildSummary;
  export: TimelineDevBuildSummary;
  comparisonWarnings: string[];
  typewriterOverrunWarnings: string[];
  lineCapOverflowWarnings: string[];
  subtitleCompletionWarnings: string[];
  timingMismatchWarnings: string[];
  optimizerFindings: string[];
}

function summarizeTimelineBuild(
  timeline: MasterTimeline,
  mode: MasterTimelineBuildMode,
): TimelineDevBuildSummary {
  const diagnostics = timeline.diagnostics;

  return {
    mode,
    authority: timeline.authority,
    ...(mode === "export"
      ? { exportDurationSource: "MasterTimeline" as const }
      : mode === "preview"
        ? { previewDurationSource: "MasterTimeline" as const }
        : {}),
    renderDurationMs: timeline.renderDurationMs,
    audioDurationMs: timeline.audioDurationMs,
    narrationDurationMs: timeline.narrationDurationMs,
    sceneDurationMs: timeline.sceneDurationMs,
    subtitleDurationMs: timeline.subtitleDurationMs,
    animationDurationMs: timeline.animationDurationMs,
    transitionDurationMs: timeline.transitionDurationMs,
    lastSubtitleEndMs: diagnostics.finalSubtitleEndMs ?? 0,
    finalRenderEndMs: diagnostics.renderEndBeforeBufferMs ?? timeline.renderDurationMs,
    endBufferMs: diagnostics.endBufferMs ?? 0,
    exportRefitApplied: diagnostics.exportRefitApplied ?? false,
    previewExportTimingMismatchRisk: diagnostics.previewExportTimingMismatchRisk ?? false,
    optimizerAppliedChangeCount: diagnostics.optimizer?.appliedChangeCount ?? 0,
    optimizerWarningCount: diagnostics.optimizer?.warningCount ?? 0,
    optimizerFindings:
      diagnostics.optimizer?.findings.map(
        (finding) => `[${finding.severity}] ${finding.rule}: ${finding.message}`,
      ) ?? [],
    warnings: timeline.warnings,
  };
}

function detectTypewriterOverrunWarnings(timeline: MasterTimeline): string[] {
  const warnings: string[] = [];
  const animationTrack = getTimelineTrackByType(timeline.tracks, "caption-animation");
  const subtitleTrack = getTimelineTrackByType(timeline.tracks, "subtitle");

  if (!animationTrack || !subtitleTrack) {
    return warnings;
  }

  const subtitlesById = new Map<string, SubtitleTimelineEvent>(
    subtitleTrack.events.map((event) => [event.id, event as SubtitleTimelineEvent]),
  );

  for (const event of animationTrack.events) {
    const animation = event as CaptionAnimationTimelineEvent;
    if (animation.metadata.effect !== "typewriter") {
      continue;
    }

    const subtitle = subtitlesById.get(animation.metadata.subtitleEventId);
    const text = subtitle?.metadata.text.trim() ?? "";
    if (!text) {
      continue;
    }

    const estimatedRevealMs =
      animation.metadata.requiredAnimationMs ?? estimateTypewriterRevealDurationMs(text);
    const availableDurationMs =
      animation.metadata.availableDurationMs ??
      (subtitle ? subtitle.endMs - subtitle.startMs : animation.durationMs);

    if (animation.metadata.captionTooShortForEffect || estimatedRevealMs > availableDurationMs) {
      warnings.push(
        `[${timeline.authority}] scene ${animation.metadata.sceneIndex + 1} chunk ${animation.metadata.chunkIndex + 1}: typewriter needs ~${estimatedRevealMs}ms but subtitle window is ${availableDurationMs}ms.`,
      );
      continue;
    }

    if (animation.endMs > (animation.metadata.subtitleEndMs ?? animation.endMs)) {
      warnings.push(
        `[${timeline.authority}] scene ${animation.metadata.sceneIndex + 1} chunk ${animation.metadata.chunkIndex + 1}: typewriter animation ends after subtitle window.`,
      );
    }

    if (
      timeline.narrationDurationMs > 0 &&
      animation.endMs > timeline.narrationDurationMs &&
      animation.startMs < timeline.narrationDurationMs
    ) {
      const remainingMs = timeline.narrationDurationMs - animation.startMs;
      if (remainingMs < estimatedRevealMs) {
        warnings.push(
          `[${timeline.authority}] scene ${animation.metadata.sceneIndex + 1} chunk ${animation.metadata.chunkIndex + 1}: narration ends before typewriter can complete (~${estimatedRevealMs}ms needed, ${remainingMs}ms left in audio).`,
        );
      }
    }
  }

  return warnings;
}

function collectWarningsByTopic(
  preview: TimelineDevBuildSummary,
  exportSummary: TimelineDevBuildSummary,
): Pick<
  TimelineDevDiagnosticsSnapshot,
  | "comparisonWarnings"
  | "lineCapOverflowWarnings"
  | "subtitleCompletionWarnings"
  | "timingMismatchWarnings"
> {
  const lineCapOverflowWarnings: string[] = [];
  const subtitleCompletionWarnings: string[] = [];
  const timingMismatchWarnings: string[] = [];
  const comparisonWarnings: string[] = [];

  for (const summary of [preview, exportSummary]) {
    const label = summary.mode;

    for (const warning of summary.warnings) {
      if (warning.toLowerCase().includes("line-cap")) {
        lineCapOverflowWarnings.push(`[${label}] ${warning}`);
      } else if (
        warning.toLowerCase().includes("subtitle end") ||
        warning.toLowerCase().includes("final subtitle")
      ) {
        subtitleCompletionWarnings.push(`[${label}] ${warning}`);
      } else if (
        warning.toLowerCase().includes("mismatch") ||
        warning.toLowerCase().includes("differs from voiceover")
      ) {
        timingMismatchWarnings.push(`[${label}] ${warning}`);
      }
    }
  }

  if (preview.sceneDurationMs !== exportSummary.sceneDurationMs) {
    comparisonWarnings.push(
      `Scene span differs: preview ${preview.sceneDurationMs}ms vs export ${exportSummary.sceneDurationMs}ms.`,
    );
  }

  if (preview.renderDurationMs !== exportSummary.renderDurationMs) {
    comparisonWarnings.push(
      `Render duration differs: preview ${preview.renderDurationMs}ms vs export ${exportSummary.renderDurationMs}ms.`,
    );
  }

  if (preview.lastSubtitleEndMs !== exportSummary.lastSubtitleEndMs) {
    comparisonWarnings.push(
      `Last subtitle end differs: preview ${preview.lastSubtitleEndMs}ms vs export ${exportSummary.lastSubtitleEndMs}ms.`,
    );
  }

  if (preview.exportRefitApplied !== exportSummary.exportRefitApplied) {
    comparisonWarnings.push(
      `Refit flag differs: preview=${preview.exportRefitApplied}, export=${exportSummary.exportRefitApplied}.`,
    );
  }

  return {
    comparisonWarnings,
    lineCapOverflowWarnings,
    subtitleCompletionWarnings,
    timingMismatchWarnings,
  };
}

/** Builds preview + export canonical timelines for development diagnostics only. */
export function buildTimelineDevDiagnostics(
  script: FootieScript,
): TimelineDevDiagnosticsSnapshot {
  const previewTimeline = buildOptimizedMasterTimeline(script, {
    mode: "preview",
    useVoiceoverRefit: true,
  });
  const exportTimeline = buildOptimizedMasterTimeline(script, {
    mode: "export",
    useVoiceoverRefit: true,
  });

  const preview = summarizeTimelineBuild(previewTimeline, "preview");
  const exportSummary = summarizeTimelineBuild(exportTimeline, "export");

  const topicWarnings = collectWarningsByTopic(preview, exportSummary);
  const optimizerFindings = [
    ...preview.optimizerFindings.map((finding) => `[preview] ${finding}`),
    ...exportSummary.optimizerFindings.map((finding) => `[export] ${finding}`),
  ];

  return {
    preview,
    export: exportSummary,
    ...topicWarnings,
    optimizerFindings,
    typewriterOverrunWarnings: [
      ...detectTypewriterOverrunWarnings(previewTimeline),
      ...detectTypewriterOverrunWarnings(exportTimeline),
    ],
  };
}

function formatBuildSummary(summary: TimelineDevBuildSummary): string {
  return [
    `mode: ${summary.mode}`,
    `authority: ${summary.authority}`,
    `exportRefitApplied: ${summary.exportRefitApplied}`,
    `previewExportTimingMismatchRisk: ${summary.previewExportTimingMismatchRisk}`,
    "",
    `renderDurationMs: ${summary.renderDurationMs}`,
    `audioDurationMs: ${summary.audioDurationMs}`,
    `narrationDurationMs: ${summary.narrationDurationMs}`,
    `sceneDurationMs: ${summary.sceneDurationMs}`,
    `subtitleDurationMs: ${summary.subtitleDurationMs}`,
    `animationDurationMs: ${summary.animationDurationMs}`,
    `transitionDurationMs: ${summary.transitionDurationMs}`,
    "",
    `lastSubtitleEndMs: ${summary.lastSubtitleEndMs}`,
    `finalRenderEndMs: ${summary.finalRenderEndMs}`,
    `endBufferMs: ${summary.endBufferMs}`,
  ].join("\n");
}

function formatWarningList(title: string, warnings: string[]): string {
  if (warnings.length === 0) {
    return `${title}\n(none)`;
  }

  return `${title}\n${warnings.map((warning) => `- ${warning}`).join("\n")}`;
}

/** Plain-text block for the development diagnostics panel. */
export function formatTimelineDevDiagnosticsForDev(
  snapshot: TimelineDevDiagnosticsSnapshot,
): string {
  return [
    "=== Preview build ===",
    formatBuildSummary(snapshot.preview),
    "",
    "=== Export build ===",
    formatBuildSummary(snapshot.export),
    "",
    formatWarningList("Preview/export comparison", snapshot.comparisonWarnings),
    "",
    formatWarningList("Timing mismatch", snapshot.timingMismatchWarnings),
    "",
    formatWarningList("Subtitle completion", snapshot.subtitleCompletionWarnings),
    "",
    formatWarningList("Line-cap overflow", snapshot.lineCapOverflowWarnings),
    "",
    formatWarningList("Typewriter overrun", snapshot.typewriterOverrunWarnings),
    "",
    formatWarningList("Timeline optimizer", snapshot.optimizerFindings),
  ].join("\n");
}

/** Compact JSON-friendly snapshot for structured dev tooling. */
export function formatTimelineDevDiagnosticsJson(
  snapshot: TimelineDevDiagnosticsSnapshot,
): string {
  return JSON.stringify(snapshot, null, 2);
}
