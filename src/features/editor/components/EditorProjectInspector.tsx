"use client";

import BackgroundMusicCard from "@/components/BackgroundMusicCard";
import NarrationPanel from "@/components/NarrationPanel";
import StoryReview from "@/components/StoryReview";
import VoiceSettingsCard from "@/components/VoiceSettingsCard";
import InspectorSection from "@/components/studio-shell/InspectorSection";
import type { FootieScript } from "@/features/story/types";

export interface EditorProjectInspectorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

/**
 * Project-level settings relocated from the sidebar — draft, voice, music, narration audio.
 */
export default function EditorProjectInspector({
  script,
  onScriptChange,
}: EditorProjectInspectorProps) {
  return (
    <div className="min-w-0 shrink-0 border-t border-border/20 pt-2">
      <InspectorSection title="Project" description="Draft, voice, music, and narration audio.">
        <div className="space-y-4">
          <StoryReview story={script} onStoryChange={onScriptChange} variant="storyboard" />
          <VoiceSettingsCard script={script} onScriptChange={onScriptChange} />
          <BackgroundMusicCard script={script} onScriptChange={onScriptChange} />
          <NarrationPanel script={script} compact />
        </div>
      </InspectorSection>
    </div>
  );
}
