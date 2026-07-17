/**
 * Build persistable RetentionStoryPlanSnapshot — Sprint 10F.3.
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStoryPlanSnapshot } from "./retention-persistence.types";

export function buildRetentionStoryPlanSnapshot(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
}): RetentionStoryPlanSnapshot {
  const { contract, plan } = input;
  const secondary = plan.emotionalArc.secondaryEmotion;
  return Object.freeze({
    version: 1 as const,
    formatStrategyId: contract.formatStrategyId,
    controllingIdea: plan.controllingIdea.statement,
    primaryEmotion: plan.emotionalArc.primaryEmotion,
    ...(secondary ? { secondaryEmotion: secondary } : {}),
    beatCount: plan.beatPlan.beats.length,
    pacingProfile: plan.pacingProfile,
    endingStrategy: plan.endingStrategy,
    informationDensity: plan.informationDensity,
    visualDensity: plan.visualDensity,
    claimIdCount: plan.claimIdRelationships.length,
    contractFingerprint: plan.contractFingerprint,
    planFingerprint: plan.planFingerprint,
    strategyRegistryVersion: plan.strategyRegistryVersion,
  });
}
