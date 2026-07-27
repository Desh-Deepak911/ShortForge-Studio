"use client";

import ProjectAudioStudio from "@/features/editor/components/ProjectAudioStudio";
import type { FootieScript } from "@/features/story/types";
import { studioInspectorStack } from "@/lib/utils/studioUi";

export interface EditorAudioInspectorProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
}

/**
 * Project-level audio workspace. This is a presentation split only; all existing
 * voiceover, music, ducking and export-mix logic remains owned by ProjectAudioStudio.
 */
export default function EditorAudioInspector({
  script,
  onScriptChange,
}: EditorAudioInspectorProps) {
  return (
    <div className={`${studioInspectorStack} pb-1`}>
      <ProjectAudioStudio script={script} onScriptChange={onScriptChange} />
    </div>
  );
}
