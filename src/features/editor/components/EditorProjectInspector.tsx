"use client";

import { FileText } from "lucide-react";

import StoryReview from "@/components/StoryReview";
import InspectorSection from "@/components/studio-shell/InspectorSection";
import type { FootieScript } from "@/features/story/types";
import { studioInspectorStack } from "@/lib/utils/studioUi";

export interface EditorProjectInspectorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

/**
 * Project-level story settings. Audio lives in its own inspector tab.
 */
export default function EditorProjectInspector({
  script,
  onScriptChange,
}: EditorProjectInspectorProps) {
  return (
    <div className={`${studioInspectorStack} pb-1`}>
      <InspectorSection
        icon={FileText}
        title="Project"
        description="Story title and narration text."
      >
        <StoryReview
          story={script}
          onStoryChange={onScriptChange}
          variant="storyboard"
        />
      </InspectorSection>
    </div>
  );
}
