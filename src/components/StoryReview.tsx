"use client";

import { Clock } from "lucide-react";
import { useMemo } from "react";

import { CopyButton } from "@/components/ui";
import {
  exceedsTargetScriptDuration,
  getEstimatedScriptDurationSeconds,
  SCRIPT_LENGTH_OVER_TARGET_WARNING,
} from "@/features/story/utils/narration-duration-budget.utils";
import type { FootieScript } from "@/features/story/types";
import {
  studioBadge,
  studioInput,
  studioLabel,
  studioSectionDesc,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
  studioTextarea,
  studioWarningPanel,
} from "@/lib/utils/studioUi";

interface StoryReviewProps {
  story: FootieScript;
  onStoryChange: (story: FootieScript) => void;
  variant?: "default" | "storyboard" | "embedded";
  /** Selected target duration from create brief — drives estimate comparison. */
  targetDurationSeconds?: number;
}

function ScriptDurationSummary({
  targetDurationSeconds,
  narration,
}: {
  targetDurationSeconds: number;
  narration: string;
}) {
  const estimatedSeconds = useMemo(
    () => getEstimatedScriptDurationSeconds(narration),
    [narration],
  );
  const showLengthWarning = useMemo(
    () => exceedsTargetScriptDuration(narration, targetDurationSeconds),
    [narration, targetDurationSeconds],
  );

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <div className={`${studioBadge} flex flex-col items-start gap-1 text-left`}>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Target: {targetDurationSeconds}s
        </span>
        <span className="text-muted">Estimated script: {estimatedSeconds}s</span>
      </div>
      {showLengthWarning ? (
        <p className={`${studioWarningPanel} text-xs leading-relaxed text-amber-100/90`} role="status">
          {SCRIPT_LENGTH_OVER_TARGET_WARNING}
        </p>
      ) : null}
    </div>
  );
}

export default function StoryReview({
  story,
  onStoryChange,
  variant = "default",
  targetDurationSeconds,
}: StoryReviewProps) {
  const resolvedTargetDuration = targetDurationSeconds ?? story.totalDuration;

  if (variant === "embedded") {
    return (
      <div className="space-y-5">
        <ScriptDurationSummary
          targetDurationSeconds={resolvedTargetDuration}
          narration={story.narration}
        />

        <div>
          <label htmlFor="story-title" className={studioLabel}>
            Title
          </label>
          <input
            id="story-title"
            type="text"
            value={story.title}
            onChange={(e) => onStoryChange({ ...story, title: e.target.value })}
            className={studioInput}
          />
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="story-narration" className={studioLabel}>
              Narration
            </label>
            <CopyButton text={story.narration} label="Copy narration" />
          </div>
          <textarea
            id="story-narration"
            value={story.narration}
            onChange={(e) => onStoryChange({ ...story, narration: e.target.value })}
            rows={10}
            placeholder="Full spoken narration for your short"
            className={studioTextarea}
          />
          <p className={`${studioSubtleText} mt-2`}>
            Edit your script before creating narration — changes save automatically.
          </p>
        </div>
      </div>
    );
  }

  if (variant === "storyboard") {
    return (
      <details className="group" open>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={studioStepLabel}>Story</p>
              <h2 className={studioSectionTitle}>Title & narration</h2>
              <p className={studioSectionDesc}>
                Refine copy before creating narration.
              </p>
            </div>
            <ScriptDurationSummary
              targetDurationSeconds={resolvedTargetDuration}
              narration={story.narration}
            />
          </div>
          <p className={`${studioSubtleText} mt-3 group-open:hidden`}>
            Tap to expand title and narration
          </p>
        </summary>

        <div className="mt-5 space-y-5 border-t border-border/40 pt-5 sm:mt-6 sm:space-y-6 sm:pt-6">
          <div>
            <label htmlFor="story-title" className={studioLabel}>
              Title
            </label>
            <input
              id="story-title"
              type="text"
              value={story.title}
              onChange={(e) => onStoryChange({ ...story, title: e.target.value })}
              className={studioInput}
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="story-narration" className={studioLabel}>
                Narration
              </label>
              <CopyButton text={story.narration} label="Copy narration" />
            </div>
            <textarea
              id="story-narration"
              value={story.narration}
              onChange={(e) => onStoryChange({ ...story, narration: e.target.value })}
              rows={6}
              placeholder="Full spoken narration for your short"
              className={studioTextarea}
            />
          </div>
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={studioStepLabel}>Story</p>
          <h2 className={studioSectionTitle}>Your story</h2>
          <p className={studioSectionDesc}>
            Edit the title and narration before creating narration audio.
          </p>
        </div>
        <ScriptDurationSummary
          targetDurationSeconds={resolvedTargetDuration}
          narration={story.narration}
        />
      </div>

      <div>
        <label htmlFor="story-title" className={studioLabel}>
          Title
        </label>
        <input
          id="story-title"
          type="text"
          value={story.title}
          onChange={(e) => onStoryChange({ ...story, title: e.target.value })}
          className={studioInput}
        />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="story-narration" className={studioLabel}>
            Narration
          </label>
          <CopyButton text={story.narration} label="Copy narration" />
        </div>
        <textarea
          id="story-narration"
          value={story.narration}
          onChange={(e) => onStoryChange({ ...story, narration: e.target.value })}
          rows={8}
          placeholder="Full spoken narration for your short"
          className={studioTextarea}
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Preview plays your full narration while scenes change in sequence.
        </p>
      </div>
    </div>
  );
}
