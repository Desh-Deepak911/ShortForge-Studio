/**
 * Sentence-safe Retention word-budget enforcement — Sprint 10H.2B.
 *
 * Removes only complete optional sentences/clauses at punctuation boundaries.
 * Never word-pops. Never damages the opening or terminal payoff. Never invents
 * text. Fails closed with length_enforcement_failed when the budget cannot be
 * met safely.
 */

import { countWords } from "@/features/story/utils/narration-duration-budget.utils";

import { RetentionStoryError } from "../domain/retention-story-errors";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import {
  buildRetentionParticipantCoverage,
  sentenceIsSoleParticipantCoverage,
} from "../strategy/retention-matchup-participant-coverage";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";
import { evaluateRetentionSpokenCompleteness } from "../validation/evaluate-retention-spoken-completeness";
import {
  assembleRetentionNarrationCandidate,
  type RetentionSegmentDraft,
} from "./assemble-retention-narration-candidate";
import { assertRetentionNarrationCandidateCoherence } from "./assert-retention-narration-candidate-coherence";
import type { RetentionNarrationCandidate } from "./retention-narration-candidate.types";

function exceedsEitherCounter(narration: string, target: number): boolean {
  return (
    countRetentionNarrationWords(narration) > target ||
    countWords(narration) > target
  );
}

function throwLengthEnforcementFailed(normalizeSeam: string): never {
  throw new RetentionStoryError(
    "length_enforcement_failed",
    "Retention narration cannot fit the duration word budget without incomplete sentences.",
    { normalizeSeam },
  );
}

/** First non-empty sentence prefix (Retention-owned). */
export function extractFirstSpokenSentence(narration: string): string | null {
  if (typeof narration !== "string" || !narration) return null;
  let start = 0;
  while (start < narration.length && /\s/.test(narration[start]!)) start += 1;
  if (start >= narration.length) return null;
  const fromStart = narration.slice(start);
  const match = /[.!?…]/.exec(fromStart);
  if (match && match.index != null) {
    return narration.slice(start, start + match.index + 1);
  }
  return null;
}

/**
 * Split text into complete sentence units ending at .!?…
 * Incomplete trailing text (no terminal punct) is returned as a final unit
 * that must never be partially deleted — only dropped entirely if optional.
 */
function splitCompleteSentenceUnits(text: string): readonly string[] {
  const units: string[] = [];
  let cursor = 0;
  const src = text;
  while (cursor < src.length) {
    while (cursor < src.length && /\s/.test(src[cursor]!)) cursor += 1;
    if (cursor >= src.length) break;
    const start = cursor;
    const rest = src.slice(start);
    const match = /[.!?…]/.exec(rest);
    if (!match || match.index == null) {
      units.push(src.slice(start).trim());
      break;
    }
    const end = start + match.index + 1;
    units.push(src.slice(start, end).trim());
    cursor = end;
  }
  return units.filter((u) => u.length > 0);
}

function draftFromTexts(
  candidate: RetentionNarrationCandidate,
  texts: readonly string[],
): readonly RetentionSegmentDraft[] {
  return Object.freeze(
    candidate.segments.map((segment, index) =>
      Object.freeze({
        beatId: segment.beatId,
        text: texts[index]!,
        claimRefs: segment.claimRefs,
        factualRisk: detectRetentionFactualRisk(texts[index]!).risky,
      }),
    ),
  );
}

function rebuildCandidate(input: {
  readonly candidate: RetentionNarrationCandidate;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly texts: readonly string[];
}): RetentionNarrationCandidate {
  try {
    const assembled = assembleRetentionNarrationCandidate({
      origin: "after_length_enforcement",
      planFingerprint: input.plan.planFingerprint,
      orderedBeatIds: input.candidate.orderedBeatIds,
      segments: draftFromTexts(input.candidate, input.texts),
    });
    const coherent = assertRetentionNarrationCandidateCoherence(assembled, {
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
    });
    const completeness = evaluateRetentionSpokenCompleteness(
      coherent,
      input.plan,
    );
    if (!completeness.ok) {
      throwLengthEnforcementFailed("spoken_completeness_failed");
    }
    return coherent;
  } catch (error) {
    if (
      error instanceof RetentionStoryError &&
      error.reason === "length_enforcement_failed"
    ) {
      throw error;
    }
    throwLengthEnforcementFailed("candidate_rebuild_failed");
  }
}

/**
 * Sentence-safe fit to plan.compressionGoals.targetWordBudget.
 * No-op when already within budget and spoken-complete.
 */
export function enforceRetentionCandidateWordBudget(input: {
  readonly candidate: RetentionNarrationCandidate;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  /** Byte-exact opening to preserve when provided (Hook-approved or initial). */
  readonly approvedOpeningText?: string;
  /** When present, protects sole matchup-participant coverage sentences. */
  readonly contract?: NormalizedStoryContract;
}): RetentionNarrationCandidate {
  const target = input.plan.compressionGoals.targetWordBudget;
  const participantCoverage = input.contract
    ? buildRetentionParticipantCoverage(input.contract)
    : null;
  if (!Number.isFinite(target) || target <= 0) {
    throwLengthEnforcementFailed("invalid_target_word_budget");
  }

  const opening =
    typeof input.approvedOpeningText === "string" &&
    input.approvedOpeningText.length > 0
      ? input.approvedOpeningText
      : extractFirstSpokenSentence(input.candidate.assembledNarration);

  if (opening == null) {
    throwLengthEnforcementFailed("opening_span_unavailable");
  }

  const firstText = input.candidate.segments[0]?.text ?? "";
  if (!firstText.startsWith(opening) && firstText !== opening) {
    throwLengthEnforcementFailed("opening_alignment_failed");
  }

  if (!exceedsEitherCounter(input.candidate.assembledNarration, target)) {
    const completeness = evaluateRetentionSpokenCompleteness(
      input.candidate,
      input.plan,
    );
    if (!completeness.ok) {
      throwLengthEnforcementFailed("spoken_completeness_failed");
    }
    return input.candidate;
  }

  const mutable = input.candidate.segments.map((s) => s.text);
  const beats = input.plan.beatPlan.beats;
  // Setup/deliver/terminal may drop *extra* complete sentences, but must keep
  // at least one complete spoken utterance (never delete the beat).
  const mustRetainOneUtterance = new Set<number>();
  for (let i = 0; i < beats.length; i++) {
    const relation = beats[i]?.payoffRelation;
    if (relation === "setup" || relation === "deliver") {
      mustRetainOneUtterance.add(i);
    }
  }
  mustRetainOneUtterance.add(mutable.length - 1);
  const maxSteps = mutable.length * 8 + 8;
  let candidate = input.candidate;

  for (let step = 0; step < maxSteps; step++) {
    if (!exceedsEitherCounter(candidate.assembledNarration, target)) {
      return candidate;
    }

    let removed = false;

    // Prefer removing trailing complete sentences from optional body beats
    // (last → first). Setup/payoff/terminal only lose surplus sentences.
    for (let i = mutable.length - 1; i >= 0; i--) {
      const text = mutable[i]!;
      if (i === 0) {
        const body = text.slice(opening.length).trim();
        if (!body) continue;
        const units = splitCompleteSentenceUnits(body);
        // Drop only a trailing *complete* sentence unit (must end with punct).
        if (units.length === 0) continue;
        const last = units[units.length - 1]!;
        if (!/[.!?…]$/u.test(last)) continue;
        if (
          participantCoverage?.required &&
          sentenceIsSoleParticipantCoverage({
            coverage: participantCoverage,
            fullNarration: candidate.assembledNarration,
            sentence: last,
          })
        ) {
          continue;
        }
        if (units.length === 1) {
          // Would leave opening-only first segment — allowed if opening is complete.
          mutable[i] = opening;
        } else {
          const kept = units.slice(0, -1).join(" ");
          mutable[i] = kept ? `${opening} ${kept}` : opening;
        }
        removed = true;
        break;
      }

      const units = splitCompleteSentenceUnits(text);
      if (units.length <= 1) continue;
      const last = units[units.length - 1]!;
      if (!/[.!?…]$/u.test(last)) continue;
      // Required beats must retain ≥1 complete utterance after the drop.
      if (mustRetainOneUtterance.has(i) && units.length <= 1) continue;
      if (
        participantCoverage?.required &&
        sentenceIsSoleParticipantCoverage({
          coverage: participantCoverage,
          fullNarration: candidate.assembledNarration,
          sentence: last,
        })
      ) {
        continue;
      }
      mutable[i] = units.slice(0, -1).join(" ");
      removed = true;
      break;
    }

    if (!removed) {
      throwLengthEnforcementFailed("no_safe_sentence_boundary");
    }

    candidate = rebuildCandidate({
      candidate: input.candidate,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      texts: mutable,
    });
  }

  if (exceedsEitherCounter(candidate.assembledNarration, target)) {
    throwLengthEnforcementFailed("budget_unmet_after_sentence_safe_trim");
  }
  return candidate;
}
