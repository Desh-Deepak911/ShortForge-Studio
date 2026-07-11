"use client";

/**
 * Explicit export fallback choices (Sprint 6F).
 * Only shows typed fallbacks from ExportFinalizationError — never auto-triggers.
 */

import type { ExportFallbackChoice } from "@/features/export/formats";

const LABELS: Record<ExportFallbackChoice, string> = {
  retry: "Retry export",
  silent: "Export silent visual",
  "voice-only": "Export voice-only",
  webm: "Switch to WebM",
};

export interface ExportFallbackActionsProps {
  readonly availableFallbacks: readonly ExportFallbackChoice[];
  readonly onChoose: (choice: ExportFallbackChoice) => void;
  readonly disabled?: boolean;
}

export function ExportFallbackActions({
  availableFallbacks,
  onChoose,
  disabled = false,
}: ExportFallbackActionsProps) {
  if (availableFallbacks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-surface/40 p-3">
      <p className="text-[12px] text-muted">
        Choose a recovery option. Nothing runs until you select one.
      </p>
      <div className="flex flex-wrap gap-2">
        {availableFallbacks.map((choice) => (
          <button
            key={choice}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(choice)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface disabled:opacity-50"
          >
            {LABELS[choice]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function resolveExportFallbackAudioOption(
  choice: ExportFallbackChoice,
): "voice-only" | "silent" | "webm" | undefined {
  if (choice === "retry") return undefined;
  return choice;
}
