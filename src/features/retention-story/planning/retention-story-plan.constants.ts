/**
 * Retention Story Plan constants — Sprint 10D.
 * Retention-owned. Do not import Hook, Studio Intelligence, or narration budget constants.
 */

import type { StoryFormatStrategyId } from "../domain/retention-story-contract.types";

export const RETENTION_STORY_PLAN_VERSION = 1 as const;
export const RETENTION_BEAT_PLAN_VERSION = 1 as const;
export const RETENTION_HOOK_HANDOFF_VERSION = 1 as const;

export const RETENTION_BEAT_STRATEGY_REGISTRY_VERSION =
  "retention-beat-strategy/1" as const;
export const RETENTION_BEAT_DENSITY_REGISTRY_VERSION =
  "retention-beat-density/1" as const;

export const RETENTION_BEAT_ID_PREFIX = "rbeat:" as const;
export const RETENTION_STORY_PLAN_FINGERPRINT_PREFIX = "rsp:" as const;

/**
 * Retention-owned narration pacing constant (words per second).
 * Intentionally copied — must NOT import the shared narration duration budget utils.
 */
export const RETENTION_WORDS_PER_SECOND = 2.4 as const;

/** Semantic beat text bounds (hard reject outside; deterministic text stays within). */
export const RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS = 160;
export const RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS = 160;
export const RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS = 260;
export const RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS = 200;
export const RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS = 200;
export const RETENTION_MAX_HANDOFF_TEXT_CHARS = 200;

/** Absolute beat-count ceiling across all production density profiles. */
export const RETENTION_MAX_BEATS = 12;

/** Planner request bounds (ephemeral only; never persisted). */
export const RETENTION_MAX_PLANNER_REQUEST_CLAIMS = 8;
export const RETENTION_MAX_PLANNER_PROPOSAL_BEATS = 24;

/** Prompt/planning labels that must not appear in beat or handoff text. */
export const RETENTION_BEAT_FORBIDDEN_LABELS = Object.freeze([
  "controlling idea",
  "emotional arc",
  "beat plan",
  "hook strategy",
  "hook handoff",
  "system prompt",
  "chain of thought",
  "chain-of-thought",
  "narration candidate",
  "retention story plan",
  "viewer question",
  "narration goal",
  "visual opportunity",
  "information contribution",
  "as an ai",
  "ignore previous",
  "ignore all previous",
] as const);

export interface RetentionBeatDensityProfile {
  readonly formatStrategyId: StoryFormatStrategyId;
  readonly minBeatDurationSec: number;
  readonly maxBeatDurationSec: number;
  readonly safeMinBeats: number;
  readonly safeMaxBeats: number;
  readonly targetBeatDurationSec: number;
}

/**
 * Immutable, versioned beat-density registry (production-capable strategies only).
 * long_form_* strategies are intentionally absent → rejected by the resolver.
 */
export const RETENTION_BEAT_DENSITY_PROFILES: Readonly<
  Partial<Record<StoryFormatStrategyId, RetentionBeatDensityProfile>>
> = Object.freeze({
  // Sprint 10H.3 — prefer fewer complete utterances on short formats so
  // 25–35s stories resolve to ~5–7 beats rather than nine thin fragments.
  short_retention: Object.freeze({
    formatStrategyId: "short_retention",
    minBeatDurationSec: 3.5,
    maxBeatDurationSec: 7,
    safeMinBeats: 4,
    safeMaxBeats: 8,
    targetBeatDurationSec: 5,
  }),
  short_standard: Object.freeze({
    formatStrategyId: "short_standard",
    minBeatDurationSec: 4,
    maxBeatDurationSec: 7,
    safeMinBeats: 4,
    safeMaxBeats: 8,
    targetBeatDurationSec: 5.5,
  }),
  extended_short: Object.freeze({
    formatStrategyId: "extended_short",
    minBeatDurationSec: 4,
    maxBeatDurationSec: 8,
    safeMinBeats: 5,
    safeMaxBeats: 10,
    targetBeatDurationSec: 6,
  }),
});

/**
 * Max tolerated dead-air per format (seconds). Stricter for the tightest formats:
 * short_retention < short_standard < extended_short.
 */
export const RETENTION_MAX_DEAD_AIR_SEC: Readonly<
  Partial<Record<StoryFormatStrategyId, number>>
> = Object.freeze({
  short_retention: 0.6,
  short_standard: 0.9,
  extended_short: 1.2,
});
