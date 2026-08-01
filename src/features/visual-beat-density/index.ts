/**
 * Visual-beat density planning (suggestion/provenance domain).
 * Not a preview/export render authority.
 */

export {
  VISUAL_BEAT_COMMAND_TERMINAL_CODES,
  VISUAL_BEAT_GENERATOR_VERSION,
  VISUAL_BEAT_PLAN_TERMINAL_CODES,
  VISUAL_BEAT_PLAN_VERSION,
  VISUAL_BEAT_PLAN_WARNING_CODES,
  type GenerateVisualBeatPlanFailure,
  type GenerateVisualBeatPlanResult,
  type GenerateVisualBeatPlanSuccess,
  type VisualBeatAnchor,
  type VisualBeatAnchorKind,
  type VisualBeatCommandTerminalCode,
  type VisualBeatDensity,
  type VisualBeatMediaKind,
  type VisualBeatPlanInput,
  type VisualBeatPlanStatus,
  type VisualBeatPlanTerminalCode,
  type VisualBeatPlanV1,
  type VisualBeatPlanWarningCode,
  type VisualBeatUsableMediaIdentity,
} from "./domain/visual-beat-plan";

export {
  deriveVisualBeatStaleReasonsFromSnapshots,
  evaluateVisualBeatPlanStaleness,
  parseStoredVisualBeatPlan,
  type EvaluateVisualBeatPlanStalenessInput,
  type VisualBeatPlanPresenceStatus,
  type VisualBeatPlanStaleReason,
  type VisualBeatPlanStalenessProjection,
} from "./domain/evaluate-visual-beat-plan-staleness";

export {
  VISUAL_BEAT_MEDIA_SET_FINGERPRINT_PREFIX,
  VISUAL_BEAT_NARRATION_FINGERPRINT_PREFIX,
  VISUAL_BEAT_ORDERED_MEDIA_FINGERPRINT_PREFIX,
  VISUAL_BEAT_SOURCE_SNAPSHOT_VERSION,
  buildVisualBeatSourceSnapshot,
  fingerprintVisualBeatMediaSet,
  fingerprintVisualBeatNarrationText,
  fingerprintVisualBeatOrderedMedia,
  parseVisualBeatSourceSnapshot,
  type BuildVisualBeatSourceSnapshotInput,
  type VisualBeatSourceSnapshotV1,
} from "./domain/visual-beat-source-snapshot";

export {
  mapSequenceItemsToUsableMedia,
  projectSceneVisualBeatPlanContext,
  readStoredVisualBeatPlan,
  resolveSceneNarrationTextForVisualBeats,
  resolveSceneVisualSequenceItemsForBeats,
  resolveVisualBeatSourceIdentity,
  type SceneVisualBeatPlanContext,
} from "./adapters/project-scene-visual-beat-plan";

export {
  VISUAL_PACING_EXPORT_GUIDANCE_CODES,
  VISUAL_PACING_EXPORT_GUIDANCE_MESSAGES,
  resolveVisualPacingExportGuidance,
  type ResolveVisualPacingExportGuidanceInput,
  type VisualPacingExportGuidanceCode,
  type VisualPacingExportGuidanceItem,
} from "./adapters/resolve-visual-pacing-export-guidance";

export {
  applyVisualBeatPlan,
  discardVisualBeatPlan,
  projectVisualBeatPlanStalenessForScene,
  suggestVisualBeatPlan,
  type VisualBeatCommandFailure,
  type VisualBeatCommandResult,
  type VisualBeatCommandSuccess,
  type VisualBeatCommandWarning,
  type VisualBeatCommandWarningCode,
} from "./editor/visual-beat-plan.commands";

export {
  VISUAL_BEAT_DENSITY_ANCHOR_SNAP_RATIO,
  VISUAL_BEAT_DENSITY_MAX_PREFERRED_DWELL_MS,
  VISUAL_BEAT_DENSITY_MIN_EFFECTIVE_DWELL_MS,
  VISUAL_BEAT_DENSITY_PREFERRED_DWELL_MS,
  computePreferredBeatCount,
  resolveVisualBeatDensityPolicy,
  type VisualBeatDensityPolicy,
} from "./domain/visual-beat-density-policy";

export {
  VISUAL_BEAT_INPUT_FINGERPRINT_PREFIX,
  fingerprintVisualBeatInput,
  normalizeVisualBeatNarrationText,
  normalizeVisualBeatUsableMedia,
  type VisualBeatFingerprintInput,
} from "./domain/fingerprint-visual-beat-input";

export {
  extractNarrationAnchors,
  narrationAnchorsAreFallbackOnly,
} from "./domain/extract-narration-anchors";

export {
  buildEqualSplitStartOffsetsMs,
  generateVisualBeatPlan,
} from "./domain/generate-visual-beat-plan";
