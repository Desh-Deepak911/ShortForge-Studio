"use client";

import {
  studioSectionDesc,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
  studioSuccessPanel,
} from "@/lib/utils/studioUi";
import type { FootieScript } from "@/features/story/types";

interface NarrationPanelProps {
  script: FootieScript;
  compact?: boolean;
}

export default function NarrationPanel({ script, compact = false }: NarrationPanelProps) {
  return (
    <div className={compact ? "space-y-4" : "space-y-6 sm:space-y-7"}>
      {!compact ? (
        <div>
          <p className={studioStepLabel}>Narration</p>
          <h2 className={studioSectionTitle}>Narration</h2>
          <p className={studioSectionDesc}>
            Turn your story narration into spoken audio for preview and export.
          </p>
        </div>
      ) : null}

      {script.voiceoverUrl ? (
        <div className={studioSuccessPanel}>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-accent">
            Audio preview
          </p>
          <audio controls src={script.voiceoverUrl} className="w-full" preload="metadata">
            Your browser does not support audio playback.
          </audio>
        </div>
      ) : (
        <p className={studioSubtleText}>
          No narration yet. Create it from your script to sync scenes and preview audio.
        </p>
      )}
    </div>
  );
}
