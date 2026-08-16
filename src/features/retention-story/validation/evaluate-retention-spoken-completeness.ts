/**
 * Deterministic spoken-narration completeness evaluator — Sprint 10H.2B.
 * Total / non-throwing. Beat segments are invisible attribution spans, so
 * sentences may cross segment boundaries. Completeness belongs to the final
 * assembled narration, not to every beat in isolation.
 */

import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import { countRetentionNarrationWords } from "./count-retention-narration-words";

export const RETENTION_SPOKEN_COMPLETENESS_VERSION =
  "spoken-completeness/1" as const;

export type RetentionSpokenCompletenessReasonId =
  | "missing_terminal_sentence_punctuation"
  | "dangling_function_word"
  | "mechanically_clipped_phrase"
  | "two_word_fragment"
  | "empty_segment"
  | "setup_narration_incomplete"
  | "payoff_narration_incomplete"
  | "assembled_ends_mid_clause";

export interface RetentionSpokenCompletenessResult {
  readonly ok: boolean;
  readonly reasonIds: readonly RetentionSpokenCompletenessReasonId[];
  readonly version: typeof RETENTION_SPOKEN_COMPLETENESS_VERSION;
}

const TERMINAL_PUNCT_RE = /[.!?…]["”’)»\]]*$/u;

const DANGLING_FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "with",
  "by",
  "from",
  "as",
  "into",
  "onto",
  "over",
  "under",
  "about",
  "against",
  "between",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "because",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "have",
  "has",
  "had",
  "having",
  "will",
  "would",
  "shall",
  "should",
  "can",
  "could",
  "may",
  "might",
  "must",
  "this",
  "that",
  "these",
  "those",
  "its",
  "it's",
  "their",
  "our",
  "your",
  "my",
  "his",
  "her",
]);

const CLIPPED_PHRASE_RE =
  /\b(?:single|pivotal|brutal|legacy|surge|pressure|moment|battle|intensity)\s*$/iu;

function lastToken(text: string): string {
  const words = text
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words[words.length - 1] ?? "").toLowerCase();
}

function segmentIncompleteReasons(
  text: string,
): RetentionSpokenCompletenessReasonId[] {
  const reasons: RetentionSpokenCompletenessReasonId[] = [];
  const trimmed = text.trim();
  if (!trimmed) {
    reasons.push("empty_segment");
    return reasons;
  }

  const words = countRetentionNarrationWords(trimmed);
  if (words > 0 && words <= 2) {
    reasons.push("two_word_fragment");
  }

  if (!TERMINAL_PUNCT_RE.test(trimmed)) {
    reasons.push("missing_terminal_sentence_punctuation");
  }

  const token = lastToken(trimmed.replace(/[.!?…]+["”’)»\]]*$/u, ""));
  if (token && DANGLING_FUNCTION_WORDS.has(token)) {
    reasons.push("dangling_function_word");
  }

  if (
    !TERMINAL_PUNCT_RE.test(trimmed) &&
    (CLIPPED_PHRASE_RE.test(trimmed) ||
      /\b(?:this|the|a|an|in|on|at|because)\s+\p{L}+\s*$/iu.test(trimmed))
  ) {
    reasons.push("mechanically_clipped_phrase");
  }

  return reasons;
}

function isMeaningfulCompleteUtterance(text: string): boolean {
  const trimmed = text.trim();
  if (!TERMINAL_PUNCT_RE.test(trimmed)) return false;
  if (countRetentionNarrationWords(trimmed) < 3) return false;
  const incomplete = segmentIncompleteReasons(trimmed);
  return incomplete.length === 0;
}

/**
 * Evaluate whether the assembled narration is complete and the terminal
 * payoff is a meaningful spoken ending.
 */
export function evaluateRetentionSpokenCompleteness(
  candidate: RetentionNarrationCandidate,
  plan?: RetentionStoryPlan,
): RetentionSpokenCompletenessResult {
  const reasons: RetentionSpokenCompletenessReasonId[] = [];
  if (!candidate.segments.length) {
    return Object.freeze({
      ok: false,
      reasonIds: Object.freeze(["empty_segment"] as const),
      version: RETENTION_SPOKEN_COMPLETENESS_VERSION,
    });
  }

  if (!candidate.segments[0]?.text.trim()) {
    reasons.push("empty_segment");
  }
  for (const segment of candidate.segments) {
    if (typeof segment.text !== "string") reasons.push("empty_segment");
  }

  const assembled = candidate.assembledNarration.trim();
  reasons.push(...segmentIncompleteReasons(assembled));
  if (assembled && !TERMINAL_PUNCT_RE.test(assembled)) {
    reasons.push("assembled_ends_mid_clause");
  }

  if (plan) {
    const beats = plan.beatPlan.beats;
    void beats;
    // The terminal attribution span must complete a meaningful ending, while
    // earlier beat spans may be clauses joined across invisible boundaries.
    const terminal = [...candidate.segments]
      .reverse()
      .find((segment) => segment.text.trim().length > 0);
    if (terminal && !isMeaningfulCompleteUtterance(terminal.text)) {
      reasons.push("payoff_narration_incomplete");
    }
  }

  const unique = Object.freeze([...new Set(reasons)]);
  return Object.freeze({
    ok: unique.length === 0,
    reasonIds: unique,
    version: RETENTION_SPOKEN_COMPLETENESS_VERSION,
  });
}
