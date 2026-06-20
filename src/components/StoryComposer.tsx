"use client";

import { ChevronDown, Info, Sparkles } from "lucide-react";
import type { RefObject } from "react";

import {
  studioChip,
  studioChipActive,
  studioComposerButton,
  studioComposerCard,
  studioComposerHelper,
  studioComposerInput,
  studioComposerSelect,
  studioError,
  studioFieldLabel,
  studioInfoCallout,
  studioSectionDesc,
  studioSectionTitle,
  studioSelectChevronCompact,
  studioStepLabel,
} from "@/lib/studioUi";
import type { QualityMode, Tone } from "@/types/footiebitz";

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: "dramatic", label: "Dramatic", description: "High stakes, cinematic" },
  { value: "funny", label: "Funny", description: "Witty and banter-led" },
  { value: "tactical", label: "Tactical", description: "Insight and analysis" },
  { value: "news", label: "News", description: "Headline-style recap" },
  { value: "emotional", label: "Emotional", description: "Passion and feeling" },
];

const DURATION_OPTIONS = [30, 45, 60] as const;

const QUALITY_OPTIONS: { value: QualityMode; label: string; description: string }[] = [
  { value: "cheap", label: "Cheap Draft", description: "Fastest, lowest token cost" },
  { value: "balanced", label: "Balanced", description: "Good quality and cost" },
  { value: "best", label: "Best", description: "Highest quality stories" },
];

interface StoryComposerProps {
  topic: string;
  onTopicChange: (value: string) => void;
  topicInputRef: RefObject<HTMLTextAreaElement | null>;
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  qualityMode: QualityMode;
  onQualityModeChange: (mode: QualityMode) => void;
  sampleTopics: readonly string[];
  loading: boolean;
  error: string | null;
  onClearError: () => void;
  onSubmit: () => void;
}

export default function StoryComposer({
  topic,
  onTopicChange,
  topicInputRef,
  tone,
  onToneChange,
  duration,
  onDurationChange,
  qualityMode,
  onQualityModeChange,
  sampleTopics,
  loading,
  error,
  onClearError,
  onSubmit,
}: StoryComposerProps) {
  return (
    <section id="studio-brief" className="min-w-0 w-full">
      <div className="mb-4 sm:mb-6">
        <p className={studioStepLabel}>Step 1</p>
        <h2 className={studioSectionTitle}>Story Brief</h2>
        <p className={studioSectionDesc}>
          Start with an idea — FootieBitz turns it into a full short-form story.
        </p>
      </div>

      <form
        className="w-full space-y-4 sm:space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className={studioComposerCard}>
          <label htmlFor="topic" className="sr-only">
            Story prompt
          </label>
          <textarea
            id="topic"
            ref={topicInputRef}
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="Describe the story you want to create..."
            disabled={loading}
            rows={4}
            className={studioComposerInput}
          />

          <p className={`${studioComposerHelper} mt-1`}>
            Generate scenes, narration, captions, and timeline-ready story blocks.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-border/50 pt-3.5 sm:mt-4 sm:grid-cols-3 sm:gap-4 sm:pt-4">
            <div>
              <label htmlFor="tone" className={`${studioFieldLabel} px-2 sm:px-0`}>
                Tone
              </label>
              <div className="relative">
                <select
                  id="tone"
                  value={tone}
                  onChange={(e) => onToneChange(e.target.value as Tone)}
                  disabled={loading}
                  className={studioComposerSelect}
                >
                  {TONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className={studioSelectChevronCompact} />
              </div>
            </div>

            <div>
              <label htmlFor="duration" className={`${studioFieldLabel} px-2 sm:px-0`}>
                Duration
              </label>
              <div className="relative">
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => onDurationChange(Number(e.target.value))}
                  disabled={loading}
                  className={studioComposerSelect}
                >
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}s
                    </option>
                  ))}
                </select>
                <ChevronDown className={studioSelectChevronCompact} />
              </div>
            </div>

            <div>
              <label htmlFor="qualityMode" className={`${studioFieldLabel} px-2 sm:px-0`}>
                Quality
              </label>
              <div className="relative">
                <select
                  id="qualityMode"
                  value={qualityMode}
                  onChange={(e) => onQualityModeChange(e.target.value as QualityMode)}
                  disabled={loading}
                  className={studioComposerSelect}
                >
                  {QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className={studioSelectChevronCompact} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className={`${studioFieldLabel} mb-2.5`}>
            Try an example
          </p>
          <div className="flex min-w-0 flex-wrap gap-2">
            {sampleTopics.map((sample) => (
              <button
                key={sample}
                type="button"
                disabled={loading}
                onClick={() => {
                  onTopicChange(sample);
                  onClearError();
                }}
                className={topic === sample ? studioChipActive : studioChip}
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        <div className={studioInfoCallout}>
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <p className="text-xs leading-relaxed text-muted">
            <span className="font-medium text-foreground/80">Token usage:</span> only story
            generation uses tokens. Images, edits, preview, and export run in your browser.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="submit" disabled={loading} className={studioComposerButton}>
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>

        {error ? <div className={studioError}>{error}</div> : null}
      </form>
    </section>
  );
}
