"use client";

import {
  studioLoadingMessage,
  studioLoadingSubtext,
  studioSkeleton,
  studioWorkspaceAside,
  studioWorkspaceGrid,
  studioWorkspaceMain,
  studioWorkspacePanel,
} from "@/lib/utils/studioUi";
import {
  GENERATION_LOADING_STEPS,
  type GenerationLoadingStep,
} from "@/types/footiebitz";

interface StudioLoadingStateProps {
  topic?: string;
  tone?: string;
  duration?: number;
  loadingStep?: GenerationLoadingStep;
  /** Script-only create flow — no editor skeleton or multi-step checklist. */
  variant?: "full" | "script-only";
}

function ScriptOnlyLoadingState({
  topic,
  tone,
  duration,
}: Pick<StudioLoadingStateProps, "topic" | "tone" | "duration">) {
  const detail =
    topic?.trim() && tone && duration
      ? `${duration}s · ${tone} · “${topic.trim().slice(0, 48)}${topic.trim().length > 48 ? "…" : ""}”`
      : undefined;

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      aria-label="Writing your story"
      className="flex min-w-0 w-full justify-center py-8 sm:py-12"
    >
      <div className="flex max-w-md flex-col items-center text-center">
        <span
          aria-hidden
          className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated/60 ring-1 ring-border/25"
        >
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
        </span>
        <p className={studioLoadingMessage}>Writing your story...</p>
        {detail ? <p className={`${studioLoadingSubtext} mt-2`}>{detail}</p> : null}
        <p className={`${studioLoadingSubtext} mt-3 max-w-xs`}>
          You&apos;ll review and edit the script on the next screen.
        </p>
      </div>
    </section>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-white/[0.03] ring-1 ring-border/15 ${className}`} />;
}

function SkeletonSceneCard({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`${studioSkeleton} overflow-hidden rounded-2xl p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-6 w-6 rounded-full" />
          <div className="space-y-2">
            <SkeletonBlock className="h-3.5 w-24" />
            <SkeletonBlock className="h-3 w-32" />
          </div>
        </div>
        <SkeletonBlock className="h-7 w-14" />
      </div>
      <SkeletonBlock className={`mt-5 w-full ${tall ? "aspect-[9/16] max-h-48" : "h-28"}`} />
      <div className="mt-4 space-y-2">
        <SkeletonBlock className="h-3 w-16" />
        <SkeletonBlock className="h-16 w-full" />
      </div>
    </div>
  );
}

function SkeletonAsidePanel({ lines = 2 }: { lines?: number }) {
  return (
    <div className={`${studioWorkspacePanel} pointer-events-none select-none`}>
      <div className="mb-5 space-y-2">
        <SkeletonBlock className="h-3 w-12" />
        <SkeletonBlock className="h-5 w-28" />
        {lines > 1 ? <SkeletonBlock className="h-3.5 w-full max-w-[14rem]" /> : null}
      </div>
      <div className="space-y-3">
        <SkeletonBlock className="h-11 w-full" />
        <SkeletonBlock className="h-11 w-full" />
      </div>
    </div>
  );
}

function StepIndicator({
  state,
}: {
  state: "done" | "active" | "pending";
}) {
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
        <span className="h-3 w-3 animate-spin rounded-full border border-accent/30 border-t-accent" />
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

export default function StudioLoadingState({
  topic,
  tone,
  duration,
  loadingStep = 1,
  variant = "full",
}: StudioLoadingStateProps) {
  if (variant === "script-only") {
    return <ScriptOnlyLoadingState topic={topic} tone={tone} duration={duration} />;
  }

  const detail =
    topic?.trim() && tone && duration
      ? `${duration}s · ${tone} · “${topic.trim().slice(0, 48)}${topic.trim().length > 48 ? "…" : ""}”`
      : undefined;

  const activeLabel = GENERATION_LOADING_STEPS[loadingStep - 1];

  return (
    <section aria-busy="true" aria-live="polite" aria-label="Building storyboard" className="min-w-0 w-full overflow-hidden">
      <div className="mb-4 sm:mb-6">
        <p className={studioLoadingMessage}>{activeLabel}</p>
        {detail ? <p className={studioLoadingSubtext}>{detail}</p> : null}
        <ol className="mx-auto mt-4 max-w-sm space-y-2">
          {GENERATION_LOADING_STEPS.map((label, index) => {
            const step = (index + 1) as GenerationLoadingStep;
            const isActive = loadingStep === step;
            const isDone = loadingStep > step;
            const state = isDone ? "done" : isActive ? "active" : "pending";

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
                <StepIndicator state={state} />
                <span>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className={`${studioWorkspaceGrid} pointer-events-none min-w-0 select-none opacity-90`}>
        <div className={studioWorkspaceMain}>
          <div className={`${studioSkeleton} mb-4 h-16 rounded-xl sm:mb-6 sm:h-24 sm:rounded-2xl`} />

          <div className="space-y-4 sm:space-y-6">
            <SkeletonSceneCard tall />
            <div className={`${studioSkeleton} mx-auto h-8 max-w-xs rounded-xl sm:h-10 sm:rounded-2xl`} />
            <SkeletonSceneCard />
            <div className={`${studioSkeleton} mx-auto hidden h-8 max-w-xs rounded-xl sm:block sm:h-10 sm:rounded-2xl`} />
            <SkeletonSceneCard />
          </div>
        </div>

        <aside className={`${studioWorkspaceAside} hidden sm:flex`}>
          <div className={`${studioWorkspacePanel} flex flex-col items-center`}>
            <SkeletonBlock className="mb-4 h-3 w-12" />
            <div className={`${studioSkeleton} aspect-[9/16] w-full max-w-[min(100%,17.5rem)] rounded-[1.75rem] sm:max-w-[260px] sm:rounded-[2rem]`} />
            <div className="mt-4 flex w-full max-w-[min(100%,17.5rem)] gap-2 sm:max-w-[260px]">
              <SkeletonBlock className="h-8 flex-1 rounded-full" />
              <SkeletonBlock className="h-8 flex-1 rounded-full" />
              <SkeletonBlock className="h-8 flex-1 rounded-full" />
            </div>
          </div>
          <SkeletonAsidePanel />
          <SkeletonAsidePanel lines={1} />
        </aside>
      </div>
    </section>
  );
}
