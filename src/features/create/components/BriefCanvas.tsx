"use client";

import { ChevronDown, Info } from "lucide-react";

import ContentTypeSuggestion from "@/features/create/components/ContentTypeSuggestion";
import { StudioPanel } from "@/components/studio-shell";
import {
  studioChip,
  studioChipActive,
  studioComposerInput,
  studioComposerSelect,
  studioError,
  studioFieldLabel,
  studioInfoCallout,
  studioSelectChevronCompact,
  studioStepLabel,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import { SCRIPT_MODE_OPTIONS } from "@/types/footiebitz";

import {
  BRIEF_DURATION_OPTIONS,
  BRIEF_TONE_OPTIONS,
  CREATE_BRIEF_FORM_ID,
  type BriefCanvasProps,
} from "./create-brief.constants";

/**
 * Primary brief canvas — topic, content type, tone, and duration.
 * Presentation only; state and submit handlers come from CreateStoryFlow.
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
  sampleTopics,
  loading,
  error,
  onClearError,
  onSubmit,
}: BriefCanvasProps) {
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

        <div className={studioInfoCallout}>
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <p className="text-xs leading-relaxed text-muted">
            Story writing happens online. Images, edits, preview, and download stay on your device.
          </p>
        </div>

        {error ? <div className={studioError}>{error}</div> : null}
      </form>
    </section>
  );
}
