/**
 * Visual-beat density planning (suggestion/provenance domain).
 * Not a preview/export render authority.
 */

export {
  VISUAL_BEAT_GENERATOR_VERSION,
  VISUAL_BEAT_PLAN_TERMINAL_CODES,
  VISUAL_BEAT_PLAN_VERSION,
  VISUAL_BEAT_PLAN_WARNING_CODES,
  type GenerateVisualBeatPlanFailure,
  type GenerateVisualBeatPlanResult,
  type GenerateVisualBeatPlanSuccess,
  type VisualBeatAnchor,
  type VisualBeatAnchorKind,
  type VisualBeatDensity,
  type VisualBeatMediaKind,
  type VisualBeatPlanInput,
  type VisualBeatPlanTerminalCode,
  type VisualBeatPlanV1,
  type VisualBeatPlanWarningCode,
  type VisualBeatUsableMediaIdentity,
} from "./domain/visual-beat-plan";

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
