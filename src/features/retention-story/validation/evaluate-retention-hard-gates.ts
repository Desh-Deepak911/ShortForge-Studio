/**
 * Internal Retention hard-gate evaluator — Sprint 10F / 10F.1.
 *
 * Not part of the public root API. Callers must reach this only through the
 * canonical asserted validation builder (or verification deep-imports).
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import {
  canonicalizeControllingIdeaClaimRefs,
  isClaimEligibleForNarrationSupport,
} from "../strategy/retention-claim-support";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { buildRetentionNarrationCandidateFingerprint } from "../composition/assemble-retention-narration-candidate";
import { resolveAuthorizedClaimIdsForBeat } from "../composition/retention-opening-claim-authority";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionHookBridgeResult } from "../integration/retention-hook-bridge.types";
import {
  buildRetentionParticipantCoverage,
  evaluateRetentionParticipantCoverage,
  toRetentionParticipantCoverageSummary,
} from "../strategy/retention-matchup-participant-coverage";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import { matchesRetentionForbiddenIntroPattern } from "./retention-generic-intro-patterns";
import { evaluateRetentionSpokenCompleteness } from "./evaluate-retention-spoken-completeness";
import { RETENTION_HARD_GATE_IDS } from "./retention-validation.constants";
import { validateRetentionCompressionWordPolicy } from "./validate-retention-compression";
import type { RetentionHardGateOutcome } from "./retention-validation.types";

function gate(
  id: (typeof RETENTION_HARD_GATE_IDS)[number],
  passed: boolean,
  detail: string,
): RetentionHardGateOutcome {
  return Object.freeze({ id, passed, detail });
}

/**
 * Evaluate hard gates against already-authority-bound inputs.
 * Does not reassert seed/plan/candidate/bridge — the canonical builder does.
 */
export function evaluateRetentionHardGates(input: {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly plan: RetentionStoryPlan;
  readonly candidate: RetentionNarrationCandidate;
  readonly hookBridge: RetentionHookBridgeResult;
}): readonly RetentionHardGateOutcome[] {
  const { contract, grounding, strategySeed, plan, candidate, hookBridge } =
    input;
  const outcomes: RetentionHardGateOutcome[] = [];

  const ci = plan.controllingIdea;
  const oneCi =
    ci != null &&
    typeof ci === "object" &&
    typeof ci.statement === "string" &&
    ci.statement.trim().length > 0 &&
    ci.mustPreserveThroughCompression === true &&
    ci.statement === strategySeed.controllingIdea.statement;
  outcomes.push(
    gate(
      "one_controlling_idea_object",
      oneCi,
      oneCi ? "single_controlling_idea" : "controlling_idea_invalid",
    ),
  );

  const recomputedCandidateFp = buildRetentionNarrationCandidateFingerprint({
    origin: candidate.origin,
    planFingerprint: candidate.planFingerprint,
    orderedBeatIds: candidate.orderedBeatIds,
    segments: candidate.segments,
    assembledNarration: candidate.assembledNarration,
  });
  const fpCoherent =
    candidate.planFingerprint === plan.planFingerprint &&
    plan.contractFingerprint === contract.contractFingerprint &&
    strategySeed.contractFingerprint === contract.contractFingerprint &&
    recomputedCandidateFp === candidate.candidateFingerprint;
  outcomes.push(
    gate(
      "plan_candidate_fingerprint_coherent",
      fpCoherent,
      fpCoherent ? "fingerprints_coherent" : "fingerprint_mismatch",
    ),
  );

  const planIds = plan.beatPlan.beats.map((b) => b.id);
  const uniquePlan = new Set(planIds).size === planIds.length;
  const uniqueCandidate =
    new Set(candidate.orderedBeatIds).size === candidate.orderedBeatIds.length;
  const idsMatch =
    planIds.length === candidate.orderedBeatIds.length &&
    planIds.every((id, i) => id === candidate.orderedBeatIds[i]);
  const beatIdsOk = uniquePlan && uniqueCandidate && idsMatch;
  outcomes.push(
    gate(
      "beat_ids_unique",
      beatIdsOk,
      beatIdsOk ? "beat_ids_unique_ordered" : "beat_ids_invalid",
    ),
  );

  const durationMs = contract.durationSec * 1000;
  let budgetsOk = plan.beatPlan.beats.length > 0;
  let prevEnd = 0;
  for (let i = 0; i < plan.beatPlan.beats.length; i++) {
    const beat = plan.beatPlan.beats[i]!;
    const start = beat.estimatedStartMs;
    const end = beat.estimatedEndMs;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > durationMs ||
      end <= start ||
      start !== prevEnd
    ) {
      budgetsOk = false;
      break;
    }
    prevEnd = end;
  }
  if (budgetsOk && prevEnd !== durationMs) budgetsOk = false;
  outcomes.push(
    gate(
      "beat_budgets_finite_ordered_within_duration",
      budgetsOk,
      budgetsOk ? "budgets_valid" : "budgets_invalid",
    ),
  );

  const noEmpty = candidate.segments.every(
    (s) => typeof s.text === "string" && s.text.trim().length > 0,
  );
  outcomes.push(
    gate(
      "no_empty_segment",
      noEmpty,
      noEmpty ? "segments_non_empty" : "empty_segment",
    ),
  );

  const spoken = evaluateRetentionSpokenCompleteness(candidate, plan);
  const segmentReasons = spoken.reasonIds.filter(
    (id) =>
      id !== "setup_narration_incomplete" &&
      id !== "payoff_narration_incomplete",
  );
  const setupPayoffOk =
    !spoken.reasonIds.includes("setup_narration_incomplete") &&
    !spoken.reasonIds.includes("payoff_narration_incomplete");
  outcomes.push(
    gate(
      "spoken_narration_complete",
      segmentReasons.length === 0,
      segmentReasons.length === 0
        ? "spoken_complete"
        : `spoken_incomplete:${segmentReasons.join(",")}`,
    ),
  );
  outcomes.push(
    gate(
      "setup_payoff_narration_complete",
      setupPayoffOk,
      setupPayoffOk
        ? "setup_payoff_spoken_complete"
        : `setup_payoff_incomplete:${spoken.reasonIds
            .filter(
              (id) =>
                id === "setup_narration_incomplete" ||
                id === "payoff_narration_incomplete",
            )
            .join(",")}`,
    ),
  );

  // Exact payoff structure: one terminal deliver, one setup immediately before.
  let payoffOk = true;
  if (contract.constraints.requirePayoff) {
    const beats = plan.beatPlan.beats;
    if (beats.length < 2) {
      payoffOk = false;
    } else {
      const deliverIndexes: number[] = [];
      const setupIndexes: number[] = [];
      for (let i = 0; i < beats.length; i++) {
        if (beats[i]!.payoffRelation === "deliver") deliverIndexes.push(i);
        if (beats[i]!.payoffRelation === "setup") setupIndexes.push(i);
      }
      const terminal = beats.length - 1;
      payoffOk =
        deliverIndexes.length === 1 &&
        deliverIndexes[0] === terminal &&
        setupIndexes.length === 1 &&
        setupIndexes[0] === terminal - 1;
    }
  }
  outcomes.push(
    gate(
      "required_payoff_beat_present",
      payoffOk,
      !contract.constraints.requirePayoff
        ? "payoff_not_required"
        : payoffOk
          ? "terminal_deliver_with_immediate_setup"
          : "payoff_structure_invalid",
    ),
  );

  let factualOk = true;
  for (const segment of candidate.segments) {
    if (!segment.factualRisk) continue;
    const canonical = canonicalizeControllingIdeaClaimRefs(segment.claimRefs);
    if (canonical == null || canonical.length === 0) {
      factualOk = false;
      break;
    }
    if (
      canonical.length !== segment.claimRefs.length ||
      canonical.some((id, i) => id !== segment.claimRefs[i])
    ) {
      factualOk = false;
      break;
    }
    const authorized = resolveAuthorizedClaimIdsForBeat(
      segment.beatId,
      plan,
      strategySeed,
    );
    for (const ref of canonical) {
      if (!authorized.has(ref)) {
        factualOk = false;
        break;
      }
      if (
        !isClaimEligibleForNarrationSupport(
          grounding,
          ref,
          contract.factHandlingMode ?? "verified_facts_only",
        )
      ) {
        factualOk = false;
        break;
      }
    }
    if (!factualOk) break;
  }
  outcomes.push(
    gate(
      "factual_risk_segments_have_eligible_claim_refs",
      factualOk,
      factualOk ? "factual_refs_eligible" : "factual_refs_invalid",
    ),
  );

  const bridgeReady =
    hookBridge.status === "ready" &&
    hookBridge.diagnostics.hookAdapterRan === true &&
    hookBridge.diagnostics.outcome === "hook_approved" &&
    hookBridge.diagnostics.planFingerprint === plan.planFingerprint &&
    hookBridge.diagnostics.candidateFingerprint ===
      candidate.candidateFingerprint &&
    hookBridge.candidate.candidateFingerprint === candidate.candidateFingerprint &&
    hookBridge.approvedNarration === hookBridge.candidate.assembledNarration &&
    hookBridge.approvedNarration === candidate.assembledNarration;
  outcomes.push(
    gate(
      "hook_terminal_approval",
      bridgeReady,
      bridgeReady ? "hook_approved_coherent" : "hook_not_approved",
    ),
  );

  const wordPolicy = validateRetentionCompressionWordPolicy({
    contract,
    plan,
    candidate,
  });
  outcomes.push(
    gate(
      "narration_fits_hard_duration_word_policy",
      wordPolicy.passed,
      wordPolicy.passed
        ? `words_ok:${wordPolicy.actualWordCount}/${wordPolicy.allowedWordCount}`
        : `words_fail:${wordPolicy.actualWordCount}/${wordPolicy.allowedWordCount}`,
    ),
  );

  let lexicalOk = true;
  if (contract.constraints.forbidGenericIntro) {
    const opening = candidate.segments[0]?.text ?? "";
    lexicalOk = !matchesRetentionForbiddenIntroPattern(opening);
  }
  outcomes.push(
    gate(
      "lexical_forbidden_intro_pattern",
      lexicalOk,
      !contract.constraints.forbidGenericIntro
        ? "lexical_not_enforced"
        : lexicalOk
          ? "opening_ok"
          : "forbidden_intro",
    ),
  );

  // Sprint 10H.4B — exact matchup participant coverage (topic-derived only).
  const coverage = buildRetentionParticipantCoverage(contract);
  const stamped = plan.participantCoverage;
  const coverageAuthorityOk =
    stamped != null &&
    retentionStableStringify(stamped) ===
      retentionStableStringify(toRetentionParticipantCoverageSummary(coverage));
  const coverageEval = evaluateRetentionParticipantCoverage({
    coverage,
    narration: candidate.assembledNarration,
  });
  const participantOk = coverageAuthorityOk && coverageEval.passed;
  outcomes.push(
    gate(
      "required_participant_coverage",
      participantOk,
      !coverage.required
        ? "participant_coverage_not_required"
        : !coverageAuthorityOk
          ? "participant_coverage_authority_mismatch"
          : coverageEval.passed
            ? "participant_coverage_ok"
            : "required_participant_missing",
    ),
  );

  const mutationOk =
    hookBridge.status === "ready" &&
    hookBridge.approvedNarration === candidate.assembledNarration &&
    hookBridge.approvedNarration === hookBridge.candidate.assembledNarration;
  outcomes.push(
    gate(
      "no_downstream_mutation",
      mutationOk,
      mutationOk ? "narration_identity_ok" : "narration_mutated",
    ),
  );

  return Object.freeze(outcomes);
}
