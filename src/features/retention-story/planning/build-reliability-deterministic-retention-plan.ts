/**
 * Reliability deterministic plan — Sprint 10H.3.
 * Builds a complete Retention plan from deterministic authority for any
 * quality mode when model planning is unavailable or invalid.
 * Does not consume planner budget. Composer quality remains unchanged.
 */

import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { buildDeterministicRetentionStrategySeed } from "../strategy/build-retention-strategy-seed";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { validateRetentionStrategyPlanningInput } from "../strategy/validate-strategy-planning-input";
import {
  assembleRetentionStoryPlan,
  assertRetentionStoryPlanCoherence,
} from "./assert-retention-story-plan-coherence";
import type {
  BuildRetentionStoryPlanInput,
  RetentionStoryPlanResult,
} from "./retention-planner.types";

function readyResult(
  plan: ReturnType<typeof assembleRetentionStoryPlan>,
  strategySeed: RetentionStrategySeed,
  diagnostics: {
    readonly qualityMode: BuildRetentionStoryPlanInput["contract"]["qualityMode"];
    readonly contractFingerprint: string;
    readonly planFingerprint: string;
  },
): RetentionStoryPlanResult {
  return Object.freeze({
    status: "ready" as const,
    plan,
    strategySeed,
    diagnostics: Object.freeze({
      qualityMode: diagnostics.qualityMode,
      plannerAttempts: 0 as const,
      outcome: "deterministic_fast" as const,
      contractFingerprint: diagnostics.contractFingerprint,
      planFingerprint: diagnostics.planFingerprint,
    }),
  });
}

/**
 * Deterministic plan for reliability fallback (Fast / Balanced / Studio).
 */
export function buildReliabilityDeterministicRetentionPlan(
  input: BuildRetentionStoryPlanInput,
): RetentionStoryPlanResult {
  if (input.ledger) {
    // Policy must match contract; do not consume planner.
    const ledger: RetentionModelCallLedger = input.ledger;
    if (ledger.policy.qualityMode !== input.contract.qualityMode) {
      throw new RetentionStoryError(
        "model_call_ledger_invalid",
        "Ledger quality mode does not match the Story Contract.",
      );
    }
  }

  if (input.contract.generationPath === "scenes_only") {
    return Object.freeze({
      status: "skipped" as const,
      reason: "scenes_only" as const,
    });
  }

  const context = validateRetentionStrategyPlanningInput({
    contract: input.contract,
    grounding: input.grounding,
    manualContext: input.manualContext ?? null,
    userInstructions: input.userInstructions ?? null,
  });

  const seedResult = buildDeterministicRetentionStrategySeed({
    contract: input.contract,
    grounding: input.grounding,
    manualContext: input.manualContext ?? null,
    userInstructions: input.userInstructions ?? null,
  });
  if (seedResult.status === "skipped") {
    return Object.freeze({
      status: "skipped" as const,
      reason: "scenes_only" as const,
    });
  }

  const plan = assembleRetentionStoryPlan(seedResult.seed, context);
  const asserted = assertRetentionStoryPlanCoherence(plan, {
    context,
    strategySeed: seedResult.seed,
  });

  return readyResult(asserted, seedResult.seed, {
    qualityMode: input.contract.qualityMode,
    contractFingerprint: input.contract.contractFingerprint,
    planFingerprint: asserted.planFingerprint,
  });
}
