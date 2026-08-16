/**
 * Single canonical Retention validation-result builder — Sprint 10F.1.
 * Shared by validateRetentionStoryCandidate and coherence assertion.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionHookBridgeReadyResult } from "../integration/assert-retention-hook-bridge-ready-coherence";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { buildRetentionCompositionBrief } from "../composition/build-retention-composition-brief";
import { evaluateRetentionHookBodyPayoff } from "../composition/evaluate-retention-hook-body-payoff";
import { evaluateRetentionDurationFit } from "../composition/evaluate-retention-duration-fit";
import { buildRetentionCreatorContentContract } from "../grounding/build-retention-creator-content-contract";
import { evaluateRetentionHardGates } from "./evaluate-retention-hard-gates";
import { evaluateRetentionNarrationSubstance } from "./evaluate-retention-narration-substance";
import {
  RETENTION_HEURISTIC_REGISTRY_VERSION,
  RETENTION_THRESHOLD_REGISTRY_VERSION,
  RETENTION_VALIDATION_VERSION,
} from "./retention-validation.constants";
import { buildRetentionValidationFingerprint } from "./retention-validation-fingerprint";
import { resolveRetentionReadinessThreshold } from "./retention-validation-thresholds";
import {
  computeRetentionAggregates,
  scoreRetentionEditorialQuality,
} from "./score-retention-editorial-quality";
import type {
  RetentionValidationFailureClass,
  RetentionValidationResult,
} from "./retention-validation.types";

export interface CanonicalRetentionValidationAuthority {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly plan: RetentionStoryPlan;
  readonly candidate: RetentionNarrationCandidate;
  readonly hookBridge: RetentionHookBridgeReadyResult;
}

export function deepFreezeRetentionValidationResult(
  result: RetentionValidationResult,
): RetentionValidationResult {
  Object.freeze(result.hardGates);
  for (const gate of result.hardGates) Object.freeze(gate);
  Object.freeze(result.editorial);
  Object.freeze(result.notes);
  return Object.freeze(result);
}

/**
 * Build the sole canonical validation result from asserted authority inputs.
 */
export function buildCanonicalRetentionValidationResult(
  authority: CanonicalRetentionValidationAuthority,
): RetentionValidationResult {
  const { contract, grounding, strategySeed, plan, candidate, hookBridge } =
    authority;

  const hardGates = evaluateRetentionHardGates({
    contract,
    grounding,
    strategySeed,
    plan,
    candidate,
    hookBridge,
  });
  const editorial = scoreRetentionEditorialQuality({
    contract,
    plan,
    candidate,
    grounding,
  });
  const substance = evaluateRetentionNarrationSubstance({
    candidate,
    grounding,
    topic: contract.topic,
    controllingIdeaStatement: plan.controllingIdea.statement,
  });
  const contentContract = buildRetentionCreatorContentContract({
    contract,
    grounding,
  });
  const brief = buildRetentionCompositionBrief({
    contract,
    contentContract,
  });
  const hookQuality = evaluateRetentionHookBodyPayoff({
    narration: candidate.assembledNarration,
    contentContract,
    brief,
  });
  const durationFit = evaluateRetentionDurationFit({
    narration: candidate.assembledNarration,
    hardWordBudget: brief.durationUtilisation.storyHardWordBudget,
    targetWordBudget: brief.durationUtilisation.storyTargetWordBudget,
    minimumUsefulWords: brief.durationUtilisation.minimumUsefulWords,
    durationSec: brief.durationUtilisation.durationSec,
    preserveCompleteRanking:
      brief.requiredRankingMembership.length >= 2 &&
      /\b(?:number one|no\.?\s*1|stands last|decisive name|#1)\b/iu.test(
        candidate.assembledNarration,
      ),
  });
  const hookQualityWarnings = hookQuality.qualityWarningIds;
  const passedCount = hardGates.filter((g) => g.passed).length;
  const allHardGatesPassed = passedCount === hardGates.length;
  const aggregates = computeRetentionAggregates({
    formatStrategyId: contract.formatStrategyId,
    editorial,
    hardGatesPassedCount: passedCount,
    hardGatesEvaluatedCount: hardGates.length,
    narrationSubstanceScore: substance.substanceScore,
  });
  const threshold = resolveRetentionReadinessThreshold(contract.formatStrategyId);
  const rescueUsed =
    hookBridge.diagnostics.compositionAuthority === "deterministic_rescue";
  const hookQualityBelowTarget = hookQualityWarnings.length > 0;
  // When narration substance is below target, readiness must not report as
  // ordinary above-threshold Pass (keeps advisory warning truthful).
  const retentionReadiness =
    substance.qualityBelowTarget || rescueUsed || hookQualityBelowTarget
      ? Math.min(aggregates.retentionReadiness, Math.max(0, threshold - 0.01))
      : aggregates.retentionReadiness;
  // Deterministic rescue is complete and fact-grounded, but it is never
  // ordinary editorial quality. Keep confidence visibly below target.
  const storyQualityConfidence = rescueUsed
    ? Math.min(aggregates.storyQualityConfidence, 0.71)
    : aggregates.storyQualityConfidence;
  const meetsThreshold =
    retentionReadiness >= threshold &&
    !substance.qualityBelowTarget &&
    !hookQualityBelowTarget;

  // Sprint 10H.3 — editorial readiness is advisory. Structural/safety hard gates
  // still block; a complete candidate below the readiness target may Pass with
  // quality_below_target explainability (never success:false solely for quality).
  let failureClass: RetentionValidationFailureClass = "none";
  let ok = false;
  if (!allHardGatesPassed) {
    failureClass = "hard_gate";
    ok = false;
  } else if (!meetsThreshold) {
    failureClass = "quality_threshold";
    ok = true;
  } else {
    failureClass = "none";
    ok = true;
  }

  const notes: string[] = [];
  if (!allHardGatesPassed) notes.push("hard_gate_failure");
  if (allHardGatesPassed && !meetsThreshold) {
    notes.push("quality_threshold_miss");
    notes.push("quality_below_target");
  }
  if (substance.qualityBelowTarget) {
    if (!notes.includes("quality_below_target")) notes.push("quality_below_target");
    notes.push("narration_substance_below_target");
    // Cap substance diagnostic IDs so persistable warning note budget stays usable.
    for (const id of substance.diagnosticIds.slice(0, 3)) {
      notes.push(`substance:${id}`);
    }
  }
  if (hookQualityBelowTarget) {
    if (!notes.includes("quality_below_target")) notes.push("quality_below_target");
    for (const id of hookQualityWarnings) {
      if (!notes.includes(id)) notes.push(id);
    }
  }
  for (const id of durationFit.warningIds) {
    if (!notes.includes(id)) notes.push(id);
  }
  if (ok && meetsThreshold) notes.push("validation_pass");
  if (ok && !meetsThreshold) notes.push("validation_pass_with_quality_warning");

  const validationFingerprint = buildRetentionValidationFingerprint({
    candidateFingerprint: candidate.candidateFingerprint,
    validatorVersion: RETENTION_VALIDATION_VERSION,
    heuristicRegistryVersion: RETENTION_HEURISTIC_REGISTRY_VERSION,
    thresholdRegistryVersion: RETENTION_THRESHOLD_REGISTRY_VERSION,
    activeStrategyThreshold: threshold,
    hardGates,
    editorial,
    retentionReadiness,
    storyQualityConfidence,
    frameworkCompliance: aggregates.frameworkCompliance,
    ok,
    failureClass,
  });

  return deepFreezeRetentionValidationResult({
    version: 1,
    ok,
    failureClass,
    hardGates,
    editorial,
    retentionReadiness,
    storyQualityConfidence,
    frameworkCompliance: aggregates.frameworkCompliance,
    activeStrategyThreshold: threshold,
    notes: Object.freeze(notes),
    validationFingerprint,
    candidateFingerprint: candidate.candidateFingerprint,
  });
}
