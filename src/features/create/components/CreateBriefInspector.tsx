"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import ResearchPreviewPanel from "@/features/create/components/ResearchPreviewPanel";
import { StudioPanel, StudioSection } from "@/components/studio-shell";
import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import type { ResearchPreviewState } from "@/features/create/types/research-preview.types";
import {
  factHandlingLabel,
  qualityLabel,
  recommendCreateBrief,
  selectionCompatibilityLabel,
  type CreationReliabilityMode,
  type FactHandlingMode,
} from "@/features/create/utils/recommend-create-brief";
import type { HookStyleSelection } from "@/features/hook-engine/presentation";
import {
  studioChip,
  studioComposerInput,
  studioComposerSelect,
  studioFieldLabel,
  studioSelectChevronCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { QualityMode, ScriptMode, Tone } from "@/types/footiebitz";
import { MAX_SCENE_COUNT, MIN_SCENE_COUNT } from "@/types/footiebitz";
import type { StoryStrategySelection } from "@/features/retention-story/presentation";

import { BRIEF_QUALITY_OPTIONS } from "./create-brief.constants";

export interface CreateBriefInspectorProps {
  context: string;
  onContextChange: (value: string) => void;
  enableResearch: boolean;
  onEnableResearchChange: (enabled: boolean) => void;
  qualityMode: QualityMode;
  onQualityModeChange: (mode: QualityMode) => void;
  sceneCount: number;
  onSceneCountChange: (count: number) => void;
  duration: number;
  loading: boolean;
  topic: string;
  scriptMode: ScriptMode;
  tone: Tone;
  factHandlingMode: FactHandlingMode;
  premiseDetails: string;
  storyStrategy: StoryStrategySelection;
  hookStyle: HookStyleSelection;
  userAuthoredHook: string;
  reliabilityMode: CreationReliabilityMode;
  researchPreview: ResearchPreviewState;
  entityPreview?: EntityPreviewDisplay;
  onPreviewResearch: () => void;
  onRefreshResearchPreview?: () => void;
  onApplyRecommendedSettings: (next: {
    qualityMode: QualityMode;
    storyStrategy: StoryStrategySelection;
    factHandlingMode: FactHandlingMode;
    hookStyle: HookStyleSelection;
    reliabilityMode: CreationReliabilityMode;
  }) => void;
}

/**
 * Brief inspector — research, notes, quality, and recommendations.
 */
export default function CreateBriefInspector({
  context,
  onContextChange,
  enableResearch,
  onEnableResearchChange,
  qualityMode,
  onQualityModeChange,
  sceneCount,
  onSceneCountChange,
  duration,
  loading,
  topic,
  scriptMode,
  tone,
  factHandlingMode,
  premiseDetails,
  storyStrategy,
  hookStyle,
  userAuthoredHook,
  reliabilityMode,
  researchPreview,
  entityPreview,
  onPreviewResearch,
  onRefreshResearchPreview,
  onApplyRecommendedSettings,
}: CreateBriefInspectorProps) {
  const [notesOpen, setNotesOpen] = useState(() => context.trim().length > 0);

  const recommendation = useMemo(
    () =>
      recommendCreateBrief({
        topic,
        durationSec: duration,
        scriptMode,
        tone,
        enableResearch,
        factHandlingMode,
        hasPremiseDetails: premiseDetails.trim().length > 0,
        hasManualContext: context.trim().length > 0,
        storyStrategy,
        qualityMode,
        hookStyle,
        userAuthoredHook,
        reliabilityMode,
      }),
    [
      topic,
      duration,
      scriptMode,
      tone,
      enableResearch,
      factHandlingMode,
      premiseDetails,
      context,
      storyStrategy,
      qualityMode,
      hookStyle,
      userAuthoredHook,
      reliabilityMode,
    ],
  );

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <StudioSection
        title="Recommended for this story"
        description="Guidance you can ignore — every compatible selection remains generatable."
      >
        <StudioPanel>
          <ul className="space-y-2 text-sm text-foreground/90">
            <li>
              <span className="text-muted">Story strategy: </span>
              {recommendation.storyStrategy === "short_retention"
                ? "Retention-first"
                : recommendation.storyStrategy === "auto"
                  ? "Auto"
                  : recommendation.storyStrategy}
            </li>
            <li>
              <span className="text-muted">Quality: </span>
              {qualityLabel(recommendation.qualityMode)}
            </li>
            <li>
              <span className="text-muted">Hook: </span>
              Auto
            </li>
            <li>
              <span className="text-muted">Fact handling: </span>
              {factHandlingLabel(recommendation.factHandling)}
              {recommendation.researchRecommended
                ? " — Smart Research recommended when factual accuracy matters"
                : ""}
            </li>
            <li>
              <span className="text-muted">Generation mode: </span>
              Flexible (default)
            </li>
            <li>
              <span className="text-muted">Likely Hook family: </span>
              {recommendation.likelyHookFamily}
            </li>
            <li>
              <span className="text-muted">Approx. beats / words: </span>
              {recommendation.approximateBeatCount} · ~
              {recommendation.targetNarrationWords}
            </li>
          </ul>

          <div className="mt-4 border-t border-border/20 pt-3">
            <p className={`${studioFieldLabel} mb-2`}>Your current selections</p>
            <ul className="space-y-2 text-sm">
              {recommendation.selectionAssessments.map((item) => (
                <li key={item.id} className="text-foreground/90">
                  <span className="text-muted">{item.label}: </span>
                  {item.valueLabel}
                  <span className="text-muted">
                    {" "}
                    · {selectionCompatibilityLabel(item.tier)}
                  </span>
                  <p className={`${studioSubtleText} mt-0.5`}>{item.note}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className={`${studioSubtleText} mt-3`}>{recommendation.summary}</p>
          <button
            type="button"
            disabled={loading}
            onClick={() =>
              onApplyRecommendedSettings({
                qualityMode: recommendation.qualityMode,
                storyStrategy: recommendation.storyStrategy,
                factHandlingMode: recommendation.factHandling,
                hookStyle: recommendation.hookStyle,
                reliabilityMode: recommendation.reliabilityMode,
              })
            }
            className={`${studioChip} mt-3`}
          >
            Apply recommended settings
          </button>
        </StudioPanel>
      </StudioSection>

      <StudioSection title="Smart Research" description="Use trusted sources when available.">
        <StudioPanel>
          <div className="flex items-start gap-3">
            <input
              id="enableResearch"
              type="checkbox"
              checked={enableResearch}
              onChange={(event) => onEnableResearchChange(event.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
            />
            <div className="min-w-0 flex-1">
              <label htmlFor="enableResearch" className="text-sm font-medium text-foreground/90">
                Enable Smart Research
              </label>
              <p className={`${studioSubtleText} mt-1`}>
                {factHandlingMode === "creative_premise"
                  ? "Research may enrich or cross-check the story. Premise facts stay creator-supplied and unverified — research never overwrites them."
                  : "Supporting facts are gathered automatically when you write your story. Research absence does not block a qualitative draft."}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-border/20 pt-4">
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
          </div>
        </StudioPanel>
      </StudioSection>

      <StudioSection title="Manual context" description="Optional notes for research and writing.">
        <StudioPanel>
          <details
            className="group"
            open={notesOpen}
            onToggle={(event) => setNotesOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-start justify-between gap-3">
                <p className={`${studioSubtleText} group-open:hidden`}>
                  Stats, formations, or anything else to include.
                </p>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180"
                  aria-hidden
                />
              </div>
            </summary>

            <div className="mt-3 border-t border-border/20 pt-3">
              <label htmlFor="context" className={studioFieldLabel}>
                Additional notes
              </label>
              <textarea
                id="context"
                value={context}
                onChange={(event) => onContextChange(event.target.value)}
                placeholder="Stats, formations, or anything else to include"
                disabled={loading}
                rows={4}
                className={`${studioComposerInput} mt-1.5 min-h-[5rem]`}
              />
            </div>
          </details>
        </StudioPanel>
      </StudioSection>

      <StudioSection title="Quality" description="Controls effort, not whether a story is returned.">
        <StudioPanel>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label htmlFor="qualityMode" className={studioFieldLabel}>
                Quality
              </label>
              <div className="relative mt-1.5">
                <select
                  id="qualityMode"
                  value={qualityMode}
                  onChange={(event) => onQualityModeChange(event.target.value as QualityMode)}
                  disabled={loading}
                  className={studioComposerSelect}
                >
                  {BRIEF_QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className={studioSelectChevronCompact} />
              </div>
              <p className={`${studioSubtleText} mt-1`}>
                {BRIEF_QUALITY_OPTIONS.find((option) => option.value === qualityMode)?.description}
              </p>
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
                onChange={(event) => {
                  const next = Number(event.target.value);
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
        </StudioPanel>
      </StudioSection>
    </div>
  );
}
