"use client";

import { studioSubtleText, studioSyncStatusCard } from "@/lib/utils/studioUi";

import type { FootieScript } from "@/features/story/types";

import { useOptionalStorySync } from "../StorySyncContext";
import { resolveStorySyncSteps } from "../story-sync.utils";
import SynchronizationStep from "./SynchronizationStep";

export interface SynchronizationStatusCardProps {
  script: FootieScript;
  onUpdateNarration?: () => void;
  onRegenerateVoice?: () => void;
  warning?: string | null;
}

/**
 * Project inspector health card — guided repair actions for narration/voice when dirty.
 */
export default function SynchronizationStatusCard({
  script,
  onUpdateNarration,
  onRegenerateVoice,
  warning,
}: SynchronizationStatusCardProps) {
  const storySync = useOptionalStorySync();
  if (!storySync) {
    return null;
  }

  return (
    <section
      aria-label="Story synchronization status"
      className={studioSyncStatusCard}
      data-story-sync-card
    >
      <header className="mb-2.5 border-b border-border/15 px-0.5 pb-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/85">
          Synchronization
        </p>
        <p className={`${studioSubtleText} mt-1 text-[11px] leading-snug`}>
          Story, voice, media, and export readiness are tracked separately.
        </p>
      </header>
      <div className="space-y-1.5" role="list">
        {resolveStorySyncSteps(storySync.state, script).map((step) => {
          const actionLabel =
            step.id === "narration" && storySync.state.narrationDirty
              ? "Update"
              : step.id === "voice" && storySync.state.voiceDirty
                ? "Regenerate"
                : undefined;
          const onAction =
            step.id === "narration" && storySync.state.narrationDirty
              ? onUpdateNarration
              : step.id === "voice" && storySync.state.voiceDirty
                ? onRegenerateVoice
                : undefined;

          return (
            <div key={step.id} role="listitem">
              <SynchronizationStep
                step={step}
                actionLabel={actionLabel}
                onAction={onAction}
              />
            </div>
          );
        })}
      </div>
      {warning ? (
        <p
          role="status"
          data-story-sync-warning
          className="mt-2 px-1 text-[11px] leading-snug text-amber-100/90"
        >
          {warning}
        </p>
      ) : null}
    </section>
  );
}
