"use client";

import { CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { useMemo } from "react";

import type { FootieScript } from "@/features/story/types";
import { useOptionalStorySync } from "@/features/story-sync/StorySyncContext";
import {
  resolveStorySyncBanner,
  resolveStorySyncSteps,
  type StorySyncStepTone,
} from "@/features/story-sync/story-sync.utils";
import SynchronizationStep from "@/features/story-sync/components/SynchronizationStep";
import {
  studioPrimaryButton,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

const TONE_DOT: Record<StorySyncStepTone, string> = {
  success: "bg-emerald-400",
  warning: "bg-amber-300",
  neutral: "bg-muted/70",
};

export interface EditorWorkflowStatusProps {
  script: FootieScript;
  persistWarning?: string | null;
  saveDraftConfirmation?: string | null;
  warning?: string | null;
  onUpdateNarration?: () => void;
  onGenerateVoice?: () => void;
  onExportUpdated?: () => void;
}

export default function EditorWorkflowStatus({
  script,
  persistWarning,
  saveDraftConfirmation,
  warning,
  onUpdateNarration,
  onGenerateVoice,
  onExportUpdated,
}: EditorWorkflowStatusProps) {
  const storySync = useOptionalStorySync();
  const steps = useMemo(
    () => (storySync ? resolveStorySyncSteps(storySync.state, script) : []),
    [script, storySync],
  );
  const banner =
    storySync && !storySync.isBannerDismissed
      ? resolveStorySyncBanner(storySync.state, script)
      : null;
  const needsAttention =
    Boolean(persistWarning || warning || banner) ||
    steps.some((step) => step.tone === "warning");
  const label = persistWarning
    ? "Save failed"
    : needsAttention
      ? "Review updates"
      : saveDraftConfirmation
        ? "Saved"
        : "Ready";

  const handleBannerPrimary = () => {
    if (!banner) {
      return;
    }
    if (banner.kind === "narration") {
      onUpdateNarration?.();
    } else if (banner.kind === "voice") {
      onGenerateVoice?.();
    } else {
      onExportUpdated?.();
    }
  };

  return (
    <details className="group relative shrink-0" data-editor-workflow-status>
      <summary
        className={`flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-xl px-2.5 text-[11px] font-medium ring-1 transition [&::-webkit-details-marker]:hidden ${
          needsAttention
            ? "bg-amber-400/10 text-amber-100 ring-amber-300/20 hover:bg-amber-400/15"
            : "bg-emerald-400/10 text-emerald-100 ring-emerald-300/20 hover:bg-emerald-400/15"
        }`}
        aria-label={`Workflow status: ${label}`}
      >
        {needsAttention ? (
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        )}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown
          className="h-3 w-3 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(23rem,calc(100vw-2rem))] rounded-2xl border border-border/45 bg-surface/98 p-3.5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground/95">
              Project status
            </p>
            <p className={`${studioSubtleText} mt-0.5 text-[11px]`}>
              Save, narration, voice, media and export readiness.
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              needsAttention
                ? "bg-amber-400/10 text-amber-100"
                : "bg-emerald-400/10 text-emerald-100"
            }`}
          >
            {label}
          </span>
        </div>

        {persistWarning ? (
          <p className="mt-3 rounded-xl bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100 ring-1 ring-amber-300/20">
            {persistWarning}
          </p>
        ) : saveDraftConfirmation ? (
          <p className="mt-3 text-[11px] text-emerald-200/90">
            {saveDraftConfirmation}
          </p>
        ) : null}

        {banner ? (
          <div className="mt-3 rounded-xl bg-background/35 p-3 ring-1 ring-border/30">
            <p className="text-sm font-medium text-foreground/95">
              {banner.title}
            </p>
            {banner.description ? (
              <p className={`${studioSubtleText} mt-1 text-[11px]`}>
                {banner.description}
              </p>
            ) : null}
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={handleBannerPrimary}
                className={`${studioPrimaryButton} min-h-8 px-3 py-1.5 text-[11px]`}
              >
                {banner.primaryLabel}
              </button>
              <button
                type="button"
                onClick={storySync?.dismissBanner}
                className={`${studioSecondaryButton} min-h-8 px-3 py-1.5 text-[11px]`}
              >
                {banner.secondaryLabel}
              </button>
            </div>
          </div>
        ) : null}

        {steps.length > 0 ? (
          <div
            className="mt-3 space-y-1.5 border-t border-border/20 pt-3"
            role="list"
          >
            <div
              className="mb-2 flex items-center gap-1.5"
              aria-label="Synchronization summary"
            >
              {steps.map((step) => (
                <span
                  key={step.id}
                  className={`h-2 w-2 rounded-full ${TONE_DOT[step.tone]}`}
                  aria-hidden
                />
              ))}
            </div>
            {steps.map((step) => {
              const actionLabel =
                step.id === "narration" && storySync?.state.narrationDirty
                  ? "Update"
                  : step.id === "voice" && storySync?.state.voiceDirty
                    ? "Regenerate"
                    : undefined;
              const onAction =
                step.id === "narration" && storySync?.state.narrationDirty
                  ? onUpdateNarration
                  : step.id === "voice" && storySync?.state.voiceDirty
                    ? onGenerateVoice
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
        ) : null}

        {warning ? (
          <p
            className="mt-3 text-[11px] leading-relaxed text-amber-100/90"
            role="status"
          >
            {warning}
          </p>
        ) : null}
      </div>
    </details>
  );
}
