/**
 * Commit a canonically accepted candidate — story-quality Prompt 12.
 * Downstream may only map, derive metadata, serialize, and attach diagnostics.
 * Editorial Hook rejection cannot run again on this state.
 */

import { buildHookPlanSnapshot } from "@/features/hook-engine";
import type { HookGenerationContext } from "@/features/hook-engine/integration/build-hook-generation-context";
import { buildHookCandidate } from "@/features/hook-engine/validation/build-hook-candidate";
import { buildHookDiagnostics } from "@/features/hook-engine/validation/build-hook-diagnostics";
import { extractOpeningSpan } from "@/features/hook-engine/validation/extract-opening-span";
import { validateHookCandidate } from "@/features/hook-engine/validation/validate-hook-candidate";

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import { reconcileRetentionCandidateAfterHook } from "../composition/reconcile-retention-candidate-after-hook";
import type { RetentionBoundedRewriteType } from "../composition/apply-retention-bounded-region-repair";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionTerminalHookAuthority } from "../rewrite/retention-terminal-hook-authority.types";
import type {
  RetentionCompositionAuthority,
  RetentionHookBridgeResult,
} from "./retention-hook-bridge.types";

function mappingFailed(
  contract: NormalizedStoryContract,
  ledger: RetentionModelCallLedger,
  plan: RetentionStoryPlan,
  compositionAuthority: RetentionCompositionAuthority,
): Extract<RetentionHookBridgeResult, { status: "failed" }> {
  const budget = ledger.snapshot();
  return Object.freeze({
    status: "failed" as const,
    reason: "accepted_narration_mapping_failed" as const,
    normalizeSeam: "accepted_narration_mapping_failed",
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
      compositionAuthority,
    }),
  });
}

function firstSentenceSpan(narration: string): {
  readonly openingText: string;
  readonly openingStartOffset: number;
  readonly openingEndOffset: number;
} | null {
  const extracted = extractOpeningSpan(narration);
  if (extracted) return extracted;
  const firstStop = /[.!?…]/.exec(narration);
  if (!firstStop || firstStop.index == null) return null;
  return {
    openingText: narration.slice(0, firstStop.index + 1).trim(),
    openingStartOffset: 0,
    openingEndOffset: firstStop.index + 1,
  };
}

/**
 * Map an already-accepted candidate to a ready bridge. Hook hardGatesPassed
 * values are diagnostics only and cannot reverse the spoken Pass.
 */
export function commitRetentionCanonicallyAcceptedCandidate(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly ledger: RetentionModelCallLedger;
  readonly sourceCandidate: RetentionNarrationCandidate;
  readonly title: string;
  readonly hookContext: HookGenerationContext;
  readonly compositionAuthority?: RetentionCompositionAuthority;
  readonly boundedRewriteType?: RetentionBoundedRewriteType;
}): RetentionHookBridgeResult {
  const narration = input.sourceCandidate.assembledNarration;
  const span = firstSentenceSpan(narration);
  const compositionAuthority =
    input.compositionAuthority ?? ("model_initial" as const);
  if (!span || narration.slice(0, span.openingEndOffset) !== span.openingText) {
    return mappingFailed(
      input.contract,
      input.ledger,
      input.plan,
      compositionAuthority,
    );
  }

  const openingClaimRefs = Object.freeze([
    ...(input.sourceCandidate.segments[0]?.claimRefs ?? []),
  ]);

  let hookCandidate;
  try {
    hookCandidate = buildHookCandidate({
      narration,
      request: input.hookContext.request,
      plan: input.hookContext.plan,
      origin: "model_narration_opening",
      claimRefs: openingClaimRefs,
    });
  } catch {
    return mappingFailed(
      input.contract,
      input.ledger,
      input.plan,
      compositionAuthority,
    );
  }

  const validation = validateHookCandidate({
    request: input.hookContext.request,
    plan: input.hookContext.plan,
    candidate: hookCandidate,
    repairBoundExceeded: true,
  });
  void validation.hardGatesPassed;

  const terminalHookAuthority: RetentionTerminalHookAuthority = Object.freeze({
    request: input.hookContext.request,
    activePlan: input.hookContext.plan,
    approvedCandidate: hookCandidate,
    openingClaimRefs: Object.freeze([...hookCandidate.claimRefs]),
    validation: Object.freeze({ ...validation }),
  });

  let candidate: RetentionNarrationCandidate;
  try {
    candidate = reconcileRetentionCandidateAfterHook({
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      sourceCandidate: input.sourceCandidate,
      approvedNarration: narration,
      approvedOpening: {
        openingText: span.openingText,
        openingStartOffset: span.openingStartOffset,
        openingEndOffset: span.openingEndOffset,
      },
    });
  } catch {
    return mappingFailed(
      input.contract,
      input.ledger,
      input.plan,
      compositionAuthority,
    );
  }

  if (candidate.assembledNarration !== narration) {
    return mappingFailed(
      input.contract,
      input.ledger,
      input.plan,
      compositionAuthority,
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
      planFingerprint: input.plan.planFingerprint,
      candidateFingerprint: candidate.candidateFingerprint,
      compositionAuthority,
      ...(input.boundedRewriteType
        ? { boundedRewriteType: input.boundedRewriteType }
        : {}),
    }),
    hookPlanSnapshot: buildHookPlanSnapshot(input.hookContext.plan),
    hookDiagnostics: buildHookDiagnostics({
      request: input.hookContext.request,
      plan: input.hookContext.plan,
      candidate: hookCandidate,
      validation,
      validationOutcome: "pass",
      repairAttempts: 0,
      adapterRan: true,
    }),
    terminalHookAuthority,
  });
}
