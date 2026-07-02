"use client";

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
    <div className={`${studioInspectorStack} shrink-0 border-t border-border/20 pt-2`}>
      <header className="px-0.5">
        <p className={studioInspectorSectionTitle}>Project Audio</p>
        <p className={`${studioSubtleText} mt-0.5 text-[11px] leading-snug`}>
          Voiceover, background music, and export mix for this short.
        </p>
      </header>

      <InspectorSection
        title="Voiceover"
        description="Narration status, voice settings, generation, and upload."
        defaultOpen
      >
        <ProjectAudioVoiceoverSection script={script} onScriptChange={onScriptChange} />
      </InspectorSection>

      <InspectorSection
        title="Background Music"
        description="Optional soundtrack — upload, volume, and fades."
      >
        <ProjectAudioBackgroundMusicSection script={script} onScriptChange={onScriptChange} />
      </InspectorSection>

      <InspectorSection
        title="Audio Mixer"
        description="Voice, music, and master volume for preview and export."
      >
        <AudioMixerPanel script={script} onScriptChange={onScriptChange} />
      </InspectorSection>

      <InspectorSection title="Export Mix" description="What will be included in your download.">
        <ProjectAudioExportMixSummary script={script} embedded />
      </InspectorSection>
    </div>
  );
}
