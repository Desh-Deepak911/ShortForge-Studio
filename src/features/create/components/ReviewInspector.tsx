"use client";

import VoiceSettingsCard from "@/components/VoiceSettingsCard";
import StudioLoadingState from "@/components/StudioLoadingState";
import { StudioPanel, StudioSection } from "@/components/studio-shell";
import type { StoryCreationBrief } from "@/features/drafts";
import type { FootieScript } from "@/features/story/types";
import {
  studioBadge,
  studioFieldLabel,
  studioInput,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { GenerationLoadingStep, ScriptMode } from "@/types/footiebitz";
import { MAX_SCENE_COUNT, MIN_SCENE_COUNT, SCRIPT_MODE_OPTIONS } from "@/types/footiebitz";

export interface ReviewInspectorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  creationBrief?: StoryCreationBrief;
  scriptMode: ScriptMode;
  scriptModeLabel: string;
  targetDurationSeconds: number;
  researchConfidenceLabel: string | null;
  briefToneLabel: string;
  briefQualityLabel: string;
  sceneCount: number;
  onSceneCountChange: (value: number) => void;
  hasVoiceover: boolean;
  voiceoverDurationMs?: number;
  hasStoryboard: boolean;
  hasNarration: boolean;
  isCreatingScenes: boolean;
  scenesCreatedSuccessfully: boolean;
  storyboardStep: GenerationLoadingStep;
  createScenesError: string | null;
  voiceControlsDisabled: boolean;
  onVoiceApplyControlReady?: (control: {
    apply: () => void;
    canApply: boolean;
    loading: boolean;
    label: string;
  }) => void;
}

/**
 * Review inspector — brief summary, voice settings, storyboard status (no duplicate CTAs).
 */
export default function ReviewInspector({
  script,
  onScriptChange,
  creationBrief,
  scriptMode,
  scriptModeLabel,
  targetDurationSeconds,
  researchConfidenceLabel,
  briefToneLabel,
  briefQualityLabel,
  sceneCount,
  onSceneCountChange,
  hasVoiceover,
  voiceoverDurationMs,
  hasStoryboard,
  hasNarration,
  isCreatingScenes,
  scenesCreatedSuccessfully,
  storyboardStep,
  createScenesError,
  voiceControlsDisabled,
  onVoiceApplyControlReady,
}: ReviewInspectorProps) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <StudioSection title="Your brief" description="Settings from Create — carried through storyboard.">
        <StudioPanel>
          <dl className="grid gap-3">
            <div className="space-y-1">
              <dt className={studioFieldLabel}>Content type</dt>
              <dd>
                <span className={studioBadge}>{scriptModeLabel}</span>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className={studioFieldLabel}>Target duration</dt>
              <dd className="text-sm text-foreground/90">{targetDurationSeconds}s</dd>
            </div>
            {researchConfidenceLabel ? (
              <div className="space-y-1">
                <dt className={studioFieldLabel}>Research confidence</dt>
                <dd>
                  <span className={studioBadge}>{researchConfidenceLabel}</span>
                  {creationBrief?.researchWarning ? (
                    <p className={`${studioSubtleText} mt-2`}>{creationBrief.researchWarning}</p>
                  ) : (
                    <p className={`${studioSubtleText} mt-2`}>Based on Smart Research at create time.</p>
                  )}
                </dd>
              </div>
            ) : null}
          </dl>

          <details className="group mt-4 border-t border-border/20 pt-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-foreground/90 [&::-webkit-details-marker]:hidden">
              View brief details
            </summary>
            <dl className="mt-3 grid gap-3">
              <div className="space-y-1">
                <dt className={studioFieldLabel}>Topic</dt>
                <dd className="text-sm leading-relaxed text-foreground/85">
                  {creationBrief?.topic ?? script.title}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className={studioFieldLabel}>Additional notes</dt>
                <dd className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {creationBrief?.context?.trim() ? creationBrief.context : "None provided"}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className={studioFieldLabel}>Tone</dt>
                <dd className="text-sm text-foreground/90">{briefToneLabel}</dd>
              </div>
              <div className="space-y-1">
                <dt className={studioFieldLabel}>Writing quality</dt>
                <dd className="text-sm text-foreground/90">{briefQualityLabel}</dd>
              </div>
              <div className="space-y-1">
                <dt className={studioFieldLabel}>Content type</dt>
                <dd className="text-sm text-foreground/90">
                  {SCRIPT_MODE_OPTIONS.find((option) => option.value === scriptMode)?.description}
                </dd>
              </div>
            </dl>
          </details>
        </StudioPanel>
      </StudioSection>

      <StudioSection
        id="review-narration"
        title="Voice settings"
        description="Choose voice and speed — use the header action to create or update narration."
      >
        <VoiceSettingsCard
          script={script}
          onScriptChange={onScriptChange}
          disabled={voiceControlsDisabled}
          variant="review"
          showApplyButton={false}
          onApplyControlReady={onVoiceApplyControlReady}
        />
      </StudioSection>

      <StudioSection
        id="review-storyboard"
        title="Storyboard"
        description="Scene count and build status — primary action is in the header."
      >
        <StudioPanel>
          <div className="max-w-xs">
            <label htmlFor="review-scene-count" className={studioFieldLabel}>
              Number of scenes
            </label>
            <input
              id="review-scene-count"
              type="number"
              min={MIN_SCENE_COUNT}
              max={MAX_SCENE_COUNT}
              step={1}
              value={sceneCount}
              onChange={(event) => onSceneCountChange(Number(event.target.value))}
              disabled={isCreatingScenes || hasStoryboard || scenesCreatedSuccessfully}
              className={`${studioInput} mt-1.5 max-w-[8rem]`}
            />
          </div>

          {hasVoiceover && voiceoverDurationMs ? (
            <p className={`${studioSubtleText} mt-3`}>
              Narration duration: {Math.round(voiceoverDurationMs / 1000)}s — scenes will be timed to
              match.
            </p>
          ) : null}

          {isCreatingScenes ? (
            <div className="mt-4">
              <StudioLoadingState
                topic={creationBrief?.topic ?? script.title}
                tone={creationBrief?.tone ?? "dramatic"}
                duration={creationBrief?.duration ?? script.totalDuration}
                loadingStep={storyboardStep}
              />
            </div>
          ) : scenesCreatedSuccessfully || hasStoryboard ? (
            <p className={`${studioSubtleText} mt-3`} role="status" aria-live="polite">
              Storyboard ready — use Open Editor in the header to add visuals and export.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {!hasNarration ? (
                <p className={studioSubtleText}>Add script text in the canvas before building scenes.</p>
              ) : null}
              {!hasVoiceover && hasNarration ? (
                <p className={studioSubtleText}>
                  Create narration first — scenes are timed to your spoken audio.
                </p>
              ) : null}
            </div>
          )}

          {createScenesError ? (
            <p className="mt-3 text-sm text-red-300/90" role="alert">
              {createScenesError}
            </p>
          ) : null}
        </StudioPanel>
      </StudioSection>
    </div>
  );
}
