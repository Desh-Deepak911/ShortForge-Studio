/**
 * Build an ephemeral Retention composer request — Sprint 10E / 10E.1 / 10E.1A.
 *
 * Controlling-idea claim authority is exclusively
 * `assertedSeed.controllingIdeaClaimRefs`.
 */

import {
  RETENTION_MAX_MANUAL_CONTEXT_CHARS,
  RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
} from "../domain/retention-story-contract.constants";
import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { normalizeRetentionGroundingContext } from "../grounding/retention-grounding-normalization";
import { isClaimEligibleForNarrationSupport } from "../strategy/retention-claim-support";
import { assertRetentionStrategySeedCoherence } from "../strategy/assert-retention-strategy-seed-coherence";
import { validateRetentionStrategyPlanningInput } from "../strategy/validate-strategy-planning-input";
import { assertRetentionStoryPlanCoherence } from "../planning/assert-retention-story-plan-coherence";
import { sanitizeRetentionBeatText } from "../planning/retention-beat-semantics";
import {
  RETENTION_MAX_COMPOSER_REQUEST_CLAIMS,
  RETENTION_MAX_SEGMENT_TEXT_CHARS,
} from "./retention-narration-candidate.constants";
import { allocateRetentionSegmentWordBudgets } from "./allocate-retention-segment-word-budgets";
import { assertRetentionNarrationCandidateCoherence } from "./assert-retention-narration-candidate-coherence";
import { resolvePlanAuthorizedComposerClaimIds } from "./retention-opening-claim-authority";
import type {
  BuildRetentionComposerRequestInput,
  RetentionComposerClaimSummary,
  RetentionComposerRequest,
} from "./retention-narration-candidate.types";

const MAX_HOOK_DIRECTIVE_CHARS = 4_000;

function deepFreezeRequest<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeRequest(child);
  }
  return Object.freeze(value);
}

function toClaimSummary(
  claim: BuildRetentionComposerRequestInput["grounding"]["claims"][number],
  eligible: boolean,
): RetentionComposerClaimSummary {
  return Object.freeze({
    claimId: claim.claimId,
    text: sanitizeRetentionBeatText(claim.text, RETENTION_MAX_SEGMENT_TEXT_CHARS),
    provenance: claim.provenance,
    verification: claim.verification,
    eligibleForFactualSupport: eligible,
  });
}

export function buildRetentionComposerRequest(
  input: BuildRetentionComposerRequestInput,
): RetentionComposerRequest {
  const { contract, plan, grounding: groundingInput, strategySeed } = input;

  const context = validateRetentionStrategyPlanningInput({
    contract,
    grounding: groundingInput,
    manualContext: input.manualContext ?? null,
    userInstructions: input.userInstructions ?? null,
  });
  const grounding = normalizeRetentionGroundingContext(context.grounding);
  const planningContext = Object.freeze({
    ...context,
    grounding,
  });

  const assertedSeed = assertRetentionStrategySeedCoherence(
    strategySeed,
    planningContext,
  );

  const assertedPlan = assertRetentionStoryPlanCoherence(plan, {
    context: planningContext,
    strategySeed: assertedSeed,
  });

  if (assertedPlan.contractFingerprint !== contract.contractFingerprint) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Retention plan contract fingerprint does not match the active contract.",
    );
  }

  if (input.previousCandidate) {
    assertRetentionNarrationCandidateCoherence(input.previousCandidate, {
      plan: assertedPlan,
      grounding,
      strategySeed: assertedSeed,
    });
  }

  const hookDirectiveBlock = sanitizeRetentionText(
    input.hookDirectiveBlock ?? "",
    MAX_HOOK_DIRECTIVE_CHARS,
  );
  if (
    typeof input.hookDirectiveBlock === "string" &&
    input.hookDirectiveBlock.normalize("NFC").replace(/\s+/g, " ").trim()
      .length > MAX_HOOK_DIRECTIVE_CHARS
  ) {
    throw new RetentionStoryError(
      "composer_proposal_invalid",
      "Retention Hook directive exceeds bounded length.",
    );
  }

  const authorizedIds = resolvePlanAuthorizedComposerClaimIds(
    assertedPlan,
    assertedSeed,
  );

  const factHandlingMode = contract.factHandlingMode ?? "verified_facts_only";
  const eligible = grounding.claims
    .filter(
      (c) =>
        authorizedIds.has(c.claimId) &&
        isClaimEligibleForNarrationSupport(
          grounding,
          c.claimId,
          factHandlingMode,
        ),
    )
    .slice()
    .sort((a, b) => a.claimId.localeCompare(b.claimId))
    .slice(0, RETENTION_MAX_COMPOSER_REQUEST_CLAIMS)
    .map((c) => toClaimSummary(c, true));

  const avoidance = grounding.claims
    .filter(
      (c) =>
        c.forbidden ||
        c.verification === "forbidden" ||
        c.verification === "rejected",
    )
    .slice()
    .sort((a, b) => a.claimId.localeCompare(b.claimId))
    .slice(0, RETENTION_MAX_COMPOSER_REQUEST_CLAIMS)
    .map((c) => toClaimSummary(c, false));

  const orderedBeatIds = assertedPlan.beatPlan.beats.map((b) => b.id);
  const targetWordBudget = assertedPlan.compressionGoals.targetWordBudget;
  // Guidance budgets leave headroom under the hard ceiling (threshold unchanged).
  const suggestedTotal = Math.max(
    orderedBeatIds.length * 4,
    Math.floor(targetWordBudget * 0.68),
  );
  const beatSuggestedWordBudgets = allocateRetentionSegmentWordBudgets(
    assertedPlan,
    suggestedTotal,
  );
  const suggestedByBeatId = new Map(
    beatSuggestedWordBudgets.map((b) => [b.beatId, b.suggestedWordBudget]),
  );
  const beats = assertedPlan.beatPlan.beats.map((beat) =>
    Object.freeze({
      beatId: beat.id,
      purpose: beat.purpose,
      emotionalIntent: beat.emotionalIntent,
      viewerQuestion: beat.viewerQuestion,
      informationContribution: beat.informationContribution,
      narrationGoal: beat.narrationGoal,
      visualOpportunity: beat.visualOpportunity,
      groundingClaimRefs: Object.freeze([...beat.groundingClaimRefs]),
      suggestedWordBudget: suggestedByBeatId.get(beat.id) ?? 0,
    }),
  );

  const request: RetentionComposerRequest = {
    contractFingerprint: contract.contractFingerprint,
    planFingerprint: assertedPlan.planFingerprint,
    qualityMode: contract.qualityMode,
    topic: contract.topic,
    topicAuthority: "creator_subject_unverified",
    scriptMode: contract.scriptMode,
    durationSec: contract.durationSec,
    modelCallKind: input.modelCallKind,
    controllingIdeaStatement: assertedPlan.controllingIdea.statement,
    // Echo of asserted seed only — never caller-widened.
    controllingIdeaClaimRefs: Object.freeze([
      ...assertedSeed.controllingIdeaClaimRefs,
    ]),
    orderedBeatIds: Object.freeze(orderedBeatIds),
    targetWordBudget,
    beatSuggestedWordBudgets,
    beats: Object.freeze(beats),
    hookHandoff: assertedPlan.hookHandoff,
    hookDirectiveBlock,
    manualContext: sanitizeRetentionText(
      input.manualContext ?? "",
      RETENTION_MAX_MANUAL_CONTEXT_CHARS,
    ),
    userInstructions: sanitizeRetentionText(
      input.userInstructions ?? "",
      RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
    ),
    eligibleClaims: Object.freeze(eligible),
    avoidanceClaims: Object.freeze(avoidance),
    previousCandidate: input.previousCandidate ?? null,
    requiredOutputSchema: Object.freeze({
      requireTitle: true as const,
      requireSegments: true as const,
      requireExactBeatIds: true as const,
      requireHookClaimRefs: true as const,
      structuredDataOnly: true as const,
    }),
  };

  return deepFreezeRequest(request);
}
