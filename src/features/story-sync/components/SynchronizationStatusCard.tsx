"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { studioSubtleText, studioSyncStatusCard } from "@/lib/utils/studioUi";

import type { FootieScript } from "@/features/story/types";

import { useOptionalStorySync } from "../StorySyncContext";
import { resolveStorySyncSteps, type StorySyncStepTone } from "../story-sync.utils";
import SynchronizationStep from "./SynchronizationStep";

/** Matches SynchronizationStep tone dots — presentation only. */
const SYNC_STEP_TONE_DOT: Record<StorySyncStepTone, string> = {
  success: "bg-emerald-400 ring-1 ring-emerald-300/40 shadow-[0_0_8px_rgba(52,211,153,0.35)]",
  warning: "bg-amber-300 ring-1 ring-amber-200/35 shadow-[0_0_8px_rgba(252,211,77,0.25)]",
  neutral: "bg-muted/70 ring-1 ring-border/30",
};

export interface SynchronizationStatusCardProps {
  script: FootieScript;
  onUpdateNarration?: () => void;
  onRegenerateVoice?: () => void;
  warning?: string | null;
}

/**
 * Project inspector health card — guided repair actions for narration/voice when dirty.
 * Collapsed by default so Scene / Project tabs sit higher in the inspector.
 */
export default function SynchronizationStatusCard({
  script,
  onUpdateNarration,
  onRegenerateVoice,
  warning,
}: SynchronizationStatusCardProps) {
  const [expanded, setExpanded] = useState(false);
  const storySync = useOptionalStorySync();
  if (!storySync) {
    return null;
  }

  const steps = resolveStorySyncSteps(storySync.state, script);

  return (
    <section
      aria-label="Story synchronization status"
      className={studioSyncStatusCard}
      data-story-sync-card
      data-story-sync-card-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-start gap-2 text-left transition-opacity hover:opacity-95"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls="story-sync-card-body"
        data-story-sync-card-toggle
      >
        <span className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/85">
            Synchronization
          </p>
          {!expanded ? (
            <p className={`${studioSubtleText} mt-0.5 text-[11px] leading-snug`}>
              Story, voice, media, and export readiness
            </p>
          ) : null}
        </span>
        {!expanded ? (
          <span
            className="flex shrink-0 items-center gap-1.5 pt-0.5"
            aria-label="Sync status summary"
            data-story-sync-status-dots
          >
            {steps.map((step) => (
              <span
                key={step.id}
                data-sync-step-dot={step.id}
                data-sync-tone={step.tone}
                className={`inline-flex h-2 w-2 rounded-full ${SYNC_STEP_TONE_DOT[step.tone]}`}
                aria-hidden
              />
            ))}
          </span>
        ) : null}
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div id="story-sync-card-body" className="mt-2.5 border-t border-border/15 pt-2.5">
          <p className={`${studioSubtleText} mb-2.5 px-0.5 text-[11px] leading-snug`}>
            Story, voice, media, and export readiness are tracked separately.
          </p>
          <div className="space-y-1.5" role="list">
            {steps.map((step) => {
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
        </div>
      ) : null}
    </section>
  );
}
