/**
 * RetentionStoryPlan assembly + coherence assertion — Sprint 10D / 10D.1.
 *
 * Fast/cheap rebuilds from deterministic authority only (no planner overlay).
 * Balanced/Studio reconstruct and revalidate the complete planner beat proposal.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import { assertRetentionStrategySeedCoherence } from "../strategy/assert-retention-strategy-seed-coherence";
import {
  buildRetentionParticipantCoverage,
  toRetentionParticipantCoverageSummary,
} from "../strategy/retention-matchup-participant-coverage";
import type {
  RetentionStrategyPlanningContext,
  RetentionStrategySeed,
} from "../strategy/retention-strategy.types";
import { buildRetentionBeatPlan } from "./build-deterministic-retention-beat-plan";
import { buildRetentionCompressionGoals } from "./build-retention-compression-goals";
import { buildRetentionHookHandoff } from "./build-retention-hook-handoff";
import { normalizeRetentionBeatProposal } from "./normalize-retention-beat-proposal";
import { buildRetentionClaimIdRelationships } from "./retention-claim-relationships";
import {
  buildRetentionStoryPlanFingerprint,
  getRetentionStoryPlanRegistryVersion,
} from "./retention-story-plan-fingerprint";
import { RETENTION_STORY_PLAN_VERSION } from "./retention-story-plan.constants";
import type {
  BuildRetentionBeatPlanOptions,
  NormalizedRetentionBeatProposal,
  RetentionBeat,
  RetentionStoryPlan,
} from "./retention-story-plan.types";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function throwPlanMismatch(): never {
  throw new RetentionStoryError(
    "retention_story_plan_mismatch",
    "Retention story plan failed coherence checks against context and strategy seed.",
  );
}

/**
 * Build a canonical, deeply-frozen RetentionStoryPlan.
 */
export function assembleRetentionStoryPlan(
  seed: RetentionStrategySeed,
  context: RetentionStrategyPlanningContext,
  options: BuildRetentionBeatPlanOptions = {},
): RetentionStoryPlan {
  const contract = context.contract;
  const grounding: RetentionGroundingContext = context.grounding;

  const beatResult = buildRetentionBeatPlan(seed, context, options);
  const beats = beatResult.beatPlan.beats;

  const compressionGoals = buildRetentionCompressionGoals(contract);
  const hookHandoff = buildRetentionHookHandoff({
    contract,
    seed,
    beats,
    grounding,
  });
  const claimIdRelationships = buildRetentionClaimIdRelationships({
    controllingIdeaClaimRefs: seed.controllingIdeaClaimRefs,
    beats,
    hookHandoff,
    grounding,
  });
  const strategyRegistryVersion = getRetentionStoryPlanRegistryVersion();
  const participantCoverage = toRetentionParticipantCoverageSummary(
    buildRetentionParticipantCoverage(contract),
  );

  const planFingerprint = buildRetentionStoryPlanFingerprint({
    contractFingerprint: contract.contractFingerprint,
    strategySeedFingerprint: seed.strategySeedFingerprint,
    strategyRegistryVersion,
    forbidGenericIntro: contract.constraints.forbidGenericIntro,
    requirePayoff: contract.constraints.requirePayoff,
    controllingIdea: seed.controllingIdea,
    controllingIdeaClaimRefs: seed.controllingIdeaClaimRefs,
    emotionalArc: beatResult.emotionalArc,
    beatPlan: beatResult.beatPlan,
    pacingProfile: contract.pacingProfile,
    informationDensity: contract.informationDensity,
    visualDensity: contract.visualDensity,
    endingStrategy: contract.endingStrategy,
    compressionGoals,
    claimIdRelationships,
    hookHandoff,
    participantCoverage,
  });

  const plan: RetentionStoryPlan = {
    version: RETENTION_STORY_PLAN_VERSION,
    contractFingerprint: contract.contractFingerprint,
    planFingerprint,
    strategyRegistryVersion,
    controllingIdea: Object.freeze({
      statement: seed.controllingIdea.statement,
      mustPreserveThroughCompression: true as const,
    }),
    emotionalArc: beatResult.emotionalArc,
    beatPlan: beatResult.beatPlan,
    pacingProfile: contract.pacingProfile,
    informationDensity: contract.informationDensity,
    visualDensity: contract.visualDensity,
    endingStrategy: contract.endingStrategy,
    compressionGoals,
    claimIdRelationships,
    hookHandoff,
    participantCoverage,
  };

  return deepFreeze(plan);
}

/**
 * Reconstruct a planner-shaped beat payload from an asserted plan for Balanced/Studio
 * revalidation. Includes purposes, all five semantic fields, and grounding refs.
 */
export function reconstructPlannerBeatProposalFromPlan(
  raw: unknown,
): {
  readonly strategy: { readonly controllingIdea: string };
  readonly beats: readonly Record<string, unknown>[];
} | null {
  if (raw == null || typeof raw !== "object") return null;
  const plan = raw as Record<string, unknown>;
  const ci = plan.controllingIdea as Record<string, unknown> | null;
  if (ci == null || typeof ci.statement !== "string") return null;

  const beatPlan = plan.beatPlan as Record<string, unknown> | null;
  if (beatPlan == null || typeof beatPlan !== "object") return null;
  const beats = beatPlan.beats;
  if (!Array.isArray(beats) || beats.length === 0) return null;

  const entries: Record<string, unknown>[] = [];
  for (const beat of beats) {
    if (beat == null || typeof beat !== "object") return null;
    const b = beat as RetentionBeat;
    if (typeof b.purpose !== "string") return null;
    if (typeof b.emotionalIntent !== "string") return null;
    if (typeof b.viewerQuestion !== "string") return null;
    if (typeof b.informationContribution !== "string") return null;
    if (typeof b.narrationGoal !== "string") return null;
    if (typeof b.visualOpportunity !== "string") return null;
    if (!Array.isArray(b.groundingClaimRefs)) return null;
    entries.push({
      purpose: b.purpose,
      emotionalIntent: b.emotionalIntent,
      viewerQuestion: b.viewerQuestion,
      informationContribution: b.informationContribution,
      narrationGoal: b.narrationGoal,
      visualOpportunity: b.visualOpportunity,
      groundingClaimRefs: [...b.groundingClaimRefs],
    });
  }

  return {
    strategy: { controllingIdea: ci.statement },
    beats: entries,
  };
}

export interface AssertRetentionStoryPlanContext {
  readonly context: RetentionStrategyPlanningContext;
  readonly strategySeed: RetentionStrategySeed;
}

/**
 * Assert a plan matches the recomputed canonical plan for the given context/seed.
 * Cheap → deterministic rebuild only. Balanced/Studio → reconstruct + revalidate proposal.
 */
export function assertRetentionStoryPlanCoherence(
  plan: unknown,
  input: AssertRetentionStoryPlanContext,
): RetentionStoryPlan {
  if (plan == null || typeof plan !== "object" || Array.isArray(plan)) {
    throwPlanMismatch();
  }

  const seed = assertRetentionStrategySeedCoherence(
    input.strategySeed,
    input.context,
  );

  const qualityMode = input.context.contract.qualityMode;
  let options: BuildRetentionBeatPlanOptions = {};

  if (qualityMode === "cheap") {
    options = {};
  } else {
    const reconstructed = reconstructPlannerBeatProposalFromPlan(plan);
    if (reconstructed == null) throwPlanMismatch();
    let normalized: NormalizedRetentionBeatProposal;
    try {
      normalized = normalizeRetentionBeatProposal(
        reconstructed,
        input.context.contract,
        input.context.grounding,
      );
    } catch {
      throwPlanMismatch();
    }
    options = { proposal: normalized };
  }

  const rebuilt = assembleRetentionStoryPlan(seed, input.context, options);

  if (retentionStableStringify(rebuilt) !== retentionStableStringify(plan)) {
    throwPlanMismatch();
  }

  return rebuilt;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Total, never-throwing structural validator.
 */
export function validateRetentionStoryPlan(
  value: unknown,
): value is RetentionStoryPlan {
  try {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const plan = value as Record<string, unknown>;
    if (plan.version !== RETENTION_STORY_PLAN_VERSION) return false;
    if (!isNonEmptyString(plan.contractFingerprint)) return false;
    if (!isNonEmptyString(plan.planFingerprint)) return false;
    if (!isNonEmptyString(plan.strategyRegistryVersion)) return false;

    const ci = plan.controllingIdea as Record<string, unknown> | null;
    if (ci == null || typeof ci !== "object") return false;
    if (!isNonEmptyString(ci.statement)) return false;
    if (ci.mustPreserveThroughCompression !== true) return false;

    const arc = plan.emotionalArc as Record<string, unknown> | null;
    if (arc == null || typeof arc !== "object") return false;
    if (!Array.isArray(arc.curve)) return false;

    const beatPlan = plan.beatPlan as Record<string, unknown> | null;
    if (beatPlan == null || typeof beatPlan !== "object") return false;
    if (beatPlan.version !== 1) return false;
    if (!Array.isArray(beatPlan.beats) || beatPlan.beats.length === 0) {
      return false;
    }
    const range = beatPlan.targetBeatCountRange as Record<string, unknown> | null;
    if (range == null || typeof range !== "object") return false;
    if (typeof range.min !== "number" || typeof range.max !== "number") {
      return false;
    }

    for (const rawBeat of beatPlan.beats) {
      if (rawBeat == null || typeof rawBeat !== "object") return false;
      const beat = rawBeat as Record<string, unknown>;
      if (!isNonEmptyString(beat.id)) return false;
      if (!isNonEmptyString(beat.purpose)) return false;
      if (typeof beat.estimatedStartMs !== "number") return false;
      if (typeof beat.estimatedEndMs !== "number") return false;
      if (beat.estimatedEndMs <= beat.estimatedStartMs) return false;
      if (!Array.isArray(beat.groundingClaimRefs)) return false;
    }

    if (!isNonEmptyString(plan.pacingProfile)) return false;
    if (!isNonEmptyString(plan.informationDensity)) return false;
    if (!isNonEmptyString(plan.visualDensity)) return false;
    if (!isNonEmptyString(plan.endingStrategy)) return false;

    const compression = plan.compressionGoals as Record<string, unknown> | null;
    if (compression == null || typeof compression !== "object") return false;
    if (typeof compression.targetWordBudget !== "number") return false;
    if (compression.preserveControllingIdea !== true) return false;
    if (typeof compression.preservePayoff !== "boolean") return false;
    if (typeof compression.maxDeadAirSec !== "number") return false;

    if (!Array.isArray(plan.claimIdRelationships)) return false;

    const handoff = plan.hookHandoff as Record<string, unknown> | null;
    if (handoff == null || typeof handoff !== "object") return false;
    if (handoff.version !== 1) return false;
    if (!isNonEmptyString(handoff.openingPsychologicalFunction)) return false;
    if (!isNonEmptyString(handoff.controllingIdeaRelation)) return false;
    if (!isNonEmptyString(handoff.nextBeatPurpose)) return false;
    if (!isNonEmptyString(handoff.desiredTransitionIntoBody)) return false;
    const gr = handoff.groundingRequirements as Record<string, unknown> | null;
    if (gr == null || typeof gr !== "object") return false;
    if (typeof gr.requireEligibleClaimRefs !== "boolean") return false;
    if (!Array.isArray(gr.claimIds)) return false;

    const pc = plan.participantCoverage as Record<string, unknown> | null;
    if (pc == null || typeof pc !== "object") return false;
    if (typeof pc.policyVersion !== "string") return false;
    if (typeof pc.required !== "boolean") return false;
    if (!Array.isArray(pc.groupTokenSets)) return false;

    return true;
  } catch {
    return false;
  }
}
