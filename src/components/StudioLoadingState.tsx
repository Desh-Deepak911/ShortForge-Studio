"use client";

import {
  StudioStatus,
  StudioStatusSpinner,
  StudioStatusStepList,
} from "@/components/studio-status";
import {
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
import { formatDisplayDurationSec } from "@/lib/utils/formatDisplayDuration.utils";

const CREATE_STORY_LOADING_STEPS = [
  "Understanding your topic",
  "Researching information",
  "Writing narration",
  "Building storyboard",
  "Preparing editor",
] as const;

interface StudioLoadingStateProps {
  topic?: string;
  tone?: string;
  duration?: number;
  loadingStep?: GenerationLoadingStep;
  /** Script-only create flow — no editor skeleton or multi-step checklist. */
  variant?: "full" | "script-only" | "create-story" | "compact";
  /** When true, create-story loading highlights the research step. */
  enableResearch?: boolean;
  /** Compact variant title override. */
  title?: string;
  /** Compact variant subtitle override. */
  subtitle?: string;
}

function ScriptOnlyLoadingState({
  topic,
  tone,
  duration,
}: Pick<StudioLoadingStateProps, "topic" | "tone" | "duration">) {
  const detail =
    topic?.trim() && tone && duration
      ? `${formatDisplayDurationSec(duration)} · ${tone} · “${topic.trim().slice(0, 48)}${topic.trim().length > 48 ? "…" : ""}”`
      : undefined;

  return (
    <StudioStatus
      variant="loading"
      layout="centered"
      title="Writing your story..."
      description={
        detail ? (
          <>
            {detail}
            <span className="mt-3 block max-w-xs">
              You&apos;ll review and edit the script on the next screen.
            </span>
          </>
        ) : (
          "You'll review and edit the script on the next screen."
        )
      }
      aria-label="Writing your story"
      className="py-8 sm:py-12"
    />
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

export default function StudioLoadingState({
  topic,
  tone,
  duration,
  loadingStep = 1,
  variant = "full",
  enableResearch = true,
  title,
  subtitle,
}: StudioLoadingStateProps) {
  if (variant === "script-only") {
    return <ScriptOnlyLoadingState topic={topic} tone={tone} duration={duration} />;
  }

  if (variant === "create-story") {
    const activeStep = enableResearch ? 2 : 3;

    return (
      <StudioStatus
        variant="loading"
        layout="centered"
        title="Creating your story..."
        description="Researching your topic, building the narrative, and preparing your storyboard."
        steps={CREATE_STORY_LOADING_STEPS}
        activeStep={activeStep}
        aria-label="Creating your story"
      />
    );
  }

  if (variant === "compact") {
    return (
      <StudioStatus
        variant="loading"
        layout="compact"
        title={title ?? "Building storyboard..."}
        description={subtitle ?? "Preparing scenes and arranging your storyboard."}
        steps={GENERATION_LOADING_STEPS}
        activeStep={loadingStep}
        aria-label={title ?? "Building storyboard"}
      />
    );
  }

  const detail =
    topic?.trim() && tone && duration
      ? `${formatDisplayDurationSec(duration)} · ${tone} · “${topic.trim().slice(0, 48)}${topic.trim().length > 48 ? "…" : ""}”`
      : undefined;

  const activeLabel = GENERATION_LOADING_STEPS[loadingStep - 1];

  return (
    <section aria-busy="true" aria-live="polite" aria-label="Building storyboard" className="min-w-0 w-full overflow-hidden">
      <div className="mb-4 sm:mb-6">
        <p className="text-center text-sm font-medium tracking-tight text-foreground/90 sm:text-[15px]">
          {activeLabel}
        </p>
        {detail ? <p className="mt-1.5 text-center text-xs text-muted">{detail}</p> : null}
        <StudioStatusStepList
          steps={GENERATION_LOADING_STEPS}
          activeStep={loadingStep}
          className="mx-auto mt-4 max-w-sm"
        />
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

/** Draft / project open loading — spinner, copy, and compact skeleton. */
export function StudioProjectLoadingState({
  title = "Opening your project...",
  description = "Restoring your story, timeline, and editor workspace.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <StudioStatus variant="loading" layout="centered" title={title} description={description} aria-label={title}>
      <div
        aria-hidden
        className="pointer-events-none mt-8 w-full max-w-sm space-y-3 select-none"
      >
        <div className={`${studioSkeleton} h-3 w-full`} />
        <div className={`${studioSkeleton} mx-auto h-3 w-[80%]`} />
        <div className={`${studioSkeleton} mt-4 h-24 w-full rounded-2xl`} />
        <div className="grid grid-cols-3 gap-2">
          <div className={`${studioSkeleton} h-10 rounded-xl`} />
          <div className={`${studioSkeleton} h-10 rounded-xl`} />
          <div className={`${studioSkeleton} h-10 rounded-xl`} />
        </div>
      </div>
    </StudioStatus>
  );
}

export { StudioStatusSpinner, StudioStatusStepList };
