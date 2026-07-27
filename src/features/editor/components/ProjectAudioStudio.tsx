"use client";

import { Download, Mic, Music2, SlidersHorizontal } from "lucide-react";

import ProjectAudioBackgroundMusicSection from "@/features/editor/components/ProjectAudioBackgroundMusicSection";
import ProjectAudioExportMixSummary from "@/features/editor/components/ProjectAudioExportMixSummary";
import ProjectAudioVoiceoverSection from "@/features/editor/components/ProjectAudioVoiceoverSection";
import { AudioMixerPanel } from "@/features/audio-mixer";
import InspectorSection from "@/components/studio-shell/InspectorSection";
import type { FootieScript } from "@/features/story/types";
import {
  studioInspectorSectionTitle,
  studioInspectorStack,
  studioSubtleText,
} from "@/lib/utils/studioUi";

export interface ProjectAudioStudioProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

/**
 * Project Audio Studio — composes voiceover, music, and export mix controls for the editor inspector.
 */
export default function ProjectAudioStudio({
  script,
  onScriptChange,
}: ProjectAudioStudioProps) {
  return (
    <div
      className={`${studioInspectorStack} shrink-0 border-t border-border/20 pt-2`}
    >
      <header className="px-0.5">
        <p className={studioInspectorSectionTitle}>Project Audio</p>
      </header>

      <InspectorSection icon={Mic} title="Voiceover" defaultOpen>
        <ProjectAudioVoiceoverSection
          script={script}
          onScriptChange={onScriptChange}
        />
      </InspectorSection>

      <InspectorSection icon={Music2} title="Background Music">
        <ProjectAudioBackgroundMusicSection
          script={script}
          onScriptChange={onScriptChange}
        />
      </InspectorSection>

      <InspectorSection icon={SlidersHorizontal} title="Audio Mixer">
        <AudioMixerPanel script={script} onScriptChange={onScriptChange} />
      </InspectorSection>

      <InspectorSection icon={Download} title="Export Mix">
        <ProjectAudioExportMixSummary script={script} embedded />
      </InspectorSection>
    </div>
  );
}
