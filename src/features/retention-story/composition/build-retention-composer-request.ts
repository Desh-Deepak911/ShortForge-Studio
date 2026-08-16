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
import type { RetentionCreatorContentUnit } from "../domain/retention-creator-content-contract.types";
import { buildRetentionCreatorContentContract } from "../grounding/build-retention-creator-content-contract";
import { normalizeRetentionGroundingContext } from "../grounding/retention-grounding-normalization";
import { isClaimEligibleForNarrationSupport } from "../strategy/retention-claim-support";
import { resolveRetentionDeterministicSubjectAnchor } from "../strategy/resolve-retention-deterministic-subject-anchor";
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
import { buildRetentionCompositionBrief } from "./build-retention-composition-brief";
import { selectRetentionAdaptiveComposerClaims } from "./select-retention-adaptive-composer-claims";
import { resolvePlanAuthorizedComposerClaimIds } from "./retention-opening-claim-authority";
import type {
  BuildRetentionComposerRequestInput,
  RetentionComposerClaimSummary,
  RetentionComposerContentAuthority,
  RetentionComposerContentUnitSummary,
  RetentionComposerRequest,
} from "./retention-narration-candidate.types";

export const RETENTION_COMPOSER_CONTENT_AUTHORITY_RULES = Object.freeze([
  "Write one continuous narration.",
  "Follow hook → evidence → escalation → payoff.",
  "Stitch facts causally; do not read them as a checklist.",
  "Do not speak planning language.",
  "Do not say central idea, next beat, that connection, or equivalent scaffold.",
  "Do not write an isolated utterance per beat.",
  "Do not repeat facts merely to fill duration.",
  "Use essential content before optional detail.",
  "Compress naturally to the selected duration.",
  "Retain exact requested list or ranking membership when structurally explicit.",
  "Beat purposes are an invisible planning scaffold.",
]);

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
    text: sanitizeRetentionBeatText(
      claim.text,
      RETENTION_MAX_SEGMENT_TEXT_CHARS,
    ),
    provenance: claim.provenance,
    verification: claim.verification,
    eligibleForFactualSupport: eligible,
  });
}

function toUnitSummary(
  unit: RetentionCreatorContentUnit,
): RetentionComposerContentUnitSummary {
  return Object.freeze({
    contentUnitId: unit.contentUnitId,
    claimId: unit.claimId,
    creatorOrder: unit.creatorOrder,
    role: unit.role,
    kind: unit.kind,
    authority: unit.authority,
    requiresUncertainty: unit.requiresUncertainty,
    text: sanitizeRetentionBeatText(unit.text, RETENTION_MAX_SEGMENT_TEXT_CHARS),
  });
}

function toContentAuthority(
  input: BuildRetentionComposerRequestInput,
  grounding: BuildRetentionComposerRequestInput["grounding"],
  controllingIdeaStatement: string,
): RetentionComposerContentAuthority {
  const contentContract =
    input.contentContract ??
    buildRetentionCreatorContentContract({
      contract: input.contract,
      grounding,
      manualContext: input.manualContext,
      controllingIdeaStatement,
      centralSubject: resolveRetentionDeterministicSubjectAnchor(
        input.contract.topic,
      ),
    });
  const byId = new Map(
    contentContract.orderedUnits.map((unit) => [unit.contentUnitId, unit]),
  );
  return Object.freeze({
    centralSubject: contentContract.centralSubject,
    controllingIdea: contentContract.controllingIdea,
    intendedConflict: contentContract.intendedConflict,
    intendedConsequence: contentContract.intendedConsequence,
    orderedEssentialUnits: Object.freeze(
      contentContract.essentialContentUnitIds
        .map((id) => byId.get(id))
        .filter((unit): unit is RetentionCreatorContentUnit => unit != null)
        .map(toUnitSummary),
    ),
    orderedOptionalUnits: Object.freeze(
      contentContract.optionalContentUnitIds
        .map((id) => byId.get(id))
        .filter((unit): unit is RetentionCreatorContentUnit => unit != null)
        .map(toUnitSummary),
    ),
    requiredUncertaintyLanguage: Object.freeze([
      ...contentContract.requiredUncertaintyLanguage,
    ]),
    forbiddenInventionIds: Object.freeze([
      ...contentContract.forbiddenInventionIds,
    ]),
    requestedStructuralObligations: Object.freeze([
      ...contentContract.requestedStructuralObligations,
    ]),
    presentationSettings: Object.freeze({
      ...contentContract.presentationSettings,
    }),
    storyWordBudget: contentContract.storyWordBudget,
    compositionRules: RETENTION_COMPOSER_CONTENT_AUTHORITY_RULES,
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
  const contentContract =
    input.contentContract ??
    buildRetentionCreatorContentContract({
      contract,
      grounding,
      manualContext: input.manualContext,
      controllingIdeaStatement: assertedPlan.controllingIdea.statement,
      centralSubject: resolveRetentionDeterministicSubjectAnchor(contract.topic),
    });
  const contentAuthority = toContentAuthority(
    { ...input, contentContract },
    grounding,
    assertedPlan.controllingIdea.statement,
  );
  const creatorClaimOrder = new Map<string, number>();
  for (const unit of [
    ...contentAuthority.orderedEssentialUnits,
    ...contentAuthority.orderedOptionalUnits,
  ]) {
    if (unit.claimId && !creatorClaimOrder.has(unit.claimId)) {
      creatorClaimOrder.set(unit.claimId, unit.creatorOrder);
    }
  }
  const eligibleSorted = grounding.claims
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
    .sort((a, b) => {
      const aOrder = creatorClaimOrder.get(a.claimId);
      const bOrder = creatorClaimOrder.get(b.claimId);
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      return 0;
    });
  const draftBrief = buildRetentionCompositionBrief({
    contract,
    contentContract,
    hookStyle: contentAuthority.presentationSettings.hookStyle,
    reliabilityMode: contentAuthority.presentationSettings.reliabilityMode,
  });
  const requiredClaimIds = [
    ...contentAuthority.orderedEssentialUnits
      .map((unit) => unit.claimId)
      .filter((id): id is string => id != null),
  ];
  for (const name of [
    ...draftBrief.requiredRankingMembership,
    ...draftBrief.requiredParticipants,
  ]) {
    const token = name.split(/\s+/u)[0] ?? "";
    if (!token) continue;
    for (const claim of eligibleSorted) {
      if (
        claim.text.includes(token) &&
        !requiredClaimIds.includes(claim.claimId)
      ) {
        requiredClaimIds.push(claim.claimId);
      }
    }
  }
  const optionalClaimIds = contentAuthority.orderedOptionalUnits
    .map((unit) => unit.claimId)
    .filter((id): id is string => id != null);
  const adaptive = selectRetentionAdaptiveComposerClaims({
    eligibleClaims: eligibleSorted.map((c) => toClaimSummary(c, true)),
    requiredClaimIds,
    optionalClaimIds,
    durationSec: contract.durationSec,
  });
  const eligible = adaptive.included;
  const compositionBrief = buildRetentionCompositionBrief({
    contract,
    contentContract,
    excludedOptionalClaimIds: adaptive.excludedOptionalClaimIds,
    hookStyle: contentAuthority.presentationSettings.hookStyle,
    reliabilityMode: contentAuthority.presentationSettings.reliabilityMode,
  });

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
  // Target most of the spoken duration while keeping modest repair headroom.
  const suggestedTotal = Math.max(
    orderedBeatIds.length * 4,
    Math.floor(targetWordBudget * 0.88),
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
    omittedOptionalClaimIds: Object.freeze([...adaptive.excludedOptionalClaimIds]),
    avoidanceClaims: Object.freeze(avoidance),
    contentAuthority,
    compositionBrief,
    previousCandidate: input.previousCandidate ?? null,
    repairContext: input.repairContext
      ? Object.freeze({
          rejectionStage: input.repairContext.rejectionStage,
          reasonCode: input.repairContext.reasonCode,
          sourceNarration: input.repairContext.sourceNarration ?? "",
        })
      : null,
    requiredOutputSchema: Object.freeze({
      requireTitle: true as const,
      requireSegments: true as const,
      requireExactBeatIds: true as const,
      requireHookClaimRefs: true as const,
      structuredDataOnly: true as const,
      preferNarrationFirst: true as const,
    }),
  };

  return deepFreezeRequest(request);
}
