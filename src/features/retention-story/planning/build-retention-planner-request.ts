/**
 * Build an ephemeral, bounded Retention planner request — Sprint 10D.1.
 * Creator topic is labeled unverified subject input. Eligible vs avoidance claims
 * are separately labeled. Never persisted into plan fingerprints.
 */

import {
  RETENTION_MAX_MANUAL_CONTEXT_CHARS,
  RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
} from "../domain/retention-story-contract.constants";
import { sanitizeRetentionText } from "../domain/normalize-story-contract";
import {
  isClaimEligibleForControllingIdeaSupport,
  isClaimEligibleForNarrationSupport,
} from "../strategy/retention-claim-support";
import type {
  RetentionStrategyPlanningContext,
  RetentionStrategySeed,
} from "../strategy/retention-strategy.types";
import { resolveAdaptiveRetentionBeatCount } from "./resolve-adaptive-retention-beat-count";
import { resolveRetentionBeatPurposeSequence } from "./retention-beat-strategy.registry";
import { sanitizeRetentionBeatText } from "./retention-beat-semantics";
import {
  RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
  RETENTION_MAX_PLANNER_REQUEST_CLAIMS,
} from "./retention-story-plan.constants";
import type {
  RetentionPlannerClaimSummary,
  RetentionPlannerRequest,
} from "./retention-planner.types";

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
  claim: RetentionStrategyPlanningContext["grounding"]["claims"][number],
  eligible: boolean,
): RetentionPlannerClaimSummary {
  return Object.freeze({
    claimId: claim.claimId,
    text: sanitizeRetentionBeatText(
      claim.text,
      RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
    ),
    provenance: claim.provenance,
    verification: claim.verification,
    eligibleForFactualSupport: eligible,
  });
}

function prioritizeEligible(
  claims: RetentionStrategyPlanningContext["grounding"]["claims"],
  grounding: RetentionStrategyPlanningContext["grounding"],
  factHandlingMode: "verified_facts_only" | "creative_premise",
): RetentionPlannerClaimSummary[] {
  const ranked = claims
    .filter((claim) =>
      isClaimEligibleForNarrationSupport(
        grounding,
        claim.claimId,
        factHandlingMode,
      ) ||
      isClaimEligibleForControllingIdeaSupport(grounding, claim.claimId),
    )
    .map((claim) => {
      const roles = new Set((claim.piFactRole ?? "").split("+").filter(Boolean));
      let rank = 3;
      if (roles.has("required")) rank = 1;
      else if (roles.has("opening_intent") || roles.has("opening_hook")) rank = 2;
      return { claim, rank };
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.claim.claimId.localeCompare(b.claim.claimId);
    });

  return ranked
    .slice(0, RETENTION_MAX_PLANNER_REQUEST_CLAIMS)
    .map(({ claim }) => toClaimSummary(claim, true));
}

function avoidanceClaims(
  claims: RetentionStrategyPlanningContext["grounding"]["claims"],
): RetentionPlannerClaimSummary[] {
  const avoided = claims.filter(
    (claim) =>
      claim.forbidden ||
      claim.verification === "forbidden" ||
      claim.verification === "rejected",
  );
  return avoided
    .slice()
    .sort((a, b) => a.claimId.localeCompare(b.claimId))
    .slice(0, RETENTION_MAX_PLANNER_REQUEST_CLAIMS)
    .map((claim) => toClaimSummary(claim, false));
}

export function buildRetentionPlannerRequest(
  seed: RetentionStrategySeed,
  context: RetentionStrategyPlanningContext,
): RetentionPlannerRequest {
  const contract = context.contract;
  const range = resolveAdaptiveRetentionBeatCount(contract);
  const suggestedBeatPurposes = resolveRetentionBeatPurposeSequence(
    contract.scriptMode,
    contract.endingStrategy,
    range.target,
  );

  const request: RetentionPlannerRequest = {
    contractFingerprint: contract.contractFingerprint,
    topic: contract.topic,
    topicAuthority: "creator_subject_unverified",
    scriptMode: contract.scriptMode,
    formatStrategyId: contract.formatStrategyId,
    durationSec: contract.durationSec,
    qualityMode: contract.qualityMode,
    pacingProfile: contract.pacingProfile,
    informationDensity: contract.informationDensity,
    visualDensity: contract.visualDensity,
    endingStrategy: contract.endingStrategy,
    requirePayoff: contract.constraints.requirePayoff,
    forbidGenericIntro: contract.constraints.forbidGenericIntro,
    targetBeatCountRange: Object.freeze({ min: range.min, max: range.max }),
    suggestedBeatPurposes,
    controllingIdeaStatement: seed.controllingIdea.statement,
    strategySeed: seed,
    manualContext: sanitizeRetentionText(
      context.manualContext,
      RETENTION_MAX_MANUAL_CONTEXT_CHARS,
    ),
    userInstructions: sanitizeRetentionText(
      context.userInstructions,
      RETENTION_MAX_USER_INSTRUCTIONS_CHARS,
    ),
    eligibleClaims: Object.freeze(
      prioritizeEligible(
        context.grounding.claims,
        context.grounding,
        contract.factHandlingMode ?? "verified_facts_only",
      ),
    ),
    avoidanceClaims: Object.freeze(avoidanceClaims(context.grounding.claims)),
    requiredOutputSchema: Object.freeze({
      requireStrategy: true as const,
      requireBeats: true as const,
      requireBeatFields: Object.freeze([
        "purpose",
        "emotionalIntent",
        "viewerQuestion",
        "informationContribution",
        "narrationGoal",
        "visualOpportunity",
        "groundingClaimRefs",
      ] as const),
      factualContributionsRequireClaimIds: true as const,
      structuredDataOnly: true as const,
    }),
  };

  return deepFreezeRequest(request);
}
