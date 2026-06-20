"use client";

import { Clock } from "lucide-react";

import CopyButton from "@/components/CopyButton";
import {
  studioBadge,
  studioInput,
  studioLabel,
  studioSectionDesc,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
  studioTextarea,
} from "@/lib/studioUi";
import type { FootieScript } from "@/types/footiebitz";

interface StoryReviewProps {
  story: FootieScript;
  onStoryChange: (story: FootieScript) => void;
  variant?: "default" | "storyboard";
}

export default function StoryReview({
  story,
  onStoryChange,
  variant = "default",
}: StoryReviewProps) {
  if (variant === "storyboard") {
    return (
      <details className="group" open>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={studioStepLabel}>Story draft</p>
              <h2 className={studioSectionTitle}>Title & narration</h2>
              <p className={studioSectionDesc}>
                Refine copy before generating spoken audio.
              </p>
            </div>
            <span className={`${studioBadge} shrink-0`}>
              <Clock className="h-3.5 w-3.5" />
              {story.totalDuration}s
            </span>
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className={studioStepLabel}>Step 2</p>
          <h2 className={studioSectionTitle}>Story Draft</h2>
          <p className={studioSectionDesc}>
            Edit the title and narration before creating narration audio.
          </p>
        </div>
        <span className={studioBadge}>
          <Clock className="h-3.5 w-3.5" />
          {story.totalDuration}s total
        </span>
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
          FootieBitz will read the full narration while scenes change in sequence.
        </p>
      </div>
    </div>
  );
}
