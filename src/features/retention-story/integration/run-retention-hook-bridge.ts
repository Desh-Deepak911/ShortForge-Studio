/**
 * Retention composition + Hook approval orchestration — Sprint 10E / 10E.1.
 *
 * Uses the frozen Hook generateHookedNarration machinery. Does not activate
 * production generation routes or commit reviewed narration.
 */

import {
  generateHookedNarration,
  type GenerateHookedNarrationInput,
  type GenerateHookedNarrationResult,
  type HookedNarrationModelCall,
} from "@/features/hook-engine/integration/generate-hooked-narration";
import type { HookGenerationContext } from "@/features/hook-engine/integration/build-hook-generation-context";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import { extractOpeningSpan } from "@/features/hook-engine/validation/extract-opening-span";

import { isRetentionStoryError } from "../domain/retention-story-errors";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import {
  assertRetentionLedgerMatchesContract,
  createRetentionModelCallLedger,
  type RetentionModelCallLedger,
} from "../budget";
import type { RetentionComposerCallback } from "../composition/retention-narration-candidate.types";
import { reconcileRetentionCandidateAfterHook } from "../composition/reconcile-retention-candidate-after-hook";
import { assertRetentionTerminalHookAuthorityCoherence } from "../rewrite/assert-retention-terminal-hook-authority-coherence";
import {
  createRetentionComposerBridgeState,
  createRetentionHookedModelCall,
  type RetentionComposerBillingMode,
} from "./create-retention-hooked-model-call";
import { commitRetentionCanonicallyAcceptedCandidate } from "./commit-retention-canonically-accepted-candidate";
import type {
  RetentionHookBridgeDiagnostics,
  RetentionHookBridgeFailureReason,
  RetentionHookBridgeResult,
} from "./retention-hook-bridge.types";

function composedFailureExtras(
  state: ReturnType<typeof createRetentionComposerBridgeState>,
): {
  readonly composedCandidate?: import("../composition/retention-narration-candidate.types").RetentionNarrationCandidate;
  readonly composedTitle?: string;
} {
  if (!state.lastCandidate) return {};
  return {
    composedCandidate: state.lastCandidate,
    composedTitle: state.lastTitle ?? "Story",
  };
}

/**
 * Injected Hook runner. Must receive the Retention-constructed, ledger-controlled
 * modelCall — the runner must not replace it with an unbudgeted bypass.
 */
export type RetentionHookRunner = (
  input: GenerateHookedNarrationInput & {
    readonly modelCall: HookedNarrationModelCall;
  },
) => Promise<GenerateHookedNarrationResult>;

export interface RunRetentionHookBridgeInput {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly strategySeed: RetentionStrategySeed;
  readonly grounding: RetentionGroundingContext;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
  readonly hookStyle?: HookStyleSelection | null;
  readonly hookContext: HookGenerationContext;
  readonly composer?: RetentionComposerCallback | null;
  readonly ledger?: RetentionModelCallLedger;
  /** Optional injected Hook runner (defaults to generateHookedNarration). */
  readonly hookRunner?: RetentionHookRunner;
  readonly topic: string;
  readonly tone: GenerateHookedNarrationInput["tone"];
  readonly duration: number;
  readonly scriptMode: GenerateHookedNarrationInput["scriptMode"];
  readonly context?: string;
  readonly templatePromptBlock?: string;
  readonly qualityMode?: GenerateHookedNarrationInput["qualityMode"];
  readonly model?: string;
  /** Sprint 10H.3A — deterministic rescue must not consume model budget. */
  readonly billingMode?: RetentionComposerBillingMode;
}

function resolveCompositionAuthority(
  billingMode: RetentionComposerBillingMode | undefined,
): RetentionHookBridgeDiagnostics["compositionAuthority"] {
  return billingMode === "deterministic"
    ? "deterministic_rescue"
    : "model_initial";
}

function hookFailureMayKeepCanonicalAccepted(input: {
  readonly hookContext: HookGenerationContext;
  readonly hookResult?: GenerateHookedNarrationResult;
  readonly lastComposerFailureReason?: string | null;
}): boolean {
  if (input.lastComposerFailureReason) return false;
  const strategyId = input.hookContext.plan.strategyId;
  const source = input.hookContext.plan.strategySource;
  if (strategyId === "user_directed" || source === "user_authored") {
    return false;
  }
  if (input.hookResult && !input.hookResult.ok) {
    const reason = [
      input.hookResult.error,
      input.hookResult.diagnostics?.fallbackReason,
    ]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
    if (/prompt_injection|harmful_targeting/i.test(reason)) return false;
  }
  return true;
}

function baseDiagnostics(
  contract: NormalizedStoryContract,
  ledger: RetentionModelCallLedger,
  extras: Partial<RetentionHookBridgeDiagnostics> = {},
  billingMode?: RetentionComposerBillingMode,
): RetentionHookBridgeDiagnostics {
  const budget = ledger.snapshot();
  // Path-global composer attempts must match ledger (Sprint 10H.3 reliability
  // rescue may run a second bridge on the same ledger).
  const ledgerComposerAttempts =
    budget.counts.initial_narration +
    budget.counts.length_compression +
    budget.counts.hook_repair +
    budget.counts.hook_fallback;
  return Object.freeze({
    qualityMode: contract.qualityMode,
    plannerAttempts: budget.counts.planner,
    composerAttempts: ledgerComposerAttempts,
    hookAdapterRan: extras.hookAdapterRan ?? false,
    budget,
    outcome: extras.outcome ?? "failed",
    planFingerprint: extras.planFingerprint,
    candidateFingerprint: extras.candidateFingerprint,
    compositionAuthority:
      extras.compositionAuthority ?? resolveCompositionAuthority(billingMode),
    ...(extras.boundedRewriteType
      ? { boundedRewriteType: extras.boundedRewriteType }
      : {}),
  });
}

function resolveSourceCandidate(
  state: ReturnType<typeof createRetentionComposerBridgeState>,
  approvedNarration: string,
) {
  const exact = state.byNarration.get(approvedNarration);
  if (exact) return exact;

  // Opening-only deterministic mutation: prove body-tail equality first.
  if (!state.lastCandidate) return null;
  const sourceSpan = extractOpeningSpan(state.lastCandidate.assembledNarration);
  const approvedSpan = extractOpeningSpan(approvedNarration);
  if (sourceSpan == null || approvedSpan == null) return null;
  const sourceTail = state.lastCandidate.assembledNarration.slice(
    sourceSpan.openingEndOffset,
  );
  const approvedTail = approvedNarration.slice(approvedSpan.openingEndOffset);
  if (sourceTail !== approvedTail) return null;
  return state.lastCandidate;
}

/**
 * Run Retention composition through Hook approval and reconcile the candidate.
 */
export async function runRetentionHookBridge(
  input: RunRetentionHookBridgeInput,
): Promise<RetentionHookBridgeResult> {
  if (input.contract.generationPath === "scenes_only") {
    const ledger =
      input.ledger ?? createRetentionModelCallLedger("scenes_only");
    try {
      assertRetentionLedgerMatchesContract(ledger, input.contract);
    } catch (error) {
      if (
        isRetentionStoryError(error) &&
        error.reason === "model_call_ledger_invalid"
      ) {
        return Object.freeze({
          status: "failed" as const,
          reason: "model_call_ledger_invalid" as const,
          diagnostics: baseDiagnostics(input.contract, ledger, {
            outcome: "failed",
            hookAdapterRan: false,
          }),
        });
      }
      throw error;
    }
    return Object.freeze({
      status: "skipped" as const,
      reason: "scenes_only" as const,
      diagnostics: baseDiagnostics(input.contract, ledger, {
        outcome: "skipped_scenes_only",
        hookAdapterRan: false,
        composerAttempts: 0,
      }),
    });
  }

  const ledger =
    input.ledger ??
    createRetentionModelCallLedger(input.contract.qualityMode);

  try {
    assertRetentionLedgerMatchesContract(ledger, input.contract);
  } catch (error) {
    if (
      isRetentionStoryError(error) &&
      error.reason === "model_call_ledger_invalid"
    ) {
      return Object.freeze({
        status: "failed" as const,
        reason: "model_call_ledger_invalid" as const,
        diagnostics: baseDiagnostics(input.contract, ledger, {
          outcome: "failed",
          hookAdapterRan: false,
        }),
      });
    }
    throw error;
  }

  const state = createRetentionComposerBridgeState();
  const billingMode = input.billingMode;

  if (input.composer == null) {
    return Object.freeze({
      status: "failed" as const,
      reason: "composer_unavailable" as const,
      diagnostics: baseDiagnostics(
        input.contract,
        ledger,
        {
          outcome: "failed",
          hookAdapterRan: false,
        },
        billingMode,
      ),
    });
  }

  const modelCall = createRetentionHookedModelCall({
    contract: input.contract,
    plan: input.plan,
    strategySeed: input.strategySeed,
    grounding: input.grounding,
    manualContext: input.manualContext,
    userInstructions: input.userInstructions,
    hookStyle: input.hookStyle,
    composer: input.composer,
    ledger,
    state,
    ...(billingMode ? { billingMode } : {}),
  });

  const runner = input.hookRunner ?? generateHookedNarration;
  const initialCallInput = {
    kind: "initial" as const,
    topic: input.topic,
    tone: input.tone,
    duration: input.duration,
    scriptMode: input.scriptMode,
    context: input.context,
    templatePromptBlock: input.templatePromptBlock,
    hookDirectiveBlock: input.hookContext.directive.promptBlock,
    permittedClaimIds: input.hookContext.permittedClaimIds,
    qualityMode: input.qualityMode ?? input.contract.qualityMode,
    model: input.model,
  };

  let initialError: unknown = null;
  try {
    await modelCall(initialCallInput);
  } catch (error) {
    initialError = error;
  }

  const userAuthoredHook =
    input.hookContext.plan.strategyId === "user_directed" ||
    input.hookContext.plan.strategySource === "user_authored";

  if (
    state.canonicalCommit.status === "accepted" &&
    state.lastCandidate &&
    !userAuthoredHook
  ) {
    return commitRetentionCanonicallyAcceptedCandidate({
      contract: input.contract,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      ledger,
      sourceCandidate: state.lastCandidate,
      title: state.lastTitle ?? "Story",
      hookContext: input.hookContext,
      compositionAuthority: resolveCompositionAuthority(billingMode),
      ...(state.boundedRewriteType
        ? { boundedRewriteType: state.boundedRewriteType }
        : {}),
    });
  }

  const gatedModelCall: HookedNarrationModelCall = async (callInput) => {
    if (state.canonicalCommit.status === "accepted" && state.lastCandidate) {
      return {
        title: state.lastTitle ?? "Story",
        narration: state.lastCandidate.assembledNarration,
        hookClaimRefs: [],
      };
    }
    if (callInput.kind === "initial") {
      if (initialError) throw initialError;
      if (state.lastCandidate) {
        return {
          title: state.lastTitle ?? "Story",
          narration: state.lastCandidate.assembledNarration,
          hookClaimRefs: [],
        };
      }
      throw initialError ?? new Error("Retention initial compose already consumed.");
    }
    return modelCall(callInput);
  };

  let hookResult: GenerateHookedNarrationResult;
  try {
    hookResult = await runner({
      hookContext: input.hookContext,
      topic: input.topic,
      tone: input.tone,
      duration: input.duration,
      scriptMode: input.scriptMode,
      context: input.context,
      templatePromptBlock: input.templatePromptBlock,
      qualityMode: input.qualityMode ?? input.contract.qualityMode,
      model: input.model,
      modelCall: gatedModelCall,
      // Align Hook full-narration hard-cap with Retention plan budget (never looser).
      narrationHardCapWords: input.plan.compressionGoals.targetWordBudget,
    });
  } catch (error) {
    if (
      state.canonicalAccepted &&
      state.lastCandidate &&
      hookFailureMayKeepCanonicalAccepted({
        hookContext: input.hookContext,
        lastComposerFailureReason: state.lastComposerFailureReason,
      })
    ) {
      const kept = commitRetentionCanonicallyAcceptedCandidate({
        contract: input.contract,
        plan: input.plan,
        grounding: input.grounding,
        strategySeed: input.strategySeed,
        ledger,
        sourceCandidate: state.lastCandidate,
        title: state.lastTitle ?? "Story",
        hookContext: input.hookContext,
        compositionAuthority: resolveCompositionAuthority(billingMode),
        ...(state.boundedRewriteType
          ? { boundedRewriteType: state.boundedRewriteType }
          : {}),
      });
      if (kept.status === "ready") {
        return kept;
      }
    }
    if (
      isRetentionStoryError(error) &&
      (error.reason === "composer_unavailable" ||
        error.reason === "composer_call_failed" ||
        error.reason === "composer_proposal_invalid" ||
        error.reason === "composer_segment_mismatch" ||
        error.reason === "composer_grounding_invalid" ||
        error.reason === "candidate_reconciliation_failed" ||
        error.reason === "length_enforcement_failed" ||
        error.reason === "model_call_budget_exhausted" ||
        error.reason === "model_call_ledger_invalid" ||
        error.reason === "retention_story_plan_mismatch" ||
        error.reason === "strategy_seed_mismatch")
    ) {
      return Object.freeze({
        status: "failed" as const,
        reason: error.reason as RetentionHookBridgeFailureReason,
        ...(error.normalizeSeam ? { normalizeSeam: error.normalizeSeam } : {}),
        ...(error.safeProviderFailure
          ? { safeProviderFailure: error.safeProviderFailure }
          : {}),
        diagnostics: baseDiagnostics(
          input.contract,
          ledger,
          {
            outcome: "failed",
            hookAdapterRan: true,
            composerAttempts: state.composerAttempts,
            planFingerprint: input.plan.planFingerprint,
          },
          billingMode,
        ),
        ...composedFailureExtras(state),
      });
    }
    throw error;
  }

  if (!hookResult.ok) {
    if (
      state.canonicalAccepted &&
      state.lastCandidate &&
      hookFailureMayKeepCanonicalAccepted({
        hookContext: input.hookContext,
        hookResult,
        lastComposerFailureReason: state.lastComposerFailureReason,
      })
    ) {
      const kept = commitRetentionCanonicallyAcceptedCandidate({
        contract: input.contract,
        plan: input.plan,
        grounding: input.grounding,
        strategySeed: input.strategySeed,
        ledger,
        sourceCandidate: state.lastCandidate,
        title: state.lastTitle ?? "Story",
        hookContext: input.hookContext,
        compositionAuthority: resolveCompositionAuthority(billingMode),
        ...(state.boundedRewriteType
          ? { boundedRewriteType: state.boundedRewriteType }
          : {}),
      });
      if (kept.status === "ready") {
        return kept;
      }
    }
    const reason =
      state.lastComposerFailureReason ?? ("hook_terminal_failure" as const);
    return Object.freeze({
      status: "failed" as const,
      reason,
      ...(state.lastNormalizeSeam
        ? { normalizeSeam: state.lastNormalizeSeam }
        : {}),
      ...(state.lastSafeProviderFailure
        ? { safeProviderFailure: state.lastSafeProviderFailure }
        : {}),
      diagnostics: baseDiagnostics(
        input.contract,
        ledger,
        {
          outcome: "failed",
          hookAdapterRan: true,
          composerAttempts: state.composerAttempts,
          planFingerprint: input.plan.planFingerprint,
        },
        billingMode,
      ),
      ...(hookResult.snapshot
        ? { hookPlanSnapshot: hookResult.snapshot }
        : {}),
      hookDiagnostics: hookResult.diagnostics,
      ...composedFailureExtras(state),
    });
  }

  // Canonical terminal Hook authority must come from actual Hook execution.
  if (
    !("terminalEvidence" in hookResult) ||
    hookResult.terminalEvidence == null
  ) {
    return Object.freeze({
      status: "failed" as const,
      reason: "hook_terminal_failure" as const,
      diagnostics: baseDiagnostics(
        input.contract,
        ledger,
        {
          outcome: "failed",
          hookAdapterRan: true,
          composerAttempts: state.composerAttempts,
          planFingerprint: input.plan.planFingerprint,
        },
        billingMode,
      ),
      ...composedFailureExtras(state),
    });
  }

  const reconcileSource = resolveSourceCandidate(
    state,
    hookResult.approvedNarration,
  );
  if (!reconcileSource) {
    return Object.freeze({
      status: "failed" as const,
      reason: "candidate_reconciliation_failed" as const,
      diagnostics: baseDiagnostics(
        input.contract,
        ledger,
        {
          outcome: "failed",
          hookAdapterRan: true,
          composerAttempts: state.composerAttempts,
          planFingerprint: input.plan.planFingerprint,
        },
        billingMode,
      ),
      ...composedFailureExtras(state),
    });
  }

  const openingSpan = extractOpeningSpan(hookResult.approvedNarration);
  if (
    openingSpan == null ||
    openingSpan.openingText !== hookResult.selection.openingText
  ) {
    return Object.freeze({
      status: "failed" as const,
      reason: "candidate_reconciliation_failed" as const,
      diagnostics: baseDiagnostics(
        input.contract,
        ledger,
        {
          outcome: "failed",
          hookAdapterRan: true,
          composerAttempts: state.composerAttempts,
          planFingerprint: input.plan.planFingerprint,
        },
        billingMode,
      ),
      ...composedFailureExtras(state),
    });
  }

  let terminalHookAuthority;
  try {
    terminalHookAuthority = assertRetentionTerminalHookAuthorityCoherence(
      {
        request: hookResult.terminalEvidence.request,
        activePlan: hookResult.terminalEvidence.activePlan,
        approvedCandidate: hookResult.terminalEvidence.candidate,
        openingClaimRefs: hookResult.terminalEvidence.openingClaimRefs,
        validation: hookResult.terminalEvidence.validation,
      },
      hookResult.approvedNarration,
    );
  } catch {
    return Object.freeze({
      status: "failed" as const,
      reason: "hook_terminal_failure" as const,
      diagnostics: baseDiagnostics(
        input.contract,
        ledger,
        {
          outcome: "failed",
          hookAdapterRan: true,
          composerAttempts: state.composerAttempts,
          planFingerprint: input.plan.planFingerprint,
        },
        billingMode,
      ),
      ...composedFailureExtras(state),
    });
  }

  try {
    const candidate = reconcileRetentionCandidateAfterHook({
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      sourceCandidate: reconcileSource,
      approvedNarration: hookResult.approvedNarration,
      approvedOpening: {
        openingText: openingSpan.openingText,
        openingStartOffset: openingSpan.openingStartOffset,
        openingEndOffset: openingSpan.openingEndOffset,
      },
    });

    return Object.freeze({
      status: "ready" as const,
      title: hookResult.title,
      approvedNarration: hookResult.approvedNarration,
      candidate,
      diagnostics: baseDiagnostics(
        input.contract,
        ledger,
        {
          outcome: "hook_approved",
          hookAdapterRan: true,
          composerAttempts: state.composerAttempts,
          planFingerprint: input.plan.planFingerprint,
          candidateFingerprint: candidate.candidateFingerprint,
          ...(state.boundedRewriteType
            ? { boundedRewriteType: state.boundedRewriteType }
            : {}),
        },
        billingMode,
      ),
      hookPlanSnapshot: hookResult.snapshot,
      hookDiagnostics: hookResult.diagnostics,
      ...(hookResult.lengthWarning
        ? { lengthWarning: hookResult.lengthWarning }
        : {}),
      terminalHookAuthority,
    });
  } catch {
    return Object.freeze({
      status: "failed" as const,
      reason: "candidate_reconciliation_failed" as const,
      diagnostics: baseDiagnostics(
        input.contract,
        ledger,
        {
          outcome: "failed",
          hookAdapterRan: true,
          composerAttempts: state.composerAttempts,
          planFingerprint: input.plan.planFingerprint,
        },
        billingMode,
      ),
      hookPlanSnapshot: hookResult.snapshot,
      hookDiagnostics: hookResult.diagnostics,
      ...composedFailureExtras(state),
    });
  }
}
