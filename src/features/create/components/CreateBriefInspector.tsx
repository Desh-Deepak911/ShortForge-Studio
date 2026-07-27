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
  const [activeSection, setActiveSection] = useState<
    "guide" | "research" | "settings"
  >("guide");

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
      <div
        className="grid grid-cols-3 gap-1 rounded-xl bg-background/35 p-1 ring-1 ring-border/25"
        role="tablist"
        aria-label="Brief tools"
      >
        {(["guide", "research", "settings"] as const).map((section) => (
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

      <div hidden={activeSection !== "guide"}>
        <StudioSection
          title="Recommended for this story"
          description="A concise starting point. You can change every setting."
        >
          <StudioPanel>
            <dl className="grid grid-cols-2 gap-2 text-sm text-foreground/90">
              <div className="rounded-xl bg-background/25 p-2.5">
                <dt className={studioFieldLabel}>Strategy</dt>
                <dd className="mt-1">
                  {recommendation.storyStrategy === "short_retention"
                    ? "Retention-first"
                    : recommendation.storyStrategy === "auto"
                      ? "Auto"
                      : recommendation.storyStrategy}
                </dd>
              </div>
              <div className="rounded-xl bg-background/25 p-2.5">
                <dt className={studioFieldLabel}>Quality</dt>
                <dd className="mt-1">
                  {qualityLabel(recommendation.qualityMode)}
                </dd>
              </div>
              <div className="rounded-xl bg-background/25 p-2.5">
                <dt className={studioFieldLabel}>Fact handling</dt>
                <dd className="mt-1">
                  {factHandlingLabel(recommendation.factHandling)}
                </dd>
              </div>
              <div className="rounded-xl bg-background/25 p-2.5">
                <dt className={studioFieldLabel}>Beats / words</dt>
                <dd className="mt-1">
                  {recommendation.approximateBeatCount} · ~
                  {recommendation.targetNarrationWords}
                </dd>
              </div>
            </dl>

            <details className="group mt-3 border-t border-border/20 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-foreground/85 [&::-webkit-details-marker]:hidden">
                Why these settings?
                <ChevronDown className="h-3.5 w-3.5 text-muted transition group-open:rotate-180" />
              </summary>
              <div className="mt-3">
                <p className={`${studioSubtleText} mb-3`}>
                  Likely hook family: {recommendation.likelyHookFamily}
                  {recommendation.researchRecommended
                    ? " · Smart Research recommended"
                    : ""}
                </p>
                <ul className="space-y-2 text-sm">
                  {recommendation.selectionAssessments.map((item) => (
                    <li key={item.id} className="text-foreground/90">
                      <span className="text-muted">{item.label}: </span>
                      {item.valueLabel}
                      <span className="text-muted">
                        {" "}
                        · {selectionCompatibilityLabel(item.tier)}
                      </span>
                      <p className={`${studioSubtleText} mt-0.5`}>
                        {item.note}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className={`${studioSubtleText} mt-3`}>
                  {recommendation.summary}
                </p>
              </div>
            </details>

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
      </div>

      <div hidden={activeSection !== "research"} className="space-y-4">
        <StudioSection title="Smart Research">
          <StudioPanel>
            <div className="flex items-start gap-3">
              <input
                id="enableResearch"
                type="checkbox"
                checked={enableResearch}
                onChange={(event) =>
                  onEnableResearchChange(event.target.checked)
                }
                disabled={loading}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="enableResearch"
                  className="text-sm font-medium text-foreground/90"
                >
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

        <StudioSection title="Manual context">
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
      </div>

      <div hidden={activeSection !== "settings"}>
        <StudioSection title="Output settings">
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
                    onChange={(event) =>
                      onQualityModeChange(event.target.value as QualityMode)
                    }
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
                  {
                    BRIEF_QUALITY_OPTIONS.find(
                      (option) => option.value === qualityMode,
                    )?.description
                  }
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
                      Math.max(
                        MIN_SCENE_COUNT,
                        Math.min(MAX_SCENE_COUNT, Math.round(next)),
                      ),
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
    </div>
  );
}
