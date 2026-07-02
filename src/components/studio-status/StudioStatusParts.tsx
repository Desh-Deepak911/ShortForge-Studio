"use client";

import {
  studioEmptyStateDesc,
  studioEmptyStateIcon,
  studioEmptyStateTitle,
  studioError,
  studioLoadingMessage,
  studioLoadingSubtext,
  studioStatusSpinnerHost,
  studioSubtleText,
  studioSuccessPanel,
  studioWarningPanel,
} from "@/lib/utils/studioUi";

import type { StudioStatusStepState } from "./studio-status.types";

export function StudioStatusSpinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-2 border-accent/25 border-t-accent ${className}`}
    />
  );
}

export function StudioStatusStepIndicator({ state }: { state: StudioStatusStepState }) {
  if (state === "done") {
    return (
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] text-accent"
      >
        ✓
      </span>
    );
  }

  if (state === "active") {
    return (
      <span
        aria-hidden
        className="flex h-4 w-4 shrink-0 items-center justify-center"
      >
        <StudioStatusSpinner className="h-3 w-3" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border/30"
    />
  );
}

export function StudioStatusStepList({
  steps,
  activeStep,
  className = "",
}: {
  steps: readonly string[];
  activeStep: number;
  className?: string;
}) {
  return (
    <ol className={`space-y-2 ${className}`.trim()}>
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = activeStep === stepNumber;
        const isDone = activeStep > stepNumber;
        const state: StudioStatusStepState = isDone ? "done" : isActive ? "active" : "pending";

        return (
          <li
            key={label}
            aria-current={isActive ? "step" : undefined}
            className={`flex items-center gap-2.5 text-xs ${
              isActive
                ? "font-medium text-foreground/90"
                : isDone
                  ? "text-muted"
                  : "text-muted/45"
            }`}
          >
            <StudioStatusStepIndicator state={state} />
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function studioStatusPanelClass(variant: "success" | "warning" | "error"): string {
  switch (variant) {
    case "success":
      return studioSuccessPanel;
    case "warning":
      return studioWarningPanel;
    case "error":
      return studioError;
    default:
      return studioError;
  }
}

export const studioStatusTokens = {
  centeredTitle: studioLoadingMessage,
  centeredDescription: studioLoadingSubtext,
  compactTitle: "text-sm font-medium tracking-tight text-foreground/90",
  compactDescription: `${studioSubtleText} mt-1 text-[11px] leading-relaxed`,
  emptyTitle: studioEmptyStateTitle,
  emptyDescription: studioEmptyStateDesc,
  emptyIconHost: studioEmptyStateIcon,
  spinnerHost: studioStatusSpinnerHost,
  panelTitle: "text-sm font-medium text-foreground/90",
  panelDescription: "mt-1 text-xs leading-relaxed text-muted",
  warningPanelTitle: "text-sm font-medium text-amber-100/90",
  warningPanelDescription: "mt-1 text-xs leading-relaxed text-amber-200/60",
  inlineTitle: "text-xs font-semibold text-foreground/90",
  inlineDescription: "mt-0.5 text-[10px] leading-relaxed text-muted",
};
