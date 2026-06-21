"use client";

import { Download, Film, Play } from "lucide-react";
import type { ReactNode } from "react";

import BackgroundMusicCard from "@/components/BackgroundMusicCard";
import ExportPanel from "@/components/ExportPanel";
import NarrationPanel from "@/components/NarrationPanel";
import StoryReview from "@/components/StoryReview";
import VoiceSettingsCard from "@/components/VoiceSettingsCard";
import { TimelineEditor } from "@/features/editor/components";
import { VideoPreview } from "@/features/preview/components";
import {
  studioMobileActionBar,
  studioMobileActionButton,
  studioMobileActionButtonPrimary,
  studioSectionDesc,
  studioSectionTitle,
  studioStepLabel,
  studioSubtleText,
  studioWorkspaceAside,
  studioWorkspaceGrid,
  studioWorkspaceMain,
  studioWorkspacePanel,
  studioWorkspaceSection,
} from "@/lib/studioUi";
import type { ExportSettings, FootieScript } from "@/features/story/types";

interface StoryWorkspaceProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  selectedSceneIndex: number;
  onSelectedSceneChange: (index: number) => void;
  onScrollToExport: () => void;
  onExportSettingsChange?: (settings: ExportSettings) => void;
}

function WorkspacePanel({
  title,
  description,
  step,
  id,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  step?: string;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`${studioWorkspacePanel} ${className}`}>
      <div className="mb-4 sm:mb-5">
        {step ? <p className={studioStepLabel}>{step}</p> : null}
        <h2 className={studioSectionTitle}>{title}</h2>
        {description ? <p className={studioSectionDesc}>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function StoryWorkspace({
  script,
  onScriptChange,
  selectedSceneIndex,
  onSelectedSceneChange,
  onScrollToExport,
  onExportSettingsChange,
}: StoryWorkspaceProps) {
  const scrollToPreview = () => {
    document.getElementById("studio-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToTimeline = () => {
    document.getElementById("studio-timeline")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="mb-4 min-w-0 sm:mb-8">
          <p className={studioStepLabel}>Storyboard</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-[1.65rem]">
            {script.title}
          </h1>
          <p className={studioSubtleText}>
            {script.totalDuration}s · {script.scenes.length} scenes · edit timeline, preview, and export
          </p>
        </div>

        <div className={studioWorkspaceGrid}>
          {/* ── Main column: draft + scene timeline ── */}
          <div className={`${studioWorkspaceMain} order-last lg:order-none`}>
            <section className={studioWorkspaceSection}>
              <StoryReview
                story={script}
                onStoryChange={onScriptChange}
                variant="storyboard"
              />
              <div className="mt-5 border-t border-border/25 pt-5 sm:mt-6 sm:pt-6">
                <VoiceSettingsCard script={script} onScriptChange={onScriptChange} />
              </div>
              <div className="mt-5 border-t border-border/25 pt-5 sm:mt-6 sm:pt-6">
                <BackgroundMusicCard script={script} onScriptChange={onScriptChange} />
              </div>
            </section>

            <section id="studio-timeline" className={studioWorkspaceSection}>
              <TimelineEditor
                script={script}
                onScriptChange={onScriptChange}
                selectedSceneIndex={selectedSceneIndex}
                onSelectedSceneChange={onSelectedSceneChange}
                variant="storyboard"
              />
            </section>
          </div>

          {/* ── Inspector: preview, narration, export ── */}
          <aside
            className={`${studioWorkspaceAside} order-first lg:order-none`}
            aria-label="Preview and export"
          >
            <WorkspacePanel
              id="studio-preview"
              step="Preview"
              title="Short preview"
              description="Play back your vertical short with narration or browser voice."
              className="w-full lg:max-w-none"
            >
              <VideoPreview
                script={script}
                selectedSceneIndex={selectedSceneIndex}
                onSelectedSceneChange={onSelectedSceneChange}
              />
            </WorkspacePanel>

            <WorkspacePanel step="Narration" title="Spoken audio">
              <NarrationPanel script={script} compact />
            </WorkspacePanel>

            <WorkspacePanel id="studio-export" step="Export" title="Export video">
              <ExportPanel
                script={script}
                compact
                onExportSettingsChange={onExportSettingsChange}
              />
            </WorkspacePanel>
          </aside>
        </div>
      </div>

      {/* Mobile sticky actions */}
      <div className={studioMobileActionBar} role="toolbar" aria-label="Storyboard actions">
        <div className="mx-auto flex min-w-0 max-w-lg gap-1.5 px-3.5 sm:gap-2 sm:px-4">
          <button type="button" onClick={scrollToTimeline} className={studioMobileActionButton}>
            <Film className="h-3.5 w-3.5" />
            Timeline
          </button>
          <button type="button" onClick={scrollToPreview} className={studioMobileActionButton}>
            <Play className="h-3.5 w-3.5" />
            Preview
          </button>
          <button type="button" onClick={onScrollToExport} className={studioMobileActionButtonPrimary}>
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>
    </>
  );
}
