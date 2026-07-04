"use client";

import type { StorySyncStepModel, StorySyncStepTone } from "../story-sync.utils";

const TONE_DOT: Record<StorySyncStepTone, string> = {
  success: "bg-emerald-400/80",
  warning: "bg-amber-300/80",
  neutral: "bg-muted/50",
};

const TONE_TEXT: Record<StorySyncStepTone, string> = {
  success: "text-emerald-200/90",
  warning: "text-amber-100/90",
  neutral: "text-muted",
};

const TONE_MARK: Record<StorySyncStepTone, string> = {
  success: "✓",
  warning: "⚠",
  neutral: "·",
};

export interface SynchronizationStepProps {
  step: StorySyncStepModel;
  /** Optional compact action (e.g. Update narration when dirty). */
  actionLabel?: string;
  onAction?: () => void;
}

/** Sync status row — optional action button for guided repair. */
export default function SynchronizationStep({
  step,
  actionLabel,
  onAction,
}: SynchronizationStepProps) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5"
      data-sync-step={step.id}
      data-sync-tone={step.tone}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[step.tone]}`}
          aria-hidden
        />
        <span className="text-xs font-medium text-foreground/90">{step.label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            data-sync-step-action={step.id}
            className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent/90 ring-1 ring-accent/25 transition-colors hover:bg-accent/10 hover:text-accent"
          >
            {actionLabel}
          </button>
        ) : null}
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium ${TONE_TEXT[step.tone]}`}
        >
          <span aria-hidden>{TONE_MARK[step.tone]}</span>
          {step.statusLabel}
        </span>
      </div>
    </div>
  );
}
