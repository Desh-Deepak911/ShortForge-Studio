/**
 * Zero-model explicit-Hook → Auto preference reconciliation — Sprint 10H.3B.
 *
 * Reuses a coherent structured Retention candidate from the first successful
 * composition. Revalidates only under Auto Hook authority. No model calls,
 * no ledger consume, no second initial composition.
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
import type { RetentionHookBridgeResult } from "./retention-hook-bridge.types";
import type { RetentionCompositionAuthority } from "./retention-hook-bridge.types";

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
 * Reconcile an existing composed candidate under Auto Hook preference.
 * Returns ready on Auto approval; failed otherwise. Never touches the ledger.
 */
export function reconcileRetentionHookPreferenceZeroModel(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly ledger: RetentionModelCallLedger;
  readonly sourceCandidate: RetentionNarrationCandidate;
  readonly title: string;
  readonly autoHookContext: HookGenerationContext;
}): RetentionHookBridgeResult {
  const { autoHookContext, sourceCandidate, plan, grounding, strategySeed } =
    input;
  const narration = sourceCandidate.assembledNarration;
  const span = extractOpeningSpan(narration);
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
      request: autoHookContext.request,
      plan: autoHookContext.plan,
      origin: "model_narration_opening",
      claimRefs: openingClaimRefs,
    });
  } catch {
    return baseFailed(input.contract, input.ledger, plan, "hook_terminal_failure");
  }

  const validation = validateHookCandidate({
    request: autoHookContext.request,
    plan: autoHookContext.plan,
    candidate: hookCandidate,
    repairBoundExceeded: true,
  });
  if (!validation.ok) {
    return baseFailed(input.contract, input.ledger, plan, "hook_terminal_failure");
  }
  if (
    !validation.hardGatesPassed.grounding ||
    !validation.hardGatesPassed.safety
  ) {
    return baseFailed(input.contract, input.ledger, plan, "hook_terminal_failure");
  }

  let selection;
  try {
    selection = buildHookSelection({
      request: autoHookContext.request,
      plan: autoHookContext.plan,
      candidate: hookCandidate,
      repairBoundExceeded: true,
    });
  } catch {
    return baseFailed(input.contract, input.ledger, plan, "hook_terminal_failure");
  }

  if (selection.openingText !== span.openingText) {
    return baseFailed(
      input.contract,
      input.ledger,
      plan,
      "candidate_reconciliation_failed",
    );
  }

  let terminalHookAuthority;
  try {
    terminalHookAuthority = assertRetentionTerminalHookAuthorityCoherence(
      {
        request: autoHookContext.request,
        activePlan: autoHookContext.plan,
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
  const hookPlanSnapshot = buildHookPlanSnapshot(autoHookContext.plan);
  const hookDiagnostics = buildHookDiagnostics({
    request: autoHookContext.request,
    plan: autoHookContext.plan,
    candidate: hookCandidate,
    validation,
    validationOutcome: "pass",
    repairAttempts: 0,
    adapterRan: true,
  });

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
      compositionAuthority: "model_initial" as RetentionCompositionAuthority,
    }),
    hookPlanSnapshot,
    hookDiagnostics,
    terminalHookAuthority,
  });
}
