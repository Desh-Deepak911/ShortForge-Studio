"use client";

import { Download } from "lucide-react";

import StudioAccordion from "@/components/studio-shell/StudioAccordion";
import { StudioStatus } from "@/components/studio-status";
import { formatDisplayDurationSec } from "@/lib/utils/formatDisplayDuration.utils";
import {
  studioFieldLabel,
  studioPanel,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface ExportSuccessSummaryProps {
  fileName: string;
  durationSec: number;
  resolution: string;
  voiceoverEnabled: boolean;
  backgroundMusicEnabled: boolean;
  diagnostics: string[];
}

function EnabledLabel({ enabled }: { enabled: boolean }) {
  return (
    <span className={enabled ? "text-foreground/90" : "text-muted"}>{enabled ? "Yes" : "No"}</span>
  );
}

/**
 * Post-export success summary — key facts first; secondary details collapsible.
 */
export default function ExportSuccessSummary({
  fileName,
  durationSec,
  resolution,
  voiceoverEnabled,
  backgroundMusicEnabled,
  diagnostics,
}: ExportSuccessSummaryProps) {
  return (
    <div className={`${studioPanel} space-y-3`}>
      <StudioStatus
        variant="success"
        layout="panel"
        title="Export completed"
        description="Your video is ready. Publish to platforms or download again below."
      />

      <dl className="space-y-2 border-y border-border/15 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className={studioFieldLabel}>Filename</dt>
          <dd className="truncate text-right font-medium text-foreground/90">{fileName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className={studioFieldLabel}>Duration</dt>
          <dd className="tabular-nums font-medium text-foreground/90">
            {formatDisplayDurationSec(durationSec)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className={studioFieldLabel}>Resolution</dt>
          <dd className="font-medium text-foreground/90">{resolution.replace("x", "×")}</dd>
        </div>
      </dl>

      <StudioAccordion variant="nested" title="Export details">
        <div className="space-y-2.5 text-[11px]">
          <div className="flex items-center justify-between gap-3">
            <span className={studioFieldLabel}>Voiceover enabled</span>
            <EnabledLabel enabled={voiceoverEnabled} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className={studioFieldLabel}>Background music enabled</span>
            <EnabledLabel enabled={backgroundMusicEnabled} />
          </div>
          {diagnostics.length > 0 ? (
            <div className="space-y-2 border-t border-border/15 pt-2.5">
              <p className={`${studioSubtleText} text-[10px] uppercase tracking-wide`}>Diagnostics</p>
              <ul className="space-y-1.5 leading-relaxed text-muted">
                {diagnostics.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </StudioAccordion>
    </div>
  );
}

export function ExportDownloadAgainButton({
  disabled,
  onClick,
  className = "",
}: {
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      <Download className="h-4 w-4" strokeWidth={1.75} />
      Download again
    </button>
  );
}
