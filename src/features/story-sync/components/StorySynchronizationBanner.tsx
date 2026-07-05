"use client";

import {
  studioPrimaryButton,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import type { FootieScript } from "@/features/story/types";

import { useOptionalStorySync } from "../StorySyncContext";
import { resolveStorySyncBanner } from "../story-sync.utils";

export interface StorySynchronizationBannerProps {
  script: FootieScript;
  onUpdateNarration?: () => void;
  onGenerateVoice?: () => void;
  onExportUpdated?: () => void;
}

/**
 * Single highest-priority sync banner above the inspector.
 * Never blocks editing; dismissible without interrupting typing.
 */
export default function StorySynchronizationBanner({
  script,
  onUpdateNarration,
  onGenerateVoice,
  onExportUpdated,
}: StorySynchronizationBannerProps) {
  const storySync = useOptionalStorySync();
  if (!storySync || storySync.isBannerDismissed) {
    return null;
  }

  const banner = resolveStorySyncBanner(storySync.state, script);
  if (!banner) {
    return null;
  }

  const handlePrimary = () => {
    if (banner.kind === "narration") {
      onUpdateNarration?.();
      return;
    }
    if (banner.kind === "voice") {
      onGenerateVoice?.();
      return;
    }
    onExportUpdated?.();
  };

  const toneClass =
    banner.tone === "info"
      ? "border-sky-500/20 bg-sky-950/20"
      : "border-amber-500/20 bg-amber-950/20";

  return (
    <div
      role="status"
      data-story-sync-banner={banner.kind}
      className={`mb-3 shrink-0 rounded-xl border px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 ${toneClass}`}
    >
      <p className="text-sm font-medium text-foreground/95">{banner.title}</p>
      {banner.description ? (
        <p className={`${studioSubtleText} mt-0.5 text-xs`}>{banner.description}</p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePrimary}
          className={`${studioPrimaryButton} min-h-[2rem] px-3 py-1.5 text-xs`}
        >
          {banner.primaryLabel}
        </button>
        <button
          type="button"
          onClick={storySync.dismissBanner}
          className={`${studioSecondaryButton} min-h-[2rem] px-3 py-1.5 text-xs`}
        >
          {banner.secondaryLabel}
        </button>
      </div>
    </div>
  );
}
