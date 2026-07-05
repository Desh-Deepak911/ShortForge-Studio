export type {
  StorySyncEditKind,
  StorySynchronizationState,
  StorySynchronizationStatus,
  StorySynchronizationSummary,
} from "./story-sync.types";

export { createInitialStorySynchronizationState } from "./story-sync.state";

export {
  advanceExportVersion,
  advanceNarrationVersion,
  advancePreviewVersion,
  advanceStoryVersion,
  advanceVoiceVersion,
  applyStorySyncEdit,
  createSynchronizedStoryState,
  getStorySyncDirtySignature,
  getSynchronizationSummary,
  isStorySyncExportBlocked,
  markExportDirty,
  markExportSynchronized,
  markNarrationDirty,
  markNarrationSynchronized,
  markPreviewDirty,
  markPreviewSynchronized,
  markStoryDirty,
  markStorySynchronized,
  markVoiceDirty,
  markVoiceSynchronized,
  resolveStorySyncBanner,
  resolveStorySyncEditKind,
  resolvePresentationSyncEditKind,
  resolveStorySyncSteps,
  STORY_SYNC_EXPORT_BLOCKED_MESSAGE,
} from "./story-sync.utils";
export type {
  StorySyncBannerKind,
  StorySyncBannerModel,
  StorySyncStepModel,
  StorySyncStepTone,
} from "./story-sync.utils";

export {
  StorySyncProvider,
  useOptionalStorySync,
  useStorySync,
} from "./StorySyncContext";
export type { StorySyncContextValue } from "./StorySyncContext";

export {
  StorySynchronizationBanner,
  SynchronizationStatusCard,
  SynchronizationStep,
} from "./components";
export type {
  StorySynchronizationBannerProps,
  SynchronizationStatusCardProps,
  SynchronizationStepProps,
} from "./components";

export {
  NO_USABLE_NARRATION_WARNING,
  rebuildNarrationFromScenes,
  resolveSceneNarrationSourceText,
} from "./story-narration-rebuild.utils";
export type { RebuildNarrationResult } from "./story-narration-rebuild.utils";
