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
  resolveMediaSyncEditKind,
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
  resolveMediaCompleteness,
  formatMissingSceneNumbers,
  formatMissingSceneNumbersLabel,
} from "./media-completeness.utils";
export type { MediaCompletenessState } from "./media-completeness.utils";

export {
  resolveExportReadiness,
  isExportReadinessBlocked,
  resolveExportBlockedMessage,
  EXPORT_BLOCKED_NO_SCENES_MESSAGE,
  EXPORT_BLOCKED_NARRATION_MESSAGE,
  EXPORT_BLOCKED_VOICE_MESSAGE,
  resolveMissingMediaBlockedMessage,
} from "./export-readiness.utils";
export type { ExportReadinessState } from "./export-readiness.utils";

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
  resolveSceneSpokenText,
} from "./story-spoken-text.utils";
export type {
  SceneSpokenTextResolution,
  SceneSpokenTextSource,
} from "./story-spoken-text.utils";

export {
  NO_USABLE_NARRATION_WARNING,
  UNSAFE_NARRATION_REBUILD_WARNING,
  formatUnsafeNarrationRebuildWarning,
  rebuildNarrationFromScenes,
  resolveSceneNarrationSourceText,
  validateNarrationRebuildSources,
} from "./story-narration-rebuild.utils";
export type {
  NarrationRebuildDiagnostics,
  NarrationRebuildSourceEntry,
  NarrationRebuildSourceType,
  RebuildNarrationResult,
} from "./story-narration-rebuild.utils";
