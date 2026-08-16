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

import type {
  HookedNarrationModelCall,
  HookedNarrationModelResult,
} from "@/features/hook-engine/integration/generate-hooked-narration";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";

import type { RetentionSafeProviderFailure } from "../domain/retention-provider-failure.types";
import { RetentionStoryError, isRetentionStoryError } from "../domain/retention-story-errors";
import {
  isRetentionProviderRequestError,
  retentionStoryErrorFromProviderFailure,
} from "../production/classify-retention-provider-failure";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import type { RetentionModelCallCategory } from "../budget/retention-model-call-budget.types";
import {
  buildRetentionComposerRequest,
} from "../composition/build-retention-composer-request";
import { buildRetentionCreatorContentContract } from "../grounding/build-retention-creator-content-contract";
import { resolveRetentionDeterministicSubjectAnchor } from "../strategy/resolve-retention-deterministic-subject-anchor";
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
import { evaluateRetentionSpokenCompleteness } from "../validation/evaluate-retention-spoken-completeness";
import { isRetentionNarrationFirstProposal } from "../composition/validate-retention-narration-first-proposal";
import { evaluateRetentionCanonicalNarrationAcceptance } from "../composition/evaluate-retention-canonical-narration-acceptance";
import { evaluateRetentionSpokenClaimGrounding } from "../composition/evaluate-retention-spoken-claim-grounding";
import { evaluateRetentionHookBodyPayoff } from "../composition/evaluate-retention-hook-body-payoff";
import {
  applyRetentionBoundedOpeningRepair,
  applyRetentionBoundedRankingPayoffRepair,
  buildDeterministicRankingNumberOneCloser,
  extractReplacementClosing,
  extractReplacementOpening,
  type RetentionBoundedRewriteType,
} from "../composition/apply-retention-bounded-region-repair";
import { applyRetentionSupportedOpeningPromotion } from "../composition/apply-retention-supported-opening-promotion";
import { evaluateRetentionDurationFit } from "../composition/evaluate-retention-duration-fit";
import {
  getBoundRetentionRejectedProposalCapture,
  recordRetentionNarrationTransform,
} from "../production/create-retention-rejected-proposal-capture";
import type { RetentionHookBridgeFailureReason } from "./retention-hook-bridge.types";

const REPAIRABLE_NORMALIZE_SEAMS = new Set([
  "hook_body_relationship_rejection",
  "unsupported_claim_or_claim_reference_rejection",
  "duration_or_compression_rejection",
]);

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
  lastNormalizeSeam: string | null;
  lastSafeProviderFailure: RetentionSafeProviderFailure | null;
  composerRepairAccepted: boolean;
  /** Prompt 8 — later Hook-engine gates must not reverse this Pass. */
  canonicalAccepted: boolean;
  /**
   * Prompt 12 — discriminated commit. Once `accepted`, editorial Hook
   * rejection / repair / rescue is unreachable.
   */
  canonicalCommit:
    | { readonly status: "uncommitted" }
    | {
        readonly status: "accepted";
        readonly narration: string;
      };
  /** Prompt 10 — internal bounded rewrite, not a new top-level authority. */
  boundedRewriteType: RetentionBoundedRewriteType | null;
}

export function createRetentionComposerBridgeState(): RetentionComposerBridgeState {
  return {
    byNarration: new Map(),
    lastCandidate: null,
    lastTitle: null,
    composerAttempts: 0,
    lastComposerFailureReason: null,
    lastNormalizeSeam: null,
    lastSafeProviderFailure: null,
    composerRepairAccepted: false,
    canonicalAccepted: false,
    canonicalCommit: { status: "uncommitted" },
    boundedRewriteType: null,
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
  readonly hookStyle?: HookStyleSelection | null;
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
  options?: { readonly preserveAccepted?: boolean },
): void {
  if (
    options?.preserveAccepted === true &&
    state.canonicalAccepted &&
    state.lastCandidate
  ) {
    // A later Hook repair/fallback miss must not discard already-accepted speech.
    return;
  }
  state.canonicalAccepted = false;
  state.canonicalCommit = { status: "uncommitted" };
  if (isRetentionProviderRequestError(error)) {
    const wrapped = retentionStoryErrorFromProviderFailure(
      error.safeProviderFailure,
    );
    state.lastComposerFailureReason = wrapped.reason as RetentionHookBridgeFailureReason;
    state.lastNormalizeSeam = wrapped.normalizeSeam ?? null;
    state.lastSafeProviderFailure = wrapped.safeProviderFailure ?? null;
    return;
  }
  if (
    isRetentionStoryError(error) &&
    COMPOSER_FAILURE_REASONS.has(
      error.reason as RetentionHookBridgeFailureReason,
    )
  ) {
    state.lastComposerFailureReason =
      error.reason as RetentionHookBridgeFailureReason;
    state.lastNormalizeSeam = error.normalizeSeam ?? null;
    state.lastSafeProviderFailure = error.safeProviderFailure ?? null;
  }
}

function exceedsWordBudget(
  narration: string,
  plan: RetentionStoryPlan,
): boolean {
  const target = plan.compressionGoals.targetWordBudget;
  const fit = evaluateRetentionDurationFit({
    narration,
    hardWordBudget: target,
    targetWordBudget: target,
    minimumUsefulWords: Math.max(12, Math.floor(target * 0.66)),
    durationSec: Math.max(1, Math.round(target / 2.4)),
    preserveCompleteRanking:
      /\b(?:number one|no\.?\s*1|stands last|decisive name|#1)\b/iu.test(
        narration,
      ),
  });
  return !fit.acceptable;
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

function acceptSplicedNarration(input: {
  readonly title: string;
  readonly narration: string;
  readonly rewriteType: RetentionBoundedRewriteType;
  readonly sourceNarration: string;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly ledger: RetentionModelCallLedger;
  readonly contract: NormalizedStoryContract;
  readonly state: RetentionComposerBridgeState;
  readonly contentContract: NonNullable<
    ReturnType<typeof buildRetentionCreatorContentContract>
  >;
  readonly brief: ReturnType<
    typeof buildRetentionComposerRequest
  >["compositionBrief"];
  readonly eligibleClaimIds: Set<string>;
  readonly permittedHookClaimIds: readonly string[];
}): HookedNarrationModelResult | null {
  try {
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: {
        title: input.title,
        narration: input.narration,
      },
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      origin: "after_body_rewrite",
      permittedHookClaimIds: input.permittedHookClaimIds,
      extras: {
        contentContract: input.contentContract,
        brief: input.brief,
        eligibleClaimIds: input.eligibleClaimIds,
      },
    });
    const candidate = finalizeCandidate({
      kind: "repair",
      candidate: built.candidate,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      ledger: input.ledger,
      contract: input.contract,
    });
    input.state.composerRepairAccepted = true;
    input.state.boundedRewriteType = input.rewriteType;
    input.state.lastCandidate = candidate;
    input.state.lastTitle = built.title?.trim() || input.title;
    input.state.lastComposerFailureReason = null;
    input.state.lastNormalizeSeam = null;
    input.state.lastSafeProviderFailure = null;
    input.state.canonicalAccepted = true;
    input.state.canonicalCommit = {
      status: "accepted",
      narration: candidate.assembledNarration,
    };
    input.state.byNarration.set(candidate.assembledNarration, candidate);
    recordRetentionNarrationTransform({
      stage: "targeted_rewrite",
      inputNarration: input.sourceNarration,
      outputNarration: candidate.assembledNarration,
      reason: input.rewriteType,
      changedRegion:
        input.rewriteType === "ranking_payoff_repair"
          ? "payoff"
          : "opening",
      authority: "targeted_rewrite",
    });
    return {
      title: built.title,
      narration: candidate.assembledNarration,
      hookClaimRefs: built.hookClaimRefs,
    };
  } catch {
    return null;
  }
}

function acceptFullDurationCompression(input: {
  readonly proposal: unknown;
  readonly sourceNarration: string;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly ledger: RetentionModelCallLedger;
  readonly contract: NormalizedStoryContract;
  readonly state: RetentionComposerBridgeState;
  readonly contentContract: NonNullable<
    ReturnType<typeof buildRetentionCreatorContentContract>
  >;
  readonly brief: ReturnType<
    typeof buildRetentionComposerRequest
  >["compositionBrief"];
  readonly eligibleClaimIds: Set<string>;
  readonly permittedHookClaimIds: readonly string[];
}): HookedNarrationModelResult | null {
  if (!isRetentionNarrationFirstProposal(input.proposal)) return null;
  try {
    const built = buildRetentionNarrationCandidateFromProposal({
      proposal: input.proposal,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      origin: "after_length_enforcement",
      permittedHookClaimIds: input.permittedHookClaimIds,
      extras: {
        contentContract: input.contentContract,
        brief: input.brief,
        eligibleClaimIds: input.eligibleClaimIds,
      },
    });
    const candidate = finalizeCandidate({
      kind: "length_compress",
      candidate: built.candidate,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      ledger: input.ledger,
      contract: input.contract,
    });
    input.state.composerRepairAccepted = true;
    input.state.boundedRewriteType = "duration_compression";
    input.state.lastCandidate = candidate;
    input.state.lastTitle = built.title?.trim() || "Story";
    input.state.lastComposerFailureReason = null;
    input.state.lastNormalizeSeam = null;
    input.state.lastSafeProviderFailure = null;
    input.state.canonicalAccepted = true;
    input.state.canonicalCommit = {
      status: "accepted",
      narration: candidate.assembledNarration,
    };
    input.state.byNarration.set(candidate.assembledNarration, candidate);
    recordRetentionNarrationTransform({
      stage: "targeted_rewrite",
      inputNarration: input.sourceNarration,
      outputNarration: candidate.assembledNarration,
      reason: "duration_compression",
      changedRegion: "full",
      authority: "targeted_rewrite",
    });
    return {
      title: built.title,
      narration: candidate.assembledNarration,
      hookClaimRefs: built.hookClaimRefs,
    };
  } catch {
    return null;
  }
}

/**
 * Build a Hook-compatible modelCall that composes structured Retention candidates.
 */
export function createRetentionHookedModelCall(
  input: CreateRetentionHookedModelCallInput,
): HookedNarrationModelCall {
  return async (hookInput): Promise<HookedNarrationModelResult> => {
    const kind = hookInput.kind as RetentionComposerModelCallKind;
    const remember = (error: unknown) =>
      rememberComposerFailure(input.state, error, {
        preserveAccepted: kind !== "initial",
      });
    if (kind === "body_rewrite") {
      const error = new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention body_rewrite must not route through the Hook modelCall adapter.",
      );
      remember(error);
      throw error;
    }
    const category = mapKindToBudgetCategory(kind);
    const deterministic = input.billingMode === "deterministic";

    if (input.composer == null) {
      const error = new RetentionStoryError(
        "composer_unavailable",
        "Retention composer callback is unavailable.",
      );
      remember(error);
      throw error;
    }

    if (!deterministic) {
      try {
        input.ledger.consume(category);
      } catch (error) {
        remember(error);
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
    let contentContract = null as ReturnType<
      typeof buildRetentionCreatorContentContract
    > | null;
    try {
      contentContract = buildRetentionCreatorContentContract({
        contract: input.contract,
        grounding: input.grounding,
        manualContext: input.manualContext,
        hookStyle: input.hookStyle,
        controllingIdeaStatement: input.plan.controllingIdea.statement,
        centralSubject: resolveRetentionDeterministicSubjectAnchor(
          input.contract.topic,
        ),
      });
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
        contentContract,
      });
    } catch (error) {
      if (!deterministic) {
        input.ledger.recordOutcome(category, "rejected");
      }
      remember(error);
      throw error;
    }

    let proposal: unknown;
    let initialOutcomePreRecorded = false;
    try {
      proposal = await input.composer(request);
    } catch (error) {
      if (!deterministic) {
        input.ledger.recordOutcome(category, "failed");
      }
      if (isRetentionProviderRequestError(error)) {
        const wrapped = retentionStoryErrorFromProviderFailure(
          error.safeProviderFailure,
        );
        remember(wrapped);
        throw wrapped;
      }
      if (isRetentionStoryError(error)) {
        remember(error);
        throw error;
      }
      const classified = retentionStoryErrorFromProviderFailure(
        {
          class: "unknown_provider_failure",
          endpointFamily: "responses",
          failurePhase: "composer_callback",
          retryCount: 0,
        },
      );
      remember(classified);
      throw classified;
    }

    const capture = getBoundRetentionRejectedProposalCapture();
    if (
      capture &&
      contentContract &&
      isRetentionNarrationFirstProposal(proposal)
    ) {
      capture.recordStage("parsed_model_proposal", proposal);
      capture.recordStage("before_normalization", proposal.narration);
      const canonical = evaluateRetentionCanonicalNarrationAcceptance({
        raw: proposal,
        contentContract,
        brief: request.compositionBrief,
        eligibleClaimIds: new Set(
          request.eligibleClaims.map((claim) => claim.claimId),
        ),
        grounding: input.grounding,
      });
      capture.recordRejection(canonical.stage, canonical.decision);
      capture.recordClauseSupport(
        evaluateRetentionSpokenClaimGrounding({
          narration: proposal.narration,
          contentContract,
          eligibleClaimIds: new Set(
            request.eligibleClaims.map((claim) => claim.claimId),
          ),
          modelUsedContentIds: proposal.usedContentIds,
          grounding: input.grounding,
        }),
      );
      capture.recordHookBodyPayoff(
        evaluateRetentionHookBodyPayoff({
          narration: proposal.narration,
          contentContract,
          brief: request.compositionBrief,
        }),
      );
      capture.recordInternalContentIds(canonical.usedContentIds);
    }

    if (
      kind === "initial" &&
      !deterministic &&
      contentContract &&
      isRetentionNarrationFirstProposal(proposal)
    ) {
      const eligibleClaimIds = new Set(
        request.eligibleClaims.map((claim) => claim.claimId),
      );
      const canonical = evaluateRetentionCanonicalNarrationAcceptance({
        raw: proposal,
        contentContract,
        brief: request.compositionBrief,
        eligibleClaimIds,
        grounding: input.grounding,
      });
      const relationship = evaluateRetentionHookBodyPayoff({
        narration: proposal.narration,
        contentContract,
        brief: request.compositionBrief,
      });
      const selectedStyle = contentContract.presentationSettings.hookStyle;
      const explicitStyle =
        selectedStyle !== "auto" && selectedStyle !== "user_written";
      const styleMiss = relationship.qualityWarningIds.includes(
        "hook_below_style_target",
      );

      if (
        canonical.decision === "accept" &&
        explicitStyle &&
        styleMiss &&
        input.ledger.policy.maxHookRepair > 0
      ) {
        const styleRepairSourceNarration = proposal.narration;
        input.ledger.recordOutcome(category, "succeeded");
        initialOutcomePreRecorded = true;
        if (!input.ledger.canConsume("hook_repair")) {
          // The original canonical narration remains accepted with its style warning.
        } else {
          try {
            input.ledger.consume("hook_repair");
            input.state.composerAttempts += 1;
            const repairRequest = buildRetentionComposerRequest({
              contract: input.contract,
              plan: input.plan,
              strategySeed: input.strategySeed,
              grounding: input.grounding,
              manualContext: input.manualContext,
              userInstructions: input.userInstructions,
              hookDirectiveBlock: hookInput.hookDirectiveBlock,
              modelCallKind: "repair",
              previousCandidate: null,
              contentContract,
              repairContext: {
                rejectionStage: "acceptance_quality_rejection",
                reasonCode: "explicit_hook_style_target_miss",
                sourceNarration: proposal.narration,
              },
            });
            const repaired = await input.composer(repairRequest);
            const repairedNarration = isRetentionNarrationFirstProposal(repaired)
              ? repaired.narration
              : "";
            const spliced = applyRetentionBoundedOpeningRepair({
              title: proposal.title,
              narration: proposal.narration,
              replacementOpening: extractReplacementOpening(repairedNarration),
              contentContract,
              brief: request.compositionBrief,
              eligibleClaimIds,
              grounding: input.grounding,
            });
            const repairedRelationship = evaluateRetentionHookBodyPayoff({
              narration: spliced.narration,
              contentContract,
              brief: request.compositionBrief,
            });
            if (
              spliced.ok &&
              !repairedRelationship.qualityWarningIds.includes(
                "hook_below_style_target",
              )
            ) {
              proposal = {
                title: proposal.title,
                narration: spliced.narration,
              };
              input.state.composerRepairAccepted = true;
              input.state.boundedRewriteType = "opening_repair";
              input.ledger.recordOutcome("hook_repair", "succeeded");
              recordRetentionNarrationTransform({
                stage: "targeted_rewrite",
                inputNarration: styleRepairSourceNarration,
                outputNarration: spliced.narration,
                reason: "opening_repair",
                changedRegion: "opening",
                authority: "targeted_rewrite",
              });
            } else {
              input.ledger.recordOutcome("hook_repair", "rejected");
            }
          } catch {
            try {
              input.ledger.recordOutcome("hook_repair", "failed");
            } catch {
              // The original accepted narration remains available.
            }
          }
        }
      }
    }

    try {
      const built = buildRetentionNarrationCandidateFromProposal({
        proposal,
        plan: input.plan,
        grounding: input.grounding,
        strategySeed: input.strategySeed,
        origin: mapKindToCandidateOrigin(kind),
        permittedHookClaimIds: hookInput.permittedClaimIds,
        extras: {
          contentContract,
          brief: request.compositionBrief,
          eligibleClaimIds: new Set(
            request.eligibleClaims.map((claim) => claim.claimId),
          ),
        },
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
      input.state.lastComposerFailureReason = null;
      input.state.lastNormalizeSeam = null;
      input.state.lastSafeProviderFailure = null;
      input.state.canonicalAccepted = true;
      input.state.canonicalCommit = {
        status: "accepted",
        narration: candidate.assembledNarration,
      };
      input.state.byNarration.set(candidate.assembledNarration, candidate);
      if (capture && isRetentionNarrationFirstProposal(proposal)) {
        capture.recordStage("after_normalization", candidate.assembledNarration);
        recordRetentionNarrationTransform({
          stage: "after_normalization",
          inputNarration: proposal.narration,
          outputNarration: candidate.assembledNarration,
          reason: "normalize_and_map",
          authority: "composition",
        });
      }
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
      } else if (!initialOutcomePreRecorded) {
        input.ledger.recordOutcome(category, "succeeded");
      }
      return {
        title: built.title,
        narration: candidate.assembledNarration,
        hookClaimRefs: built.hookClaimRefs,
      };
    } catch (error) {
      let initialOutcomeRecorded = initialOutcomePreRecorded;
      const recordInitialOutcome = (outcome: "rejected" | "malformed" | "succeeded") => {
        if (!deterministic && !initialOutcomeRecorded) {
          input.ledger.recordOutcome(category, outcome);
          initialOutcomeRecorded = true;
        }
      };
      const initialFailureOutcome =
        isRetentionStoryError(error) &&
        (error.reason === "composer_proposal_invalid" ||
          error.reason === "composer_segment_mismatch" ||
          error.reason === "composer_grounding_invalid" ||
          error.reason === "length_enforcement_failed")
          ? error.reason === "length_enforcement_failed"
            ? ("rejected" as const)
            : ("malformed" as const)
          : ("rejected" as const);

      const repairable =
        kind === "initial" &&
        !deterministic &&
        contentContract != null &&
        isRetentionNarrationFirstProposal(proposal) &&
        isRetentionStoryError(error) &&
        error.normalizeSeam != null &&
        REPAIRABLE_NORMALIZE_SEAMS.has(error.normalizeSeam);

      if (repairable && isRetentionNarrationFirstProposal(proposal) && contentContract) {
        const eligibleClaimIds = new Set(
          request.eligibleClaims.map((claim) => claim.claimId),
        );
        const relationship = evaluateRetentionHookBodyPayoff({
          narration: proposal.narration,
          contentContract,
          brief: request.compositionBrief,
        });
        const spokenGrounding = evaluateRetentionSpokenClaimGrounding({
          narration: proposal.narration,
          contentContract,
          eligibleClaimIds,
          modelUsedContentIds: proposal.usedContentIds,
          grounding: input.grounding,
        });
        const numberOne = request.compositionBrief.rankingNumberOneMember;
        const numberOneToken = numberOne?.split(/\s+/u)[0] ?? "";
        const finalUnsupportedRankingCloser =
          error.normalizeSeam === "unsupported_claim_or_claim_reference_rejection" &&
          request.scriptMode === "top_5" &&
          numberOne != null &&
          spokenGrounding.sentenceProvenance.length >= 2 &&
          spokenGrounding.sentenceProvenance.at(-1) === "unsupported" &&
          spokenGrounding.sentenceProvenance
            .slice(0, -1)
            .every((provenance) => provenance !== "unsupported") &&
          request.compositionBrief.requiredRankingMembership.every((member) =>
            proposal.narration.includes(member),
          ) &&
          relationship.payoff.includes(numberOneToken) &&
          /\b(?:number one|no\.?\s*1|#1)\b/iu.test(relationship.payoff);
        const rankingPayoffOnly =
          error.normalizeSeam === "hook_body_relationship_rejection" &&
          request.scriptMode === "top_5" &&
          relationship.reasonIds.includes("payoff_does_not_resolve_hook") &&
          !/\b(?:number one|no\.?\s*1|stands last|decisive name|#1)\b/iu.test(
            relationship.payoff,
          ) &&
          !relationship.reasonIds.some(
            (reason) =>
              reason === "opening_missing" ||
              reason === "opening_unrelated" ||
              reason === "opening_meaningless" ||
              reason === "opening_result_leak" ||
              reason === "body_does_not_evidence_hook",
          );
        if (finalUnsupportedRankingCloser) {
          const closer = buildDeterministicRankingNumberOneCloser({
            brief: request.compositionBrief,
            narration: proposal.narration,
          });
          const spliced = closer
            ? applyRetentionBoundedRankingPayoffRepair({
                title: typeof proposal.title === "string" ? proposal.title : "Story",
                narration: proposal.narration,
                replacementClosing: closer,
                replaceExistingClosing: true,
                contentContract,
                brief: request.compositionBrief,
                eligibleClaimIds,
                grounding: input.grounding,
              })
            : null;
          if (spliced?.ok) {
            const accepted = acceptSplicedNarration({
              title: typeof proposal.title === "string" ? proposal.title : "Story",
              narration: spliced.narration,
              rewriteType: "ranking_payoff_repair",
              sourceNarration: proposal.narration,
              plan: input.plan,
              grounding: input.grounding,
              strategySeed: input.strategySeed,
              ledger: input.ledger,
              contract: input.contract,
              state: input.state,
              contentContract,
              brief: request.compositionBrief,
              eligibleClaimIds,
              permittedHookClaimIds: hookInput.permittedClaimIds,
            });
            if (accepted) {
              recordInitialOutcome("succeeded");
              return accepted;
            }
          }
          if (spliced) {
            const splicedAcceptance = evaluateRetentionCanonicalNarrationAcceptance({
              raw: {
                title: typeof proposal.title === "string" ? proposal.title : "Story",
                narration: spliced.narration,
              },
              contentContract,
              brief: request.compositionBrief,
              eligibleClaimIds,
              grounding: input.grounding,
            });
            if (splicedAcceptance.stage === "duration_or_compression_rejection") {
              recordInitialOutcome(initialFailureOutcome);
              if (!input.ledger.canConsume("length_compression")) {
                remember(error);
                throw error;
              }
              try {
                input.ledger.consume("length_compression");
                input.state.composerAttempts += 1;
                const compressionRequest = buildRetentionComposerRequest({
                  contract: input.contract,
                  plan: input.plan,
                  strategySeed: input.strategySeed,
                  grounding: input.grounding,
                  manualContext: input.manualContext,
                  userInstructions: input.userInstructions,
                  hookDirectiveBlock: hookInput.hookDirectiveBlock,
                  modelCallKind: "length_compress",
                  previousCandidate: null,
                  contentContract,
                  repairContext: {
                    rejectionStage: "duration_or_compression_rejection",
                    reasonCode: "ranking_payoff_repair_requires_compression",
                    sourceNarration: spliced.narration,
                  },
                });
                const compressed = await input.composer(compressionRequest);
                if (capture && isRetentionNarrationFirstProposal(compressed)) {
                  capture.recordStage("after_repair", compressed.narration);
                }
                const accepted = acceptFullDurationCompression({
                  proposal: compressed,
                  sourceNarration: spliced.narration,
                  plan: input.plan,
                  grounding: input.grounding,
                  strategySeed: input.strategySeed,
                  ledger: input.ledger,
                  contract: input.contract,
                  state: input.state,
                  contentContract,
                  brief: request.compositionBrief,
                  eligibleClaimIds,
                  permittedHookClaimIds: hookInput.permittedClaimIds,
                });
                if (accepted) {
                  input.ledger.recordOutcome("length_compression", "succeeded");
                  return accepted;
                }
                input.ledger.recordOutcome("length_compression", "rejected");
              } catch {
                try {
                  input.ledger.recordOutcome("length_compression", "failed");
                } catch {
                  // The ledger may already be closed if consume failed.
                }
              }
            }
          }
        }

        const selectedHookStyle =
          contentContract.presentationSettings.hookStyle;
        const explicitHookStyle =
          selectedHookStyle !== "auto" && selectedHookStyle !== "user_written";

        if (
          error.normalizeSeam ===
            "unsupported_claim_or_claim_reference_rejection" &&
          !explicitHookStyle
        ) {
          const promoted = applyRetentionSupportedOpeningPromotion({
            title: typeof proposal.title === "string" ? proposal.title : "Story",
            narration: proposal.narration,
            contentContract,
            brief: request.compositionBrief,
            eligibleClaimIds,
            grounding: input.grounding,
          });
          if (promoted.ok) {
            const accepted = acceptSplicedNarration({
              title: typeof proposal.title === "string" ? proposal.title : "Story",
              narration: promoted.narration,
              rewriteType: "supported_opening_promotion",
              sourceNarration: proposal.narration,
              plan: input.plan,
              grounding: input.grounding,
              strategySeed: input.strategySeed,
              ledger: input.ledger,
              contract: input.contract,
              state: input.state,
              contentContract,
              brief: request.compositionBrief,
              eligibleClaimIds,
              permittedHookClaimIds: hookInput.permittedClaimIds,
            });
            if (accepted) {
              recordInitialOutcome("succeeded");
              return accepted;
            }
          }
        }

        if (rankingPayoffOnly) {
          const closer = buildDeterministicRankingNumberOneCloser({
            brief: request.compositionBrief,
            narration: proposal.narration,
          });
          if (closer) {
            const spliced = applyRetentionBoundedRankingPayoffRepair({
              title: typeof proposal.title === "string" ? proposal.title : "Story",
              narration: proposal.narration,
              replacementClosing: closer,
              contentContract,
              brief: request.compositionBrief,
              eligibleClaimIds,
              grounding: input.grounding,
            });
            if (spliced.ok) {
              const accepted = acceptSplicedNarration({
                title: typeof proposal.title === "string" ? proposal.title : "Story",
                narration: spliced.narration,
                rewriteType: "ranking_payoff_repair",
                sourceNarration: proposal.narration,
                plan: input.plan,
                grounding: input.grounding,
                strategySeed: input.strategySeed,
                ledger: input.ledger,
                contract: input.contract,
                state: input.state,
                contentContract,
                brief: request.compositionBrief,
                eligibleClaimIds,
                permittedHookClaimIds: hookInput.permittedClaimIds,
              });
              if (accepted) {
                // Keep the already-consumed initial compose as the model
                // success. The closer is local and must not consume hook_repair.
                recordInitialOutcome("succeeded");
                return accepted;
              }
            }
          }
        }

        if (error.normalizeSeam === "duration_or_compression_rejection") {
          recordInitialOutcome(initialFailureOutcome);
          if (input.ledger.canConsume("length_compression")) {
            try {
              input.ledger.consume("length_compression");
              input.state.composerAttempts += 1;
              const compressionRequest = buildRetentionComposerRequest({
                contract: input.contract,
                plan: input.plan,
                strategySeed: input.strategySeed,
                grounding: input.grounding,
                manualContext: input.manualContext,
                userInstructions: input.userInstructions,
                hookDirectiveBlock: hookInput.hookDirectiveBlock,
                modelCallKind: "length_compress",
                previousCandidate: null,
                contentContract,
                repairContext: {
                  rejectionStage: error.normalizeSeam,
                  reasonCode: error.reason,
                  sourceNarration: proposal.narration,
                },
              });
              const compressed = await input.composer(compressionRequest);
              if (capture && isRetentionNarrationFirstProposal(compressed)) {
                capture.recordStage("after_repair", compressed.narration);
              }
              const accepted = acceptFullDurationCompression({
                proposal: compressed,
                sourceNarration: proposal.narration,
                plan: input.plan,
                grounding: input.grounding,
                strategySeed: input.strategySeed,
                ledger: input.ledger,
                contract: input.contract,
                state: input.state,
                contentContract,
                brief: request.compositionBrief,
                eligibleClaimIds,
                permittedHookClaimIds: hookInput.permittedClaimIds,
              });
              if (accepted) {
                input.ledger.recordOutcome("length_compression", "succeeded");
                return accepted;
              }
              input.ledger.recordOutcome("length_compression", "rejected");
            } catch {
              try {
                input.ledger.recordOutcome("length_compression", "failed");
              } catch {
                // The ledger may already be closed if consume failed.
              }
            }
          }
          remember(error);
          throw error;
        }

        const openingBroken =
          error.normalizeSeam === "hook_body_relationship_rejection" &&
          relationship.reasonIds.some(
            (reason) =>
              reason === "opening_missing" ||
              reason === "opening_unrelated" ||
              reason === "opening_meaningless" ||
              reason === "opening_result_leak",
          );
        recordInitialOutcome(initialFailureOutcome);

        const providerRepairEligible =
          (openingBroken ||
            error.normalizeSeam === "unsupported_claim_or_claim_reference_rejection") &&
          input.ledger.canConsume("hook_repair");

        if (providerRepairEligible) {
          try {
            input.ledger.consume("hook_repair");
            input.state.composerAttempts += 1;
            const repairRequest = buildRetentionComposerRequest({
              contract: input.contract,
              plan: input.plan,
              strategySeed: input.strategySeed,
              grounding: input.grounding,
              manualContext: input.manualContext,
              userInstructions: input.userInstructions,
              hookDirectiveBlock: hookInput.hookDirectiveBlock,
              modelCallKind: "repair",
              previousCandidate: null,
              contentContract,
              repairContext: {
                rejectionStage: error.normalizeSeam!,
                reasonCode: error.reason,
                sourceNarration: proposal.narration,
              },
            });
            const repaired = await input.composer(repairRequest);
            const repairedNarration =
              isRetentionNarrationFirstProposal(repaired) &&
              typeof repaired.narration === "string"
                ? repaired.narration
                : "";
            const rewriteType: RetentionBoundedRewriteType = rankingPayoffOnly
              ? "ranking_payoff_repair"
              : "opening_repair";
            const spliced = rankingPayoffOnly
              ? applyRetentionBoundedRankingPayoffRepair({
                  title:
                    typeof proposal.title === "string" ? proposal.title : "Story",
                  narration: proposal.narration,
                  replacementClosing: extractReplacementClosing(repairedNarration),
                  contentContract,
                  brief: request.compositionBrief,
                  eligibleClaimIds,
                  grounding: input.grounding,
                })
              : applyRetentionBoundedOpeningRepair({
                  title:
                    typeof proposal.title === "string" ? proposal.title : "Story",
                  narration: proposal.narration,
                  replacementOpening: extractReplacementOpening(repairedNarration),
                  contentContract,
                  brief: request.compositionBrief,
                  eligibleClaimIds,
                  grounding: input.grounding,
                });
            const repairedStyleRelationship = evaluateRetentionHookBodyPayoff({
              narration: spliced.narration,
              contentContract,
              brief: request.compositionBrief,
            });
            const repairedStyleSatisfied =
              !explicitHookStyle ||
              !repairedStyleRelationship.qualityWarningIds.includes(
                "hook_below_style_target",
              );
            if (spliced.ok && repairedStyleSatisfied) {
              const accepted = acceptSplicedNarration({
                title:
                  typeof proposal.title === "string" ? proposal.title : "Story",
                narration: spliced.narration,
                rewriteType,
                sourceNarration: proposal.narration,
                plan: input.plan,
                grounding: input.grounding,
                strategySeed: input.strategySeed,
                ledger: input.ledger,
                contract: input.contract,
                state: input.state,
                contentContract,
                brief: request.compositionBrief,
                eligibleClaimIds,
                permittedHookClaimIds: hookInput.permittedClaimIds,
              });
              if (accepted) {
                input.ledger.recordOutcome("hook_repair", "succeeded");
                if (capture) {
                  capture.recordStage("after_repair", accepted.narration);
                }
                return accepted;
              }
            }
            input.ledger.recordOutcome("hook_repair", "failed");
          } catch {
            try {
              input.ledger.recordOutcome("hook_repair", "failed");
            } catch {
              // Ledger may already be closed if consume never completed.
            }
          }
        }
      } else {
        recordInitialOutcome(initialFailureOutcome);
      }

      remember(error);
      throw error;
    }
  };
}
