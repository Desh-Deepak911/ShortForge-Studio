import type { StorySynchronizationState } from "./story-sync.types";

/** Creates a fully synchronized initial state (all versions at 0, nothing dirty). */
export function createInitialStorySynchronizationState(
  partial?: Partial<StorySynchronizationState>,
): StorySynchronizationState {
  return {
    storyVersion: 0,
    narrationVersion: 0,
    voiceVersion: 0,
    previewVersion: 0,
    exportVersion: 0,
    storyDirty: false,
    narrationDirty: false,
    voiceDirty: false,
    previewDirty: false,
    exportDirty: false,
    lastNarrationGeneratedAt: null,
    lastVoiceGeneratedAt: null,
    lastExportAt: null,
    lastPreviewAt: null,
    ...partial,
  };
}
