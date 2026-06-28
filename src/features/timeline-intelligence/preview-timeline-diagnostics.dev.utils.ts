import type { MasterTimeline } from "./timeline.types";
import { buildTimelineDevDiagnostics } from "./timeline-diagnostics.dev.utils";
import type { TimelineDevDiagnosticsSnapshot } from "./timeline-diagnostics.dev.utils";
import { isTimelineDevDiagnosticsEnabled } from "./timeline-diagnostics.dev.types";

export const PREVIEW_DURATION_SOURCE_MASTER_TIMELINE = "MasterTimeline" as const;

export interface PreviewMasterTimelineDevDiagnostics {
  previewDurationSource: typeof PREVIEW_DURATION_SOURCE_MASTER_TIMELINE;
  renderDurationMs: number;
  narrationDurationMs: number;
  audioEndedButTimelineActive: boolean;
  previewExportMismatchWarnings: string[];
  optimizerAppliedChangeCount: number;
  optimizerWarningCount: number;
}

export function resolvePreviewMasterTimelineDevDiagnostics(options: {
  masterTimeline: MasterTimeline;
  currentTimeMs: number;
  narrationEnded: boolean;
  diagnosticsSnapshot?: TimelineDevDiagnosticsSnapshot;
}): PreviewMasterTimelineDevDiagnostics {
  const narrationDurationMs = options.masterTimeline.narrationDurationMs;
  const renderDurationMs = options.masterTimeline.renderDurationMs;
  const audioEndedButTimelineActive =
    options.narrationEnded &&
    narrationDurationMs > 0 &&
    options.currentTimeMs >= narrationDurationMs &&
    options.currentTimeMs < renderDurationMs;

  return {
    previewDurationSource: PREVIEW_DURATION_SOURCE_MASTER_TIMELINE,
    renderDurationMs,
    narrationDurationMs,
    audioEndedButTimelineActive,
    previewExportMismatchWarnings: options.diagnosticsSnapshot?.comparisonWarnings ?? [],
    optimizerAppliedChangeCount: options.masterTimeline.diagnostics.optimizer?.appliedChangeCount ?? 0,
    optimizerWarningCount: options.masterTimeline.diagnostics.optimizer?.warningCount ?? 0,
  };
}

/** Logs preview timeline authority diagnostics in development builds. */
export function logPreviewMasterTimelineDiagnostics(
  masterTimeline: MasterTimeline,
  options: {
    currentTimeMs?: number;
    narrationEnded?: boolean;
    script?: Parameters<typeof buildTimelineDevDiagnostics>[0];
  } = {},
): void {
  if (!isTimelineDevDiagnosticsEnabled) {
    return;
  }

  const snapshot = options.script ? buildTimelineDevDiagnostics(options.script) : undefined;

  console.info(
    "[PreviewTimeline]",
    resolvePreviewMasterTimelineDevDiagnostics({
      masterTimeline,
      currentTimeMs: options.currentTimeMs ?? 0,
      narrationEnded: options.narrationEnded ?? false,
      diagnosticsSnapshot: snapshot,
    }),
  );
}
