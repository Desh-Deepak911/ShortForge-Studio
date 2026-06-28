import type { MasterTimeline } from "./timeline.types";
import { isTimelineDevDiagnosticsEnabled } from "./timeline-diagnostics.dev.types";

export const EXPORT_DURATION_SOURCE_MASTER_TIMELINE = "MasterTimeline" as const;

export interface ExportMasterTimelineDevDiagnostics {
  exportDurationSource: typeof EXPORT_DURATION_SOURCE_MASTER_TIMELINE;
  renderDurationMs: number;
  audioDurationMs: number;
  subtitleDurationMs: number;
  animationDurationMs: number;
  refitApplied: boolean;
  optimizerAppliedChangeCount: number;
  optimizerWarningCount: number;
}

export function resolveExportMasterTimelineDevDiagnostics(
  masterTimeline: MasterTimeline,
): ExportMasterTimelineDevDiagnostics {
  return {
    exportDurationSource: EXPORT_DURATION_SOURCE_MASTER_TIMELINE,
    renderDurationMs: masterTimeline.renderDurationMs,
    audioDurationMs: masterTimeline.audioDurationMs,
    subtitleDurationMs: masterTimeline.subtitleDurationMs,
    animationDurationMs: masterTimeline.animationDurationMs,
    refitApplied: masterTimeline.diagnostics.exportRefitApplied ?? false,
    optimizerAppliedChangeCount: masterTimeline.diagnostics.optimizer?.appliedChangeCount ?? 0,
    optimizerWarningCount: masterTimeline.diagnostics.optimizer?.warningCount ?? 0,
  };
}

/** Logs export timeline authority diagnostics in development builds. */
export function logExportMasterTimelineDiagnostics(masterTimeline: MasterTimeline): void {
  if (!isTimelineDevDiagnosticsEnabled) {
    return;
  }

  console.info(
    "[ExportTimeline]",
    resolveExportMasterTimelineDevDiagnostics(masterTimeline),
  );
}
