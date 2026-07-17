/**
 * Bounded repair / fallback orchestration — Sprint 7C.2.
 * Dependency-injected callbacks only; no direct model or network calls.
 * Terminal results always cohere with activePlan fingerprints.
 */

import type {
  HookCandidate,
  HookCandidateOrigin,
  HookDiagnostics,
  HookFallbackCallback,
  HookPlan,
  HookRepairCallback,
  HookSelection,
  HookValidationResult,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import {
  assertHookPlanFingerprint,
  assertHookRequestFingerprint,
} from "../domain/hook-fingerprint";
import { assertRequestPlanCoherence } from "../domain/assert-request-plan-coherence";
import { buildCompatibilityFallbackPlan } from "../strategies/build-hook-plan";
import { buildHookCandidate, HookCandidateError } from "../validation/build-hook-candidate";
import { buildHookDiagnostics } from "../validation/build-hook-diagnostics";
import { buildHookSelection } from "../validation/build-hook-selection";
import {
  isHardGateFailure,
  isQualityOnlyFailure,
  validateHookCandidate,
} from "../validation/validate-hook-candidate";
import {
  applyDeterministicCompatibilityOpening,
  hasUsableHookNarrationBody,
} from "./deterministic-compatibility-opening";

export interface RunBoundedHookRepairInput {
  readonly request: NormalizedHookRequest;
  readonly plan: HookPlan;
  readonly narration: string;
  readonly claimRefs?: readonly string[];
  readonly candidateOrigin?: HookCandidateOrigin;
  /** Caller flag — does not consume the repair attempt. */
  readonly compressionRevalidated?: boolean;
  readonly repair?: HookRepairCallback;
  readonly compatibilityFallback?: HookFallbackCallback;
  readonly safeFallback?: HookFallbackCallback;
}

export interface RunBoundedHookRepairResult {
  readonly ok: boolean;
  /** Active plan for the terminal outcome (may be compatibility fallback plan). */
  readonly activePlan: HookPlan;
  readonly selection?: HookSelection;
  readonly candidate?: HookCandidate;
  readonly validation?: HookValidationResult;
  readonly diagnostics: HookDiagnostics;
  /**
   * Success-only approved complete narration after length enforcement + Hook validation.
   * Absent on failure. Story generation commits this into FootieScript.narration.
   */
  readonly approvedNarration?: string;
}

export class HookTerminalCoherenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HookTerminalCoherenceError";
  }
}

/**
 * Central invariant: every returned artifact must match activePlan identity.
 * Previous-plan candidate/validation must never appear under a fallback active plan.
 */
export function assertTerminalPlanCoherence(result: {
  readonly activePlan: HookPlan;
  readonly selection?: HookSelection;
  readonly candidate?: HookCandidate;
  readonly validation?: HookValidationResult;
  readonly diagnostics: HookDiagnostics;
}): void {
  const { activePlan, selection, candidate, validation, diagnostics } = result;

  if (diagnostics.planFingerprint !== activePlan.planFingerprint) {
    throw new HookTerminalCoherenceError(
      "Terminal coherence: diagnostics.planFingerprint !== activePlan.planFingerprint",
    );
  }
  if (diagnostics.strategyId !== activePlan.strategyId) {
    throw new HookTerminalCoherenceError(
      "Terminal coherence: diagnostics.strategyId !== activePlan.strategyId",
    );
  }
  if (diagnostics.strategyVersion !== activePlan.strategyVersion) {
    throw new HookTerminalCoherenceError(
      "Terminal coherence: diagnostics.strategyVersion !== activePlan.strategyVersion",
    );
  }
  if (diagnostics.strategySource !== activePlan.strategySource) {
    throw new HookTerminalCoherenceError(
      "Terminal coherence: diagnostics.strategySource !== activePlan.strategySource",
    );
  }

  if (candidate) {
    if (candidate.planFingerprint !== activePlan.planFingerprint) {
      throw new HookTerminalCoherenceError(
        "Terminal coherence: candidate.planFingerprint !== activePlan.planFingerprint",
      );
    }
    if (candidate.strategyId !== activePlan.strategyId) {
      throw new HookTerminalCoherenceError(
        "Terminal coherence: candidate.strategyId !== activePlan.strategyId",
      );
    }
    if (candidate.strategyVersion !== activePlan.strategyVersion) {
      throw new HookTerminalCoherenceError(
        "Terminal coherence: candidate.strategyVersion !== activePlan.strategyVersion",
      );
    }
  }

  if (validation) {
    if (validation.planFingerprint !== activePlan.planFingerprint) {
      throw new HookTerminalCoherenceError(
        "Terminal coherence: validation.planFingerprint !== activePlan.planFingerprint",
      );
    }
    if (candidate && validation.candidateId !== candidate.candidateId) {
      throw new HookTerminalCoherenceError(
        "Terminal coherence: validation.candidateId !== candidate.candidateId",
      );
    }
  }

  if (selection) {
    if (selection.planFingerprint !== activePlan.planFingerprint) {
      throw new HookTerminalCoherenceError(
        "Terminal coherence: selection.planFingerprint !== activePlan.planFingerprint",
      );
    }
    if (selection.strategyId !== activePlan.strategyId) {
      throw new HookTerminalCoherenceError(
        "Terminal coherence: selection.strategyId !== activePlan.strategyId",
      );
    }
  }
}

function classifyInitialCandidateFailure(narration: string): string {
  if (typeof narration !== "string" || narration.length === 0) {
    return "initial_narration_empty";
  }
  if (!narration.trim()) {
    return "initial_narration_whitespace_only";
  }
  return "initial_opening_span_unavailable";
}

function terminal(
  input: RunBoundedHookRepairInput,
  activePlan: HookPlan,
  partial: {
    readonly ok: boolean;
    readonly selection?: HookSelection;
    readonly candidate?: HookCandidate;
    readonly validation?: HookValidationResult;
    readonly validationOutcome: HookDiagnostics["validationOutcome"];
    readonly repairAttempts: number;
    readonly fallbackReason?: string;
    readonly groundingStatusOverride?: HookDiagnostics["groundingStatus"];
    readonly adapterRan: boolean;
    readonly approvedNarration?: string;
  },
): RunBoundedHookRepairResult {
  const diagnostics = buildHookDiagnostics({
    request: input.request,
    plan: activePlan,
    candidate: partial.candidate,
    validation: partial.validation,
    validationOutcome: partial.validationOutcome,
    repairAttempts: partial.repairAttempts,
    fallbackReason: partial.fallbackReason,
    compressionRevalidated: input.compressionRevalidated,
    adapterRan: partial.adapterRan,
    groundingStatusOverride: partial.groundingStatusOverride,
  });

  const result = Object.freeze({
    ok: partial.ok,
    activePlan,
    ...(partial.selection ? { selection: partial.selection } : {}),
    ...(partial.candidate ? { candidate: partial.candidate } : {}),
    ...(partial.validation ? { validation: partial.validation } : {}),
    ...(partial.ok && partial.approvedNarration
      ? { approvedNarration: partial.approvedNarration }
      : {}),
    diagnostics,
  });

  assertTerminalPlanCoherence(result);
  return result;
}

async function tryFallback(input: {
  readonly orchestration: RunBoundedHookRepairInput;
  readonly kind: "compatibility" | "safe";
  readonly previousValidation?: HookValidationResult;
  readonly previousFailureReason?: string;
  readonly repairAttempts: number;
  readonly latestNarration: string;
  readonly latestCandidate?: HookCandidate;
  readonly callback?: HookFallbackCallback;
}): Promise<RunBoundedHookRepairResult> {
  const {
    orchestration,
    kind,
    previousValidation,
    previousFailureReason,
    repairAttempts,
    latestNarration,
    latestCandidate,
    callback,
  } = input;

  const fallbackPlan = buildCompatibilityFallbackPlan(orchestration.request);
  const priorGrounding =
    previousValidation?.groundingStatus ??
    orchestration.request.grounding.normalizedGroundingStatus;

  /** Failures before a fallback candidate is built/validated — no previous-plan artifacts. */
  const failBeforeFallbackCandidate = (fallbackReason: string) =>
    terminal(orchestration, fallbackPlan, {
      ok: false,
      validationOutcome: "generation_failed",
      repairAttempts,
      fallbackReason,
      groundingStatusOverride: priorGrounding,
      adapterRan: true,
    });

  const topic = orchestration.request.topic;
  let fallbackNarration: string;
  /** Terminal fallback openings never carry opening claim refs. */
  const fallbackClaimRefs: readonly string[] = [];

  if (hasUsableHookNarrationBody(latestNarration)) {
    // Usable prior body: deterministic opening only — no model call.
    fallbackNarration = applyDeterministicCompatibilityOpening(
      latestNarration,
      topic,
    );
  } else {
    if (!callback) {
      return failBeforeFallbackCandidate(`${kind}_fallback_unavailable`);
    }

    let fallbackPayload: Awaited<ReturnType<HookFallbackCallback>>;
    try {
      fallbackPayload = await callback({
        request: orchestration.request,
        plan: fallbackPlan,
        kind,
        narration: latestNarration,
        ...(previousValidation ? { previousValidation } : {}),
        ...(previousFailureReason ? { previousFailureReason } : {}),
        ...(latestCandidate ? { latestCandidate } : {}),
      });
    } catch {
      return failBeforeFallbackCandidate(`${kind}_fallback_callback_rejected`);
    }

    if (!fallbackPayload || !fallbackPayload.narration?.trim()) {
      return failBeforeFallbackCandidate(`${kind}_fallback_empty`);
    }

    // One model call max: replace its opening deterministically; never retry.
    fallbackNarration = applyDeterministicCompatibilityOpening(
      fallbackPayload.narration,
      topic,
    );
  }

  if (!fallbackNarration.trim()) {
    return failBeforeFallbackCandidate(`${kind}_fallback_empty`);
  }

  let candidate: HookCandidate;
  try {
    candidate = buildHookCandidate({
      narration: fallbackNarration,
      request: orchestration.request,
      plan: fallbackPlan,
      origin: "compatibility_fallback",
      claimRefs: fallbackClaimRefs,
    });
  } catch (error) {
    const reason =
      error instanceof HookCandidateError
        ? "fallback_candidate_construction_failed"
        : `${kind}_fallback_candidate_failed`;
    return failBeforeFallbackCandidate(reason);
  }

  const validation = validateHookCandidate({
    request: orchestration.request,
    plan: fallbackPlan,
    candidate,
    repairBoundExceeded: repairAttempts >= 1,
  });

  if (!validation.ok) {
    return terminal(orchestration, fallbackPlan, {
      ok: false,
      candidate,
      validation,
      validationOutcome: "generation_failed",
      repairAttempts,
      fallbackReason: isHardGateFailure(validation)
        ? kind === "safe"
          ? "safe_fallback_failed_hard_gate"
          : "compatibility_fallback_failed_hard_gate"
        : `${kind}_fallback_failed_validation`,
      adapterRan: true,
    });
  }

  const selection = buildHookSelection({
    request: orchestration.request,
    plan: fallbackPlan,
    candidate,
    repairBoundExceeded: repairAttempts >= 1,
  });

  return terminal(orchestration, fallbackPlan, {
    ok: true,
    selection,
    candidate,
    validation,
    validationOutcome: "fallback",
    repairAttempts,
    fallbackReason:
      kind === "safe"
        ? "validated_safe_fallback"
        : "validated_compatibility_fallback",
    adapterRan: true,
    approvedNarration: fallbackNarration,
  });
}

function routeAfterFailure(input: {
  readonly orchestration: RunBoundedHookRepairInput;
  readonly validation: HookValidationResult;
  readonly repairAttempts: number;
  readonly latestNarration: string;
  readonly latestCandidate?: HookCandidate;
}): Promise<RunBoundedHookRepairResult> {
  if (isQualityOnlyFailure(input.validation)) {
    return tryFallback({
      orchestration: input.orchestration,
      kind: "compatibility",
      previousValidation: input.validation,
      repairAttempts: input.repairAttempts,
      latestNarration: input.latestNarration,
      latestCandidate: input.latestCandidate,
      callback: input.orchestration.compatibilityFallback,
    });
  }
  return tryFallback({
    orchestration: input.orchestration,
    kind: "safe",
    previousValidation: input.validation,
    repairAttempts: input.repairAttempts,
    latestNarration: input.latestNarration,
    latestCandidate: input.latestCandidate,
    callback: input.orchestration.safeFallback,
  });
}

/**
 * Validate → at most one repair → at most one fallback. Never unbounded.
 * adapterRan is derived internally (true for hook-capable paths; false for scenes-only).
 */
export async function runBoundedHookRepair(
  input: RunBoundedHookRepairInput,
): Promise<RunBoundedHookRepairResult> {
  assertHookRequestFingerprint(input.request);
  assertHookPlanFingerprint(input.plan);
  assertRequestPlanCoherence(input.request, input.plan);

  // scenes-only: never build/validate/repair/fallback; adapterRan false
  if (input.request.generationPath === "scenes_only_non_hook") {
    return terminal(input, input.plan, {
      ok: false,
      validationOutcome: "generation_failed",
      repairAttempts: 0,
      fallbackReason: "scenes_only_non_hook",
      groundingStatusOverride: input.request.grounding.normalizedGroundingStatus,
      adapterRan: false,
    });
  }

  const origin: HookCandidateOrigin =
    input.candidateOrigin ?? "model_narration_opening";

  let candidate: HookCandidate;
  try {
    candidate = buildHookCandidate({
      narration: input.narration,
      request: input.request,
      plan: input.plan,
      origin,
      claimRefs: input.claimRefs,
    });
  } catch {
    // No initial candidate → compatibility fallback once; never repair
    return tryFallback({
      orchestration: input,
      kind: "compatibility",
      previousFailureReason: classifyInitialCandidateFailure(input.narration),
      repairAttempts: 0,
      latestNarration: input.narration,
      callback: input.compatibilityFallback,
    });
  }

  let validation = validateHookCandidate({
    request: input.request,
    plan: input.plan,
    candidate,
  });

  if (validation.ok) {
    const selection = buildHookSelection({
      request: input.request,
      plan: input.plan,
      candidate,
    });
    return terminal(input, input.plan, {
      ok: true,
      selection,
      candidate,
      validation,
      validationOutcome: "pass",
      repairAttempts: 0,
      adapterRan: true,
      approvedNarration: input.narration,
    });
  }

  // Repair unavailable → immediate fallback by failure class
  if (!input.repair) {
    return routeAfterFailure({
      orchestration: input,
      validation,
      repairAttempts: 0,
      latestNarration: input.narration,
      latestCandidate: candidate,
    });
  }

  const repairAttempts = 1;
  let latestNarration = input.narration;

  try {
    const repaired = await input.repair({
      request: input.request,
      plan: input.plan,
      candidate,
      validation,
      narration: input.narration,
    });

    if (!repaired || !repaired.narration?.trim()) {
      return routeAfterFailure({
        orchestration: input,
        validation,
        repairAttempts,
        latestNarration: input.narration,
        latestCandidate: candidate,
      });
    }

    latestNarration = repaired.narration;

    try {
      candidate = buildHookCandidate({
        narration: repaired.narration,
        request: input.request,
        plan: input.plan,
        origin: "repair_rewrite",
        claimRefs: repaired.claimRefs,
      });
    } catch {
      return routeAfterFailure({
        orchestration: input,
        validation,
        repairAttempts,
        latestNarration,
        latestCandidate: candidate,
      });
    }

    validation = validateHookCandidate({
      request: input.request,
      plan: input.plan,
      candidate,
      repairBoundExceeded: true,
    });

    if (validation.ok) {
      const selection = buildHookSelection({
        request: input.request,
        plan: input.plan,
        candidate,
        repairBoundExceeded: true,
      });
      return terminal(input, input.plan, {
        ok: true,
        selection,
        candidate,
        validation,
        validationOutcome: "repaired",
        repairAttempts,
        adapterRan: true,
        approvedNarration: latestNarration,
      });
    }

    return routeAfterFailure({
      orchestration: input,
      validation,
      repairAttempts,
      latestNarration,
      latestCandidate: candidate,
    });
  } catch {
    // Repair callback rejected — attempt counts; route to fallback
    return routeAfterFailure({
      orchestration: input,
      validation,
      repairAttempts,
      latestNarration: input.narration,
      latestCandidate: candidate,
    });
  }
}
