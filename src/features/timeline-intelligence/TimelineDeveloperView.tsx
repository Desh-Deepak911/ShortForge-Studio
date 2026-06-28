"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";

import type { FootieScript } from "@/features/story/types";
import { studioGhostButton, studioPanel, studioSubtleText } from "@/lib/studioUi";

import {
  buildTimelineDevDiagnostics,
  formatTimelineDevDiagnosticsForDev,
  formatTimelineDevDiagnosticsJson,
} from "./timeline-diagnostics.dev.utils";
import { isTimelineDevDiagnosticsEnabled } from "./timeline-diagnostics.dev.types";

interface TimelineDeveloperViewProps {
  script: FootieScript;
}

function DevSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-violet-300/80">{title}</p>
      <div className="rounded-lg bg-black/25 px-2.5 py-2 ring-1 ring-violet-500/15">{children}</div>
    </div>
  );
}

function DevPre({ value }: { value: string }) {
  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-violet-100/90">
      {value}
    </pre>
  );
}

function DevMetricGrid({
  label,
  summary,
}: {
  label: string;
  summary: ReturnType<typeof buildTimelineDevDiagnostics>["preview"];
}) {
  const rows: Array<[string, string | number | boolean]> = [
    ...(summary.exportDurationSource
      ? [["exportDurationSource", summary.exportDurationSource] as [string, string]]
      : []),
    ...(summary.previewDurationSource
      ? [["previewDurationSource", summary.previewDurationSource] as [string, string]]
      : []),
    ["Authority", summary.authority],
    ["Export refit applied", summary.exportRefitApplied],
    ["Mismatch risk", summary.previewExportTimingMismatchRisk],
    ["renderDurationMs", summary.renderDurationMs],
    ["audioDurationMs", summary.audioDurationMs],
    ["narrationDurationMs", summary.narrationDurationMs],
    ["sceneDurationMs", summary.sceneDurationMs],
    ["subtitleDurationMs", summary.subtitleDurationMs],
    ["animationDurationMs", summary.animationDurationMs],
    ["transitionDurationMs", summary.transitionDurationMs],
    ["lastSubtitleEndMs", summary.lastSubtitleEndMs],
    ["finalRenderEndMs", summary.finalRenderEndMs],
    ["endBufferMs", summary.endBufferMs],
    ["optimizerAppliedChangeCount", summary.optimizerAppliedChangeCount],
    ["optimizerWarningCount", summary.optimizerWarningCount],
  ];

  return (
    <DevSection title={label}>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[11px] text-violet-100/90">
        {rows.map(([key, value]) => (
          <div key={`${label}-${key}`} className="contents">
            <dt className="text-violet-300/70">{key}</dt>
            <dd className="text-right font-mono">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </DevSection>
  );
}

function DevWarningSection({
  title,
  warnings,
}: {
  title: string;
  warnings: string[];
}) {
  return (
    <DevSection title={title}>
      {warnings.length === 0 ? (
        <p className="text-[11px] text-violet-300/60">None</p>
      ) : (
        <ul className="space-y-1 text-[11px] leading-relaxed text-amber-200/90">
          {warnings.map((warning) => (
            <li key={warning} className="break-words">
              {warning}
            </li>
          ))}
        </ul>
      )}
    </DevSection>
  );
}

/** Development-only canonical timeline diagnostics — editor workspace. */
export default function TimelineDeveloperView({ script }: TimelineDeveloperViewProps) {
  const snapshot = useMemo(() => buildTimelineDevDiagnostics(script), [script]);

  if (!isTimelineDevDiagnosticsEnabled || script.scenes.length === 0) {
    return null;
  }

  return (
    <details className={`${studioPanel} mt-3 border border-violet-500/20 bg-violet-950/15`}>
      <summary
        className={`${studioGhostButton} cursor-pointer list-none px-3.5 py-3 text-sm font-medium text-violet-200 [&::-webkit-details-marker]:hidden sm:px-4`}
      >
        Timeline Intelligence
        <span className={`${studioSubtleText} ml-2 text-xs font-normal text-violet-300/70`}>
          dev only
        </span>
      </summary>

      <div className="space-y-3 border-t border-violet-500/15 px-3.5 py-3 sm:px-4 sm:py-4">
        <DevMetricGrid label="Preview build" summary={snapshot.preview} />
        <DevMetricGrid label="Export build" summary={snapshot.export} />

        <DevWarningSection title="Preview/export comparison" warnings={snapshot.comparisonWarnings} />
        <DevWarningSection title="Timing mismatch" warnings={snapshot.timingMismatchWarnings} />
        <DevWarningSection title="Subtitle completion" warnings={snapshot.subtitleCompletionWarnings} />
        <DevWarningSection title="Line-cap overflow" warnings={snapshot.lineCapOverflowWarnings} />
        <DevWarningSection title="Typewriter overrun" warnings={snapshot.typewriterOverrunWarnings} />
        <DevWarningSection title="Timeline optimizer" warnings={snapshot.optimizerFindings} />

        <DevSection title="Full diagnostics">
          <DevPre value={formatTimelineDevDiagnosticsForDev(snapshot)} />
        </DevSection>

        <DevSection title="JSON snapshot">
          <DevPre value={formatTimelineDevDiagnosticsJson(snapshot)} />
        </DevSection>
      </div>
    </details>
  );
}
