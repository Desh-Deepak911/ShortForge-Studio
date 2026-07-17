/**
 * Rebuild Retention candidate after body rewrite with exact opening preservation —
 * Sprint 10F.2 / 10F.2A / 10H.2B.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { assembleRetentionNarrationCandidate } from "../composition/assemble-retention-narration-candidate";
import { assertRetentionNarrationCandidateCoherence } from "../composition/assert-retention-narration-candidate-coherence";
import type { RetentionSegmentDraft } from "../composition/assemble-retention-narration-candidate";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import { enforceRetentionCandidateWordBudget } from "../composition/enforce-retention-candidate-word-budget";
import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";
import type { RetentionApprovedOpeningAuthority } from "./retention-rewrite.types";
import { normalizeRetentionBodyRewriteProposal } from "./normalize-retention-body-rewrite-proposal";

function failOpening(message: string): never {
  throw new RetentionStoryError("candidate_reconciliation_failed", message);
}

function countWords(text: string): number {
  return countRetentionNarrationWords(text);
}

/**
 * Assert rewritten assembled narration preserves the approved opening exactly once.
 */
export function assertExactApprovedOpeningPreserved(
  assembledNarration: string,
  approvedOpening: RetentionApprovedOpeningAuthority,
): void {
  const { openingText, openingStartOffset, openingEndOffset } = approvedOpening;
  if (
    typeof assembledNarration !== "string" ||
    assembledNarration.length === 0
  ) {
    failOpening("Rewritten narration is empty.");
  }
  if (openingStartOffset !== 0) {
    failOpening("Approved opening must start at offset 0.");
  }
  if (openingEndOffset !== openingText.length) {
    failOpening("Approved opening end offset does not match opening text length.");
  }
  if (
    assembledNarration.slice(openingStartOffset, openingEndOffset) !==
    openingText
  ) {
    failOpening("Rewritten narration does not preserve the exact approved opening.");
  }
  if (!assembledNarration.startsWith(openingText)) {
    failOpening("Rewritten narration opening prefix mismatch.");
  }

  // Opening must appear exactly once (immediate or later duplicates fail).
  const first = assembledNarration.indexOf(openingText);
  const last = assembledNarration.lastIndexOf(openingText);
  if (first !== 0 || last !== 0) {
    failOpening("Rewritten narration must contain the approved opening exactly once.");
  }
}

/**
 * Normalize proposal → assemble after_body_rewrite candidate → assert opening.
 */
export function reconcileRetentionCandidateAfterBodyRewrite(input: {
  readonly proposal: unknown;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly approvedOpening: RetentionApprovedOpeningAuthority;
  readonly permittedHookClaimIds?: readonly string[];
  readonly origin?: "after_body_rewrite" | "after_length_enforcement" | "final";
  readonly contract?: NormalizedStoryContract;
}): {
  readonly candidate: RetentionNarrationCandidate;
  readonly title: string;
  readonly hookClaimRefs: readonly string[];
} {
  const normalized = normalizeRetentionBodyRewriteProposal(
    input.proposal,
    input.plan,
    input.grounding,
    input.strategySeed,
    input.permittedHookClaimIds ?? [],
  );

  const drafts: RetentionSegmentDraft[] = normalized.segments.map(
    (segment: RetentionSegmentDraft) =>
      Object.freeze({
        beatId: segment.beatId,
        text: segment.text,
        claimRefs: segment.claimRefs,
        factualRisk: detectRetentionFactualRisk(segment.text).risky,
      }),
  );

  const assembled = assembleRetentionNarrationCandidate({
    origin: input.origin ?? "after_body_rewrite",
    planFingerprint: input.plan.planFingerprint,
    orderedBeatIds: input.plan.beatPlan.beats.map((b) => b.id),
    segments: drafts,
  });

  assertExactApprovedOpeningPreserved(
    assembled.assembledNarration,
    input.approvedOpening,
  );

  const candidate = assertRetentionNarrationCandidateCoherence(assembled, {
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
  });

  return {
    candidate,
    title: normalized.title,
    hookClaimRefs: normalized.hookClaimRefs,
  };
}

function assembleFromMutableTexts(input: {
  readonly origin: "after_length_enforcement" | "final";
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly approvedOpening: RetentionApprovedOpeningAuthority;
  readonly previousCandidate: RetentionNarrationCandidate;
  readonly texts: readonly string[];
}): RetentionNarrationCandidate {
  const beats = input.plan.beatPlan.beats;
  const texts = input.texts;
  if (texts.length !== beats.length) {
    failOpening("Structured enforcement beat/text count mismatch.");
  }

  const drafts: RetentionSegmentDraft[] = beats.map((beat, i) => {
    const text = texts[i]!;
    if (typeof text !== "string" || text.trim().length === 0) {
      failOpening("Deterministic enforcement removed a required beat segment.");
    }
    const prev = input.previousCandidate.segments[i];
    if (!prev || prev.beatId !== beat.id) {
      failOpening("Deterministic enforcement lost ordered beat ownership.");
    }
    // Claim refs stay on their original supported segment — never migrate.
    return {
      beatId: beat.id,
      text,
      claimRefs: [...prev.claimRefs],
      factualRisk: detectRetentionFactualRisk(text).risky,
    };
  });

  // Payoff deliver beat must remain meaningful non-empty content.
  const lastBeat = beats[beats.length - 1]!;
  if (lastBeat.payoffRelation === "deliver") {
    const lastText = drafts[drafts.length - 1]!.text.trim();
    if (lastText.length === 0 || countWords(lastText) < 3) {
      failOpening("Deterministic enforcement destroyed the required payoff beat.");
    }
  }

  // Setup beat must remain if present.
  const setup = beats.find((b) => b.payoffRelation === "setup");
  if (setup) {
    const idx = beats.findIndex((b) => b.id === setup.id);
    const setupText = drafts[idx]?.text.trim() ?? "";
    if (setupText.length === 0 || countWords(setupText) < 3) {
      failOpening("Deterministic enforcement destroyed the required setup beat.");
    }
  }

  const assembled = assembleRetentionNarrationCandidate({
    origin: input.origin,
    planFingerprint: input.plan.planFingerprint,
    orderedBeatIds: beats.map((b) => b.id),
    segments: drafts,
  });

  assertExactApprovedOpeningPreserved(
    assembled.assembledNarration,
    input.approvedOpening,
  );

  return assertRetentionNarrationCandidateCoherence(assembled, {
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
  });
}

/**
 * Structured deterministic length enforcement (Sprint 10H.2B).
 * Sentence-safe only — never word-pops or flat-truncates narration.
 * Does not flatten/redistribute tokens or migrate claim refs across segments.
 */
export function rebuildRetentionCandidateFromEnforcedNarration(input: {
  readonly narration: string;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly approvedOpening: RetentionApprovedOpeningAuthority;
  readonly previousCandidate: RetentionNarrationCandidate;
  readonly origin: "after_length_enforcement" | "final";
  readonly targetWordBudget: number;
  /** When present, protects sole matchup-participant coverage during trim. */
  readonly contract?: NormalizedStoryContract;
}): RetentionNarrationCandidate {
  const { approvedOpening, previousCandidate, plan, targetWordBudget } = input;
  assertExactApprovedOpeningPreserved(input.narration, approvedOpening);

  if (targetWordBudget <= 0) {
    failOpening("Retention target word budget is invalid.");
  }

  const opening = approvedOpening.openingText;
  const openingWordCount = countWords(opening);
  if (openingWordCount > targetWordBudget) {
    failOpening("Approved opening alone exceeds Retention target word budget.");
  }

  // Start from previous candidate segment ownership — never flatten/redistribute.
  const texts = previousCandidate.segments.map((segment, index) => {
    if (index === 0) {
      if (!segment.text.startsWith(opening)) {
        failOpening("First segment lost the approved opening before enforcement.");
      }
      return segment.text;
    }
    return segment.text;
  });

  if (!texts[0]!.startsWith(opening)) {
    failOpening("Structured enforcement cannot restore the approved opening.");
  }

  let candidate = assembleFromMutableTexts({
    origin: input.origin,
    plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    approvedOpening,
    previousCandidate,
    texts,
  });

  try {
    candidate = enforceRetentionCandidateWordBudget({
      candidate,
      plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      approvedOpeningText: opening,
      ...(input.contract ? { contract: input.contract } : {}),
    });
  } catch (error) {
    if (
      error instanceof RetentionStoryError &&
      error.reason === "length_enforcement_failed"
    ) {
      failOpening(
        "Deterministic enforcement cannot reach Retention target without incomplete sentences.",
      );
    }
    throw error;
  }

  assertExactApprovedOpeningPreserved(
    candidate.assembledNarration,
    approvedOpening,
  );

  if (countWords(candidate.assembledNarration) > targetWordBudget) {
    failOpening("Final enforced narration exceeds Retention target word budget.");
  }

  // Claim refs must not have migrated across segments.
  for (let i = 0; i < previousCandidate.segments.length; i++) {
    const prev = previousCandidate.segments[i]!;
    const next = candidate.segments[i]!;
    if (prev.beatId !== next.beatId) {
      failOpening("Deterministic enforcement reordered beat ownership.");
    }
    if (
      JSON.stringify([...prev.claimRefs]) !==
      JSON.stringify([...next.claimRefs])
    ) {
      failOpening("Deterministic enforcement migrated claim refs between segments.");
    }
  }

  return candidate;
}
