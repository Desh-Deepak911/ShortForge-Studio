/**
 * Canonical Retention Story candidate validator — Sprint 10F / 10F.1.
 * Pure hard gates + editorial scoring. No model calls. No rewrite.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import {
  assertRetentionCreatorContextAuthorityMatchesContract,
  buildRetentionCreatorContextAuthority,
} from "../domain/retention-creator-context-authority";
import { assertRetentionNarrationCandidateCoherence } from "../composition/assert-retention-narration-candidate-coherence";
import { assertRetentionHookBridgeForValidation } from "../rewrite/assert-retention-hook-bridge-for-validation";
import { assertRetentionStoryPlanCoherence } from "../planning/assert-retention-story-plan-coherence";
import { assertRetentionStrategySeedCoherence } from "../strategy/assert-retention-strategy-seed-coherence";
import { validateRetentionStrategyPlanningInput } from "../strategy/validate-strategy-planning-input";
import {
  buildRetentionValidationDiagnostics,
  buildSkippedScenesOnlyDiagnostics,
} from "./build-retention-validation-diagnostics";
import { buildCanonicalRetentionValidationResult } from "./build-canonical-retention-validation-result";
import { RetentionValidationError } from "./retention-validation-errors";
import type {
  RetentionStoryValidationOutcome,
  ValidateRetentionStoryCandidateInput,
} from "./retention-validation.types";

function deepFreezeOutcome(
  outcome: RetentionStoryValidationOutcome,
): RetentionStoryValidationOutcome {
  if (outcome.status === "validated") {
    return Object.freeze({
      ...outcome,
      validation: Object.freeze(outcome.validation),
      diagnostics: Object.freeze(outcome.diagnostics),
    });
  }
  return Object.freeze({
    ...outcome,
    diagnostics: Object.freeze(outcome.diagnostics),
  });
}

function hasFullValidationInput(
  input: ValidateRetentionStoryCandidateInput,
): input is Extract<
  ValidateRetentionStoryCandidateInput,
  { readonly grounding: unknown }
> {
  return (
    "grounding" in input &&
    "strategySeed" in input &&
    "plan" in input &&
    "hookBridge" in input &&
    "candidate" in input
  );
}

/**
 * Validate the final Hook-approved RetentionNarrationCandidate.
 * Checks `contract.generationPath` before reading any non-contract field.
 */
export function validateRetentionStoryCandidate(
  input: ValidateRetentionStoryCandidateInput,
): RetentionStoryValidationOutcome {
  if (input == null || typeof input !== "object") {
    return deepFreezeOutcome({
      status: "failed",
      reason: "validation_input_invalid",
      diagnostics: buildRetentionValidationDiagnostics({
        contractFingerprint: "unknown",
        planFingerprint: null,
        candidateFingerprint: null,
        validation: null,
        failureClass: "hard_gate",
        safeSummary: "validation_input_invalid",
        noteIds: Object.freeze(["validation_input_invalid"]),
        terminalState: "fail",
      }),
    });
  }

  const contract = input.contract;
  if (
    contract == null ||
    typeof contract !== "object" ||
    typeof contract.generationPath !== "string" ||
    typeof contract.contractFingerprint !== "string"
  ) {
    return deepFreezeOutcome({
      status: "failed",
      reason: "validation_input_invalid",
      diagnostics: buildRetentionValidationDiagnostics({
        contractFingerprint: "unknown",
        planFingerprint: null,
        candidateFingerprint: null,
        validation: null,
        failureClass: "hard_gate",
        safeSummary: "validation_input_invalid",
        noteIds: Object.freeze(["validation_input_invalid"]),
        terminalState: "fail",
      }),
    });
  }

  // Scenes-only: contract alone. Do not read grounding/seed/plan/bridge/candidate.
  if (contract.generationPath === "scenes_only") {
    return deepFreezeOutcome({
      status: "skipped",
      reason: "scenes_only",
      diagnostics: buildSkippedScenesOnlyDiagnostics({
        contractFingerprint: contract.contractFingerprint,
      }),
    });
  }

  if (!hasFullValidationInput(input)) {
    return deepFreezeOutcome({
      status: "failed",
      reason: "validation_input_invalid",
      diagnostics: buildRetentionValidationDiagnostics({
        contractFingerprint: contract.contractFingerprint,
        planFingerprint: null,
        candidateFingerprint: null,
        validation: null,
        failureClass: "hard_gate",
        safeSummary: "validation_input_invalid",
        noteIds: Object.freeze(["hook_capable_input_incomplete"]),
        terminalState: "fail",
      }),
    });
  }

  try {
    const creatorAuthority = assertRetentionCreatorContextAuthorityMatchesContract(
      "creatorContextAuthority" in input
        ? (input.creatorContextAuthority ??
          buildRetentionCreatorContextAuthority({}))
        : buildRetentionCreatorContextAuthority({}),
      input.contract,
    );
    const planningContext = validateRetentionStrategyPlanningInput({
      contract: input.contract,
      grounding: input.grounding,
      manualContext: creatorAuthority.manualContext || null,
      userInstructions: creatorAuthority.userInstructions || null,
    });
    const strategySeed = assertRetentionStrategySeedCoherence(
      input.strategySeed,
      planningContext,
    );
    const plan = assertRetentionStoryPlanCoherence(input.plan, {
      context: planningContext,
      strategySeed,
    });
    const candidate = assertRetentionNarrationCandidateCoherence(
      input.candidate,
      {
        plan,
        grounding: planningContext.grounding,
        strategySeed,
      },
    );

    let hookBridge;
    try {
      hookBridge = assertRetentionHookBridgeForValidation(input.hookBridge, {
        contract: planningContext.contract,
        grounding: planningContext.grounding,
        strategySeed,
        plan,
        candidate,
      });
    } catch (err) {
      if (
        err instanceof RetentionValidationError &&
        err.reason === "hook_bridge_coherence_mismatch"
      ) {
        return deepFreezeOutcome({
          status: "failed",
          reason: "hook_bridge_not_approved",
          diagnostics: buildRetentionValidationDiagnostics({
            contractFingerprint: planningContext.contract.contractFingerprint,
            planFingerprint: plan.planFingerprint,
            candidateFingerprint: candidate.candidateFingerprint,
            validation: null,
            failureClass: "hard_gate",
            safeSummary: "hook_bridge_not_approved",
            noteIds: Object.freeze(["hook_bridge_not_approved"]),
            terminalState: "fail",
          }),
        });
      }
      throw err;
    }

    const validation = buildCanonicalRetentionValidationResult({
      contract: planningContext.contract,
      grounding: planningContext.grounding,
      strategySeed,
      plan,
      candidate,
      hookBridge,
    });

    const rewriteUsed =
      hookBridge.diagnostics.budget.counts.retention_body_rewrite === 1;

    return deepFreezeOutcome({
      status: "validated",
      validation,
      diagnostics: buildRetentionValidationDiagnostics({
        contractFingerprint: planningContext.contract.contractFingerprint,
        planFingerprint: plan.planFingerprint,
        candidateFingerprint: candidate.candidateFingerprint,
        validation,
        failureClass: validation.failureClass,
        safeSummary: validation.ok
          ? rewriteUsed
            ? "validation_pass_after_rewrite"
            : "validation_pass"
          : validation.failureClass === "quality_threshold"
            ? "quality_threshold_miss"
            : "hard_gate_failure",
        noteIds: Object.freeze([...validation.notes]),
        terminalState: validation.ok
          ? rewriteUsed
            ? "pass_after_rewrite"
            : "pass"
          : "fail",
        rewriteUsed,
      }),
    });
  } catch (err) {
    if (
      err instanceof RetentionStoryError &&
      (err.reason === "creator_context_identity_mismatch" ||
        err.reason === "grounding_summary_mismatch" ||
        err.reason === "grounding_identity_mismatch")
    ) {
      return deepFreezeOutcome({
        status: "failed",
        reason: err.reason,
        diagnostics: buildRetentionValidationDiagnostics({
          contractFingerprint: contract.contractFingerprint,
          planFingerprint: null,
          candidateFingerprint: null,
          validation: null,
          failureClass: "hard_gate",
          safeSummary: err.reason,
          noteIds: Object.freeze([err.reason]),
          terminalState: "fail",
        }),
      });
    }
    const reason =
      err instanceof RetentionStoryError &&
      (err.reason === "strategy_seed_mismatch" ||
        err.reason === "retention_story_plan_mismatch" ||
        err.reason === "candidate_fingerprint_mismatch" ||
        err.reason === "composer_grounding_invalid" ||
        err.reason === "strategy_input_mismatch")
        ? "validation_authority_mismatch"
        : "validation_input_invalid";
    return deepFreezeOutcome({
      status: "failed",
      reason,
      diagnostics: buildRetentionValidationDiagnostics({
        contractFingerprint: contract.contractFingerprint,
        planFingerprint: null,
        candidateFingerprint: null,
        validation: null,
        failureClass: "hard_gate",
        safeSummary: reason,
        noteIds: Object.freeze([reason]),
        terminalState: "fail",
      }),
    });
  }
}
