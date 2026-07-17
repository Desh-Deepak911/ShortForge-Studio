/**
 * RetentionBeatPlan construction — Sprint 10D / 10D.1.
 *
 * Fast/cheap: fully deterministic purposes, templates (safe subject anchor), and
 * optional single grounded middle beat.
 * Balanced/Studio: complete normalized planner proposal is authoritative for
 * purposes + semantic fields + grounding refs within Retention constraints.
 * IDs, timing, relations, novelty, arc binding are always recomputed.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingClaim,
} from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { bindEmotionalArcBlueprintToBeatIds } from "../strategy/bind-emotional-arc-blueprint";
import {
  isClaimEligibleForControllingIdeaSupport,
  isClaimEligibleForNarrationSupport,
  normalizeRetentionControllingIdeaStatement,
} from "../strategy/retention-claim-support";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import { resolveRetentionDeterministicSubjectAnchor } from "../strategy/resolve-retention-deterministic-subject-anchor";
import { claimRelevantToRetentionTopic } from "../strategy/retention-subject-tokens";
import type {
  RetentionStrategyPlanningContext,
  RetentionStrategySeed,
} from "../strategy/retention-strategy.types";
import { allocateRetentionBeatBudgets } from "./allocate-retention-beat-budgets";
import { buildRetentionBeatId } from "./retention-beat-identity";
import {
  retentionBeatTextHasForbiddenMarker,
  sanitizeRetentionBeatText,
} from "./retention-beat-semantics";
import {
  buildRetentionBeatTemplateFields,
  resolveRetentionBeatControllingIdeaRelation,
  resolveRetentionBeatNoveltyRole,
  resolveRetentionBeatPayoffRelations,
  resolveRetentionBeatPurposeSequence,
} from "./retention-beat-strategy.registry";
import { resolveAdaptiveRetentionBeatCount } from "./resolve-adaptive-retention-beat-count";
import { getRetentionBeatDensityProfile } from "./resolve-retention-beat-count-range";
import {
  RETENTION_BEAT_PLAN_VERSION,
  RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
} from "./retention-story-plan.constants";
import type {
  BuildRetentionBeatPlanOptions,
  NormalizedRetentionBeatProposal,
  RetentionBeat,
  RetentionBeatPlanResult,
  RetentionBeatPurpose,
  RetentionBeatSemanticFields,
} from "./retention-story-plan.types";
import { isValidRetentionPlannerPurposeSequence } from "./validate-retention-planner-purpose-sequence";

function groundedClaimRank(claim: RetentionGroundingClaim): number {
  const roles = new Set((claim.piFactRole ?? "").split("+").filter(Boolean));
  if (roles.has("required")) return 1;
  if (roles.has("opening_intent") || roles.has("opening_hook")) return 2;
  return 3;
}

function selectGroundedBeatClaim(
  context: RetentionStrategyPlanningContext,
): { readonly claimId: string; readonly text: string } | null {
  const topic = context.contract.topic;
  const mode = context.contract.factHandlingMode ?? "verified_facts_only";
  const eligible = context.grounding.claims.filter(
    (claim) =>
      isClaimEligibleForControllingIdeaSupport(
        context.grounding,
        claim.claimId,
      ) ||
      isClaimEligibleForNarrationSupport(
        context.grounding,
        claim.claimId,
        mode,
      ),
  );

  const candidates = eligible
    .map((claim) => {
      const normalized = normalizeRetentionControllingIdeaStatement(claim.text);
      return { claim, normalized };
    })
    .filter(({ claim, normalized }) => {
      if (!normalized) return false;
      if (normalized.length > RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS) {
        return false;
      }
      if (retentionBeatTextHasForbiddenMarker(normalized)) return false;
      if (!detectRetentionFactualRisk(normalized).risky) return false;
      if (claim.sourceRef === "creative_premise") {
        return true;
      }
      const roles = new Set(
        (claim.piFactRole ?? "").split("+").filter(Boolean),
      );
      const piRequiredOrOpening =
        roles.has("required") ||
        roles.has("opening_intent") ||
        roles.has("opening_hook");
      return piRequiredOrOpening || claimRelevantToRetentionTopic(topic, claim.text);
    })
    .sort((a, b) => {
      const byRank = groundedClaimRank(a.claim) - groundedClaimRank(b.claim);
      if (byRank !== 0) return byRank;
      return a.claim.claimId.localeCompare(b.claim.claimId);
    });

  const chosen = candidates[0];
  if (!chosen) return null;
  return {
    claimId: chosen.claim.claimId,
    text: sanitizeRetentionBeatText(
      chosen.normalized,
      RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
    ),
  };
}

function resolvePurposes(
  contract: NormalizedStoryContract,
  beatCount: number,
  proposal: NormalizedRetentionBeatProposal | null | undefined,
): readonly RetentionBeatPurpose[] {
  if (proposal != null && proposal.beats.length > 0) {
    const purposes = proposal.beats.map((b) => b.purpose);
    const range = resolveAdaptiveRetentionBeatCount(contract);
    if (
      !isValidRetentionPlannerPurposeSequence(
        purposes,
        contract.endingStrategy,
        range,
      )
    ) {
      throw new RetentionStoryError(
        "planner_proposal_invalid",
        "Planner purpose sequence is invalid for the active contract.",
      );
    }
    return Object.freeze(purposes);
  }
  return resolveRetentionBeatPurposeSequence(
    contract.scriptMode,
    contract.endingStrategy,
    beatCount,
  );
}

/**
 * Build the ordered beat plan and the beat-bound emotional arc.
 * The returned plan is provisional; callers must run coherence assertion.
 */
export function buildRetentionBeatPlan(
  seed: RetentionStrategySeed,
  context: RetentionStrategyPlanningContext,
  options: BuildRetentionBeatPlanOptions = {},
): RetentionBeatPlanResult {
  const contract: NormalizedStoryContract = context.contract;
  const range = resolveAdaptiveRetentionBeatCount(contract);
  const density = getRetentionBeatDensityProfile(contract);
  const proposal = options.proposal ?? null;

  if (
    contract.qualityMode === "cheap" &&
    proposal != null &&
    proposal.beats.length > 0
  ) {
    throw new RetentionStoryError(
      "strategy_not_applicable",
      "Planner beat enrichment is not applicable for Fast quality mode.",
    );
  }

  const beatCount =
    proposal != null && proposal.beats.length > 0
      ? proposal.beats.length
      : range.target;

  if (beatCount < range.min || beatCount > range.max) {
    throw new RetentionStoryError(
      "planner_proposal_invalid",
      "Beat count is outside the active duration-derived range.",
    );
  }

  const purposes = resolvePurposes(contract, beatCount, proposal);
  const budgets = allocateRetentionBeatBudgets({
    durationSec: contract.durationSec,
    count: beatCount,
    pacingProfile: contract.pacingProfile,
    minBeatDurationSec: density.minBeatDurationSec,
    maxBeatDurationSec: density.maxBeatDurationSec,
  });
  const payoffRelations = resolveRetentionBeatPayoffRelations(
    beatCount,
    contract.constraints.requirePayoff,
  );

  const subjectAnchor =
    resolveRetentionDeterministicSubjectAnchor(contract.topic) ?? "this contest";

  const premiseClaims =
    proposal == null &&
    (contract.factHandlingMode ?? "verified_facts_only") === "creative_premise"
      ? Object.freeze(
          context.grounding.claims
            .filter(
              (c) =>
                c.sourceRef === "creative_premise" &&
                c.permittedFactualUse &&
                !c.forbidden,
            )
            .slice()
            .sort((a, b) => a.claimId.localeCompare(b.claimId)),
        )
      : Object.freeze([] as RetentionGroundingClaim[]);
  // When Creative Premise distributes claims, do not also select a grounded
  // premise claim (avoids duplicate result statements that break Hook authority).
  const grounded =
    proposal == null && premiseClaims.length === 0
      ? selectGroundedBeatClaim(context)
      : null;
  let groundedIndex = -1;
  if (grounded || premiseClaims.length > 0) {
    for (let i = 1; i < beatCount - 1; i++) {
      if (purposes[i] === "proof") {
        groundedIndex = i;
        break;
      }
    }
    if (groundedIndex === -1) {
      for (let i = 1; i < beatCount - 1; i++) {
        if (purposes[i] === "reveal") {
          groundedIndex = i;
          break;
        }
      }
    }
    if (groundedIndex === -1 && beatCount > 2) {
      groundedIndex = 1;
    }
  }
  // Distribute creator premise facts one-per-middle-beat (exact text + one ref).
  const premiseByBeatIndex = new Map<
    number,
    { readonly claimId: string; readonly text: string }
  >();
  if (premiseClaims.length > 0 && beatCount > 2) {
    const middleIndexes: number[] = [];
    for (let i = 1; i < beatCount - 1; i++) middleIndexes.push(i);
    for (let p = 0; p < premiseClaims.length && p < middleIndexes.length; p++) {
      const claim = premiseClaims[p]!;
      premiseByBeatIndex.set(middleIndexes[p]!, {
        claimId: claim.claimId,
        text: claim.text,
      });
    }
  }

  const beats: RetentionBeat[] = [];

  for (let i = 0; i < beatCount; i++) {
    const purpose = purposes[i]!;
    const template = buildRetentionBeatTemplateFields(purpose, subjectAnchor);
    const proposed = proposal?.beats[i];

    let fields: RetentionBeatSemanticFields;
    let groundingClaimRefs: readonly string[];

    if (proposed != null) {
      if (proposed.purpose !== purpose) {
        throw new RetentionStoryError(
          "planner_proposal_invalid",
          "Planner beat purpose does not match the accepted sequence.",
        );
      }
      fields = {
        emotionalIntent: proposed.emotionalIntent,
        viewerQuestion: proposed.viewerQuestion,
        informationContribution: proposed.informationContribution,
        narrationGoal: proposed.narrationGoal,
        visualOpportunity: proposed.visualOpportunity,
      };
      groundingClaimRefs = proposed.groundingClaimRefs;
    } else {
      const premise = premiseByBeatIndex.get(i);
      const useGrounded =
        !premise && i === groundedIndex && grounded != null;
      fields = {
        emotionalIntent: template.emotionalIntent,
        viewerQuestion: template.viewerQuestion,
        informationContribution: premise
          ? premise.text
          : useGrounded
            ? grounded!.text
            : template.informationContribution,
        narrationGoal: template.narrationGoal,
        visualOpportunity: template.visualOpportunity,
      };
      if (premise) {
        groundingClaimRefs = Object.freeze([premise.claimId]);
      } else if (useGrounded) {
        groundingClaimRefs = Object.freeze([grounded!.claimId]);
      } else {
        groundingClaimRefs = Object.freeze([] as string[]);
      }
    }

    const controllingIdeaRelation = resolveRetentionBeatControllingIdeaRelation(
      i,
      beatCount,
    );
    const payoffRelation = payoffRelations[i]!;
    const noveltyRole = resolveRetentionBeatNoveltyRole(purpose, i, beatCount);
    const budget = budgets[i]!;

    const id = buildRetentionBeatId({
      contractFingerprint: contract.contractFingerprint,
      strategySeedFingerprint: seed.strategySeedFingerprint,
      orderedIndex: i,
      purpose,
      emotionalIntent: fields.emotionalIntent,
      viewerQuestion: fields.viewerQuestion,
      informationContribution: fields.informationContribution,
      narrationGoal: fields.narrationGoal,
      visualOpportunity: fields.visualOpportunity,
      groundingClaimRefs,
      estimatedStartMs: budget.startMs,
      estimatedEndMs: budget.endMs,
      noveltyRole,
      controllingIdeaRelation,
      payoffRelation,
    });

    beats.push(
      Object.freeze({
        id,
        purpose,
        emotionalIntent: fields.emotionalIntent,
        viewerQuestion: fields.viewerQuestion,
        informationContribution: fields.informationContribution,
        narrationGoal: fields.narrationGoal,
        visualOpportunity: fields.visualOpportunity,
        estimatedStartMs: budget.startMs,
        estimatedEndMs: budget.endMs,
        noveltyRole,
        groundingClaimRefs: Object.freeze([...groundingClaimRefs]),
        controllingIdeaRelation,
        payoffRelation,
      }),
    );
  }

  const orderedBeatIds = Object.freeze(beats.map((b) => b.id));
  const emotionalArc = bindEmotionalArcBlueprintToBeatIds(
    seed.emotionalArcBlueprint,
    orderedBeatIds,
  );

  const beatPlan = Object.freeze({
    version: RETENTION_BEAT_PLAN_VERSION,
    beats: Object.freeze(beats),
    targetBeatCountRange: Object.freeze({ min: range.min, max: range.max }),
  });

  return Object.freeze({ beatPlan, emotionalArc, orderedBeatIds });
}
