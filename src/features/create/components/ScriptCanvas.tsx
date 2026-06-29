"use client";

import StoryReview from "@/components/StoryReview";
import { StudioPanel } from "@/components/studio-shell";
import type { FootieScript } from "@/features/story/types";
import { studioStepLabel, studioSubtleText } from "@/lib/utils/studioUi";

export interface ScriptCanvasProps {
  script: FootieScript;
  onStoryChange: (script: FootieScript) => void;
  targetDurationSeconds: number;
  saveMessage?: string | null;
  autosaveSavedMessage?: string | null;
}

/**
 * Script review canvas — title, narration, duration estimate, and warnings.
 */
export default function ScriptCanvas({
  script,
  onStoryChange,
  targetDurationSeconds,
  saveMessage,
  autosaveSavedMessage,
}: ScriptCanvasProps) {
  const statusMessage = saveMessage ?? autosaveSavedMessage;

  return (
    <section id="review-script-canvas" className="flex min-h-0 w-full min-w-0 flex-col">
      <div className="mb-4 min-w-0">
        <p className={studioStepLabel}>Script Review</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          Review your script
        </h2>
        <p className={`${studioSubtleText} mt-1`}>
          Refine the title and narration. Estimated duration is compared to your target.
        </p>
      </div>

      <StudioPanel>
        <StoryReview
          story={script}
          onStoryChange={onStoryChange}
          variant="embedded"
          targetDurationSeconds={targetDurationSeconds}
        />

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border/30 pt-5">
          {statusMessage ? (
            <p className={studioSubtleText} role="status" aria-live="polite">
              {statusMessage}
            </p>
          ) : (
            <p className={studioSubtleText}>Edits save automatically.</p>
          )}
        </div>
      </StudioPanel>
    </section>
  );
}
