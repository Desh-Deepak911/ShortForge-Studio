"use client";

import { studioSyncStatusStep } from "@/lib/utils/studioUi";

import type { StorySyncStepModel, StorySyncStepTone } from "../story-sync.utils";

const TONE_DOT: Record<StorySyncStepTone, string> = {
  success: "bg-emerald-400 ring-1 ring-emerald-300/40 shadow-[0_0_8px_rgba(52,211,153,0.35)]",
  warning: "bg-amber-300 ring-1 ring-amber-200/35 shadow-[0_0_8px_rgba(252,211,77,0.25)]",
  neutral: "bg-muted/70 ring-1 ring-border/30",
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
      className={studioSyncStatusStep}
      data-sync-step={step.id}
      data-sync-tone={step.tone}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex h-2 w-2 shrink-0 rounded-full ${TONE_DOT[step.tone]}`}
          aria-hidden
        />
        <span className="whitespace-nowrap text-xs font-medium text-foreground/90">
          {step.label}
        </span>
      </div>
      <div className="flex min-w-0 items-start justify-end gap-2">
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            data-sync-step-action={step.id}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent/90 ring-1 ring-accent/25 transition-colors hover:bg-accent/10 hover:text-accent"
          >
            {actionLabel}
          </button>
        ) : null}
        <span
          className={`inline-flex min-w-0 items-start gap-1 text-right text-[11px] font-medium leading-snug ${TONE_TEXT[step.tone]}`}
        >
          <span aria-hidden className="mt-px shrink-0 leading-none">
            {TONE_MARK[step.tone]}
          </span>
          <span className="min-w-0 break-words">{step.statusLabel}</span>
        </span>
      </div>
    </div>
  );
}
