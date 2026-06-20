"use client";

import {
  studioLoadingMessage,
  studioLoadingSubtext,
  studioSkeleton,
  studioWorkspaceAside,
  studioWorkspaceGrid,
  studioWorkspaceMain,
  studioWorkspacePanel,
} from "@/lib/studioUi";

interface StudioLoadingStateProps {
  topic?: string;
  tone?: string;
  duration?: number;
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
}: StudioLoadingStateProps) {
  const detail =
    topic?.trim() && tone && duration
      ? `${duration}s · ${tone} · “${topic.trim().slice(0, 48)}${topic.trim().length > 48 ? "…" : ""}”`
      : undefined;

  return (
    <section aria-busy="true" aria-live="polite" aria-label="Building storyboard" className="min-w-0 w-full overflow-hidden">
      <div className="mb-4 sm:mb-6">
        <p className={studioLoadingMessage}>Building your storyboard...</p>
        {detail ? <p className={studioLoadingSubtext}>{detail}</p> : null}
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
