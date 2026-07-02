"use client";

import StoryReview from "@/components/StoryReview";
import ProjectAudioStudio from "@/features/editor/components/ProjectAudioStudio";
import InspectorSection from "@/components/studio-shell/InspectorSection";
import type { FootieScript } from "@/features/story/types";
import { studioInspectorStack } from "@/lib/utils/studioUi";

export interface EditorProjectInspectorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

/**
 * Project-level settings — audio studio is always visible; story text collapses below.
 */
export default function EditorProjectInspector({
  script,
  onScriptChange,
}: EditorProjectInspectorProps) {
  return (
    <div className={`${studioInspectorStack} shrink-0`}>
      <ProjectAudioStudio script={script} onScriptChange={onScriptChange} />

      <InspectorSection title="Project" description="Story title and narration text.">
        <StoryReview story={script} onStoryChange={onScriptChange} variant="storyboard" />
      </InspectorSection>
    </div>
  );
}
