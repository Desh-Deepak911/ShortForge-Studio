"use client";

import { ChevronDown, Info, Sparkles } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";

import {
  studioChip,
  studioChipActive,
  studioComposerButton,
  studioComposerHelper,
  studioComposerInput,
  studioComposerSelect,
  studioError,
  studioFieldLabel,
  studioInfoCallout,
  studioPanel,
  studioSectionDesc,
  studioSectionTitle,
  studioSelectChevronCompact,
  studioStepLabel,
  studioStickyMobileFooter,
  studioSubtleText,
} from "@/lib/studioUi";
import ResearchPreviewPanel from "@/features/create/components/ResearchPreviewPanel";
import ContentTypeSuggestion from "@/features/create/components/ContentTypeSuggestion";
import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import type { ResearchPreviewState } from "@/features/create/types/research-preview.types";
import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";
import { MAX_SCENE_COUNT, MIN_SCENE_COUNT, SCRIPT_MODE_OPTIONS } from "@/types/footiebitz";

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: "dramatic", label: "Dramatic", description: "High stakes, cinematic" },
  { value: "funny", label: "Funny", description: "Witty and banter-led" },
  { value: "tactical", label: "Tactical", description: "Insight and analysis" },
  { value: "news", label: "News", description: "Headline-style recap" },
  { value: "emotional", label: "Emotional", description: "Passion and feeling" },
];

const DURATION_OPTIONS = [30, 45, 60] as const;

const QUALITY_OPTIONS: { value: QualityMode; label: string; description: string }[] = [
  { value: "cheap", label: "Fast", description: "Quickest first pass" },
  { value: "balanced", label: "Balanced", description: "Good balance of speed and polish" },
  { value: "best", label: "Studio", description: "Highest polish" },
];

interface StoryComposerProps {
  topic: string;
  onTopicChange: (value: string) => void;
  topicInputRef: RefObject<HTMLTextAreaElement | null>;
  scriptMode: ScriptMode;
  onScriptModeChange: (mode: ScriptMode) => void;
  context: string;
  onContextChange: (value: string) => void;
  enableResearch: boolean;
  onEnableResearchChange: (enabled: boolean) => void;
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  qualityMode: QualityMode;
  onQualityModeChange: (mode: QualityMode) => void;
  sceneCount: number;
  onSceneCountChange: (count: number) => void;
  sampleTopics: readonly string[];
  loading: boolean;
  error: string | null;
  onClearError: () => void;
  onSubmit: () => void;
  researchPreview: ResearchPreviewState;
  entityPreview?: EntityPreviewDisplay;
  onPreviewResearch: () => void;
  /** Re-runs research preview via `executeIntelligenceQuery` (no client-side orchestration). */
  onRefreshResearchPreview?: () => void;
}

function ComposerStep({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${studioPanel} space-y-3 sm:space-y-4`}>
      <div>
        <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-[17px]">
          {title}
        </h3>
        {description ? (
          <p className={`${studioComposerHelper} mt-1.5 px-0`}>{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function StoryComposer({
  topic,
  onTopicChange,
  topicInputRef,
  scriptMode,
  onScriptModeChange,
  context,
  onContextChange,
  enableResearch,
  onEnableResearchChange,
  tone,
  onToneChange,
  duration,
  onDurationChange,
  qualityMode,
  onQualityModeChange,
  sceneCount,
  onSceneCountChange,
  sampleTopics,
  loading,
  error,
  onClearError,
  onSubmit,
  researchPreview,
  entityPreview,
  onPreviewResearch,
  onRefreshResearchPreview,
}: StoryComposerProps) {
  const [optionalDetailsOpen, setOptionalDetailsOpen] = useState(() => context.trim().length > 0);

  return (
    <section id="studio-brief" className="min-w-0 w-full">
      <div className="mb-4 sm:mb-6">
        <p className={studioStepLabel}>Create</p>
        <h2 className={studioSectionTitle}>Your brief</h2>
        <p className={studioSectionDesc}>
          A few choices up front — then you&apos;ll review and edit your story on the next screen.
        </p>
      </div>

      <form
        className="w-full space-y-3 sm:space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {/* 1. What are you creating? */}
        <ComposerStep
          title="What are you creating?"
          description="Choose the kind of short-form story you want to make."
        >
          <div>
            <label htmlFor="scriptMode" className={studioFieldLabel}>
              Content type
            </label>
            <div className="relative mt-1.5">
              <select
                id="scriptMode"
                value={scriptMode}
                onChange={(e) => onScriptModeChange(e.target.value as ScriptMode)}
                disabled={loading}
                className={studioComposerSelect}
              >
                {SCRIPT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className={studioSelectChevronCompact} />
            </div>
            <p className={`${studioSubtleText} mt-1.5`}>
              {SCRIPT_MODE_OPTIONS.find((option) => option.value === scriptMode)?.description}
            </p>
          </div>
        </ComposerStep>

        {/* 2. Your idea */}
        <ComposerStep
          title="Your idea"
          description="Start with a match, event, player, topic, or story idea."
        >
          <div>
            <label htmlFor="topic" className={studioFieldLabel}>
              Topic
            </label>
            <textarea
              id="topic"
              ref={topicInputRef}
              value={topic}
              onChange={(e) => onTopicChange(e.target.value)}
              placeholder="e.g. Arsenal vs Chelsea, Erling Haaland form, or a last-minute winner"
              disabled={loading}
              rows={4}
              className={`${studioComposerInput} mt-1.5 min-h-[5.5rem] sm:min-h-[6.5rem]`}
            />
          </div>

          <div>
            <p className={`${studioFieldLabel} mb-2`}>Try an example</p>
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
                  className={`${topic === sample ? studioChipActive : studioChip} max-w-full truncate`}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          <ContentTypeSuggestion
            topic={topic}
            context={context}
            scriptMode={scriptMode}
            loading={loading}
          />
        </ComposerStep>

        {/* 3. Optional details */}
        <details
          className={`${studioPanel} group`}
          open={optionalDetailsOpen}
          onToggle={(event) => setOptionalDetailsOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-[17px]">
                  Optional details
                </h3>
                <p className={`${studioComposerHelper} mt-1.5 px-0 group-open:hidden`}>
                  Add anything specific you want included.
                </p>
              </div>
              <ChevronDown
                className="mt-1 h-4 w-4 shrink-0 text-muted transition group-open:rotate-180"
                aria-hidden
              />
            </div>
          </summary>

          <div className="mt-4 space-y-4 border-t border-border/25 pt-4 sm:space-y-5 sm:pt-5">
            <div>
              <label htmlFor="context" className={studioFieldLabel}>
                Additional Notes
              </label>
              <textarea
                id="context"
                value={context}
                onChange={(e) => onContextChange(e.target.value)}
                placeholder="Stats, formations, or anything else to include"
                disabled={loading}
                rows={3}
                className={`${studioComposerInput} mt-1.5 min-h-[4.5rem]`}
              />
              <p className={`${studioComposerHelper} mt-1.5 px-0`}>
                Add anything specific you want included.
              </p>
            </div>

            <div>
              <p className={studioFieldLabel}>Story settings</p>
              <p className={`${studioSubtleText} mt-1 mb-3`}>
                Tone, length, and quality for your first draft.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="tone" className={studioFieldLabel}>
                    Tone
                  </label>
                  <div className="relative mt-1.5">
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
                  <label htmlFor="duration" className={studioFieldLabel}>
                    Duration
                  </label>
                  <div className="relative mt-1.5">
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
                  <label htmlFor="qualityMode" className={studioFieldLabel}>
                    Quality
                  </label>
                  <div className="relative mt-1.5">
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

                <div>
                  <label htmlFor="sceneCount" className={studioFieldLabel}>
                    Number of scenes
                  </label>
                  <input
                    id="sceneCount"
                    type="number"
                    min={MIN_SCENE_COUNT}
                    max={MAX_SCENE_COUNT}
                    step={1}
                    value={sceneCount}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) {
                        return;
                      }
                      onSceneCountChange(
                        Math.max(MIN_SCENE_COUNT, Math.min(MAX_SCENE_COUNT, Math.round(next))),
                      );
                    }}
                    disabled={loading}
                    className={`${studioComposerSelect} mt-1.5`}
                  />
                </div>
              </div>
            </div>
          </div>
        </details>

        {/* 4. Smart Research */}
        <ComposerStep
          title="Smart Research"
          description="Use trusted sources when available."
        >
          <div className="flex items-start gap-3 rounded-xl bg-surface-elevated/40 px-3 py-3 ring-1 ring-border/25 sm:px-4">
            <input
              id="enableResearch"
              type="checkbox"
              checked={enableResearch}
              onChange={(e) => onEnableResearchChange(e.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
            />
            <div className="min-w-0 flex-1">
              <label htmlFor="enableResearch" className="text-sm font-medium text-foreground/90">
                Enable Smart Research
              </label>
              <p className={`${studioSubtleText} mt-1`}>
                Supporting facts are gathered automatically when you write your story.
              </p>
            </div>
          </div>

          <ResearchPreviewPanel
            embedded
            enableResearch={enableResearch}
            topic={topic}
            manualContext={context}
            scriptMode={scriptMode}
            preview={researchPreview}
            entityPreview={entityPreview}
            disabled={loading}
            onPreviewResearch={onPreviewResearch}
            onRefreshResearchPreview={onRefreshResearchPreview}
          />
        </ComposerStep>

        <div className={studioInfoCallout}>
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <p className="text-xs leading-relaxed text-muted">
            Story writing happens online. Images, edits, preview, and download stay on your device.
          </p>
        </div>

        {/* 5. Create */}
        <div className={`${studioPanel} ${studioStickyMobileFooter} space-y-3`}>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-[17px]">
              Create
            </h3>
            <p className={`${studioSubtleText} mt-1.5`}>
              Narration and storyboard come on the next screens.
            </p>
          </div>
          <button type="submit" disabled={loading} className={`${studioComposerButton} w-full`}>
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            {loading ? "Writing story..." : "Write Story"}
          </button>
        </div>

        {error ? <div className={studioError}>{error}</div> : null}
      </form>
    </section>
  );
}
