/**
 * Retention terminal validation + optional Studio body rewrite — Sprint 10F.2 / 10F.2A.
 * Does not commit narration, start VO/scenes, activate routes, or persist.
 *
 * Terminal Hook authority is read only from the ready Hook bridge.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import {
  assertRetentionLedgerMatchesContract,
  type RetentionModelCallLedger,
} from "../budget/create-retention-model-call-ledger";
import { assertRetentionModelCallLedgerSnapshotCoherence } from "../budget/assert-retention-model-call-ledger-snapshot-coherence";
import { assertRetentionHookBridgeReadyCoherence } from "../integration/assert-retention-hook-bridge-ready-coherence";
import type { RetentionHookBridgeReadyResult } from "../integration/assert-retention-hook-bridge-ready-coherence";
import { assertRetentionValidationResultCoherence } from "../validation/assert-retention-validation-result-coherence";
import {
  buildRetentionCreatorContextAuthority,
} from "../domain/retention-creator-context-authority";
import { validateRetentionStoryCandidate } from "../validation/validate-retention-story-candidate";
import type { RetentionValidationResult } from "../validation/retention-validation.types";
import { buildRetentionSafeValidationFailureSummary } from "../validation/build-retention-safe-validation-failure-summary";
import { assertRetentionHookBridgePostRewriteCoherence } from "./assert-retention-hook-bridge-post-rewrite-coherence";
import { buildRetentionRewriteDiagnostics } from "./build-retention-rewrite-diagnostics";
import { runRetentionBodyRewrite } from "./run-retention-body-rewrite";
import type {
  RetentionTerminalScenesOnlyInput,
  RetentionTerminalScriptPathInput,
  RetentionTerminalValidationResult,
  RunRetentionTerminalValidationInput,
} from "./retention-rewrite.types";

function deepFreezeResult(
  result: RetentionTerminalValidationResult,
): RetentionTerminalValidationResult {
  return Object.freeze(result);
}

function isScenesOnlyInput(
  input: RunRetentionTerminalValidationInput,
): input is RetentionTerminalScenesOnlyInput {
  return input.kind === "scenes_only";
}

function isScriptPathInput(
  input: RunRetentionTerminalValidationInput,
): input is RetentionTerminalScriptPathInput {
  return input.kind !== "scenes_only";
}

/**
 * Scenes-only terminal skip — ledger authority only.
 * Does not read plan, seed, candidate, Hook bridge, or model callbacks.
 */
function runScenesOnlyTerminalSkip(
  input: RetentionTerminalScenesOnlyInput,
): RetentionTerminalValidationResult {
  if (input.contract.generationPath !== "scenes_only") {
    return deepFreezeResult({
      status: "ledger_invalid",
      diagnostics: buildRetentionRewriteDiagnostics({
        terminalState: "ledger_invalid",
        qualityMode: "scenes_only",
        contractFingerprint: input.contract.contractFingerprint,
        safeReasonIds: Object.freeze(["scenes_only_contract_mismatch"]),
      }),
    });
  }

  try {
    assertRetentionLedgerMatchesContract(input.ledger, input.contract);
    assertRetentionModelCallLedgerSnapshotCoherence(
      input.ledger.snapshot(),
      "scenes_only",
      { requireClosed: true },
    );
  } catch {
    return deepFreezeResult({
      status: "ledger_invalid",
      diagnostics: buildRetentionRewriteDiagnostics({
        terminalState: "ledger_invalid",
        qualityMode: "scenes_only",
        contractFingerprint: input.contract.contractFingerprint,
        budget: safeLedgerSnapshot(input.ledger),
        safeReasonIds: Object.freeze(["scenes_only_ledger_invalid"]),
      }),
    });
  }

  const snap = input.ledger.snapshot();
  if (snap.qualityMode !== "scenes_only") {
    return deepFreezeResult({
      status: "ledger_invalid",
      diagnostics: buildRetentionRewriteDiagnostics({
        terminalState: "ledger_invalid",
        qualityMode: snap.qualityMode,
        contractFingerprint: input.contract.contractFingerprint,
        budget: snap,
        safeReasonIds: Object.freeze(["scenes_only_ledger_invalid"]),
      }),
    });
  }
  if (
    snap.policy.totalCeiling !== 0 ||
    snap.counts.total !== 0 ||
    snap.events.length !== 0
  ) {
    return deepFreezeResult({
      status: "ledger_invalid",
      diagnostics: buildRetentionRewriteDiagnostics({
        terminalState: "ledger_invalid",
        qualityMode: "scenes_only",
        contractFingerprint: input.contract.contractFingerprint,
        budget: snap,
        safeReasonIds: Object.freeze(["scenes_only_nonzero_ledger"]),
      }),
    });
  }

  return deepFreezeResult({
    status: "skipped_scenes_only",
    diagnostics: buildRetentionRewriteDiagnostics({
      terminalState: "skipped_scenes_only",
      qualityMode: "scenes_only",
      contractFingerprint: input.contract.contractFingerprint,
      budget: snap,
      safeReasonIds: Object.freeze(["scenes_only"]),
    }),
  });
}

function safeLedgerSnapshot(ledger: RetentionModelCallLedger) {
  try {
    return ledger.snapshot();
  } catch {
    return null;
  }
}

function failResult(
  status: Exclude<
    RetentionTerminalValidationResult["status"],
    "pass_without_rewrite" | "pass_after_rewrite" | "skipped_scenes_only"
  >,
  input: RetentionTerminalScriptPathInput,
  safeReasonIds: readonly string[],
  extras: {
    readonly planFingerprint?: string | null;
    readonly initialCandidateFingerprint?: string | null;
    readonly finalCandidateFingerprint?: string | null;
    readonly initialValidationFingerprint?: string | null;
    readonly finalValidationFingerprint?: string | null;
    readonly rewriteUsed?: boolean;
    readonly lengthCompressionUsed?: boolean;
    readonly deterministicTruncateUsed?: boolean;
    readonly validation?: RetentionValidationResult | null;
  } = {},
): RetentionTerminalValidationResult {
  const validationFailureSummary =
    extras.validation != null
      ? buildRetentionSafeValidationFailureSummary(extras.validation)
      : null;
  return deepFreezeResult({
    status,
    diagnostics: buildRetentionRewriteDiagnostics({
      terminalState: status,
      qualityMode:
        input.contract.generationPath === "scenes_only"
          ? "scenes_only"
          : input.contract.qualityMode,
      contractFingerprint: input.contract.contractFingerprint,
      planFingerprint: extras.planFingerprint ?? input.plan.planFingerprint,
      initialCandidateFingerprint: extras.initialCandidateFingerprint ?? null,
      finalCandidateFingerprint: extras.finalCandidateFingerprint ?? null,
      initialValidationFingerprint: extras.initialValidationFingerprint ?? null,
      finalValidationFingerprint: extras.finalValidationFingerprint ?? null,
      rewriteUsed: extras.rewriteUsed,
      lengthCompressionUsed: extras.lengthCompressionUsed,
      deterministicTruncateUsed: extras.deterministicTruncateUsed,
      budget: input.ledger.snapshot(),
      safeReasonIds,
      ...(validationFailureSummary
        ? { validationFailureSummary }
        : {}),
    }),
  });
}

function isRewriteEligible(input: {
  readonly contract: RetentionTerminalScriptPathInput["contract"];
  readonly initialValidation: RetentionValidationResult;
  readonly ledger: RetentionTerminalScriptPathInput["ledger"];
}): boolean {
  if (input.contract.generationPath === "scenes_only") return false;
  if (input.contract.qualityMode !== "best") return false;
  // 10H.3: quality_threshold is advisory (ok:true) but Studio may still rewrite.
  if (input.initialValidation.failureClass !== "quality_threshold") return false;
  if (!input.initialValidation.hardGates.every((g) => g.passed)) return false;
  return input.ledger.canConsume("retention_body_rewrite");
}

function buildPostRewriteHookBridge(input: {
  readonly title: string;
  readonly candidate: import("../composition/retention-narration-candidate.types").RetentionNarrationCandidate;
  readonly planFingerprint: string;
  readonly budget: ReturnType<
    RetentionTerminalScriptPathInput["ledger"]["snapshot"]
  >;
  readonly hookPlanSnapshot: RetentionHookBridgeReadyResult["hookPlanSnapshot"];
  readonly hookDiagnostics: RetentionHookBridgeReadyResult["hookDiagnostics"];
  readonly lengthWarning?: string;
  readonly terminalHookAuthority: RetentionHookBridgeReadyResult["terminalHookAuthority"];
  readonly postRewriteHookEvidence: NonNullable<
    RetentionHookBridgeReadyResult["postRewriteHookEvidence"]
  >;
}): RetentionHookBridgeReadyResult {
  const budget = input.budget;
  const composerAttempts =
    budget.counts.initial_narration +
    budget.counts.length_compression +
    budget.counts.hook_repair +
    budget.counts.hook_fallback;
  const hasDeterministicRescue = budget.events.some(
    (e) =>
      e.category === "initial_narration" &&
      e.outcome === "skipped_deterministic",
  );
  return Object.freeze({
    status: "ready" as const,
    title: input.title,
    approvedNarration: input.candidate.assembledNarration,
    candidate: input.candidate,
    diagnostics: Object.freeze({
      qualityMode: "best",
      plannerAttempts: budget.counts.planner,
      composerAttempts,
      hookAdapterRan: true,
      budget,
      outcome: "hook_approved" as const,
      planFingerprint: input.planFingerprint,
      candidateFingerprint: input.candidate.candidateFingerprint,
      compositionAuthority: hasDeterministicRescue
        ? ("deterministic_rescue" as const)
        : ("model_initial" as const),
    }),
    hookPlanSnapshot: input.hookPlanSnapshot,
    hookDiagnostics: input.hookDiagnostics,
    ...(input.lengthWarning ? { lengthWarning: input.lengthWarning } : {}),
    terminalHookAuthority: input.terminalHookAuthority,
    postRewriteHookEvidence: input.postRewriteHookEvidence,
  });
}

/**
 * Terminal Retention validation with optional Studio body rewrite.
 */
export async function runRetentionTerminalValidation(
  input: RunRetentionTerminalValidationInput,
): Promise<RetentionTerminalValidationResult> {
  if (isScenesOnlyInput(input)) {
    return runScenesOnlyTerminalSkip(input);
  }

  if (!isScriptPathInput(input)) {
    return deepFreezeResult({
      status: "ledger_invalid",
      diagnostics: buildRetentionRewriteDiagnostics({
        terminalState: "ledger_invalid",
        qualityMode: "unknown",
        contractFingerprint: "",
        safeReasonIds: Object.freeze(["terminal_input_invalid"]),
      }),
    });
  }

  // Legacy scenes_only via script-path shape without plan/bridge reads is rejected;
  // callers must use the discriminated scenes-only input.
  if (input.contract.generationPath === "scenes_only") {
    return failResult("ledger_invalid", input, [
      "scenes_only_requires_discriminated_input",
    ]);
  }

  let readyBridge: RetentionHookBridgeReadyResult;
  try {
    readyBridge = assertRetentionHookBridgeReadyCoherence(input.hookBridge, {
      contract: input.contract,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      plan: input.plan,
      candidate: input.candidate,
    });
  } catch {
    return failResult("rewrite_not_allowed", input, ["hook_bridge_not_ready"], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
    });
  }

  const creatorContextAuthority =
    input.creatorContextAuthority ??
    buildRetentionCreatorContextAuthority({
      manualContext: input.manualContext,
      userInstructions: input.userInstructions,
    });

  const initialOutcome = validateRetentionStoryCandidate({
    contract: input.contract,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    plan: input.plan,
    hookBridge: readyBridge,
    candidate: input.candidate,
    creatorContextAuthority,
  });

  if (initialOutcome.status !== "validated") {
    return failResult("rewrite_not_allowed", input, [initialOutcome.reason], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
    });
  }

  let initialValidation: RetentionValidationResult;
  try {
    initialValidation = assertRetentionValidationResultCoherence({
      result: initialOutcome.validation,
      contract: input.contract,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      plan: input.plan,
      hookBridge: readyBridge,
      candidate: input.candidate,
      creatorContextAuthority,
    });
  } catch {
    return failResult("rewrite_not_allowed", input, [
      "initial_validation_incoherent",
    ], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
    });
  }

  // Optimal pass — all hard gates + readiness target met.
  if (
    initialValidation.ok === true &&
    initialValidation.failureClass === "none"
  ) {
    return deepFreezeResult({
      status: "pass_without_rewrite",
      candidate: input.candidate,
      validation: initialValidation,
      hookBridge: readyBridge,
      diagnostics: buildRetentionRewriteDiagnostics({
        terminalState: "pass_without_rewrite",
        qualityMode: input.contract.qualityMode,
        contractFingerprint: input.contract.contractFingerprint,
        planFingerprint: input.plan.planFingerprint,
        initialCandidateFingerprint: input.candidate.candidateFingerprint,
        finalCandidateFingerprint: input.candidate.candidateFingerprint,
        initialValidationFingerprint: initialValidation.validationFingerprint,
        finalValidationFingerprint: initialValidation.validationFingerprint,
        rewriteUsed: false,
        budget: readyBridge.diagnostics.budget,
        safeReasonIds: Object.freeze(["pass_without_rewrite"]),
      }),
    });
  }

  const rewriteEligible = isRewriteEligible({
    contract: input.contract,
    initialValidation,
    ledger: input.ledger,
  });

  if (
    !rewriteEligible &&
    initialValidation.ok === true &&
    initialValidation.failureClass === "quality_threshold"
  ) {
    // 10H.3 — structurally complete but below editorial target: succeed with warning.
    return deepFreezeResult({
      status: "pass_without_rewrite",
      candidate: input.candidate,
      validation: initialValidation,
      hookBridge: readyBridge,
      diagnostics: buildRetentionRewriteDiagnostics({
        terminalState: "pass_without_rewrite",
        qualityMode: input.contract.qualityMode,
        contractFingerprint: input.contract.contractFingerprint,
        planFingerprint: input.plan.planFingerprint,
        initialCandidateFingerprint: input.candidate.candidateFingerprint,
        finalCandidateFingerprint: input.candidate.candidateFingerprint,
        initialValidationFingerprint: initialValidation.validationFingerprint,
        finalValidationFingerprint: initialValidation.validationFingerprint,
        rewriteUsed: false,
        budget: readyBridge.diagnostics.budget,
        safeReasonIds: Object.freeze([
          "pass_without_rewrite",
          "quality_below_target",
        ]),
      }),
    });
  }

  if (!rewriteEligible) {
    // Hard-gate failures remain blocking at this stage (reliability rescue upstream).
    const reason =
      initialValidation.failureClass === "hard_gate"
        ? "hard_gate_failure"
        : input.contract.qualityMode !== "best"
          ? "quality_mode_not_studio"
          : !input.ledger.canConsume("retention_body_rewrite")
            ? "rewrite_budget_unavailable"
            : "rewrite_not_allowed";
    return failResult("rewrite_not_allowed", input, [reason], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
      initialValidationFingerprint: initialValidation.validationFingerprint,
      validation: initialValidation,
    });
  }

  // Prevent second rewrite: budget already consumed before this call.
  if (input.ledger.snapshot().counts.retention_body_rewrite > 0) {
    return failResult("rewrite_not_allowed", input, ["rewrite_already_used"], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
      initialValidationFingerprint: initialValidation.validationFingerprint,
    });
  }

  const rewriteRun = await runRetentionBodyRewrite({
    contract: input.contract,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    plan: input.plan,
    hookBridge: readyBridge,
    candidate: input.candidate,
    initialValidation,
    ledger: input.ledger,
    rewriteComposer: input.rewriteComposer,
    lengthComposer: input.lengthComposer,
    manualContext: input.manualContext,
    userInstructions: input.userInstructions,
  });

  if (rewriteRun.status !== "rewritten") {
    return failResult(rewriteRun.status, input, [rewriteRun.status], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
      initialValidationFingerprint: initialValidation.validationFingerprint,
      rewriteUsed: input.ledger.snapshot().counts.retention_body_rewrite > 0,
    });
  }

  const postBridge = buildPostRewriteHookBridge({
    title: rewriteRun.title,
    candidate: rewriteRun.candidate,
    planFingerprint: input.plan.planFingerprint,
    budget: rewriteRun.budget,
    hookPlanSnapshot: readyBridge.hookPlanSnapshot,
    hookDiagnostics: readyBridge.hookDiagnostics,
    ...(readyBridge.lengthWarning
      ? { lengthWarning: readyBridge.lengthWarning }
      : {}),
    terminalHookAuthority: rewriteRun.terminalHookAuthority,
    postRewriteHookEvidence: rewriteRun.postRewriteHookEvidence,
  });

  let assertedPostBridge: RetentionHookBridgeReadyResult;
  try {
    assertedPostBridge = assertRetentionHookBridgePostRewriteCoherence(
      postBridge,
      {
        contract: input.contract,
        grounding: input.grounding,
        strategySeed: input.strategySeed,
        plan: input.plan,
        candidate: rewriteRun.candidate,
      },
    );
  } catch {
    return failResult("ledger_invalid", input, ["post_rewrite_bridge_invalid"], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
      finalCandidateFingerprint: rewriteRun.candidate.candidateFingerprint,
      initialValidationFingerprint: initialValidation.validationFingerprint,
      rewriteUsed: true,
      lengthCompressionUsed: rewriteRun.lengthCompressionUsed,
      deterministicTruncateUsed: rewriteRun.deterministicTruncateUsed,
    });
  }

  // Final Retention validation — only the rebuilt candidate.
  const finalOutcome = validateRetentionStoryCandidate({
    contract: input.contract,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    plan: input.plan,
    hookBridge: assertedPostBridge,
    candidate: rewriteRun.candidate,
    creatorContextAuthority,
  });

  if (finalOutcome.status !== "validated" || !finalOutcome.validation.ok) {
    return failResult(
      "post_rewrite_retention_failed",
      input,
      [
        finalOutcome.status === "validated"
          ? finalOutcome.validation.failureClass
          : finalOutcome.reason,
      ],
      {
        planFingerprint: input.plan.planFingerprint,
        initialCandidateFingerprint: input.candidate.candidateFingerprint,
        finalCandidateFingerprint: rewriteRun.candidate.candidateFingerprint,
        initialValidationFingerprint: initialValidation.validationFingerprint,
        finalValidationFingerprint:
          finalOutcome.status === "validated"
            ? finalOutcome.validation.validationFingerprint
            : null,
        rewriteUsed: true,
        lengthCompressionUsed: rewriteRun.lengthCompressionUsed,
        deterministicTruncateUsed: rewriteRun.deterministicTruncateUsed,
        validation:
          finalOutcome.status === "validated"
            ? finalOutcome.validation
            : null,
      },
    );
  }

  let finalValidation: RetentionValidationResult;
  try {
    finalValidation = assertRetentionValidationResultCoherence({
      result: finalOutcome.validation,
      contract: input.contract,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      plan: input.plan,
      hookBridge: assertedPostBridge,
      candidate: rewriteRun.candidate,
      creatorContextAuthority,
    });
  } catch (error) {
    void error;
    return failResult("post_rewrite_retention_failed", input, [
      "final_validation_incoherent",
    ], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
      finalCandidateFingerprint: rewriteRun.candidate.candidateFingerprint,
      initialValidationFingerprint: initialValidation.validationFingerprint,
      rewriteUsed: true,
    });
  }

  // 10H.3 — quality_threshold after rewrite is still a structural Pass (advisory).
  if (
    !finalValidation.ok ||
    finalValidation.failureClass === "hard_gate"
  ) {
    return failResult("post_rewrite_retention_failed", input, [
      "final_quality_failure",
    ], {
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
      finalCandidateFingerprint: rewriteRun.candidate.candidateFingerprint,
      initialValidationFingerprint: initialValidation.validationFingerprint,
      finalValidationFingerprint: finalValidation.validationFingerprint,
      rewriteUsed: true,
    });
  }

  if (
    finalValidation.candidateFingerprint !==
    rewriteRun.candidate.candidateFingerprint
  ) {
    throw new RetentionStoryError(
      "candidate_fingerprint_mismatch",
      "Final validation candidate fingerprint mismatch.",
    );
  }

  return deepFreezeResult({
    status: "pass_after_rewrite",
    candidate: rewriteRun.candidate,
    validation: finalValidation,
    hookBridge: assertedPostBridge,
    diagnostics: buildRetentionRewriteDiagnostics({
      terminalState: "pass_after_rewrite",
      qualityMode: "best",
      contractFingerprint: input.contract.contractFingerprint,
      planFingerprint: input.plan.planFingerprint,
      initialCandidateFingerprint: input.candidate.candidateFingerprint,
      finalCandidateFingerprint: rewriteRun.candidate.candidateFingerprint,
      initialValidationFingerprint: initialValidation.validationFingerprint,
      finalValidationFingerprint: finalValidation.validationFingerprint,
      rewriteUsed: true,
      lengthCompressionUsed: rewriteRun.lengthCompressionUsed,
      deterministicTruncateUsed: rewriteRun.deterministicTruncateUsed,
      budget: assertedPostBridge.diagnostics.budget,
      safeReasonIds: Object.freeze(["pass_after_rewrite"]),
    }),
  });
}
