"use client";

/**
 * Compact read-only preview of suggested visual change offsets.
 * Not an editable timeline — Visual sequence steppers remain the timing editor.
 */

export function formatVisualPacingOffsetSeconds(offsetMs: number): string {
  const seconds = Math.max(0, offsetMs) / 1000;
  return `${seconds.toFixed(1)}s`;
}

export function formatVisualPacingChangesLabel(
  offsetsMs: readonly number[],
): string {
  if (offsetsMs.length === 0) {
    return "No suggested changes.";
  }
  const parts = offsetsMs.map(formatVisualPacingOffsetSeconds);
  return `Changes at ${parts.join(" · ")}`;
}

export interface VisualPacingSuggestionPreviewProps {
  readonly offsetsMs: readonly number[];
  readonly sceneDurationMs: number;
  readonly label?: string;
  readonly applied?: boolean;
}

export default function VisualPacingSuggestionPreview({
  offsetsMs,
  sceneDurationMs,
  label = "Suggested pacing",
  applied = false,
}: VisualPacingSuggestionPreviewProps) {
  const textEquivalent = formatVisualPacingChangesLabel(offsetsMs);
  const durationMs = Math.max(1, sceneDurationMs);

  return (
    <div
      className="space-y-1.5 rounded-xl bg-background/25 px-3 py-2.5 ring-1 ring-border/30"
      data-visual-pacing-suggestion-preview
      data-visual-pacing-preview-applied={applied ? "true" : "false"}
    >
      <p className="text-[11px] font-medium text-foreground/85">{label}</p>
      <p
        className="text-xs tabular-nums leading-relaxed text-foreground/90"
        data-visual-pacing-preview-text
      >
        {textEquivalent}
      </p>
      {offsetsMs.length > 0 ? (
        <div
          className="relative h-1.5 overflow-hidden rounded-full bg-surface-elevated/50"
          aria-hidden="true"
          data-visual-pacing-preview-ticks
        >
          {offsetsMs.map((offsetMs, index) => {
            const left = Math.min(100, Math.max(0, (offsetMs / durationMs) * 100));
            return (
              <span
                key={`${offsetMs}-${index}`}
                className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-accent/70"
                style={{ left: `${left}%` }}
              />
            );
          })}
        </div>
      ) : null}
      {!applied ? (
        <p className="text-[11px] leading-relaxed text-muted">
          Apply to change the scene timing.
        </p>
      ) : null}
    </div>
  );
}
