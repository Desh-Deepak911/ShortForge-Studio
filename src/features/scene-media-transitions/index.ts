/**
 * Intra-scene media transitions (Sprint 9A foundation).
 * Owns media-to-media transitions inside one FootieScene.
 * Does not own Preview/Export rendering, MasterTimeline, or scene-to-scene transitions.
 *
 * Sprint 9B may import the semantic resolver from this barrel (or resolution/)
 * and shared effect-layer mathematics from timeline-intelligence (its owner).
 *
 * Do not re-export timeline-intelligence utilities from this barrel (import-cycle safety).
 */

export {
  INTRA_SCENE_TRANSITION_DURATION_OPTIONS,
  INTRA_SCENE_TRANSITION_EFFECTS,
  INTRA_SCENE_TRANSITION_WINDOW_FRACTION,
  type IntraSceneTransitionDiagnostic,
  type IntraSceneTransitionDiagnosticCode,
} from "./domain/constants";
export {
  isSupportedIntraSceneTransitionDuration,
  isSupportedIntraSceneTransitionEffect,
  pairKey,
} from "./domain/effect-support";
export {
  cloneSceneMediaTransitionBoundary,
  cloneSceneMediaTransitionTrack,
} from "./domain/clone-track";
export {
  applyNormalizedSceneMediaTransitionsToScene,
  normalizeSceneMediaTransitionTrack,
  resolveStoredBoundaryEffect,
  type NormalizeSceneMediaTransitionTrackResult,
} from "./domain/normalize-track";
export { reconcileSceneMediaTransitions } from "./domain/reconcile-track";
export {
  sceneMediaTransitionTrackSignature,
  sceneMediaTransitionsChanged,
} from "./domain/track-signature";
export { resolveEffectiveIntraSceneTransitionDurationMs } from "./resolution/resolve-effective-duration";
export {
  CONTINUOUS_INTRA_SCENE_TRANSITION_TIMING_MODEL,
  resolveContinuousIntraSceneTransitionTiming,
  resolveContinuousTransitionFootageAvailability,
  type ContinuousIntraSceneTransitionTimingInput,
  type ContinuousTransitionMediaAvailabilityInput,
  type ContinuousTransitionFootageAvailability,
  type ResolvedContinuousIntraSceneTransitionTiming,
} from "./resolution/resolve-continuous-intra-scene-transition-timing";
export {
  INTRA_SCENE_TRANSITION_EXPORT_SEAM,
  INTRA_SCENE_TRANSITION_PREVIEW_SEAM,
  resolveIntraSceneTransitionAtElapsed,
  type ResolvedIntraSceneTransition,
} from "./resolution/resolve-intra-scene-transition";
export {
  reconcileSceneMediaTransitionsAfterTimelineWrite,
  resetSceneMediaTransitionBoundary,
  SceneMediaTransitionCommandError,
  setSceneMediaTransitionBoundary,
  type SceneMediaTransitionCommandResult,
} from "./editor/commands";
export { isSelectableSceneMediaTransitionPair } from "./editor/selection";
export {
  formatMediaTransitionAffordanceLabel,
  formatMediaTransitionEffectChip,
  formatMediaTransitionPairLabel,
  INTRA_SCENE_TRANSITION_EDITOR_NOTICE,
  INTRA_SCENE_TRANSITION_SINGLE_ITEM_GUIDANCE,
  INTRA_SCENE_TRANSITION_MULTI_ITEM_GUIDANCE,
} from "./presentation/labels";
