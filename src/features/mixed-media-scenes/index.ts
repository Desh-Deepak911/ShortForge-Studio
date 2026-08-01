/**
 * Mixed-media scenes (gated by mixed-media-scenes-v1).
 */

export {
  isMixedMediaScenesCapabilityEnabled,
  listIncludesMixedMediaScenesCapability,
  MIXED_MEDIA_SCENES_CAPABILITY_ID,
} from "./domain/mixed-media-scenes-capability";
export {
  cloneVisualSequence,
  normalizeVisualSequence,
  type NormalizeVisualSequenceResult,
  type VisualSequenceTerminalCode,
  type VisualSequenceWarning,
  type VisualSequenceWarningCode,
} from "./domain/normalize-visual-sequence";
export {
  mediaTimelineWindowsToVisualSequence,
  visualSequenceToMediaTimeline,
} from "./adapters/visual-sequence-to-media-timeline";
export {
  applyVisualSequenceAuthorityToScene,
  applyVisualSequenceAuthorityToStory,
  reconcileVisualSequenceRenderAuthority,
  visualSequenceDivergesFromMediaTimeline,
  type ReconcileVisualSequenceAuthorityResult,
  type VisualRenderAuthority,
  type VisualSequenceAuthorityMode,
} from "./adapters/reconcile-visual-sequence-authority";
export {
  projectSceneVisualPlan,
  type ProjectedSceneVisualPlan,
} from "./adapters/project-visual-sequence";
export {
  isInspectorSelectableMediaItemId,
  resolveInspectorSceneMediaProjection,
  resolveNearestInspectorMediaItemId,
  type InspectorSceneMediaProjection,
} from "./adapters/inspector-scene-media-projection";
export {
  appendMixedMediaSequenceItem,
  readMixedMediaSequenceItems,
  readSceneVisualSequence,
  removeMixedMediaSequenceItem,
  reorderMixedMediaSequenceItem,
  updateMixedMediaSequenceBoundary,
  updateMixedMediaSequenceItemDuration,
  updateMixedMediaSequenceItemTiming,
  type MixedMediaSceneCommandResult,
} from "./editor/mixed-media-scene.commands";
