/**
 * Visual-beat plan domain model.
 * Suggestion/provenance only — never a render authority.
 */

export const VISUAL_BEAT_PLAN_VERSION = 1 as const;
export const VISUAL_BEAT_GENERATOR_VERSION = 1 as const;

export type VisualBeatDensity = "fast" | "balanced" | "studio";

export type VisualBeatAnchorKind = "sentence" | "phrase" | "fallback";

export type VisualBeatPlanWarningCode =
  | "BEATS_ANCHORS_FALLBACK"
  | "BEATS_EQUAL_SPLIT_USED"
  | "BEATS_FEWER_VISUALS_THAN_TARGET"
  | "BEATS_MORE_VISUALS_THAN_TARGET";

export type VisualBeatPlanTerminalCode =
  | "BEATS_NO_USABLE_VISUALS"
  | "BEATS_SCENE_TOO_SHORT"
  | "BEATS_INVALID_DURATION";

export type VisualBeatMediaKind = "image" | "video";

/** Ordered usable-media identity for planning and fingerprinting. */
export interface VisualBeatUsableMediaIdentity {
  readonly itemId: string;
  readonly mediaKind: VisualBeatMediaKind;
  readonly sourceIdentity: string;
}

export interface VisualBeatAnchor {
  readonly offsetMs: number;
  readonly kind: VisualBeatAnchorKind;
  /** Inclusive character index in normalized narration at the cue boundary. */
  readonly charIndex: number;
}

/**
 * Draft beat plan. Preview / Browser / Headless must not consume this object.
 * Apply (later slice) is the only path into visualSequence authority.
 */
export interface VisualBeatPlanV1 {
  readonly version: typeof VISUAL_BEAT_PLAN_VERSION;
  readonly generatorVersion: typeof VISUAL_BEAT_GENERATOR_VERSION;
  readonly density: VisualBeatDensity;
  readonly sourceFingerprint: string;
  readonly status: "draft";
  /** Scene-local starts; index 0 is always 0; length equals achieved media windows. */
  readonly proposedStartOffsetsMs: readonly number[];
  readonly anchors?: readonly VisualBeatAnchor[];
  readonly preferredBeatCount: number;
  readonly achievedMediaWindowCount: number;
  readonly warningCodes: readonly VisualBeatPlanWarningCode[];
  /** Present only when the caller supplied an explicit generation timestamp. */
  readonly generatedAtIso?: string;
}

export interface VisualBeatPlanInput {
  readonly narrationText: string;
  readonly sceneDurationMs: number;
  readonly usableMedia: readonly VisualBeatUsableMediaIdentity[];
  readonly density: VisualBeatDensity;
  readonly generatorVersion?: typeof VISUAL_BEAT_GENERATOR_VERSION;
  /** Explicit clock dependency — generation never samples the system clock. */
  readonly generatedAtIso?: string;
}

export type GenerateVisualBeatPlanSuccess = {
  readonly ok: true;
  readonly plan: VisualBeatPlanV1;
};

export type GenerateVisualBeatPlanFailure = {
  readonly ok: false;
  readonly terminalCode: VisualBeatPlanTerminalCode;
  readonly warningCodes: readonly VisualBeatPlanWarningCode[];
};

export type GenerateVisualBeatPlanResult =
  | GenerateVisualBeatPlanSuccess
  | GenerateVisualBeatPlanFailure;

export const VISUAL_BEAT_PLAN_WARNING_CODES = {
  BEATS_ANCHORS_FALLBACK: "BEATS_ANCHORS_FALLBACK",
  BEATS_EQUAL_SPLIT_USED: "BEATS_EQUAL_SPLIT_USED",
  BEATS_FEWER_VISUALS_THAN_TARGET: "BEATS_FEWER_VISUALS_THAN_TARGET",
  BEATS_MORE_VISUALS_THAN_TARGET: "BEATS_MORE_VISUALS_THAN_TARGET",
} as const satisfies Record<VisualBeatPlanWarningCode, VisualBeatPlanWarningCode>;

export const VISUAL_BEAT_PLAN_TERMINAL_CODES = {
  BEATS_NO_USABLE_VISUALS: "BEATS_NO_USABLE_VISUALS",
  BEATS_SCENE_TOO_SHORT: "BEATS_SCENE_TOO_SHORT",
  BEATS_INVALID_DURATION: "BEATS_INVALID_DURATION",
} as const satisfies Record<VisualBeatPlanTerminalCode, VisualBeatPlanTerminalCode>;
