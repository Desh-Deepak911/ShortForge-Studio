/**
 * Scene media timeline — Sprint 8A–8E domain, editor, Preview/Export adapters.
 * Multi-image scenes are the default production capability (flag retired in 8E.3).
 */

export { buildLegacyVirtualMediaItemId } from "./domain/legacy-virtual-id";
export * from "./editor";
export {
  applyNormalizedMediaTimelineToScene,
  cloneSceneMedia,
  cloneSceneMediaTimeline,
  isAbsentSceneMediaTimeline,
  normalizeSceneMediaTimeline,
  normalizeSceneMediaTimelineItem,
  type NormalizeSceneMediaTimelineResult,
  type SceneMediaTimelineDiagnostic,
  type SceneMediaTimelineDiagnosticCode,
} from "./domain/normalize-timeline";
export {
  isSceneMediaTimelineBuildError,
  SceneMediaTimelineBuildError,
} from "./domain/build-timeline-error";
export {
  sceneMediaTimelineChanged,
  sceneMediaTimelineSignature,
} from "./domain/timeline-signature";
export {
  normalizeSceneDurationMsForWindows,
  resolveActiveSceneMediaAtElapsed,
  resolveSceneMediaWindows,
  type ActiveSceneMediaResolution,
  type ResolvedMediaWindowProvenance,
  type ResolvedSceneMediaWindow,
  type ResolveSceneMediaWindowsInput,
} from "./resolution/resolve-media-windows";
export {
  projectSceneMediaTimeline,
  readStoredSceneMediaTimeline,
  resolveProjectedActiveSceneMedia,
  resolveProjectedSceneMediaWindows,
  type ProjectedSceneMediaTimeline,
} from "./adapters/project-scene-media-timeline";
export {
  applyBuiltMediaTimelineToScene,
  buildSceneMediaTimeline,
  type BuildSceneMediaTimelineInput,
  type BuildSceneMediaTimelineResult,
} from "./adapters/build-scene-media-timeline";
export { sceneMediaToCompatibilityImage } from "./adapters/scene-media-to-compatibility-image";
export {
  buildActiveSceneMediaRenderViewFromWindow,
  resolveActiveSceneMediaRenderView,
  resolvePreviewSceneMediaWindows,
  resolveSceneMediaItemRenderView,
  type ActiveSceneMediaRenderView,
  type ResolveActiveSceneMediaRenderViewOptions,
} from "./adapters/resolve-active-scene-media-render-view";