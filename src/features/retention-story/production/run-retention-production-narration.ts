/**
 * Canonical Retention production narration orchestrator — Sprint 10F.3.
 *
 * Shared by script-only and full audio-first. Owns one path-global ledger per attempt.
 * Does not start VO/scenes. Commit gate is the sole exit for approved narration.
 */

import {
  buildHookGenerationContext,
  buildNeutralResearchEvidence,
} from "@/features/hook-engine/integration";
import {
  reconcileHookStyleSelection,
  requestedStrategyIdFromHookStyle,
  type HookStyleSelection,
} from "@/features/hook-engine";
import { resolveScriptMode } from "@/types/footiebitz";

import {
  isRetentionStoryError,
  RetentionStoryError,
} from "../domain/retention-story-errors";
import { buildRetentionCreatorContextAuthority } from "../domain/retention-creator-context-authority";
import { normalizeStoryContract } from "../domain/normalize-story-contract";
import { normalizeRetentionGroundingContext } from "../grounding/retention-grounding-normalization";
import {
  createRetentionModelCallLedger,
  recordDeterministicNarrationRescue,
} from "../budget/create-retention-model-call-ledger";
import { buildDeterministicFallbackComposer } from "../composition/build-deterministic-fallback-composer";
import { buildDeterministicFallbackNarrationCandidate } from "../composition/build-deterministic-fallback-narration";
import { buildRetentionStoryPlan } from "../planning/build-retention-story-plan";
import { buildReliabilityDeterministicRetentionPlan } from "../planning/build-reliability-deterministic-retention-plan";
import { resolveAdaptiveRetentionBeatCount } from "../planning/resolve-adaptive-retention-beat-count";
import { runRetentionHookBridge } from "../integration/run-retention-hook-bridge";
import { reconcileRetentionHookPreferenceZeroModel } from "../integration/reconcile-retention-hook-preference-zero-model";
import { rebuildRetentionReadyBridgeFromCandidate } from "../integration/rebuild-retention-ready-bridge-from-candidate";
import {
  promoteRetentionRescueWithFidelity,
  rescuePromotionPreservesCanonical,
} from "../integration/promote-retention-rescue-with-fidelity";
import type { DeterministicFallbackBuildResult } from "../composition/build-retention-coherent-deterministic-rescue";
import { reconcileRetentionParticipantCoverageZeroModel } from "../composition/reconcile-retention-participant-coverage";
import {
  buildRetentionParticipantCoverage,
  evaluateRetentionParticipantCoverage,
} from "../strategy/retention-matchup-participant-coverage";
import {
  isTerminalAuthorityRetentionHardGateId,
  retentionFailedGatesAreFlexibleRecoverable,
} from "../validation/classify-retention-hard-gate-recoverability";
import { runRetentionTerminalValidation } from "../rewrite/run-retention-terminal-validation";
import { buildProductionStoryContractInput } from "./build-production-story-contract-input";
import { buildRetentionGenerationDisposition } from "./build-retention-generation-disposition";
import type { RetentionSafeProviderFailure } from "../domain/retention-provider-failure.types";
import { createRetentionGenerationAcceptanceTraceRecorder } from "./create-retention-generation-acceptance-trace";
import type { RetentionGenerationRejectionStage } from "./retention-generation-acceptance-trace.types";
import { deriveRetentionClaimAdaptations } from "./derive-retention-claim-adaptations";
import {
  assertRetentionHookPreferenceDispositionCoherence,
  captureRetentionRequestedHookAuthority,
  deriveRetentionHookPreferenceAdaptation,
} from "./derive-retention-hook-preference-adaptation";
import { commitRetentionApprovedNarration } from "./commit-retention-approved-narration";
import {
  bindRetentionRejectedProposalCapture,
  createRetentionRejectedProposalCaptureSession,
  isRetentionRejectedProposalCaptureEnabled,
  recordRetentionNarrationTransform,
} from "./create-retention-rejected-proposal-capture";
import type { CreationReliabilityMode } from "./retention-terminal-failure-taxonomy";
import {
  creatorSafeErrorMessage,
  mapHookBridgeFailure,
  mapStoryErrorReason,
  mapTerminalFailure,
} from "./map-retention-production-failure";
import type { RetentionGenerationAdaptationId } from "./retention-generation-disposition.types";
import {
  summarizeLedgerBudget,
  type RetentionProductionFailureCategory,
  type RetentionProductionNarrationResult,
  type RetentionProductionSafeDiagnostics,
  type RunRetentionProductionNarrationInput,
} from "./retention-production.types";

function isFlexibleAuthorityTerminalSafeReason(
  safeReasonIds: readonly string[],
): boolean {
  return safeReasonIds.some(
    (id) =>
      id === "creator_context_identity_mismatch" ||
      id === "grounding_summary_mismatch" ||
      id === "grounding_identity_mismatch" ||
      id === "validation_authority_mismatch" ||
      id === "authority_mismatch",
  );
}

function isSoftEmptyResearchGroundingReason(reason: string): boolean {
  return (
    reason === "invalid_research_identity" ||
    reason === "grounding_identity_mismatch" ||
    reason === "grounding_summary_mismatch" ||
    reason === "invalid_grounding_context"
  );
}

function mapHookBridgeReasonToAcceptanceStage(
  reason: string,
  normalizeSeam?: string,
): RetentionGenerationRejectionStage {
  const parseSeams = new Set([
    "empty_provider_response",
    "response_extraction_failure",
    "response_json_parse_failure",
    "response_schema_mismatch",
    "composer_proposal_malformed",
  ]);
  if (normalizeSeam && parseSeams.has(normalizeSeam)) {
    return "malformed_composer_proposal";
  }
  const seamStages = new Set<RetentionGenerationRejectionStage>([
    "malformed_composer_proposal",
    "hook_body_relationship_rejection",
    "unsupported_claim_or_claim_reference_rejection",
    "duration_or_compression_rejection",
    "narration_hard_gate_rejection",
  ]);
  if (
    normalizeSeam &&
    seamStages.has(normalizeSeam as RetentionGenerationRejectionStage)
  ) {
    return normalizeSeam as RetentionGenerationRejectionStage;
  }
  switch (reason) {
    case "composer_unavailable":
      return "model_call_unavailable";
    case "composer_call_failed":
      return "model_call_failed";
    case "composer_proposal_invalid":
      return "malformed_composer_proposal";
    case "composer_segment_mismatch":
    case "candidate_fingerprint_mismatch":
      return "beat_segment_identity_mismatch";
    case "composer_grounding_invalid":
      return "unsupported_claim_or_claim_reference_rejection";
    case "accepted_narration_mapping_failed":
      return "accepted_narration_mapping_failed";
    case "hook_terminal_failure":
    case "candidate_reconciliation_failed":
      return "hook_validation_rejection";
    case "length_enforcement_failed":
    case "model_call_budget_exhausted":
      return "duration_or_compression_rejection";
    default:
      return "model_call_failed";
  }
}

function providerFailureRecordExtras(hookBridge: {
  readonly status: string;
  readonly safeProviderFailure?: RetentionSafeProviderFailure;
} | null): { readonly providerFailure?: RetentionSafeProviderFailure } | undefined {
  if (
    hookBridge != null &&
    hookBridge.status === "failed" &&
    hookBridge.safeProviderFailure
  ) {
    return { providerFailure: hookBridge.safeProviderFailure };
  }
  return undefined;
}

function mapTerminalMissToAcceptanceStage(input: {
  readonly terminalStatus: string;
  readonly failedHardGateIds: readonly string[];
  readonly safeReasonIds: readonly string[];
}): RetentionGenerationRejectionStage {
  if (
    input.terminalStatus === "length_enforcement_failed" ||
    input.safeReasonIds.some((id) =>
      /length|overrun|word_budget|spoken_completeness/i.test(id),
    )
  ) {
    return "duration_or_compression_rejection";
  }
  if (
    input.failedHardGateIds.some(
      (id) =>
        /hook_body|hook_relationship|opening_body/i.test(id) ||
        id.includes("hook_body"),
    ) ||
    input.safeReasonIds.some((id) => /hook_body|opening_body/i.test(id))
  ) {
    return "hook_body_relationship_rejection";
  }
  if (
    input.failedHardGateIds.length > 0 ||
    input.safeReasonIds.some((id) => /hard_gate|authority|fingerprint/i.test(id))
  ) {
    return "narration_hard_gate_rejection";
  }
  return "acceptance_quality_rejection";
}

function ensureDeterministicNarrationEvidence(
  ledger: ReturnType<typeof createRetentionModelCallLedger>,
): void {
  const alreadyRecorded = ledger
    .snapshot()
    .events.some(
      (event) =>
        event.category === "initial_narration" &&
        event.outcome === "skipped_deterministic",
    );
  if (!alreadyRecorded) recordDeterministicNarrationRescue(ledger);
}

/** Lazy-load so barrel / injected doubles never pull server-only AI clients. */
async function resolveProductionScriptModel(qualityMode: string): Promise<string> {
  const { resolveScriptModel } = await import("@/lib/ai/script-models");
  return resolveScriptModel(qualityMode as "cheap" | "balanced" | "best");
}

async function loadProductionPlanner(model: string) {
  const { createRetentionProductionPlanner } = await import(
    "./create-retention-production-planner"
  );
  return createRetentionProductionPlanner({ model });
}

async function loadProductionComposer(model: string) {
  const { createRetentionProductionComposer } = await import(
    "./create-retention-production-composer"
  );
  return createRetentionProductionComposer({ model });
}

async function loadProductionRewriteComposer(
  model: string,
  durationSec: number,
) {
  const { createRetentionProductionRewriteComposer } = await import(
    "./create-retention-production-rewrite-composer"
  );
  return createRetentionProductionRewriteComposer({ model, durationSec });
}

function resolveHookStyle(
  input: RunRetentionProductionNarrationInput,
): HookStyleSelection | undefined {
  if (input.hookStyle) return input.hookStyle;
  if (input.userAuthoredHook) return "user_written";
  if (input.requestedStrategyId) return input.requestedStrategyId;
  return undefined;
}

const WRITE_MY_OWN_AUTHORITY_MISMATCH_MESSAGE =
  "Your Write My Own opening could not be kept exactly as written. Edit the opening and try again — Auto was not used.";

const PRECISE_HOOK_NO_SILENT_AUTO_MESSAGE =
  "Precise mode could not apply your selected Hook style without changing it. Switch to Flexible or Auto Hook, then try again.";

function failResult(
  category: RetentionProductionFailureCategory,
  extras: {
    readonly contractFingerprint?: string | null;
    readonly planFingerprint?: string | null;
    readonly candidateFingerprint?: string | null;
    readonly validationFingerprint?: string | null;
    readonly rewriteUsed?: boolean;
    readonly terminalState?: string;
    readonly qualityMode?: string;
    readonly safeReasonIds?: readonly string[];
    readonly budget?: RetentionProductionSafeDiagnostics["budget"];
    readonly validationFailureSummary?: RetentionProductionSafeDiagnostics["validationFailureSummary"];
    readonly hookPlan?: RetentionProductionNarrationResult extends {
      ok: false;
    }
      ? never
      : never;
    readonly hookPlanSnapshot?: import("@/features/hook-engine").HookPlanSnapshot;
    readonly hookDiagnostics?: import("@/features/hook-engine").HookDiagnostics;
    /** Creator-safe override (e.g. Write My Own opening hard-gate). */
    readonly errorMessage?: string;
    readonly acceptanceTrace?: import("./retention-generation-acceptance-trace.types").RetentionGenerationAcceptanceTrace;
  } = {},
): RetentionProductionNarrationResult {
  const diagnostics: RetentionProductionSafeDiagnostics = Object.freeze({
    version: 1 as const,
    terminalState: extras.terminalState ?? "fail",
    qualityMode: extras.qualityMode ?? "unknown",
    contractFingerprint: extras.contractFingerprint ?? null,
    planFingerprint: extras.planFingerprint ?? null,
    candidateFingerprint: extras.candidateFingerprint ?? null,
    validationFingerprint: extras.validationFingerprint ?? null,
    rewriteUsed: extras.rewriteUsed === true,
    failureCategory: category,
    safeReasonIds: Object.freeze([...(extras.safeReasonIds ?? [category])]),
    ...(extras.budget ? { budget: extras.budget } : {}),
    ...(extras.validationFailureSummary
      ? { validationFailureSummary: extras.validationFailureSummary }
      : {}),
    ...(extras.acceptanceTrace
      ? { acceptanceTrace: extras.acceptanceTrace }
      : {}),
  });
  return Object.freeze({
    ok: false as const,
    error: extras.errorMessage ?? creatorSafeErrorMessage(category),
    failureCategory: category,
    ...(extras.hookPlanSnapshot
      ? { hookPlan: extras.hookPlanSnapshot }
      : {}),
    ...(extras.hookDiagnostics
      ? { hookDiagnostics: extras.hookDiagnostics }
      : {}),
    retentionDiagnostics: diagnostics,
  });
}

/**
 * Run the canonical Retention → Hook → validate → commit pipeline.
 */
export async function runRetentionProductionNarration(
  input: RunRetentionProductionNarrationInput,
): Promise<RetentionProductionNarrationResult> {
  const topic = input.topic.trim();
  if (!topic) {
    return failResult("contract_normalization_failure", {
      safeReasonIds: Object.freeze(["empty_topic"]),
    });
  }

  let contract;
  let grounding;
  let softEmptyResearchGrounding = false;
  // Canonical ephemeral creator-context authority — built once from original
  // creator inputs. Never reconstructed as null at validation/commit.
  const creatorContextAuthority = buildRetentionCreatorContextAuthority({
    manualContext: input.manualContext,
    userInstructions: input.userInstructions,
  });
  const creatorManualContext =
    creatorContextAuthority.manualContext || null;
  const creatorUserInstructions =
    creatorContextAuthority.userInstructions || null;
  // Hook/advisory generation prose — not creator-context identity authority.
  const generationContext =
    input.generationContext != null && input.generationContext.trim()
      ? input.generationContext
      : null;
  const creatorSelectedHookStyle = resolveHookStyle(input);
  const hookStyleCompatibility = creatorSelectedHookStyle
    ? reconcileHookStyleSelection(
        creatorSelectedHookStyle,
        resolveScriptMode(input.scriptMode),
      )
    : null;
  const effectiveHookStyle =
    hookStyleCompatibility?.selection ?? creatorSelectedHookStyle;
  const hookStyleReconciledBeforeContract =
    hookStyleCompatibility?.compatibilityNotice != null;

  let contractInput;
  try {
    contractInput = buildProductionStoryContractInput({
      topic,
      durationSec: input.durationSec,
      generationPath: input.generationPath,
      apiMode:
        input.apiMode ??
        (input.generationPath === "script_only"
          ? "script-only"
          : String(input.generationPath) === "scenes_only"
            ? "scenes-only"
            : "full"),
      scriptMode: input.scriptMode,
      tone: input.tone,
      qualityMode: input.qualityMode,
      templateId: input.templateId,
      userInstructions: creatorUserInstructions,
      hookStyle: effectiveHookStyle,
      userAuthoredHook: input.userAuthoredHook,
      formatStrategyId: input.formatStrategyId ?? "auto",
      manualContext: creatorManualContext,
      premiseDetails: input.premiseDetails,
      factHandlingMode: input.factHandlingMode,
      graphContext: input.graphContext,
      assembledContext: input.assembledContext,
      narrativePlan: input.narrativePlan,
    });
  } catch (error) {
    if (isRetentionStoryError(error)) {
      return failResult(mapStoryErrorReason(error.reason), {
        safeReasonIds: Object.freeze([error.reason]),
      });
    }
    return failResult("contract_normalization_failure");
  }

  try {
    contract = normalizeStoryContract(contractInput);
  } catch (error) {
    if (isRetentionStoryError(error)) {
      return failResult(mapStoryErrorReason(error.reason), {
        safeReasonIds: Object.freeze([error.reason]),
      });
    }
    return failResult("contract_normalization_failure");
  }

  try {
    grounding = normalizeRetentionGroundingContext(
      contractInput.grounding ?? {
        version: 1,
        claims: [],
        researchIdentity: null,
      },
    );
  } catch (error) {
    const emptyOrUnavailableResearch =
      input.researchAttemptedWithoutData === true ||
      input.researchApplied !== true;
    const allowSoft =
      input.creationReliabilityMode !== "precise" &&
      emptyOrUnavailableResearch &&
      isRetentionStoryError(error) &&
      isSoftEmptyResearchGroundingReason(error.reason);
    if (allowSoft) {
      grounding = normalizeRetentionGroundingContext({
        version: 1,
        claims: [],
        researchIdentity: null,
      });
      softEmptyResearchGrounding = true;
    } else if (isRetentionStoryError(error)) {
      return failResult(mapStoryErrorReason(error.reason), {
        safeReasonIds: Object.freeze([error.reason]),
      });
    } else {
      return failResult("grounding_failure");
    }
  }

  if (contract.generationPath === "scenes_only") {
    return failResult("scenes_only_not_applicable", {
      contractFingerprint: contract.contractFingerprint,
      qualityMode: "scenes_only",
    });
  }

  const captureSession = isRetentionRejectedProposalCaptureEnabled(input)
    ? createRetentionRejectedProposalCaptureSession({
        caseId: input.rejectedProposalCaptureCaseId ?? "uncategorized",
      })
    : null;
  if (captureSession) {
    bindRetentionRejectedProposalCapture(captureSession);
  }

  // Private-data-free boundary: model resolution → adapters → plan → Hook →
  // terminal validation → commit. Unknown provider/model errors never escape.
  try {
    // One path-global ledger for the entire attempt.
    const ledger = createRetentionModelCallLedger(contract.qualityMode);
    const acceptanceTrace = createRetentionGenerationAcceptanceTraceRecorder();
    const model =
      input.model ?? (await resolveProductionScriptModel(contract.qualityMode));

    const planner =
      input.planner !== undefined
        ? input.planner
        : contract.qualityMode === "cheap"
          ? null
          : await loadProductionPlanner(model);

    const composer =
      input.composer !== undefined
        ? input.composer
        : await loadProductionComposer(model);

    if (input.composer === null || composer == null) {
      acceptanceTrace.record("model_call_unavailable");
    }

    const rewriteComposer =
      input.rewriteComposer !== undefined
        ? input.rewriteComposer
        : input.composer !== undefined
          ? null
          : contract.qualityMode === "best"
            ? await loadProductionRewriteComposer(model, contract.durationSec)
            : null;

    const lengthComposer =
      input.lengthComposer !== undefined
        ? input.lengthComposer
        : input.composer !== undefined
          ? composer
          : await loadProductionComposer(model);

    const adaptations: RetentionGenerationAdaptationId[] = [];
    let omittedAuthorizedClaimIds: string[] = [];
    if (softEmptyResearchGrounding) {
      adaptations.push("unsupported_facts_omitted");
    }
    const emptyPremiseGuidance =
      contract.factHandlingMode === "creative_premise" &&
      !(input.premiseDetails ?? "").trim();
    const adaptiveBeats = resolveAdaptiveRetentionBeatCount(contract);
    if (adaptiveBeats.compacted) {
      adaptations.push("beat_plan_compacted");
    }

    let planResult;
    try {
      planResult = await buildRetentionStoryPlan({
        contract,
        grounding,
        manualContext: creatorManualContext,
        userInstructions: creatorUserInstructions,
        planner,
        ledger,
      });
    } catch (error) {
      if (
        isRetentionStoryError(error) &&
        (error.reason === "model_call_ledger_invalid" ||
          error.reason === "model_call_budget_exhausted")
      ) {
        return failResult(mapStoryErrorReason(error.reason), {
          contractFingerprint: contract.contractFingerprint,
          qualityMode: contract.qualityMode,
          safeReasonIds: Object.freeze([error.reason]),
          budget: summarizeLedgerBudget(ledger.snapshot()),
        });
      }
      // Planner throw → deterministic reliability plan (non-blocking preference).
      planResult = buildReliabilityDeterministicRetentionPlan({
        contract,
        grounding,
        manualContext: creatorManualContext,
        userInstructions: creatorUserInstructions,
        planner: null,
        ledger,
      });
      adaptations.push("planner_fallback_used");
    }

    if (planResult.status === "skipped") {
      return failResult("scenes_only_not_applicable", {
        contractFingerprint: contract.contractFingerprint,
        qualityMode: contract.qualityMode,
        budget: summarizeLedgerBudget(ledger.snapshot()),
      });
    }

    if (planResult.status === "failed") {
      // Sprint 10H.3 — model planning is advisory; continue with deterministic plan.
      planResult = buildReliabilityDeterministicRetentionPlan({
        contract,
        grounding,
        manualContext: creatorManualContext,
        userInstructions: creatorUserInstructions,
        planner: null,
        ledger,
      });
      adaptations.push("planner_fallback_used");
      if (planResult.status !== "ready") {
        return failResult("planner_failed", {
          contractFingerprint: contract.contractFingerprint,
          qualityMode: contract.qualityMode,
          budget: summarizeLedgerBudget(ledger.snapshot()),
          safeReasonIds: Object.freeze(["planner_fallback_unavailable"]),
        });
      }
    }

    let { plan, strategySeed } = planResult;

    const researchEvidence =
      input.researchEvidence ??
      buildNeutralResearchEvidence({
        assembled: input.assembledContext ?? undefined,
        graphContext: input.graphContext ?? undefined,
        narrativePlan: input.narrativePlan ?? undefined,
        researchAttempted:
          input.researchAttemptedWithoutData === true ||
          input.researchApplied === true,
        researchApplied: input.researchApplied === true,
        ...(creatorManualContext != null
          ? { manualContext: creatorManualContext }
          : {}),
      });

    const buildHookContext = (hookStyleOverride?: typeof input.hookStyle) => {
      const resolvedHookStyle = hookStyleOverride ?? effectiveHookStyle;
      // Auto / Write My Own are not selectable strategy ids for the adapter.
      const requestedStrategyId =
        hookStyleOverride === "auto" ||
        resolvedHookStyle === "auto" ||
        resolvedHookStyle === "user_written"
          ? undefined
          : (input.requestedStrategyId ??
            requestedStrategyIdFromHookStyle(resolvedHookStyle));
      return buildHookGenerationContext({
        topic,
        scriptMode: contract.scriptMode,
        tone: contract.tone,
        durationSeconds: contract.durationSec,
        generationPath: input.generationPath,
        template: {
          ...(input.templateId ? { templateId: input.templateId } : {}),
          ...(input.openingStyleAdvisory
            ? { openingStyleAdvisory: input.openingStyleAdvisory }
            : {}),
        },
        ...(resolvedHookStyle === "user_written" && input.userAuthoredHook
          ? { userAuthoredHook: input.userAuthoredHook }
          : {}),
        ...(requestedStrategyId ? { requestedStrategyId } : {}),
        researchEvidence,
        researchUnavailable: input.researchAttemptedWithoutData === true,
      });
    };

    const selectedHookStyle = effectiveHookStyle;

    const runBridge = async (
      activePlan: typeof plan,
      activeSeed: typeof strategySeed,
      activeComposer: typeof composer,
      hookContext: ReturnType<typeof buildHookContext>,
      activeHookStyle: typeof selectedHookStyle,
      billingMode: "model" | "deterministic" = "model",
    ) =>
      runRetentionHookBridge({
        contract,
        plan: activePlan,
        strategySeed: activeSeed,
        grounding,
        manualContext: creatorManualContext,
        userInstructions: creatorUserInstructions,
        hookStyle: activeHookStyle,
        hookContext,
        composer: activeComposer,
        ledger,
        billingMode,
        ...(input.hookRunner ? { hookRunner: input.hookRunner } : {}),
        topic,
        tone: contract.tone,
        duration: contract.durationSec,
        scriptMode: contract.scriptMode,
        ...(generationContext != null || creatorManualContext != null
          ? { context: generationContext ?? creatorManualContext ?? undefined }
          : {}),
        templatePromptBlock: input.templatePromptBlock,
        qualityMode: contract.qualityMode,
        model,
      });

    const preciseMode = input.creationReliabilityMode === "precise";
    const reliabilityMode: CreationReliabilityMode = preciseMode
      ? "precise"
      : "flexible";
    // Sprint 10H.5B — capture creator-requested Hook authority once, before
    // the first bridge. Final disposition compares this to committed authority.
    let initialHookContext: ReturnType<typeof buildHookContext>;
    try {
      initialHookContext = buildHookContext();
    } catch {
      return failResult("hook_terminal_failure", {
        contractFingerprint: contract.contractFingerprint,
        planFingerprint: plan.planFingerprint,
        qualityMode: contract.qualityMode,
        safeReasonIds: Object.freeze(["hook_preference_authority_incoherent"]),
        budget: summarizeLedgerBudget(ledger.snapshot()),
      });
    }
    const requestedHookAuthority = captureRetentionRequestedHookAuthority({
      selectedHookStyle,
      reliabilityMode,
      initialHookContext,
    });
    let deterministicRescueUsed = false;
    let canonicalRescueSnapshot: DeterministicFallbackBuildResult | null = null;

    let hookBridge: Awaited<ReturnType<typeof runRetentionHookBridge>> | null =
      null;
    try {
      hookBridge = await runBridge(
        plan,
        strategySeed,
        composer,
        initialHookContext,
        selectedHookStyle,
      );
    } catch {
      hookBridge = null;
    }

    // A rejected user-written opening is a candidate failure, not a story
    // failure. The deterministic rescue below first tries to preserve it, then
    // may reconcile to a safe Auto opening with creator-facing diagnostics.

    // Sprint 10H.3B — explicit Hook preference: zero-model Auto reconcile
    // against the preserved composed candidate. Never a second model initial.
    // Explicit preferences may reconcile to Auto so story creation continues.
    // Provisional branch markers are not final disposition authority (10H.5B).
    const bridgeFailedForHookPreference =
      hookBridge != null &&
      hookBridge.status === "failed" &&
      (hookBridge.reason === "hook_terminal_failure" ||
        hookBridge.reason === "candidate_reconciliation_failed") &&
      hookBridge.composedCandidate != null;
    if (
      bridgeFailedForHookPreference &&
      selectedHookStyle != null &&
      selectedHookStyle !== "auto" &&
      selectedHookStyle !== "user_written" &&
      hookBridge != null &&
      hookBridge.status === "failed" &&
      hookBridge.composedCandidate
    ) {
      const reconciled = reconcileRetentionHookPreferenceZeroModel({
        contract,
        plan,
        grounding,
        strategySeed,
        ledger,
        sourceCandidate: hookBridge.composedCandidate,
        title: hookBridge.composedTitle ?? "Story",
        autoHookContext: buildHookContext("auto"),
      });
      if (reconciled.status === "ready") {
        hookBridge = reconciled;
      }
    }

    // One deterministic narration rescue (Auto-compatible, or Write My Own
    // body rescue retaining the exact user opening). At most once.
    // Precise + explicit Hook: rescue only with the same Hook context (no Auto).
    if (hookBridge == null || hookBridge.status !== "ready") {
      if (hookBridge == null) {
        acceptanceTrace.record("model_call_failed");
      } else if (hookBridge.status === "failed") {
        acceptanceTrace.record(
          mapHookBridgeReasonToAcceptanceStage(
            hookBridge.reason,
            hookBridge.normalizeSeam,
          ),
          providerFailureRecordExtras(hookBridge),
        );
      }
      const reliabilityPlan = buildReliabilityDeterministicRetentionPlan({
        contract,
        grounding,
        manualContext: creatorManualContext,
        userInstructions: creatorUserInstructions,
        planner: null,
        ledger,
      });
      if (reliabilityPlan.status === "ready") {
        plan = reliabilityPlan.plan;
        strategySeed = reliabilityPlan.strategySeed;
        if (!adaptations.includes("planner_fallback_used")) {
          adaptations.push("planner_fallback_used");
        }
        const preserveOpening =
          selectedHookStyle === "user_written" && input.userAuthoredHook
            ? input.userAuthoredHook
            : null;
        const rescueHookContext =
          selectedHookStyle === "user_written"
            ? buildHookContext()
            : buildHookContext("auto");
        const fallbackComposer = buildDeterministicFallbackComposer({
          contract,
          plan,
          grounding,
          strategySeed,
          hookStyle: selectedHookStyle ?? null,
          ...(preserveOpening ? { preserveOpeningText: preserveOpening } : {}),
          onBuilt: (meta) => {
            omittedAuthorizedClaimIds = [...meta.omittedClaimIds];
            if (meta.hookReconciled && !adaptations.includes("hook_style_reconciled")) {
              adaptations.push("hook_style_reconciled");
            }
            if (!canonicalRescueSnapshot) {
              canonicalRescueSnapshot = buildDeterministicFallbackNarrationCandidate({
                contract,
                plan,
                grounding,
                strategySeed,
                hookStyle: selectedHookStyle ?? null,
                ...(preserveOpening ? { preserveOpeningText: preserveOpening } : {}),
              });
            }
          },
        });
        try {
          const rescued = await runBridge(
            plan,
            strategySeed,
            fallbackComposer,
            rescueHookContext,
            selectedHookStyle === "user_written" ? "user_written" : "auto",
            "deterministic",
          );
          acceptanceTrace.record("deterministic_rescue_entered");
          deterministicRescueUsed = true;
          if (rescued.status === "ready") {
            const authorisedHookReplacement = selectedHookStyle !== "user_written";
            const preserved =
              canonicalRescueSnapshot == null ||
              rescuePromotionPreservesCanonical(
                canonicalRescueSnapshot,
                rescued.approvedNarration,
                authorisedHookReplacement,
              );
            if (preserved) {
              hookBridge = rescued;
              adaptations.push("reliability_rescue_used");
              adaptations.push("deterministic_story_fallback_used");
              acceptanceTrace.record("deterministic_rescue_accepted");
            } else if (canonicalRescueSnapshot) {
              const retried = promoteRetentionRescueWithFidelity({
                contract,
                plan,
                grounding,
                strategySeed,
                ledger,
                built: canonicalRescueSnapshot,
                hookContext: rescueHookContext,
                authorisedHookReplacement,
              });
              if (retried.status === "ready") {
                hookBridge = retried;
                adaptations.push("reliability_rescue_used");
                adaptations.push("deterministic_story_fallback_used");
                acceptanceTrace.record("deterministic_rescue_accepted");
              }
            }
          }
        } catch {
          acceptanceTrace.record("deterministic_rescue_entered");
          deterministicRescueUsed = true;
          // continue to fail below if still not ready
        }
      }
    }

    // Last resort: zero-model deterministic candidate + Auto-compatible Hook.
    if (hookBridge == null || hookBridge.status !== "ready") {
      const reliabilityPlan = buildReliabilityDeterministicRetentionPlan({
        contract,
        grounding,
        manualContext: creatorManualContext,
        userInstructions: creatorUserInstructions,
        planner: null,
        ledger,
      });
      if (reliabilityPlan.status === "ready") {
        plan = reliabilityPlan.plan;
        strategySeed = reliabilityPlan.strategySeed;
        if (!adaptations.includes("planner_fallback_used")) {
          adaptations.push("planner_fallback_used");
        }
        const built =
          canonicalRescueSnapshot != null &&
          (selectedHookStyle == null || selectedHookStyle === "auto")
            ? canonicalRescueSnapshot
            : buildDeterministicFallbackNarrationCandidate({
                contract,
                plan,
                grounding,
                strategySeed,
                hookStyle: "auto",
              });
        canonicalRescueSnapshot = built;
        if (
          built.hookReconciled &&
          !adaptations.includes("hook_style_reconciled")
        ) {
          adaptations.push("hook_style_reconciled");
        }
        ensureDeterministicNarrationEvidence(ledger);
        omittedAuthorizedClaimIds = [...built.omittedClaimIds];
        const promoted = promoteRetentionRescueWithFidelity({
          contract,
          plan,
          grounding,
          strategySeed,
          ledger,
          built,
          hookContext: buildHookContext("auto"),
          authorisedHookReplacement: true,
        });
        if (promoted.status === "ready") {
          hookBridge = promoted;
          deterministicRescueUsed = true;
          adaptations.push("reliability_rescue_used");
          adaptations.push("deterministic_story_fallback_used");
          if (
            selectedHookStyle != null &&
            selectedHookStyle !== "auto" &&
            !adaptations.includes("hook_style_reconciled")
          ) {
            adaptations.push("hook_style_reconciled");
          }
          acceptanceTrace.record("deterministic_rescue_entered");
          acceptanceTrace.record("deterministic_rescue_accepted");
        } else {
          hookBridge = promoted;
        }
      }
    }

    if (hookBridge != null && hookBridge.status === "ready") {
      captureSession?.recordStage(
        "after_hook_promotion",
        hookBridge.approvedNarration,
      );
      captureSession?.recordStage(
        "after_mapping",
        hookBridge.candidate.assembledNarration,
      );
      const priorModel = captureSession?.getRecordedStage("before_normalization");
      const priorNarration =
        typeof priorModel === "string" && priorModel.trim()
          ? priorModel
          : hookBridge.candidate.assembledNarration;
      if (
        deterministicRescueUsed ||
        hookBridge.diagnostics.compositionAuthority === "deterministic_rescue"
      ) {
        recordRetentionNarrationTransform({
          stage: "deterministic_rescue",
          inputNarration: priorNarration,
          outputNarration: hookBridge.approvedNarration,
          reason: "deterministic_rescue",
          changedRegion: "full",
          authority: "deterministic_rescue",
        });
      } else {
        recordRetentionNarrationTransform({
          stage: "after_hook_promotion",
          inputNarration: hookBridge.candidate.assembledNarration,
          outputNarration: hookBridge.approvedNarration,
          reason: "hook_bridge_ready",
          authority: hookBridge.diagnostics.compositionAuthority ?? "model_initial",
        });
      }
    }

    if (hookBridge == null || hookBridge.status !== "ready") {
      const reason =
        hookBridge == null
          ? "composer_call_failed"
          : hookBridge.status === "skipped"
            ? "scenes_only"
            : hookBridge.reason;
      acceptanceTrace.record(
        mapHookBridgeReasonToAcceptanceStage(
          reason,
          hookBridge != null && hookBridge.status === "failed"
            ? hookBridge.normalizeSeam
            : undefined,
        ),
        providerFailureRecordExtras(
          hookBridge != null && hookBridge.status === "failed"
            ? hookBridge
            : null,
        ),
      );
      return failResult(mapHookBridgeFailure(reason), {
        contractFingerprint: contract.contractFingerprint,
        planFingerprint: plan.planFingerprint,
        qualityMode: contract.qualityMode,
        safeReasonIds: Object.freeze([reason]),
        budget: summarizeLedgerBudget(ledger.snapshot()),
        acceptanceTrace: acceptanceTrace.freeze(),
        ...(hookBridge != null &&
        hookBridge.status === "failed" &&
        "hookPlanSnapshot" in hookBridge &&
        hookBridge.hookPlanSnapshot
          ? { hookPlanSnapshot: hookBridge.hookPlanSnapshot }
          : {}),
        ...(hookBridge != null &&
        hookBridge.status === "failed" &&
        "hookDiagnostics" in hookBridge &&
        hookBridge.hookDiagnostics
          ? { hookDiagnostics: hookBridge.hookDiagnostics }
          : {}),
      });
    }

    // Sprint 10H.4B — zero-model participant-coverage reconcile before terminal.
    {
      const coverage = buildRetentionParticipantCoverage(contract);
      const coverageEval = evaluateRetentionParticipantCoverage({
        coverage,
        narration: hookBridge.candidate.assembledNarration,
      });
      if (coverage.required && !coverageEval.passed) {
        const reconciled = reconcileRetentionParticipantCoverageZeroModel({
          contract,
          plan,
          grounding,
          strategySeed,
          candidate: hookBridge.candidate,
        });
        if (reconciled.ok) {
          const promoted = rebuildRetentionReadyBridgeFromCandidate({
            contract,
            plan,
            grounding,
            strategySeed,
            ledger,
            sourceCandidate: reconciled.candidate,
            title: hookBridge.title,
            hookContext: buildHookContext(),
            compositionAuthority: hookBridge.diagnostics.compositionAuthority,
          });
          if (promoted.status === "ready") {
            hookBridge = promoted;
            adaptations.push("participant_coverage_reconciled");
          }
        }
      }
    }

    let terminal = await runRetentionTerminalValidation({
      contract,
      grounding,
      strategySeed,
      plan,
      hookBridge,
      candidate: hookBridge.candidate,
      ledger,
      rewriteComposer,
      lengthComposer,
      manualContext: creatorManualContext,
      userInstructions: creatorUserInstructions,
      creatorContextAuthority,
    });

    // Post-rewrite / terminal miss: one zero-model participant reconcile, then revalidate.
    const terminalFailedParticipantCoverage =
      terminal.status !== "pass_without_rewrite" &&
      terminal.status !== "pass_after_rewrite" &&
      (terminal.diagnostics.validationFailureSummary?.failedHardGateIds.includes(
        "required_participant_coverage",
      ) === true ||
        terminal.diagnostics.safeReasonIds.includes(
          "required_participant_missing",
        ));
    if (
      terminalFailedParticipantCoverage &&
      !adaptations.includes("participant_coverage_reconciled")
    ) {
      const sourceCandidate =
        "candidate" in terminal && terminal.candidate
          ? terminal.candidate
          : hookBridge.candidate;
      const reconciled = reconcileRetentionParticipantCoverageZeroModel({
        contract,
        plan,
        grounding,
        strategySeed,
        candidate: sourceCandidate,
      });
      if (reconciled.ok) {
        const promoted = rebuildRetentionReadyBridgeFromCandidate({
          contract,
          plan,
          grounding,
          strategySeed,
          ledger,
          sourceCandidate: reconciled.candidate,
          title: hookBridge.title,
          hookContext: buildHookContext(),
          compositionAuthority: hookBridge.diagnostics.compositionAuthority,
        });
        if (promoted.status === "ready") {
          hookBridge = promoted;
          adaptations.push("participant_coverage_reconciled");
          terminal = await runRetentionTerminalValidation({
            contract,
            grounding,
            strategySeed,
            plan,
            hookBridge: promoted,
            candidate: promoted.candidate,
            ledger,
            rewriteComposer: null,
            lengthComposer: null,
            manualContext: creatorManualContext,
            userInstructions: creatorUserInstructions,
            creatorContextAuthority,
          });
        }
      }
    }

    // Terminal recoverable failure: deterministic structural/length rescue.
    // Flexible may still recover after Hook-stage rescue was already used —
    // ordinary content/structure gates must not remain terminal.
    let flexibleStructuralRescueUsed = false;
    {
      const terminalMiss =
        terminal.status !== "pass_without_rewrite" &&
        terminal.status !== "pass_after_rewrite";
      const failedGates =
        terminal.diagnostics.validationFailureSummary?.failedHardGateIds ?? [];
      const authorityTerminal =
        isFlexibleAuthorityTerminalSafeReason(
          terminal.diagnostics.safeReasonIds,
        ) ||
        failedGates.some((id) => isTerminalAuthorityRetentionHardGateId(id));
      const recoverable =
        !authorityTerminal &&
        (retentionFailedGatesAreFlexibleRecoverable({
          failedHardGateIds: failedGates,
          safeReasonIds: terminal.diagnostics.safeReasonIds,
        }) ||
          terminal.status === "length_enforcement_failed" ||
          terminal.diagnostics.safeReasonIds.some((id) =>
            /length|overrun|word_budget|spoken_completeness/i.test(id),
          ));
      const allowOrdinaryDetRescue = !deterministicRescueUsed;
      const allowFlexibleStructural =
        recoverable &&
        !flexibleStructuralRescueUsed;
      const allowWmoLengthRescue =
        selectedHookStyle === "user_written" &&
        recoverable &&
        !deterministicRescueUsed;

      if (
        terminalMiss &&
        (allowOrdinaryDetRescue || allowFlexibleStructural || allowWmoLengthRescue)
      ) {
        acceptanceTrace.record(
          mapTerminalMissToAcceptanceStage({
            terminalStatus: terminal.status,
            failedHardGateIds: failedGates,
            safeReasonIds: terminal.diagnostics.safeReasonIds,
          }),
        );
        const lengthish =
          terminal.status === "length_enforcement_failed" ||
          terminal.diagnostics.safeReasonIds.some((id) =>
            /length|overrun|word_budget|spoken_completeness/i.test(id),
          );
        if (lengthish && !adaptations.includes("length_rescue_used")) {
          adaptations.push("length_rescue_used");
        }

        const reliabilityPlan = buildReliabilityDeterministicRetentionPlan({
          contract,
          grounding,
          manualContext: creatorManualContext,
          userInstructions: creatorUserInstructions,
          planner: null,
          ledger,
        });
        if (reliabilityPlan.status === "ready") {
          plan = reliabilityPlan.plan;
          strategySeed = reliabilityPlan.strategySeed;
          const preserveOpening =
            selectedHookStyle === "user_written" && input.userAuthoredHook
              ? input.userAuthoredHook
              : null;
          const rescueHookContext =
            selectedHookStyle === "user_written"
              ? buildHookContext()
              : buildHookContext("auto");

          // Prefer zero-model promote when Hook-stage rescue already ran
          // (avoids a second full bridge round-trip that can re-fail preference).
          if (allowFlexibleStructural && deterministicRescueUsed) {
            acceptanceTrace.record("deterministic_rescue_entered");
            const built =
              canonicalRescueSnapshot ??
              buildDeterministicFallbackNarrationCandidate({
                contract,
                plan,
                grounding,
                strategySeed,
                hookStyle: selectedHookStyle ?? null,
                ...(preserveOpening
                  ? { preserveOpeningText: preserveOpening }
                  : {}),
              });
            canonicalRescueSnapshot = built;
            if (
              built.hookReconciled &&
              !adaptations.includes("hook_style_reconciled")
            ) {
              adaptations.push("hook_style_reconciled");
            }
            ensureDeterministicNarrationEvidence(ledger);
            omittedAuthorizedClaimIds = [...built.omittedClaimIds];
            const promoted = promoteRetentionRescueWithFidelity({
              contract,
              plan,
              grounding,
              strategySeed,
              ledger,
              built,
              hookContext: rescueHookContext,
              authorisedHookReplacement: selectedHookStyle !== "user_written",
            });
            flexibleStructuralRescueUsed = true;
            if (promoted.status === "ready") {
              if (!adaptations.includes("reliability_rescue_used")) {
                adaptations.push("reliability_rescue_used");
              }
              if (!adaptations.includes("deterministic_story_fallback_used")) {
                adaptations.push("deterministic_story_fallback_used");
              }
              acceptanceTrace.record("deterministic_rescue_accepted");
              hookBridge = promoted;
              terminal = await runRetentionTerminalValidation({
                contract,
                grounding,
                strategySeed,
                plan,
                hookBridge: promoted,
                candidate: promoted.candidate,
                ledger,
                rewriteComposer: null,
                lengthComposer: null,
                manualContext: creatorManualContext,
                userInstructions: creatorUserInstructions,
                creatorContextAuthority,
              });
            }
          } else {
            const fallbackComposer = buildDeterministicFallbackComposer({
              contract,
              plan,
              grounding,
              strategySeed,
              hookStyle: selectedHookStyle ?? null,
              ...(preserveOpening
                ? { preserveOpeningText: preserveOpening }
                : {}),
              onBuilt: (meta) => {
                omittedAuthorizedClaimIds = [...meta.omittedClaimIds];
                if (
                  meta.hookReconciled &&
                  !adaptations.includes("hook_style_reconciled")
                ) {
                  adaptations.push("hook_style_reconciled");
                }
              },
            });
            try {
              acceptanceTrace.record("deterministic_rescue_entered");
              const rescuedBridge = await runBridge(
                plan,
                strategySeed,
                fallbackComposer,
                rescueHookContext,
                selectedHookStyle === "user_written" ? "user_written" : "auto",
                "deterministic",
              );
              deterministicRescueUsed = true;
              if (allowFlexibleStructural) {
                flexibleStructuralRescueUsed = true;
              }
              if (rescuedBridge.status === "ready") {
                if (!adaptations.includes("reliability_rescue_used")) {
                  adaptations.push("reliability_rescue_used");
                }
                if (!adaptations.includes("deterministic_story_fallback_used")) {
                  adaptations.push("deterministic_story_fallback_used");
                }
                acceptanceTrace.record("deterministic_rescue_accepted");
                hookBridge = rescuedBridge;
                terminal = await runRetentionTerminalValidation({
                  contract,
                  grounding,
                  strategySeed,
                  plan,
                  hookBridge: rescuedBridge,
                  candidate: rescuedBridge.candidate,
                  ledger,
                  rewriteComposer: null,
                  lengthComposer: null,
                  manualContext: creatorManualContext,
                  userInstructions: creatorUserInstructions,
                  creatorContextAuthority,
                });
              }
            } catch {
              acceptanceTrace.record("deterministic_rescue_entered");
              deterministicRescueUsed = true;
              // fall through
            }
          }
        }
      }
    }

    if (
      terminal.status !== "pass_without_rewrite" &&
      terminal.status !== "pass_after_rewrite"
    ) {
      return failResult(
        mapTerminalFailure(
          terminal.status as Exclude<
            typeof terminal.status,
            "pass_without_rewrite" | "pass_after_rewrite" | "skipped_scenes_only"
          >,
          terminal.diagnostics.safeReasonIds,
        ),
        {
          contractFingerprint: contract.contractFingerprint,
          planFingerprint: plan.planFingerprint,
          candidateFingerprint: terminal.diagnostics.finalCandidateFingerprint,
          validationFingerprint:
            terminal.diagnostics.finalValidationFingerprint ??
            terminal.diagnostics.initialValidationFingerprint,
          qualityMode: contract.qualityMode,
          terminalState: terminal.status,
          rewriteUsed: terminal.diagnostics.rewriteUsed,
          safeReasonIds: terminal.diagnostics.safeReasonIds,
          budget: summarizeLedgerBudget(ledger.snapshot()),
          acceptanceTrace: acceptanceTrace.freeze(),
          ...(terminal.diagnostics.validationFailureSummary
            ? {
                validationFailureSummary:
                  terminal.diagnostics.validationFailureSummary,
              }
            : {}),
          hookPlanSnapshot: hookBridge.hookPlanSnapshot,
          hookDiagnostics: hookBridge.hookDiagnostics,
        },
      );
    }

    if (
      terminal.diagnostics.safeReasonIds.includes("quality_below_target") ||
      (terminal.validation.failureClass === "quality_threshold" &&
        terminal.validation.ok)
    ) {
      adaptations.push("quality_below_target");
    }

    const claimAdaptations = deriveRetentionClaimAdaptations({
      contract,
      grounding,
      candidate: terminal.candidate,
      premiseDetails: input.premiseDetails,
      manualContext: creatorManualContext,
      omittedAuthorizedClaimIds,
    });
    for (const id of claimAdaptations) {
      if (!adaptations.includes(id)) adaptations.push(id);
    }

    // Sprint 10H.5B — canonical Hook preference disposition from final bridge.
    const finalReadyBridge = terminal.hookBridge;
    const adaptationsForDisposition = adaptations.filter(
      (id) => id !== "hook_style_reconciled",
    ) as RetentionGenerationAdaptationId[];
    const hookPref = hookStyleReconciledBeforeContract
      ? ({
          status: "ok" as const,
          adaptation: "hook_style_reconciled" as const,
        })
      : deriveRetentionHookPreferenceAdaptation({
          reliabilityMode,
          selectedHookStyle: creatorSelectedHookStyle ?? "auto",
          requestedHookPlan: requestedHookAuthority,
          finalHookPlan: finalReadyBridge.hookPlanSnapshot,
        });
    if (hookPref.status === "fail") {
      return failResult("hook_terminal_failure", {
        contractFingerprint: contract.contractFingerprint,
        planFingerprint: plan.planFingerprint,
        qualityMode: contract.qualityMode,
        terminalState: terminal.status,
        safeReasonIds: Object.freeze([hookPref.safeReasonId]),
        budget: summarizeLedgerBudget(ledger.snapshot()),
        errorMessage:
          hookPref.safeReasonId === "precise_mode_no_silent_hook_auto"
            ? PRECISE_HOOK_NO_SILENT_AUTO_MESSAGE
            : hookPref.safeReasonId === "user_authored_hook_authority_mismatch"
              ? WRITE_MY_OWN_AUTHORITY_MISMATCH_MESSAGE
              : undefined,
        hookPlanSnapshot: finalReadyBridge.hookPlanSnapshot,
        hookDiagnostics: finalReadyBridge.hookDiagnostics,
      });
    }
    if (hookPref.adaptation) {
      adaptationsForDisposition.push(hookPref.adaptation);
    }

    const usedDeterministicFallback = adaptationsForDisposition.includes(
      "deterministic_story_fallback_used",
    );
    if (
      usedDeterministicFallback &&
      !adaptationsForDisposition.includes("quality_below_target")
    ) {
      adaptationsForDisposition.push("quality_below_target");
    }

    const boundedRewriteType =
      finalReadyBridge.diagnostics.boundedRewriteType === "opening_repair" ||
      finalReadyBridge.diagnostics.boundedRewriteType === "ranking_payoff_repair" ||
      finalReadyBridge.diagnostics.boundedRewriteType ===
        "supported_opening_promotion" ||
      finalReadyBridge.diagnostics.boundedRewriteType === "duration_compression"
        ? finalReadyBridge.diagnostics.boundedRewriteType
        : undefined;
    const rewriteUsed =
      terminal.status === "pass_after_rewrite" || boundedRewriteType != null;
    if (usedDeterministicFallback) {
      // Ensure rescue markers exist even when a later promote path accepted.
      acceptanceTrace.record("deterministic_rescue_entered");
      acceptanceTrace.record("deterministic_rescue_accepted");
    } else if (rewriteUsed) {
      acceptanceTrace.record("rewrite_accepted");
    } else {
      acceptanceTrace.record("model_narration_accepted");
    }

    if (
      !usedDeterministicFallback &&
      (terminal.validation.notes.includes("quality_below_target") ||
        terminal.validation.notes.includes("narration_substance_below_target"))
    ) {
      acceptanceTrace.record("acceptance_quality_rejection");
    }

    const frozenAcceptanceTrace = acceptanceTrace.freeze({
      finalNarrationAuthority: usedDeterministicFallback
        ? "deterministic_rescue"
        : rewriteUsed
          ? "model_after_rewrite"
          : "model_direct",
      ...(boundedRewriteType ? { boundedRewriteType } : {}),
    });

    let dispositionWarningNotes = [...terminal.validation.notes];
    if (usedDeterministicFallback) {
      dispositionWarningNotes = dispositionWarningNotes.filter(
        (note) => note !== "validation_pass",
      );
      if (!dispositionWarningNotes.includes("quality_below_target")) {
        dispositionWarningNotes.push("quality_below_target");
      }
      if (
        !dispositionWarningNotes.includes("validation_pass_with_quality_warning")
      ) {
        dispositionWarningNotes.push("validation_pass_with_quality_warning");
      }
      if (!dispositionWarningNotes.includes("deterministic_fallback_accepted")) {
        dispositionWarningNotes.push("deterministic_fallback_accepted");
      }
    }

    const disposition = buildRetentionGenerationDisposition({
      contract,
      plan,
      narration: terminal.candidate.assembledNarration,
      warningNotes: dispositionWarningNotes,
      adaptations: adaptationsForDisposition,
      emptyPremiseGuidance,
      acceptanceTrace: frozenAcceptanceTrace,
    });

    const dispositionCoherence =
      assertRetentionHookPreferenceDispositionCoherence({
        derive: hookPref,
        adaptations: disposition.adaptations,
        creatorFacingNotes: disposition.creatorFacingNotes,
      });
    if (dispositionCoherence.status === "fail") {
      return failResult("commit_gate_coherence_failure", {
        contractFingerprint: contract.contractFingerprint,
        planFingerprint: plan.planFingerprint,
        qualityMode: contract.qualityMode,
        terminalState: terminal.status,
        safeReasonIds: Object.freeze([dispositionCoherence.safeReasonId]),
        budget: summarizeLedgerBudget(ledger.snapshot()),
        acceptanceTrace: frozenAcceptanceTrace,
        hookPlanSnapshot: finalReadyBridge.hookPlanSnapshot,
        hookDiagnostics: finalReadyBridge.hookDiagnostics,
      });
    }

    const committed = commitRetentionApprovedNarration({
      terminal,
      contract,
      grounding,
      strategySeed,
      plan,
      ledger,
      title: finalReadyBridge.title,
      generationDisposition: disposition,
      creatorContextAuthority,
      acceptanceTrace: frozenAcceptanceTrace,
      ...(usedDeterministicFallback
        ? { validationWarningNotesOverride: dispositionWarningNotes }
        : {}),
      ...(finalReadyBridge.lengthWarning
        ? { lengthWarning: finalReadyBridge.lengthWarning }
        : {}),
    });

    if (!committed.ok) {
      return failResult("commit_gate_coherence_failure", {
        contractFingerprint: contract.contractFingerprint,
        planFingerprint: plan.planFingerprint,
        qualityMode: contract.qualityMode,
        terminalState: terminal.status,
        safeReasonIds: committed.safeReasonIds,
        budget: summarizeLedgerBudget(ledger.snapshot()),
        hookPlanSnapshot: hookBridge.hookPlanSnapshot,
        hookDiagnostics: hookBridge.hookDiagnostics,
      });
    }

    return Object.freeze({
      ok: true as const,
      approved: committed.approved,
    });
  } catch (error) {
    // Never rethrow provider/model/stack payloads to /api/generate-script.
    if (isRetentionStoryError(error)) {
      return failResult(mapStoryErrorReason(error.reason), {
        contractFingerprint: contract.contractFingerprint,
        qualityMode: contract.qualityMode,
        safeReasonIds: Object.freeze([error.reason]),
      });
    }
    return failResult("production_internal_failure", {
      contractFingerprint: contract.contractFingerprint,
      qualityMode: contract.qualityMode,
      safeReasonIds: Object.freeze(["unhandled_production_exception"]),
    });
  } finally {
    try {
      captureSession?.flush();
    } finally {
      bindRetentionRejectedProposalCapture(null);
    }
  }
}

/** Test helper — expose RetentionStoryError for injected adapter failures. */
export function retentionProductionThrownAsStoryError(
  reason: Parameters<typeof mapStoryErrorReason>[0],
  message: string,
): RetentionStoryError {
  return new RetentionStoryError(reason, message);
}
