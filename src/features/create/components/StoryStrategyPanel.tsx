"use client";

import { ChevronDown } from "lucide-react";

import {
  STORY_STRATEGY_CATALOG,
  getStoryStrategyCatalogEntry,
  isStoryStrategyCompatibleWithDuration,
  predictAutoStoryStrategy,
  type StoryStrategySelection,
} from "@/features/retention-story/presentation";
import { StudioPanel } from "@/components/studio-shell";
import {
  studioComposerSelect,
  studioFieldLabel,
  studioSelectChevronCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface StoryStrategyPanelProps {
  storyStrategy: StoryStrategySelection;
  onStoryStrategyChange: (selection: StoryStrategySelection) => void;
  durationSec: number;
  compatibilityNotice: string | null;
  loading: boolean;
}

/**
 * Create brief — Story Strategy selector (Sprint 10G).
 * Imports only the client-safe Retention presentation surface.
 */
export default function StoryStrategyPanel({
  storyStrategy,
  onStoryStrategyChange,
  durationSec,
  compatibilityNotice,
  loading,
}: StoryStrategyPanelProps) {
  const selectedEntry = getStoryStrategyCatalogEntry(storyStrategy);
  const autoPrediction = predictAutoStoryStrategy(durationSec);

  return (
    <StudioPanel>
      <p className={studioFieldLabel} id="story-strategy-heading">
        Story strategy
      </p>
      <p className={`${studioSubtleText} mt-1 mb-3`} id="story-strategy-help">
        Choose how ShortForge structures pacing and payoff — separate from Hook
        style.
      </p>

      <div>
        <label htmlFor="storyStrategy" className="sr-only">
          Story strategy
        </label>
        <div className="relative mt-1.5">
          <select
            id="storyStrategy"
            value={storyStrategy}
            onChange={(event) =>
              onStoryStrategyChange(event.target.value as StoryStrategySelection)
            }
            disabled={loading}
            aria-labelledby="story-strategy-heading"
            aria-describedby={
              compatibilityNotice
                ? "story-strategy-help story-strategy-description story-strategy-compat-notice"
                : "story-strategy-help story-strategy-description"
            }
            className={studioComposerSelect}
          >
            {STORY_STRATEGY_CATALOG.map((entry) => {
              const compatible = isStoryStrategyCompatibleWithDuration(
                entry.selection,
                durationSec,
              );
              return (
                <option
                  key={entry.selection}
                  value={entry.selection}
                  disabled={!compatible}
                >
                  {entry.label}
                  {!compatible ? " — not for this duration" : ""}
                </option>
              );
            })}
          </select>
          <ChevronDown className={studioSelectChevronCompact} />
        </div>

        <p id="story-strategy-description" className={`${studioSubtleText} mt-1.5`}>
          {selectedEntry?.description}
        </p>

        {storyStrategy === "auto" ? (
          <p
            className={`${studioSubtleText} mt-2 text-foreground/80`}
            role="status"
          >
            {autoPrediction.summary}
          </p>
        ) : null}

        {compatibilityNotice ? (
          <p
            id="story-strategy-compat-notice"
            className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
            role="status"
            aria-live="polite"
          >
            {compatibilityNotice}
          </p>
        ) : null}
      </div>
    </StudioPanel>
  );
}
