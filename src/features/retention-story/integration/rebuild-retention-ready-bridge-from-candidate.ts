/**
 * Rebuild a ready Hook bridge from an already-composed candidate — Sprint 10H.4B.
 * Zero model calls. Zero ledger consume. Used after participant-coverage reconcile.
 */

import { buildHookPlanSnapshot } from "@/features/hook-engine";
import type { HookGenerationContext } from "@/features/hook-engine/integration/build-hook-generation-context";
import { buildHookCandidate } from "@/features/hook-engine/validation/build-hook-candidate";
import { buildHookDiagnostics } from "@/features/hook-engine/validation/build-hook-diagnostics";
import { buildHookSelection } from "@/features/hook-engine/validation/build-hook-selection";
import { extractOpeningSpan } from "@/features/hook-engine/validation/extract-opening-span";
import { validateHookCandidate } from "@/features/hook-engine/validation/validate-hook-candidate";

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import { reconcileRetentionCandidateAfterHook } from "../composition/reconcile-retention-candidate-after-hook";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { assertRetentionTerminalHookAuthorityCoherence } from "../rewrite/assert-retention-terminal-hook-authority-coherence";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type {
  RetentionCompositionAuthority,
  RetentionHookBridgeResult,
} from "./retention-hook-bridge.types";

function baseFailed(
  contract: NormalizedStoryContract,
  ledger: RetentionModelCallLedger,
  plan: RetentionStoryPlan,
  reason: "hook_terminal_failure" | "candidate_reconciliation_failed",
): Extract<RetentionHookBridgeResult, { status: "failed" }> {
  const budget = ledger.snapshot();
  return Object.freeze({
    status: "failed" as const,
    reason,
    diagnostics: Object.freeze({
      qualityMode: contract.qualityMode,
      plannerAttempts: budget.counts.planner,
      composerAttempts:
        budget.counts.initial_narration +
        budget.counts.length_compression +
        budget.counts.hook_repair +
        budget.counts.hook_fallback,
      hookAdapterRan: true,
      budget,
      outcome: "failed" as const,
      planFingerprint: plan.planFingerprint,
      compositionAuthority: "model_initial" as RetentionCompositionAuthority,
    }),
  });
}

/**
 * Promote a coherent Retention candidate into a ready Hook bridge under the
 * supplied Hook context. No model / ledger side effects.
 */
export function rebuildRetentionReadyBridgeFromCandidate(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly ledger: RetentionModelCallLedger;
  readonly sourceCandidate: RetentionNarrationCandidate;
  readonly title: string;
  readonly hookContext: HookGenerationContext;
  readonly compositionAuthority?: RetentionCompositionAuthority;
  /** After canonical accept, Hook-engine grounding is a warning, not a veto. */
  readonly ignoreHookQualityGrounding?: boolean;
  readonly boundedRewriteType?:
    | "opening_repair"
    | "ranking_payoff_repair"
    | "supported_opening_promotion";
}): RetentionHookBridgeResult {
  const {
    hookContext,
    sourceCandidate,
    plan,
    grounding,
    strategySeed,
  } = input;
  const narration = sourceCandidate.assembledNarration;
  const extracted = extractOpeningSpan(narration);
  const keepAfterAccept = input.ignoreHookQualityGrounding === true;
  const firstStop = /[.!?…]/.exec(narration);
  const span =
    extracted ??
    (keepAfterAccept && firstStop
      ? {
          openingText: narration.slice(0, firstStop.index + 1).trim(),
          openingTextNormalized: narration.slice(0, firstStop.index + 1).trim(),
          openingStartOffset: 0,
          openingEndOffset: firstStop.index + 1,
        }
      : null);
  if (!span) {
    return baseFailed(
      input.contract,
      input.ledger,
      plan,
      "candidate_reconciliation_failed",
    );
  }

  const openingClaimRefs = Object.freeze([
    ...(sourceCandidate.segments[0]?.claimRefs ?? []),
  ]);

  let hookCandidate;
  try {
    hookCandidate = buildHookCandidate({
      narration,
      request: hookContext.request,
      plan: hookContext.plan,
      origin: "model_narration_opening",
      claimRefs: openingClaimRefs,
    });
  } catch {
    return baseFailed(input.contract, input.ledger, plan, "hook_terminal_failure");
  }

  const validation = validateHookCandidate({
    request: hookContext.request,
    plan: hookContext.plan,
    candidate: hookCandidate,
    repairBoundExceeded: true,
  });
  const blockingSafety = validation.reasons.some(
    (reason) =>
      reason === "safety.prompt_injection" ||
      reason === "safety.harmful_targeting" ||
      reason === "safety.empty_opening",
  );
  if (blockingSafety) {
    return baseFailed(input.contract, input.ledger, plan, "hook_terminal_failure");
  }
  if (
    !input.ignoreHookQualityGrounding &&
    !validation.hardGatesPassed.grounding
  ) {
    return baseFailed(input.contract, input.ledger, plan, "hook_terminal_failure");
  }

  let selectionOpening = span.openingText;
  try {
    const selection = buildHookSelection({
      request: hookContext.request,
      plan: hookContext.plan,
      candidate: hookCandidate,
      repairBoundExceeded: true,
    });
    if (selection.openingText === span.openingText) {
      selectionOpening = selection.openingText;
    }
  } catch {
    selectionOpening = span.openingText;
  }
  void selectionOpening;

  let terminalHookAuthority;
  try {
    terminalHookAuthority = assertRetentionTerminalHookAuthorityCoherence(
      {
        request: hookContext.request,
        activePlan: hookContext.plan,
        approvedCandidate: hookCandidate,
        openingClaimRefs: Object.freeze([...hookCandidate.claimRefs]),
        validation,
      },
      narration,
    );
  } catch {
    return baseFailed(input.contract, input.ledger, plan, "hook_terminal_failure");
  }

  let candidate: RetentionNarrationCandidate;
  try {
    candidate = reconcileRetentionCandidateAfterHook({
      plan,
      grounding,
      strategySeed,
      sourceCandidate,
      approvedNarration: narration,
      approvedOpening: {
        openingText: span.openingText,
        openingStartOffset: span.openingStartOffset,
        openingEndOffset: span.openingEndOffset,
      },
    });
  } catch {
    return baseFailed(
      input.contract,
      input.ledger,
      plan,
      "candidate_reconciliation_failed",
    );
  }

  const budget = input.ledger.snapshot();
  return Object.freeze({
    status: "ready" as const,
    title: input.title,
    approvedNarration: narration,
    candidate,
    diagnostics: Object.freeze({
      qualityMode: input.contract.qualityMode,
      plannerAttempts: budget.counts.planner,
      composerAttempts:
        budget.counts.initial_narration +
        budget.counts.length_compression +
        budget.counts.hook_repair +
        budget.counts.hook_fallback,
      hookAdapterRan: true as const,
      budget,
      outcome: "hook_approved" as const,
      planFingerprint: plan.planFingerprint,
      candidateFingerprint: candidate.candidateFingerprint,
      compositionAuthority:
        input.compositionAuthority ?? ("model_initial" as const),
      ...(input.boundedRewriteType
        ? { boundedRewriteType: input.boundedRewriteType }
        : {}),
    }),
    hookPlanSnapshot: buildHookPlanSnapshot(hookContext.plan),
    hookDiagnostics: buildHookDiagnostics({
      request: hookContext.request,
      plan: hookContext.plan,
      candidate: hookCandidate,
      validation,
      validationOutcome: "pass",
      repairAttempts: 0,
      adapterRan: true,
    }),
    terminalHookAuthority,
  });
}
