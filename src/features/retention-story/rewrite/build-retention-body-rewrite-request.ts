/**
 * Build ephemeral Studio body-rewrite request — Sprint 10F.2.
 * Excludes CoT, raw critique, private prompts, full research dumps, credentials.
 */

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
} from "../composition/retention-narration-candidate.constants";
import { assertRetentionNarrationCandidateCoherence } from "../composition/assert-retention-narration-candidate-coherence";
import { resolvePlanAuthorizedComposerClaimIds } from "../composition/retention-opening-claim-authority";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type {
  RetentionEditorialComponentId,
  RetentionValidationResult,
} from "../validation/retention-validation.types";
import type {
  RetentionApprovedOpeningAuthority,
  RetentionBodyRewriteRequest,
} from "./retention-rewrite.types";

function deepFreezeRequest<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeRequest(child);
  }
  return Object.freeze(value);
}

const EDITORIAL_KEYS = [
  "clarity",
  "curiosity",
  "emotionalProgression",
  "compressionQuality",
  "novelty",
  "escalation",
  "payoffStrength",
  "visualPotential",
  "repetitionPenalty",
  "controllingIdeaAdherence",
  "genericIntroductionQuality",
] as const;

const EDITORIAL_ID_BY_KEY: Record<
  (typeof EDITORIAL_KEYS)[number],
  RetentionEditorialComponentId
> = {
  clarity: "clarity",
  curiosity: "curiosity",
  emotionalProgression: "emotional_progression",
  compressionQuality: "compression_quality",
  novelty: "novelty",
  escalation: "escalation",
  payoffStrength: "payoff_strength",
  visualPotential: "visual_potential",
  repetitionPenalty: "repetition_penalty",
  controllingIdeaAdherence: "controlling_idea_adherence",
  genericIntroductionQuality: "generic_introduction_quality",
};

/** Safe component IDs that scored below the soft readiness contribution band. */
export function resolveMissedQualityComponentIds(
  validation: RetentionValidationResult,
): readonly RetentionEditorialComponentId[] {
  const threshold = Math.max(0.35, validation.activeStrategyThreshold - 0.2);
  const missed: RetentionEditorialComponentId[] = [];
  for (const key of EDITORIAL_KEYS) {
    if (validation.editorial[key] < threshold) {
      missed.push(EDITORIAL_ID_BY_KEY[key]);
    }
  }
  return Object.freeze(missed);
}

export function buildRetentionBodyRewriteRequest(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly strategySeed: RetentionStrategySeed;
  readonly grounding: RetentionGroundingContext;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
  readonly currentCandidate: RetentionNarrationCandidate;
  readonly immutableApprovedOpening: RetentionApprovedOpeningAuthority;
  readonly initialValidation: RetentionValidationResult;
}): RetentionBodyRewriteRequest {
  if (input.contract.qualityMode !== "best") {
    throw new RetentionStoryError(
      "strategy_not_applicable",
      "Retention body rewrite requires Studio quality mode.",
    );
  }

  const context = validateRetentionStrategyPlanningInput({
    contract: input.contract,
    grounding: input.grounding,
    manualContext: input.manualContext ?? null,
    userInstructions: input.userInstructions ?? null,
  });
  const grounding = normalizeRetentionGroundingContext(context.grounding);
  const planningContext = Object.freeze({ ...context, grounding });
  const assertedSeed = assertRetentionStrategySeedCoherence(
    input.strategySeed,
    planningContext,
  );
  const assertedPlan = assertRetentionStoryPlanCoherence(input.plan, {
    context: planningContext,
    strategySeed: assertedSeed,
  });
  const currentCandidate = assertRetentionNarrationCandidateCoherence(
    input.currentCandidate,
    {
      plan: assertedPlan,
      grounding,
      strategySeed: assertedSeed,
    },
  );

  const opening = input.immutableApprovedOpening;
  if (
    typeof opening.openingText !== "string" ||
    opening.openingText.length === 0 ||
    !Number.isInteger(opening.openingStartOffset) ||
    !Number.isInteger(opening.openingEndOffset) ||
    opening.openingStartOffset !== 0 ||
    opening.openingEndOffset <= opening.openingStartOffset
  ) {
    throw new RetentionStoryError(
      "candidate_reconciliation_failed",
      "Retention body rewrite opening authority is invalid.",
    );
  }

  const authorizedIds = resolvePlanAuthorizedComposerClaimIds(
    assertedPlan,
    assertedSeed,
  );
  const factHandlingMode =
    input.contract.factHandlingMode ?? "verified_facts_only";
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
    .map((c) =>
      Object.freeze({
        claimId: c.claimId,
        text: sanitizeRetentionBeatText(c.text, RETENTION_MAX_SEGMENT_TEXT_CHARS),
        provenance: c.provenance,
        verification: c.verification,
        eligibleForFactualSupport: true as const,
      }),
    );

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
    .map((c) =>
      Object.freeze({
        claimId: c.claimId,
        text: sanitizeRetentionBeatText(c.text, RETENTION_MAX_SEGMENT_TEXT_CHARS),
        provenance: c.provenance,
        verification: c.verification,
        eligibleForFactualSupport: false as const,
      }),
    );

  const orderedBeatIds = assertedPlan.beatPlan.beats.map((b) => b.id);
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
    }),
  );

  return deepFreezeRequest({
    contractFingerprint: input.contract.contractFingerprint,
    planFingerprint: assertedPlan.planFingerprint,
    qualityMode: "best" as const,
    modelCallKind: "body_rewrite" as const,
    controllingIdeaStatement: assertedPlan.controllingIdea.statement,
    controllingIdeaClaimRefs: Object.freeze([
      ...assertedSeed.controllingIdeaClaimRefs,
    ]),
    orderedBeatIds: Object.freeze(orderedBeatIds),
    beats: Object.freeze(beats),
    immutableApprovedOpening: Object.freeze({ ...opening }),
    currentCandidate,
    missedQualityComponentIds: resolveMissedQualityComponentIds(
      input.initialValidation,
    ),
    eligibleClaims: Object.freeze(eligible),
    avoidanceClaims: Object.freeze(avoidance),
    targetWordBudget: assertedPlan.compressionGoals.targetWordBudget,
    requiredOutputSchema: Object.freeze({
      requireTitle: true as const,
      requireSegments: true as const,
      requireExactBeatIds: true as const,
      requireHookClaimRefs: true as const,
      preserveExactOpening: true as const,
      structuredDataOnly: true as const,
    }),
  });
}
