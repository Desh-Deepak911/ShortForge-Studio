/**
 * Retention Story Plan orchestrators — Sprint 10D / 10D.1 / 10E.1.
 *
 * Fast (cheap): zero planner calls, deterministic authority only.
 * Balanced/Studio: exactly one injected planner call; complete proposal required.
 * No silent Fast downgrade. No partial planner_enriched outcomes.
 * Optional shared path-global ledger for planner budget accounting.
 */

import {
  assertRetentionLedgerMatchesContract,
  type RetentionModelCallLedger,
} from "../budget/create-retention-model-call-ledger";
import { RetentionStoryError, isRetentionStoryError } from "../domain/retention-story-errors";
import { buildDeterministicRetentionStrategySeed } from "../strategy/build-retention-strategy-seed";
import { normalizeRetentionStrategyProposal } from "../strategy/normalize-retention-strategy-proposal";
import type {
  RetentionStrategyPlanningContext,
  RetentionStrategySeed,
} from "../strategy/retention-strategy.types";
import { validateRetentionStrategyPlanningInput } from "../strategy/validate-strategy-planning-input";
import {
  assembleRetentionStoryPlan,
  assertRetentionStoryPlanCoherence,
} from "./assert-retention-story-plan-coherence";
import { buildRetentionPlannerRequest } from "./build-retention-planner-request";
import { normalizeRetentionBeatProposal } from "./normalize-retention-beat-proposal";
import { runRetentionPlannerOnce } from "./run-retention-planner-once";
import type {
  BuildRetentionStoryPlanInput,
  RetentionStoryPlanDiagnostics,
  RetentionStoryPlanResult,
} from "./retention-planner.types";

function readyResult(
  plan: ReturnType<typeof assembleRetentionStoryPlan>,
  strategySeed: RetentionStrategySeed,
  diagnostics: RetentionStoryPlanDiagnostics,
): RetentionStoryPlanResult {
  return Object.freeze({
    status: "ready" as const,
    plan,
    strategySeed,
    diagnostics,
  });
}

function maybeAssertLedger(
  ledger: RetentionModelCallLedger | undefined,
  contract: BuildRetentionStoryPlanInput["contract"],
): void {
  if (ledger) {
    assertRetentionLedgerMatchesContract(ledger, contract);
  }
}

/**
 * Fast deterministic path. Rejects non-cheap contracts so Balanced/Studio cannot
 * bypass the planner boundary through this public builder.
 */
export function buildDeterministicRetentionStoryPlan(
  input: BuildRetentionStoryPlanInput,
): RetentionStoryPlanResult {
  // Ledger policy must be validated before any scenes-only early return.
  maybeAssertLedger(input.ledger, input.contract);

  if (input.contract.generationPath === "scenes_only") {
    return Object.freeze({ status: "skipped" as const, reason: "scenes_only" as const });
  }

  if (input.contract.qualityMode !== "cheap") {
    throw new RetentionStoryError(
      "strategy_not_applicable",
      "Deterministic Fast plan builder requires qualityMode cheap.",
    );
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
    return Object.freeze({ status: "skipped" as const, reason: "scenes_only" as const });
  }

  const plan = assembleRetentionStoryPlan(seedResult.seed, context);
  const asserted = assertRetentionStoryPlanCoherence(plan, {
    context,
    strategySeed: seedResult.seed,
  });

  return readyResult(asserted, seedResult.seed, {
    qualityMode: input.contract.qualityMode,
    plannerAttempts: 0,
    outcome: "deterministic_fast",
    contractFingerprint: input.contract.contractFingerprint,
    planFingerprint: asserted.planFingerprint,
  });
}

function normalizeCompletePlannerProposal(
  proposal: unknown,
  context: RetentionStrategyPlanningContext,
  baseSeed: RetentionStrategySeed,
): {
  readonly seed: RetentionStrategySeed;
  readonly beatProposal: ReturnType<typeof normalizeRetentionBeatProposal>;
} {
  if (proposal == null || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw new RetentionStoryError(
      "planner_proposal_invalid",
      "Retention planner proposal is malformed.",
    );
  }
  const record = proposal as Record<string, unknown>;
  if (record.strategy == null || typeof record.strategy !== "object") {
    throw new RetentionStoryError(
      "planner_proposal_invalid",
      "Retention planner proposal is missing strategy.",
    );
  }

  const seed = normalizeRetentionStrategyProposal(record.strategy, context);
  void baseSeed;
  const beatProposal = normalizeRetentionBeatProposal(
    proposal,
    context.contract,
    context.grounding,
  );
  return { seed, beatProposal };
}

/**
 * Quality-aware orchestrator. When `ledger` is supplied, consumes `planner`
 * immediately before the injected planner call and records the terminal outcome.
 */
export async function buildRetentionStoryPlan(
  input: BuildRetentionStoryPlanInput,
): Promise<RetentionStoryPlanResult> {
  // Ledger policy must be validated before any scenes-only early return.
  maybeAssertLedger(input.ledger, input.contract);

  if (input.contract.generationPath === "scenes_only") {
    return Object.freeze({ status: "skipped" as const, reason: "scenes_only" as const });
  }

  if (input.contract.qualityMode === "cheap") {
    // Deterministic builder also validates ledger; safe to forward.
    return buildDeterministicRetentionStoryPlan(input);
  }

  const context = validateRetentionStrategyPlanningInput({
    contract: input.contract,
    grounding: input.grounding,
    manualContext: input.manualContext ?? null,
    userInstructions: input.userInstructions ?? null,
  });

  const baseSeedResult = buildDeterministicRetentionStrategySeed({
    contract: input.contract,
    grounding: input.grounding,
    manualContext: input.manualContext ?? null,
    userInstructions: input.userInstructions ?? null,
  });
  if (baseSeedResult.status === "skipped") {
    return Object.freeze({ status: "skipped" as const, reason: "scenes_only" as const });
  }

  const request = buildRetentionPlannerRequest(baseSeedResult.seed, context);
  const baseDiagnostics = {
    qualityMode: input.contract.qualityMode,
    contractFingerprint: input.contract.contractFingerprint,
  } as const;

  // No planner budget when the callback is unavailable and no call occurs.
  if (typeof input.planner !== "function") {
    return Object.freeze({
      status: "failed" as const,
      reason: "planner_unavailable" as const,
      diagnostics: {
        ...baseDiagnostics,
        plannerAttempts: 0 as const,
        outcome: "planner_unavailable" as const,
      },
    });
  }

  if (input.ledger) {
    input.ledger.consume("planner");
  }

  const outcome = await runRetentionPlannerOnce(request, input.planner);

  if (outcome.status === "call_failed") {
    input.ledger?.recordOutcome("planner", "failed");
    return Object.freeze({
      status: "failed" as const,
      reason: "planner_call_failed" as const,
      diagnostics: {
        ...baseDiagnostics,
        plannerAttempts: 1 as const,
        outcome: "planner_call_failed" as const,
      },
    });
  }
  if (outcome.status === "proposal_invalid") {
    input.ledger?.recordOutcome("planner", "malformed");
    return Object.freeze({
      status: "failed" as const,
      reason: "planner_proposal_invalid" as const,
      diagnostics: {
        ...baseDiagnostics,
        plannerAttempts: 1 as const,
        outcome: "planner_proposal_invalid" as const,
      },
    });
  }
  if (outcome.status === "unavailable") {
    // Guard above should prevent this after consume; close pending honestly.
    input.ledger?.recordOutcome("planner", "failed");
    return Object.freeze({
      status: "failed" as const,
      reason: "planner_unavailable" as const,
      diagnostics: {
        ...baseDiagnostics,
        plannerAttempts: 0 as const,
        outcome: "planner_unavailable" as const,
      },
    });
  }

  try {
    const { seed, beatProposal } = normalizeCompletePlannerProposal(
      outcome.proposal,
      context,
      baseSeedResult.seed,
    );
    const plan = assembleRetentionStoryPlan(seed, context, {
      proposal: beatProposal,
    });
    const asserted = assertRetentionStoryPlanCoherence(plan, {
      context,
      strategySeed: seed,
    });

    input.ledger?.recordOutcome("planner", "succeeded");

    return readyResult(asserted, seed, {
      ...baseDiagnostics,
      plannerAttempts: 1 as const,
      outcome: "planner_enriched" as const,
      planFingerprint: asserted.planFingerprint,
    });
  } catch (error) {
    input.ledger?.recordOutcome("planner", "malformed");
    if (
      isRetentionStoryError(error) &&
      (error.reason === "planner_proposal_invalid" ||
        error.reason === "invalid_strategy_proposal" ||
        error.reason === "invalid_controlling_idea" ||
        error.reason === "strategy_seed_mismatch" ||
        error.reason === "invalid_emotional_arc_blueprint")
    ) {
      return Object.freeze({
        status: "failed" as const,
        reason: "planner_proposal_invalid" as const,
        diagnostics: {
          ...baseDiagnostics,
          plannerAttempts: 1 as const,
          outcome: "planner_proposal_invalid" as const,
          // Bounded machine seam for live diagnosis (no proposal text).
          normalizeFailureReason: error.normalizeSeam ?? error.reason,
        },
      });
    }
    throw error instanceof RetentionStoryError
      ? error
      : new RetentionStoryError(
          "retention_story_plan_mismatch",
          "Retention story plan assembly failed unexpectedly.",
        );
  }
}
