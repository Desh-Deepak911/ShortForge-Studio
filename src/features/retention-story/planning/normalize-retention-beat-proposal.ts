/**
 * Strict Retention planner proposal normalization — Sprint 10D.1 / 10H.2.
 *
 * Balanced/Studio must supply a complete strategy + beats payload. Invalid,
 * incomplete, unsafe, or unsupported fields terminate as planner_proposal_invalid.
 * No silent template substitution on supplied invalid values.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import {
  canonicalizeControllingIdeaClaimRefs,
  claimRefSupportsNarrationStatement,
  isClaimEligibleForNarrationSupport,
} from "../strategy/retention-claim-support";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import { canonicalRetentionBeatText } from "./retention-beat-semantics";
import { resolveAdaptiveRetentionBeatCount } from "./resolve-adaptive-retention-beat-count";
import {
  RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS,
  RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
  RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS,
  RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS,
  RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS,
  RETENTION_MAX_PLANNER_PROPOSAL_BEATS,
} from "./retention-story-plan.constants";
import type {
  NormalizedRetentionBeatProposal,
  NormalizedRetentionBeatProposalEntry,
  RetentionBeatPurpose,
} from "./retention-story-plan.types";
import {
  isRetentionBeatPurpose,
  isValidRetentionPlannerPurposeSequence,
} from "./validate-retention-planner-purpose-sequence";

function throwProposalInvalid(normalizeSeam: string): never {
  throw new RetentionStoryError(
    "planner_proposal_invalid",
    "Retention planner beat proposal is malformed.",
    { normalizeSeam },
  );
}

function requireQualitativeField(
  raw: unknown,
  maxChars: number,
  fieldSeam: string,
): string {
  const canonical = canonicalRetentionBeatText(raw, maxChars);
  if (canonical == null) throwProposalInvalid(`${fieldSeam}_malformed`);
  if (detectRetentionFactualRisk(canonical).risky) {
    throwProposalInvalid(`${fieldSeam}_factual_risk`);
  }
  return canonical;
}

function normalizeInformationContribution(
  raw: unknown,
  refsRaw: unknown,
  grounding: RetentionGroundingContext,
  factHandlingMode: "verified_facts_only" | "creative_premise",
): { readonly text: string; readonly groundingClaimRefs: readonly string[] } {
  const text = canonicalRetentionBeatText(
    raw,
    RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
  );
  if (text == null) throwProposalInvalid("information_contribution_malformed");

  const refs = canonicalizeControllingIdeaClaimRefs(refsRaw);
  if (refs == null) throwProposalInvalid("grounding_claim_refs_malformed");

  const risky = detectRetentionFactualRisk(text).risky;
  if (risky) {
    if (refs.length !== 1) {
      throwProposalInvalid("factual_contribution_without_eligible_support");
    }
    const claimId = refs[0]!;
    if (
      !isClaimEligibleForNarrationSupport(grounding, claimId, factHandlingMode)
    ) {
      throwProposalInvalid("factual_contribution_without_eligible_support");
    }
    if (
      !claimRefSupportsNarrationStatement(
        grounding,
        claimId,
        text,
        factHandlingMode,
      )
    ) {
      throwProposalInvalid("factual_contribution_without_eligible_support");
    }
    return { text, groundingClaimRefs: refs };
  }

  // Qualitative contribution: zero refs required; any supplied refs must still support.
  if (refs.length === 0) {
    return { text, groundingClaimRefs: Object.freeze([]) };
  }
  for (const claimId of refs) {
    if (
      !isClaimEligibleForNarrationSupport(grounding, claimId, factHandlingMode)
    ) {
      throwProposalInvalid("grounding_claim_refs_ineligible");
    }
    if (
      !claimRefSupportsNarrationStatement(
        grounding,
        claimId,
        text,
        factHandlingMode,
      )
    ) {
      throwProposalInvalid("grounding_claim_refs_unsupported");
    }
  }
  return { text, groundingClaimRefs: refs };
}

/**
 * Normalize a complete planner proposal's beats into canonical enrichment entries.
 * Requires a non-empty beats array inside the active count range.
 */
export function normalizeRetentionBeatProposal(
  raw: unknown,
  contract: NormalizedStoryContract,
  grounding: RetentionGroundingContext,
): NormalizedRetentionBeatProposal {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throwProposalInvalid("proposal_shape_invalid");
  }

  const record = raw as Record<string, unknown>;
  void record.reasoning;
  void record.chainOfThought;
  void record.diagnostics;

  if (
    record.pacingProfile != null ||
    record.informationDensity != null ||
    record.visualDensity != null ||
    record.endingStrategy != null
  ) {
    throwProposalInvalid("contract_fields_not_allowed");
  }

  if (record.strategy == null || typeof record.strategy !== "object") {
    throwProposalInvalid("strategy_missing");
  }

  const beats = record.beats;
  if (!Array.isArray(beats) || beats.length === 0) {
    throwProposalInvalid("beats_missing");
  }
  if (beats.length > RETENTION_MAX_PLANNER_PROPOSAL_BEATS) {
    throwProposalInvalid("beat_count_out_of_range");
  }

  const range = resolveAdaptiveRetentionBeatCount(contract);
  if (beats.length < range.min || beats.length > range.max) {
    throwProposalInvalid("beat_count_out_of_range");
  }

  const purposes: RetentionBeatPurpose[] = [];
  const entries: NormalizedRetentionBeatProposalEntry[] = [];

  for (const rawBeat of beats) {
    if (rawBeat == null || typeof rawBeat !== "object" || Array.isArray(rawBeat)) {
      throwProposalInvalid("beat_shape_invalid");
    }
    const beat = rawBeat as Record<string, unknown>;
    // Ignore planner IDs and timing entirely.
    void beat.id;
    void beat.estimatedStartMs;
    void beat.estimatedEndMs;

    if (!isRetentionBeatPurpose(beat.purpose)) {
      throwProposalInvalid("beat_purpose_invalid");
    }
    purposes.push(beat.purpose);

    const info = normalizeInformationContribution(
      beat.informationContribution,
      beat.groundingClaimRefs,
      grounding,
      contract.factHandlingMode ?? "verified_facts_only",
    );

    entries.push(
      Object.freeze({
        purpose: beat.purpose,
        emotionalIntent: requireQualitativeField(
          beat.emotionalIntent,
          RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS,
          "emotional_intent",
        ),
        viewerQuestion: requireQualitativeField(
          beat.viewerQuestion,
          RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS,
          "viewer_question",
        ),
        informationContribution: info.text,
        narrationGoal: requireQualitativeField(
          beat.narrationGoal,
          RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS,
          "narration_goal",
        ),
        visualOpportunity: requireQualitativeField(
          beat.visualOpportunity,
          RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS,
          "visual_opportunity",
        ),
        groundingClaimRefs: info.groundingClaimRefs,
      }),
    );
  }

  if (
    !isValidRetentionPlannerPurposeSequence(
      purposes,
      contract.endingStrategy,
      range,
    )
  ) {
    throwProposalInvalid("beat_purpose_sequence_invalid");
  }

  return Object.freeze({ beats: Object.freeze(entries) });
}
