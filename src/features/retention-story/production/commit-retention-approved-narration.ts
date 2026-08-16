/**
 * Final Retention commit gate — Sprint 10F.3 / 10F.3A.
 * Accepts only canonical terminal Pass results. Returns a detached, deeply
 * frozen approved narration. No public boolean bypass.
 */

import { validateRetentionCompressionWordPolicy } from "../validation/validate-retention-compression";
import { assertRetentionNarrationCandidateCoherence } from "../composition/assert-retention-narration-candidate-coherence";
import { assertRetentionHookBridgeReadyCoherence } from "../integration/assert-retention-hook-bridge-ready-coherence";
import type { RetentionHookBridgeReadyResult } from "../integration/assert-retention-hook-bridge-ready-coherence";
import { assertRetentionSafeHookEnvelopeCoherence } from "../integration/assert-retention-safe-hook-envelope-coherence";
import { assertRetentionHookBridgePostRewriteCoherence } from "../rewrite/assert-retention-hook-bridge-post-rewrite-coherence";
import { assertRetentionValidationResultCoherence } from "../validation/assert-retention-validation-result-coherence";
import type { RetentionTerminalValidationResult } from "../rewrite/retention-rewrite.types";
import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import { RetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionCreatorContextAuthority } from "../domain/retention-creator-context-authority";
import { buildRetentionStoryPlanSnapshot } from "./build-retention-plan-snapshot";
import { buildRetentionValidationSummary } from "./build-retention-validation-summary";
import { assertCommitGateLedgerAuthority } from "./assert-commit-gate-ledger-authority";
import {
  summarizeLedgerBudget,
  type RetentionApprovedNarrationResult,
  type RetentionProductionSafeDiagnostics,
} from "./retention-production.types";

function deepFreezeDetached<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const copy = value.map((item) => deepFreezeDetached(item));
    return Object.freeze(copy) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = deepFreezeDetached(child);
  }
  return Object.freeze(out) as T;
}

export interface CommitRetentionApprovedNarrationInput {
  readonly terminal: RetentionTerminalValidationResult;
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly plan: RetentionStoryPlan;
  readonly ledger: RetentionModelCallLedger;
  readonly title: string;
  readonly lengthWarning?: string;
  readonly generationDisposition?: import("./retention-generation-disposition.types").RetentionGenerationDispositionSummary;
  /** Optional warning-note override for truthful fallback / substance reporting. */
  readonly validationWarningNotesOverride?: readonly string[];
  /** Safe acceptance/rejection provenance for diagnostics. */
  readonly acceptanceTrace?: import("./retention-generation-acceptance-trace.types").RetentionGenerationAcceptanceTrace;
  /** Sprint 10H.4A — same ephemeral authority used for planning/validation. */
  readonly creatorContextAuthority?: RetentionCreatorContextAuthority | null;
}

export type CommitRetentionApprovedNarrationResult =
  | { readonly ok: true; readonly approved: RetentionApprovedNarrationResult }
  | {
      readonly ok: false;
      readonly reason: "commit_gate_coherence_failure" | "terminal_not_pass";
      readonly safeReasonIds: readonly string[];
    };

/**
 * Commit gate — only pass_without_rewrite / pass_after_rewrite may commit.
 */
export function commitRetentionApprovedNarration(
  input: CommitRetentionApprovedNarrationInput,
): CommitRetentionApprovedNarrationResult {
  const { terminal, contract, grounding, strategySeed, plan, ledger } = input;

  if (
    terminal.status !== "pass_without_rewrite" &&
    terminal.status !== "pass_after_rewrite"
  ) {
    return Object.freeze({
      ok: false as const,
      reason: "terminal_not_pass" as const,
      safeReasonIds: Object.freeze([terminal.status]),
    });
  }

  try {
    const bridgeContext = {
      contract,
      grounding,
      strategySeed,
      plan,
      candidate: terminal.candidate,
    };
    const readyBridge: RetentionHookBridgeReadyResult =
      terminal.status === "pass_after_rewrite"
        ? assertRetentionHookBridgePostRewriteCoherence(
            terminal.hookBridge,
            bridgeContext,
          )
        : assertRetentionHookBridgeReadyCoherence(
            terminal.hookBridge,
            bridgeContext,
          );

    const candidate = assertRetentionNarrationCandidateCoherence(
      terminal.candidate,
      {
        plan,
        grounding,
        strategySeed,
      },
    );

    const validation = assertRetentionValidationResultCoherence({
      result: terminal.validation,
      contract,
      grounding,
      strategySeed,
      plan,
      hookBridge: readyBridge,
      candidate,
      creatorContextAuthority: input.creatorContextAuthority,
    });

    if (validation.ok !== true) {
      return Object.freeze({
        ok: false as const,
        reason: "commit_gate_coherence_failure" as const,
        safeReasonIds: Object.freeze(["validation_not_ok"]),
      });
    }

    if (
      candidate.candidateFingerprint !== validation.candidateFingerprint ||
      candidate.candidateFingerprint !==
        terminal.diagnostics.finalCandidateFingerprint ||
      validation.validationFingerprint !==
        terminal.diagnostics.finalValidationFingerprint
    ) {
      return Object.freeze({
        ok: false as const,
        reason: "commit_gate_coherence_failure" as const,
        safeReasonIds: Object.freeze(["fingerprint_mismatch"]),
      });
    }

    const approvedNarration = readyBridge.approvedNarration;
    if (approvedNarration !== candidate.assembledNarration) {
      return Object.freeze({
        ok: false as const,
        reason: "commit_gate_coherence_failure" as const,
        safeReasonIds: Object.freeze(["approved_narration_mismatch"]),
      });
    }

    const wordPolicy = validateRetentionCompressionWordPolicy({
      contract,
      plan,
      candidate,
    });
    if (!wordPolicy.passed) {
      return Object.freeze({
        ok: false as const,
        reason: "commit_gate_coherence_failure" as const,
        safeReasonIds: Object.freeze(["word_budget_violation"]),
      });
    }

    if (
      contract.generationPath !== "script_only" &&
      contract.generationPath !== "audio_first_full"
    ) {
      return Object.freeze({
        ok: false as const,
        reason: "commit_gate_coherence_failure" as const,
        safeReasonIds: Object.freeze(["invalid_generation_path"]),
      });
    }

    let ledgerSnap;
    try {
      ledgerSnap = assertCommitGateLedgerAuthority({
        liveLedger: ledger,
        terminalBudget: terminal.diagnostics.budget,
        bridgeBudget: readyBridge.diagnostics.budget,
        qualityMode: contract.qualityMode,
        terminalState: terminal.status,
      });
    } catch (error) {
      const reasonId =
        error instanceof RetentionStoryError
          ? error.message &&
            /^[a-z][a-z0-9_]*$/.test(error.message)
            ? error.message
            : error.reason
          : "ledger_authority_failure";
      return Object.freeze({
        ok: false as const,
        reason: "commit_gate_coherence_failure" as const,
        safeReasonIds: Object.freeze([reasonId]),
      });
    }

    let safeHook;
    try {
      safeHook = assertRetentionSafeHookEnvelopeCoherence({
        hookPlanSnapshot: readyBridge.hookPlanSnapshot,
        hookDiagnostics: readyBridge.hookDiagnostics,
        terminalHookAuthority: readyBridge.terminalHookAuthority,
        generationPath: contract.generationPath,
      });
    } catch {
      return Object.freeze({
        ok: false as const,
        reason: "commit_gate_coherence_failure" as const,
        safeReasonIds: Object.freeze(["safe_hook_envelope_mismatch"]),
      });
    }

    const planSnapshot = buildRetentionStoryPlanSnapshot({ contract, plan });
    const validationSummary = buildRetentionValidationSummary(validation, {
      contractFingerprint: contract.contractFingerprint,
      planFingerprint: plan.planFingerprint,
      terminalState: terminal.status,
    }, {
      ...(input.validationWarningNotesOverride
        ? { warningNotesOverride: input.validationWarningNotesOverride }
        : {}),
    });

    const safeDiagnostics: RetentionProductionSafeDiagnostics = Object.freeze({
      version: 1 as const,
      terminalState: terminal.status,
      qualityMode: contract.qualityMode,
      contractFingerprint: contract.contractFingerprint,
      planFingerprint: plan.planFingerprint,
      candidateFingerprint: candidate.candidateFingerprint,
      validationFingerprint: validation.validationFingerprint,
      rewriteUsed: terminal.status === "pass_after_rewrite",
      safeReasonIds: Object.freeze([...terminal.diagnostics.safeReasonIds]),
      budget: summarizeLedgerBudget(ledgerSnap),
      ...(input.acceptanceTrace
        ? { acceptanceTrace: input.acceptanceTrace }
        : {}),
    });

    const approved: RetentionApprovedNarrationResult = deepFreezeDetached({
      title: input.title.trim() || readyBridge.title,
      narration: approvedNarration,
      planSnapshot,
      validationSummary,
      hookPlan: safeHook.hookPlanSnapshot,
      hookDiagnostics: safeHook.hookDiagnostics,
      ...(input.lengthWarning ? { lengthWarning: input.lengthWarning } : {}),
      ...(input.generationDisposition
        ? { generationDisposition: input.generationDisposition }
        : {}),
      contractFingerprint: contract.contractFingerprint,
      planFingerprint: plan.planFingerprint,
      candidateFingerprint: candidate.candidateFingerprint,
      validationFingerprint: validation.validationFingerprint,
      terminalState: terminal.status,
      qualityMode: contract.qualityMode,
      generationPath: contract.generationPath,
      safeDiagnostics,
    });

    return Object.freeze({ ok: true as const, approved });
  } catch (error) {
    const reasonId =
      error instanceof RetentionStoryError
        ? error.reason
        : "commit_gate_exception";
    return Object.freeze({
      ok: false as const,
      reason: "commit_gate_coherence_failure" as const,
      safeReasonIds: Object.freeze([reasonId]),
    });
  }
}
