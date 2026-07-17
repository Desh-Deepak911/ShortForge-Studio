/**
 * Preview-only adapters for intra-scene transitions (Sprint 9B / 9B.1).
 * Not re-exported from the feature root barrel (keeps domain/story import graph clean).
 */

export {
  composeIntraSceneTransitionPreview,
  resolveIntraSceneTransitionProgressCheckpoint,
  type IntraSceneTransitionPreviewComposition,
} from "./compose-intra-scene-transition-preview";
export {
  buildPreviewMediaLayerStableKey,
  planPreviewMediaLayers,
  type IntraSceneTransitionLayerDiagnostics,
  type PlanPreviewMediaLayersInput,
  type PreviewMediaLayerDescriptor,
  type PreviewMediaLayerPlan,
  type PreviewMediaLayerRole,
} from "./plan-preview-media-layers";
