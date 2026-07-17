"use client";

import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";

import ContentTypeSuggestion from "@/features/create/components/ContentTypeSuggestion";
import HookStylePanel from "@/features/create/components/HookStylePanel";
import StoryStrategyPanel from "@/features/create/components/StoryStrategyPanel";
import { CreatorTemplatePicker } from "@/features/creator-templates/components";
import { StudioPanel } from "@/components/studio-shell";
import { StudioStatus } from "@/components/studio-status";
import {
  studioChip,
  studioChipActive,
  studioComposerInput,
  studioComposerSelect,
  studioFieldLabel,
  studioInfoCallout,
  studioSelectChevronCompact,
  studioStepLabel,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import { SCRIPT_MODE_OPTIONS } from "@/types/footiebitz";

import {
  BRIEF_DURATION_OPTIONS,
  BRIEF_FACT_HANDLING_OPTIONS,
  BRIEF_RELIABILITY_OPTIONS,
  BRIEF_TONE_OPTIONS,
  CREATE_BRIEF_FORM_ID,
  type BriefCanvasProps,
} from "./create-brief.constants";

/**
 * Primary brief canvas — topic, content type, tone, duration, fact handling.
 * Strategy / Hook / Template live under Advanced controls (Sprint 10H.3).
 */
export default function BriefCanvas({
  topic,
  onTopicChange,
  topicInputRef,
  scriptMode,
  onScriptModeChange,
  context,
  tone,
  onToneChange,
  duration,
  onDurationChange,
  storyStrategy,
  onStoryStrategyChange,
  storyStrategyCompatibilityNotice,
  hookStyle,
  onHookStyleChange,
  userAuthoredHook,
  onUserAuthoredHookChange,
  selectedTemplateId,
  onTemplateChange,
  sceneCount,
  enableResearch,
  factHandlingMode,
  onFactHandlingModeChange,
  premiseDetails,
  onPremiseDetailsChange,
  reliabilityMode,
  onReliabilityModeChange,
  hookStyleCompatibilityNotice,
  sampleTopics,
  loading,
  error,
  onClearError,
  onSubmit,
  onUseAutoHook,
}: BriefCanvasProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <section id="studio-brief" className="min-w-0 w-full">
      <div className="mb-1 min-w-0">
        <p className={studioStepLabel}>Brief</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          Your brief
        </h2>
        <p className={`${studioSubtleText} mt-1`}>
          Describe your idea — you&apos;ll review and edit the full story on the next screen.
        </p>
      </div>

      <form
        id={CREATE_BRIEF_FORM_ID}
        className="mt-4 w-full space-y-4 sm:space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <StudioPanel>
          <div className="space-y-4">
            <div>
              <label htmlFor="topic" className={studioFieldLabel}>
                Topic
              </label>
              <textarea
                id="topic"
                ref={topicInputRef}
                value={topic}
                onChange={(event) => onTopicChange(event.target.value)}
                placeholder="e.g. Arsenal vs Chelsea, Erling Haaland form, or a last-minute winner"
                disabled={loading}
                rows={5}
                className={`${studioComposerInput} mt-1.5 min-h-[7rem] text-[15px] sm:min-h-[8.5rem] sm:text-base lg:min-h-[9.5rem] lg:text-[17px]`}
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

            <div>
              <label htmlFor="scriptMode" className={studioFieldLabel}>
                Content type
              </label>
              <div className="relative mt-1.5">
                <select
                  id="scriptMode"
                  value={scriptMode}
                  onChange={(event) => onScriptModeChange(event.target.value as typeof scriptMode)}
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

            <ContentTypeSuggestion
              topic={topic}
              context={context}
              scriptMode={scriptMode}
              loading={loading}
            />
          </div>
        </StudioPanel>

        <StudioPanel>
          <p className={studioFieldLabel}>Story feel</p>
          <p className={`${studioSubtleText} mt-1 mb-3`}>Tone and target length for your first draft.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tone" className={studioFieldLabel}>
                Tone
              </label>
              <div className="relative mt-1.5">
                <select
                  id="tone"
                  value={tone}
                  onChange={(event) => onToneChange(event.target.value as typeof tone)}
                  disabled={loading}
                  className={studioComposerSelect}
                >
                  {BRIEF_TONE_OPTIONS.map((option) => (
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
                  onChange={(event) => onDurationChange(Number(event.target.value))}
                  disabled={loading}
                  className={studioComposerSelect}
                >
                  {BRIEF_DURATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}s
                    </option>
                  ))}
                </select>
                <ChevronDown className={studioSelectChevronCompact} />
              </div>
            </div>
          </div>
        </StudioPanel>

        <StudioPanel>
          <label htmlFor="factHandlingMode" className={studioFieldLabel}>
            Fact Handling
          </label>
          <p className={`${studioSubtleText} mt-1 mb-3`}>
            Choose how ShortForge may use research and your own details.
          </p>
          <div className="relative">
            <select
              id="factHandlingMode"
              value={factHandlingMode}
              onChange={(event) =>
                onFactHandlingModeChange(
                  event.target.value as typeof factHandlingMode,
                )
              }
              disabled={loading}
              className={studioComposerSelect}
            >
              {BRIEF_FACT_HANDLING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevronCompact} />
          </div>
          <p className={`${studioSubtleText} mt-1.5`}>
            {
              BRIEF_FACT_HANDLING_OPTIONS.find(
                (option) => option.value === factHandlingMode,
              )?.description
            }
          </p>

          {factHandlingMode === "creative_premise" ? (
            <div className="mt-4 border-t border-border/20 pt-4">
              <label htmlFor="premiseDetails" className={studioFieldLabel}>
                Premise details
              </label>
              <p className={`${studioSubtleText} mt-1 mb-2`}>
                One fact per line. These stay creator-supplied — not independently verified.
              </p>
              <textarea
                id="premiseDetails"
                value={premiseDetails}
                onChange={(event) => onPremiseDetailsChange(event.target.value)}
                placeholder={
                  "Home side edged a 2–1 finish.\nThe contest had 26 fouls.\nLate pressure decided the tone."
                }
                disabled={loading}
                rows={4}
                className={`${studioComposerInput} mt-1.5 min-h-[5rem]`}
              />
            </div>
          ) : null}
        </StudioPanel>

        <StudioPanel>
          <details
            className="group"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={studioFieldLabel}>Advanced controls</p>
                  <p className={`${studioSubtleText} mt-1`}>
                    Story Strategy, Hook Style, and templates — Auto is recommended.
                  </p>
                </div>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180"
                  aria-hidden
                />
              </div>
            </summary>

            <div className="mt-4 space-y-4 border-t border-border/20 pt-4">
              <div>
                <label htmlFor="reliabilityMode" className={studioFieldLabel}>
                  Generation mode
                </label>
                <p className={`${studioSubtleText} mt-1 mb-3`}>
                  Flexible is the default. Precise is opt-in and avoids silent Auto changes.
                </p>
                <div className="relative">
                  <select
                    id="reliabilityMode"
                    value={reliabilityMode}
                    onChange={(event) =>
                      onReliabilityModeChange(
                        event.target.value as typeof reliabilityMode,
                      )
                    }
                    disabled={loading}
                    className={studioComposerSelect}
                  >
                    {BRIEF_RELIABILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className={studioSelectChevronCompact} />
                </div>
                <p className={`${studioSubtleText} mt-1.5`}>
                  {
                    BRIEF_RELIABILITY_OPTIONS.find(
                      (option) => option.value === reliabilityMode,
                    )?.description
                  }
                </p>
              </div>

              <StoryStrategyPanel
                storyStrategy={storyStrategy}
                onStoryStrategyChange={onStoryStrategyChange}
                durationSec={duration}
                compatibilityNotice={storyStrategyCompatibilityNotice}
                loading={loading}
              />

              <HookStylePanel
                hookStyle={hookStyle}
                onHookStyleChange={onHookStyleChange}
                userAuthoredHook={userAuthoredHook}
                onUserAuthoredHookChange={onUserAuthoredHookChange}
                scriptMode={scriptMode}
                selectedTemplateId={selectedTemplateId}
                enableResearch={enableResearch}
                compatibilityNotice={hookStyleCompatibilityNotice}
                loading={loading}
              />

              {hookStyle === "user_written" && onUseAutoHook ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={onUseAutoHook}
                  className={`${studioChip} text-xs`}
                >
                  Use Auto instead
                </button>
              ) : null}

              <div>
                <p className={studioFieldLabel}>Creator template</p>
                <p className={`${studioSubtleText} mt-1 mb-3`}>
                  Optional reusable formats with smart defaults.
                </p>
                <CreatorTemplatePicker
                  selectedTemplateId={selectedTemplateId}
                  onTemplateChange={onTemplateChange}
                  scriptMode={scriptMode}
                  sceneCount={sceneCount}
                  duration={duration}
                  disabled={loading}
                />
              </div>
            </div>
          </details>
        </StudioPanel>

        <div className={studioInfoCallout}>
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <p className="text-xs leading-relaxed text-muted">
            Story writing happens online. Images, edits, preview, and download stay on your device.
          </p>
        </div>

        {error ? (
          <StudioStatus variant="error" layout="panel" description={error} />
        ) : null}
      </form>
    </section>
  );
}
