"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import ResearchPreviewPanel from "@/features/create/components/ResearchPreviewPanel";
import { StudioPanel, StudioSection } from "@/components/studio-shell";
import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import type { ResearchPreviewState } from "@/features/create/types/research-preview.types";
import { CreatorTemplatePicker } from "@/features/creator-templates/components";
import type { CreatorTemplateId } from "@/features/creator-templates";
import {
  studioComposerInput,
  studioComposerSelect,
  studioFieldLabel,
  studioSelectChevronCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { QualityMode, ScriptMode } from "@/types/footiebitz";
import { MAX_SCENE_COUNT, MIN_SCENE_COUNT } from "@/types/footiebitz";

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
  selectedTemplateId: CreatorTemplateId | "";
  onTemplateChange: (templateId: CreatorTemplateId | "") => void;
  loading: boolean;
  topic: string;
  scriptMode: ScriptMode;
  researchPreview: ResearchPreviewState;
  entityPreview?: EntityPreviewDisplay;
  onPreviewResearch: () => void;
  onRefreshResearchPreview?: () => void;
}

/**
 * Brief inspector — research, notes, and generation settings.
 * Presentation only; wired from CreateStoryFlow state.
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
  selectedTemplateId,
  onTemplateChange,
  loading,
  topic,
  scriptMode,
  researchPreview,
  entityPreview,
  onPreviewResearch,
  onRefreshResearchPreview,
}: CreateBriefInspectorProps) {
  const [notesOpen, setNotesOpen] = useState(() => context.trim().length > 0);

  return (
    <div className="flex min-h-0 flex-col gap-4">
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
                Supporting facts are gathered automatically when you write your story.
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

      <StudioSection title="Additional notes" description="Optional context for research and writing.">
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

      <StudioSection title="Creator template" description="Reusable formats with smart defaults.">
        <StudioPanel>
          <CreatorTemplatePicker
            selectedTemplateId={selectedTemplateId}
            onTemplateChange={onTemplateChange}
            scriptMode={scriptMode}
            sceneCount={sceneCount}
            duration={duration}
            disabled={loading}
          />
        </StudioPanel>
      </StudioSection>

      <StudioSection title="Generation settings" description="Quality and scene count for the first draft.">
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
