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
import { evaluateRetentionHardGates } from "./evaluate-retention-hard-gates";
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
  });
  const passedCount = hardGates.filter((g) => g.passed).length;
  const allHardGatesPassed = passedCount === hardGates.length;
  const aggregates = computeRetentionAggregates({
    formatStrategyId: contract.formatStrategyId,
    editorial,
    hardGatesPassedCount: passedCount,
    hardGatesEvaluatedCount: hardGates.length,
  });
  const threshold = resolveRetentionReadinessThreshold(contract.formatStrategyId);
  const meetsThreshold = aggregates.retentionReadiness >= threshold;

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
    retentionReadiness: aggregates.retentionReadiness,
    storyQualityConfidence: aggregates.storyQualityConfidence,
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
    retentionReadiness: aggregates.retentionReadiness,
    storyQualityConfidence: aggregates.storyQualityConfidence,
    frameworkCompliance: aggregates.frameworkCompliance,
    activeStrategyThreshold: threshold,
    notes: Object.freeze(notes),
    validationFingerprint,
    candidateFingerprint: candidate.candidateFingerprint,
  });
}
