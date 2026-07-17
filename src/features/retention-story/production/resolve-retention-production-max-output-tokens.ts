/**
 * Call-kind-aware Retention production max_output_tokens — Sprint 10F.3A.
 * Replaces shared narration-only token policy for Retention structured JSON calls.
 * Does not weaken schemas, raise model-call ceilings, add retries, or add env vars.
 */

import { RETENTION_MAX_BEATS } from "../planning/retention-story-plan.constants";
import { RETENTION_WORDS_PER_SECOND } from "../planning/retention-story-plan.constants";

export type RetentionProductionModelCallKind =
  | "planner"
  | "initial_composer"
  | "length_compression"
  | "hook_repair"
  | "hook_fallback"
  | "studio_rewrite";

/** Absolute hard caps so policies stay bounded for 15–60s / max beats. */
const ABSOLUTE_MAX_OUTPUT_TOKENS = 1800;
const ABSOLUTE_MIN_OUTPUT_TOKENS = 220;

/** Approx tokens per spoken word in structured JSON segment text. */
const TOKENS_PER_WORD = 1.45;
/** Per-beat structured JSON field overhead (ids, purposes, punctuation). */
const TOKENS_PER_BEAT_SCHEMA = 48;
/** Shared envelope overhead (title, claim-ref arrays, braces). */
const JSON_ENVELOPE_OVERHEAD = 96;
/** Planner strategy + curve + controlling-idea overhead. */
const PLANNER_STRATEGY_OVERHEAD = 180;
/** Per-beat planner proposal field overhead (semantic strings + refs). */
const PLANNER_TOKENS_PER_BEAT = 110;

function clampTokens(value: number): number {
  const rounded = Math.round(value);
  return Math.min(
    ABSOLUTE_MAX_OUTPUT_TOKENS,
    Math.max(ABSOLUTE_MIN_OUTPUT_TOKENS, rounded),
  );
}

function clampDuration(durationSec: number): number {
  if (!Number.isFinite(durationSec)) return 30;
  return Math.max(15, Math.min(60, Math.round(durationSec)));
}

function clampBeatCount(beatCount: number): number {
  if (!Number.isFinite(beatCount)) return 1;
  return Math.max(1, Math.min(RETENTION_MAX_BEATS, Math.round(beatCount)));
}

function targetWordsForDuration(durationSec: number): number {
  return Math.round(clampDuration(durationSec) * RETENTION_WORDS_PER_SECOND);
}

export interface ResolveRetentionProductionMaxOutputTokensInput {
  readonly kind: RetentionProductionModelCallKind;
  readonly durationSec: number;
  /**
   * Exact beat count for composer/rewrite/repair kinds.
   * For planner, pass the permitted max beat count from the density range.
   */
  readonly beatCount: number;
  /** Optional override; defaults to duration × Retention WPS. */
  readonly targetWordBudget?: number;
}

/**
 * Derive a bounded max_output_tokens for a Retention production model call.
 */
export function resolveRetentionProductionMaxOutputTokens(
  input: ResolveRetentionProductionMaxOutputTokensInput,
): number {
  const durationSec = clampDuration(input.durationSec);
  const beatCount = clampBeatCount(input.beatCount);
  const wordBudget =
    typeof input.targetWordBudget === "number" &&
    Number.isFinite(input.targetWordBudget) &&
    input.targetWordBudget > 0
      ? Math.min(targetWordsForDuration(60), Math.round(input.targetWordBudget))
      : targetWordsForDuration(durationSec);

  switch (input.kind) {
    case "planner": {
      // Derive from permitted beat-count range max + planner schema overhead.
      return clampTokens(
        PLANNER_STRATEGY_OVERHEAD +
          beatCount * PLANNER_TOKENS_PER_BEAT +
          JSON_ENVELOPE_OVERHEAD,
      );
    }
    case "initial_composer": {
      // Exact beats + target narration words + title/claim-ref/JSON overhead.
      return clampTokens(
        JSON_ENVELOPE_OVERHEAD +
          40 /* title */ +
          24 /* hookClaimRefs */ +
          beatCount * TOKENS_PER_BEAT_SCHEMA +
          wordBudget * TOKENS_PER_WORD,
      );
    }
    case "length_compression":
    case "hook_repair":
    case "hook_fallback": {
      // Structured response requirements match composer shape with modest headroom.
      return clampTokens(
        JSON_ENVELOPE_OVERHEAD +
          40 +
          24 +
          beatCount * TOKENS_PER_BEAT_SCHEMA +
          wordBudget * TOKENS_PER_WORD +
          64,
      );
    }
    case "studio_rewrite": {
      return clampTokens(
        JSON_ENVELOPE_OVERHEAD +
          40 +
          24 +
          beatCount * TOKENS_PER_BEAT_SCHEMA +
          wordBudget * TOKENS_PER_WORD +
          96,
      );
    }
    default: {
      const _exhaustive: never = input.kind;
      void _exhaustive;
      return ABSOLUTE_MIN_OUTPUT_TOKENS;
    }
  }
}

/** Exported for verification — absolute policy bounds. */
export const RETENTION_PRODUCTION_OUTPUT_TOKEN_BOUNDS = Object.freeze({
  min: ABSOLUTE_MIN_OUTPUT_TOKENS,
  max: ABSOLUTE_MAX_OUTPUT_TOKENS,
});
