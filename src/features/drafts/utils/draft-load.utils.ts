import type { FootieScript } from "@/features/story/types";

import { syncFootieScript } from "@/lib/voiceover";

import type { Draft } from "../types";

import { hydrateDraftScriptAudio } from "./draft-audio-persistence.utils";
import { applyEditorSlicesToScript } from "./draft-model.utils";

/** Merges denormalized draft slices and restores persisted audio for the editor. */
export function resolveDraftScriptForEditor(draft: Draft): FootieScript {
  const merged = applyEditorSlicesToScript(draft.script, {
    scenes: draft.scenes,
    timelineItems: draft.timelineItems,
    voiceSettings: draft.voiceSettings,
    voiceover: draft.voiceover,
    exportSettings: draft.exportSettings,
    backgroundMusic: draft.backgroundMusic,
  });

  return syncFootieScript(hydrateDraftScriptAudio(merged));
}
