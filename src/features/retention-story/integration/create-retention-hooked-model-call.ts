/**
 * Retention composer → Hook model-call bridge — Sprint 10E / 10E.1 / 10H.2B.
 *
 * Every successful model response normalizes into a complete structured
 * Retention candidate before its assembled narration is handed to Hook.
 * Hook only receives { title, narration, hookClaimRefs }.
 *
 * Over-budget initial composition preserves the structured candidate so Hook
 * can spend the shared length_compression allowance. Sentence-safe
 * deterministic enforcement runs only after compression (or when compression
 * is unavailable). Never flat-truncates under the Retention hard cap.
 */

import { countWords } from "@/features/story/utils/narration-duration-budget.utils";
import type {
  HookedNarrationModelCall,
  HookedNarrationModelResult,
} from "@/features/hook-engine/integration/generate-hooked-narration";

import { RetentionStoryError, isRetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import type { RetentionModelCallCategory } from "../budget/retention-model-call-budget.types";
import {
  buildRetentionComposerRequest,
} from "../composition/build-retention-composer-request";
import {
  buildRetentionNarrationCandidateFromProposal,
} from "../composition/build-retention-narration-candidate";
import {
  enforceRetentionCandidateWordBudget,
  extractFirstSpokenSentence,
} from "../composition/enforce-retention-candidate-word-budget";
import type {
  RetentionComposerCallback,
  RetentionComposerModelCallKind,
  RetentionNarrationCandidate,
} from "../composition/retention-narration-candidate.types";
import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";
import { evaluateRetentionSpokenCompleteness } from "../validation/evaluate-retention-spoken-completeness";
import type { RetentionHookBridgeFailureReason } from "./retention-hook-bridge.types";

function mapKindToBudgetCategory(
  kind: RetentionComposerModelCallKind,
): RetentionModelCallCategory {
  switch (kind) {
    case "initial":
      return "initial_narration";
    case "length_compress":
      return "length_compression";
    case "repair":
      return "hook_repair";
    case "compatibility_fallback":
    case "safe_fallback":
      return "hook_fallback";
    case "body_rewrite":
      return "retention_body_rewrite";
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return "initial_narration";
    }
  }
}

function mapKindToCandidateOrigin(
  kind: RetentionComposerModelCallKind,
): RetentionNarrationCandidate["origin"] {
  switch (kind) {
    case "length_compress":
      return "after_length_enforcement";
    case "body_rewrite":
      return "after_body_rewrite";
    case "initial":
    case "repair":
    case "compatibility_fallback":
    case "safe_fallback":
      return "initial_compose";
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return "initial_compose";
    }
  }
}

const COMPOSER_FAILURE_REASONS: ReadonlySet<RetentionHookBridgeFailureReason> =
  new Set([
    "composer_unavailable",
    "composer_call_failed",
    "composer_proposal_invalid",
    "composer_segment_mismatch",
    "composer_grounding_invalid",
    "length_enforcement_failed",
    "model_call_budget_exhausted",
    "model_call_ledger_invalid",
  ]);

/** Internal bridge state — not part of the public Retention API. */
export interface RetentionComposerBridgeState {
  readonly byNarration: Map<string, RetentionNarrationCandidate>;
  lastCandidate: RetentionNarrationCandidate | null;
  /** Title from the last successful compose (Sprint 10H.3B zero-model reconcile). */
  lastTitle: string | null;
  composerAttempts: number;
  lastComposerFailureReason: RetentionHookBridgeFailureReason | null;
}

export function createRetentionComposerBridgeState(): RetentionComposerBridgeState {
  return {
    byNarration: new Map(),
    lastCandidate: null,
    lastTitle: null,
    composerAttempts: 0,
    lastComposerFailureReason: null,
  };
}

export type RetentionComposerBillingMode = "model" | "deterministic";

export interface CreateRetentionHookedModelCallInput {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly strategySeed: RetentionStrategySeed;
  readonly grounding: RetentionGroundingContext;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
  readonly composer: RetentionComposerCallback | null | undefined;
  readonly ledger: RetentionModelCallLedger;
  readonly state: RetentionComposerBridgeState;
  /**
   * Sprint 10H.3A — `deterministic` runs the composer without consuming
   * model-call budget and records `skipped_deterministic` on success.
   */
  readonly billingMode?: RetentionComposerBillingMode;
}

function rememberComposerFailure(
  state: RetentionComposerBridgeState,
  error: unknown,
): void {
  if (
    isRetentionStoryError(error) &&
    COMPOSER_FAILURE_REASONS.has(
      error.reason as RetentionHookBridgeFailureReason,
    )
  ) {
    state.lastComposerFailureReason =
      error.reason as RetentionHookBridgeFailureReason;
  }
}

function exceedsWordBudget(
  narration: string,
  plan: RetentionStoryPlan,
): boolean {
  const target = plan.compressionGoals.targetWordBudget;
  return (
    countRetentionNarrationWords(narration) > target ||
    countWords(narration) > target
  );
}

function assertSpokenComplete(
  candidate: RetentionNarrationCandidate,
  plan: RetentionStoryPlan,
): void {
  const completeness = evaluateRetentionSpokenCompleteness(candidate, plan);
  if (!completeness.ok) {
    throw new RetentionStoryError(
      "length_enforcement_failed",
      "Retention narration is spoken-incomplete.",
      { normalizeSeam: completeness.reasonIds[0] ?? "spoken_completeness_failed" },
    );
  }
}

function finalizeCandidate(input: {
  readonly kind: RetentionComposerModelCallKind;
  readonly candidate: RetentionNarrationCandidate;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly ledger: RetentionModelCallLedger;
  readonly contract: NormalizedStoryContract;
}): RetentionNarrationCandidate {
  const { kind, plan, grounding, strategySeed, ledger, contract } = input;
  let candidate = input.candidate;
  const overBudget = exceedsWordBudget(candidate.assembledNarration, plan);
  const canCompressLater =
    kind === "initial" &&
    ledger.snapshot().remaining.length_compression > 0;

  if (overBudget && canCompressLater) {
    // Preserve structured over-budget candidate for the shared length_compression call.
    return candidate;
  }

  if (overBudget) {
    const opening = extractFirstSpokenSentence(candidate.assembledNarration);
    candidate = enforceRetentionCandidateWordBudget({
      candidate,
      plan,
      grounding,
      strategySeed,
      contract,
      ...(opening ? { approvedOpeningText: opening } : {}),
    });
  }

  assertSpokenComplete(candidate, plan);
  if (exceedsWordBudget(candidate.assembledNarration, plan)) {
    throw new RetentionStoryError(
      "length_enforcement_failed",
      "Retention narration remains over the duration word budget.",
      { normalizeSeam: "budget_unmet" },
    );
  }
  return candidate;
}

/**
 * Build a Hook-compatible modelCall that composes structured Retention candidates.
 */
export function createRetentionHookedModelCall(
  input: CreateRetentionHookedModelCallInput,
): HookedNarrationModelCall {
  return async (hookInput): Promise<HookedNarrationModelResult> => {
    const kind = hookInput.kind as RetentionComposerModelCallKind;
    if (kind === "body_rewrite") {
      const error = new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention body_rewrite must not route through the Hook modelCall adapter.",
      );
      rememberComposerFailure(input.state, error);
      throw error;
    }
    const category = mapKindToBudgetCategory(kind);
    const deterministic = input.billingMode === "deterministic";

    if (input.composer == null) {
      const error = new RetentionStoryError(
        "composer_unavailable",
        "Retention composer callback is unavailable.",
      );
      rememberComposerFailure(input.state, error);
      throw error;
    }

    if (!deterministic) {
      try {
        input.ledger.consume(category);
      } catch (error) {
        rememberComposerFailure(input.state, error);
        throw error;
      }
    }
    input.state.composerAttempts += 1;

    const previous =
      kind === "initial"
        ? null
        : (input.state.lastCandidate ??
          (hookInput.previousNarration
            ? (input.state.byNarration.get(hookInput.previousNarration) ?? null)
            : null));

    let request;
    try {
      request = buildRetentionComposerRequest({
        contract: input.contract,
        plan: input.plan,
        strategySeed: input.strategySeed,
        grounding: input.grounding,
        manualContext: input.manualContext,
        userInstructions: input.userInstructions,
        hookDirectiveBlock: hookInput.hookDirectiveBlock,
        modelCallKind: kind,
        previousCandidate: previous,
      });
    } catch (error) {
      if (!deterministic) {
        input.ledger.recordOutcome(category, "rejected");
      }
      rememberComposerFailure(input.state, error);
      throw error;
    }

    let proposal: unknown;
    try {
      proposal = await input.composer(request);
    } catch (error) {
      if (!deterministic) {
        input.ledger.recordOutcome(category, "failed");
      }
      if (isRetentionStoryError(error)) {
        rememberComposerFailure(input.state, error);
        throw error;
      }
      const wrapped = new RetentionStoryError(
        "composer_call_failed",
        "Retention composer callback failed.",
      );
      rememberComposerFailure(input.state, wrapped);
      throw wrapped;
    }

    try {
      const built = buildRetentionNarrationCandidateFromProposal({
        proposal,
        plan: input.plan,
        grounding: input.grounding,
        strategySeed: input.strategySeed,
        origin: mapKindToCandidateOrigin(kind),
        permittedHookClaimIds: hookInput.permittedClaimIds,
      });
      const candidate = finalizeCandidate({
        kind,
        candidate: built.candidate,
        plan: input.plan,
        grounding: input.grounding,
        strategySeed: input.strategySeed,
        ledger: input.ledger,
        contract: input.contract,
      });
      input.state.lastCandidate = candidate;
      input.state.lastTitle = built.title?.trim() || "Story";
      input.state.byNarration.set(candidate.assembledNarration, candidate);
      if (deterministic) {
        // Zero-cost composition authority marker (at most once per rescue bridge).
        const alreadyMarked = input.ledger
          .snapshot()
          .events.some(
            (e) =>
              e.category === "initial_narration" &&
              e.outcome === "skipped_deterministic",
          );
        if (!alreadyMarked) {
          input.ledger.recordOutcome(
            "initial_narration",
            "skipped_deterministic",
          );
        }
      } else {
        input.ledger.recordOutcome(category, "succeeded");
      }
      return {
        title: built.title,
        narration: candidate.assembledNarration,
        hookClaimRefs: built.hookClaimRefs,
      };
    } catch (error) {
      if (!deterministic) {
        const outcome =
          isRetentionStoryError(error) &&
          (error.reason === "composer_proposal_invalid" ||
            error.reason === "composer_segment_mismatch" ||
            error.reason === "composer_grounding_invalid" ||
            error.reason === "length_enforcement_failed")
            ? error.reason === "length_enforcement_failed"
              ? "rejected"
              : "malformed"
            : "rejected";
        input.ledger.recordOutcome(category, outcome);
      }
      rememberComposerFailure(input.state, error);
      throw error;
    }
  };
}
