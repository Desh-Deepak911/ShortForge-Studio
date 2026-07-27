"use client";

import { useState } from "react";

import VoiceSettingsCard from "@/components/VoiceSettingsCard";
import StudioLoadingState from "@/components/StudioLoadingState";
import { StudioStatus } from "@/components/studio-status";
import { StudioNumberStepper, StudioSwitch } from "@/components/ui";
import ScenePlanDevBadge from "@/features/create/components/ScenePlanDevBadge";
import StoryIntelligencePanel from "@/features/create/components/StoryIntelligencePanel";
import { StudioPanel, StudioSection } from "@/components/studio-shell";
import type { StoryCreationBrief } from "@/features/drafts";
import { hookStyleLabel } from "@/features/hook-engine/presentation";
import { getHookStrategy } from "@/features/hook-engine/strategies";
import {
  isStoryStrategySelection,
  storyStrategyLabel,
} from "@/features/retention-story/presentation";
import type { FootieScript } from "@/features/story/types";
import {
  studioBadge,
  studioFieldLabel,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type {
  GenerationLoadingStep,
  ScenePlanDevDebug,
  ScriptMode,
} from "@/types/footiebitz";
import {
  MAX_SCENE_COUNT,
  MIN_SCENE_COUNT,
  SCRIPT_MODE_OPTIONS,
} from "@/types/footiebitz";

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
  showStudioIntelligenceScenePlanToggle: boolean;
  useStudioIntelligenceScenes: boolean;
  onUseStudioIntelligenceScenesChange: (enabled: boolean) => void;
  scenePlanDevDebug?: ScenePlanDevDebug | null;
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
  showStudioIntelligenceScenePlanToggle,
  useStudioIntelligenceScenes,
  onUseStudioIntelligenceScenesChange,
  scenePlanDevDebug,
  onVoiceApplyControlReady,
}: ReviewInspectorProps) {
  const [activeSection, setActiveSection] = useState<
    "overview" | "voice" | "storyboard"
  >("overview");
  const selectedHookStyleLabel = creationBrief?.hookStyle
    ? hookStyleLabel(creationBrief.hookStyle)
    : "Auto — Recommended";
  const selectedStoryStrategyLabel =
    creationBrief?.formatStrategyId &&
    isStoryStrategySelection(creationBrief.formatStrategyId) &&
    creationBrief.formatStrategyId !== "auto"
      ? storyStrategyLabel(creationBrief.formatStrategyId)
      : "Auto — Recommended";
  const resolvedStrategyLabel = creationBrief?.hookPlan?.strategyId
    ? (getHookStrategy(creationBrief.hookPlan.strategyId)?.label ??
      creationBrief.hookPlan.strategyId)
    : null;

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-visible">
      <div
        className="grid grid-cols-3 gap-1 rounded-xl bg-background/35 p-1 ring-1 ring-border/25"
        role="tablist"
        aria-label="Review tools"
      >
        {(["overview", "voice", "storyboard"] as const).map((section) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={activeSection === section}
            onClick={() => setActiveSection(section)}
            className={`rounded-lg px-2 py-2 text-[11px] font-semibold capitalize transition ${
              activeSection === section
                ? "bg-surface-elevated text-foreground ring-1 ring-border/35"
                : "text-muted hover:text-foreground"
            }`}
          >
            {section}
          </button>
        ))}
      </div>

      <div hidden={activeSection !== "overview"}>
        <StudioSection title="Your brief">
          <StudioPanel>
            <dl className="grid grid-cols-2 gap-2">
              <div className="space-y-1 rounded-xl bg-background/25 p-2.5">
                <dt className={studioFieldLabel}>Content type</dt>
                <dd>
                  <span className={studioBadge}>{scriptModeLabel}</span>
                </dd>
              </div>
              <div className="space-y-1 rounded-xl bg-background/25 p-2.5">
                <dt className={studioFieldLabel}>Story strategy</dt>
                <dd>
                  <span className={studioBadge}>
                    {selectedStoryStrategyLabel}
                  </span>
                </dd>
              </div>
              <div className="col-span-2 space-y-1 rounded-xl bg-background/25 p-2.5">
                <dt className={studioFieldLabel}>Hook style</dt>
                <dd>
                  <span className={studioBadge}>{selectedHookStyleLabel}</span>
                  {resolvedStrategyLabel ? (
                    <p className={`${studioSubtleText} mt-2`}>
                      Resolved opening strategy: {resolvedStrategyLabel}
                    </p>
                  ) : null}
                </dd>
              </div>
              <div className="space-y-1 rounded-xl bg-background/25 p-2.5">
                <dt className={studioFieldLabel}>Target duration</dt>
                <dd className="text-sm text-foreground/90">
                  {targetDurationSeconds}s
                </dd>
              </div>
              {researchConfidenceLabel ? (
                <div className="space-y-1 rounded-xl bg-background/25 p-2.5">
                  <dt className={studioFieldLabel}>Research confidence</dt>
                  <dd>
                    <span className={studioBadge}>
                      {researchConfidenceLabel}
                    </span>
                    {creationBrief?.researchWarning ? (
                      <p className={`${studioSubtleText} mt-2`}>
                        {creationBrief.researchWarning}
                      </p>
                    ) : (
                      <p className={`${studioSubtleText} mt-2`}>
                        Based on Smart Research at create time.
                      </p>
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
                    {creationBrief?.context?.trim()
                      ? creationBrief.context
                      : "None provided"}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className={studioFieldLabel}>Tone</dt>
                  <dd className="text-sm text-foreground/90">
                    {briefToneLabel}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className={studioFieldLabel}>Writing quality</dt>
                  <dd className="text-sm text-foreground/90">
                    {briefQualityLabel}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className={studioFieldLabel}>Content type</dt>
                  <dd className="text-sm text-foreground/90">
                    {
                      SCRIPT_MODE_OPTIONS.find(
                        (option) => option.value === scriptMode,
                      )?.description
                    }
                  </dd>
                </div>
              </dl>
            </details>
          </StudioPanel>
        </StudioSection>

        <StoryIntelligencePanel creationBrief={creationBrief} />
      </div>

      <div hidden={activeSection !== "voice"}>
        <StudioSection id="review-narration" title="Voice settings">
          <VoiceSettingsCard
            script={script}
            onScriptChange={onScriptChange}
            disabled={voiceControlsDisabled}
            variant="review"
            showApplyButton={false}
            onApplyControlReady={onVoiceApplyControlReady}
          />
        </StudioSection>
      </div>

      <div hidden={activeSection !== "storyboard"}>
        <StudioSection id="review-storyboard" title="Storyboard">
          <StudioPanel>
            <div className="max-w-xs">
              <label htmlFor="review-scene-count" className={studioFieldLabel}>
                Number of scenes
              </label>
              <StudioNumberStepper
                id="review-scene-count"
                min={MIN_SCENE_COUNT}
                max={MAX_SCENE_COUNT}
                step={1}
                value={sceneCount}
                onChange={(event) =>
                  onSceneCountChange(Number(event.target.value))
                }
                onStepValue={onSceneCountChange}
                disabled={
                  isCreatingScenes || hasStoryboard || scenesCreatedSuccessfully
                }
                aria-label="Number of scenes"
                className="mt-1.5"
              />
            </div>

            {showStudioIntelligenceScenePlanToggle ? (
              <StudioSwitch
                checked={useStudioIntelligenceScenes}
                onChange={(event) =>
                  onUseStudioIntelligenceScenesChange(event.target.checked)
                }
                disabled={
                  isCreatingScenes ||
                  hasStoryboard ||
                  scenesCreatedSuccessfully
                }
                label="Studio Intelligence scene planning"
                description="Use assisted scene planning in this staging workspace."
                className="mt-4"
              />
            ) : null}

            {hasVoiceover && voiceoverDurationMs ? (
              <p className={`${studioSubtleText} mt-3`}>
                Narration duration: {Math.round(voiceoverDurationMs / 1000)}s —
                scenes will be timed to match.
              </p>
            ) : null}

            {isCreatingScenes ? (
              <div className="mt-4">
                <StudioLoadingState
                  variant="compact"
                  loadingStep={storyboardStep}
                  title="Building storyboard..."
                  subtitle="Preparing scenes and arranging your storyboard."
                />
              </div>
            ) : scenesCreatedSuccessfully || hasStoryboard ? (
              <p
                className={`${studioSubtleText} mt-3`}
                role="status"
                aria-live="polite"
              >
                Storyboard ready — use Open Editor in the header to add visuals
                and export.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {!hasNarration ? (
                  <p className={studioSubtleText}>
                    Add script text in the canvas before building scenes.
                  </p>
                ) : null}
                {!hasVoiceover && hasNarration ? (
                  <p className={studioSubtleText}>
                    Create narration first — scenes are timed to your spoken
                    audio.
                  </p>
                ) : null}
              </div>
            )}

            {createScenesError ? (
              <StudioStatus
                variant="error"
                layout="panel"
                description={createScenesError}
                className="mt-3"
              />
            ) : null}

            <ScenePlanDevBadge debug={scenePlanDevDebug} />
          </StudioPanel>
        </StudioSection>
      </div>
    </div>
  );
}
