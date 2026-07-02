"use client";

import { Clock } from "lucide-react";
import { useMemo } from "react";

import { CopyButton } from "@/components/ui";
import { StudioStatus } from "@/components/studio-status";
import {
  exceedsTargetScriptDuration,
  getEstimatedScriptDurationSeconds,
  SCRIPT_LENGTH_OVER_TARGET_WARNING,
} from "@/features/story/utils/narration-duration-budget.utils";
import type { FootieScript } from "@/features/story/types";
import { formatDisplayDurationSec } from "@/lib/utils/formatDisplayDuration.utils";
import {
  studioBadge,
  studioFieldLabel,
  studioInput,
  studioSectionDesc,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
  studioTextarea,
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
          Target: {formatDisplayDurationSec(targetDurationSeconds)}
        </span>
        <span className="text-muted">
          Estimated script: {formatDisplayDurationSec(estimatedSeconds)}
        </span>
      </div>
      {showLengthWarning ? (
        <StudioStatus
          variant="warning"
          layout="panel"
          description={SCRIPT_LENGTH_OVER_TARGET_WARNING}
          className="text-left"
        />
      ) : null}
    </div>
  );
}

function StoryReviewStoryboardVariant({
  story,
  onStoryChange,
  targetDurationSeconds,
}: {
  story: FootieScript;
  onStoryChange: (story: FootieScript) => void;
  targetDurationSeconds: number;
}) {
  return (
    <div className="space-y-3">
      <ScriptDurationSummary
        targetDurationSeconds={targetDurationSeconds}
        narration={story.narration}
      />

      <div>
        <label htmlFor="story-title" className={studioFieldLabel}>
          Title
        </label>
        <input
          id="story-title"
          type="text"
          value={story.title}
          onChange={(e) => onStoryChange({ ...story, title: e.target.value })}
          className={`${studioInput} mt-1.5`}
        />
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="story-narration" className={studioFieldLabel}>
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
          <label htmlFor="story-title" className={studioFieldLabel}>
            Title
          </label>
          <input
            id="story-title"
            type="text"
            value={story.title}
            onChange={(e) => onStoryChange({ ...story, title: e.target.value })}
            className={`${studioInput} mt-1.5`}
          />
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="story-narration" className={studioFieldLabel}>
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
      <StoryReviewStoryboardVariant
        story={story}
        onStoryChange={onStoryChange}
        targetDurationSeconds={resolvedTargetDuration}
      />
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
        <label htmlFor="story-title" className={studioFieldLabel}>
          Title
        </label>
        <input
          id="story-title"
          type="text"
          value={story.title}
          onChange={(e) => onStoryChange({ ...story, title: e.target.value })}
          className={`${studioInput} mt-1.5`}
        />
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="story-narration" className={studioFieldLabel}>
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
