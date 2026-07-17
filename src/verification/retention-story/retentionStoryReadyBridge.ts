/**
 * Shared ready Hook-bridge + terminal Hook authority helpers for Retention verifies.
 * Sprint 10F.2A — authority must be coherent with approved narration.
 */

import {
  buildHookCandidate,
  buildHookPlanFromRequest,
  buildCompatibilityFallbackPlan,
  buildHookPlanSnapshot,
  normalizeHookRequest,
  validateHookCandidate,
  type HookDiagnostics,
  type HookPlanSnapshot,
} from "@/features/hook-engine";
import { extractOpeningSpan } from "@/features/hook-engine/validation/extract-opening-span";
import type {
  RetentionHookBridgeResult,
  RetentionModelCallLedger,
  RetentionNarrationCandidate,
  RetentionStoryPlan,
  RetentionTerminalHookAuthority,
} from "@/features/retention-story";
import { createRetentionModelCallLedger } from "@/features/retention-story";
import type { HookedNarrationTerminalEvidence } from "@/features/hook-engine/integration/generate-hooked-narration";

/** Safe Hook envelope derived from terminal authority for verify fixtures. */
export function deriveSafeHookEnvelopeFromAuthority(
  authority: RetentionTerminalHookAuthority,
  generationPath: "script_only" | "audio_first_full" = "script_only",
): {
  readonly hookPlanSnapshot: HookPlanSnapshot;
  readonly hookDiagnostics: HookDiagnostics;
} {
  const hookPlanSnapshot = buildHookPlanSnapshot(authority.activePlan);
  const outcome: HookDiagnostics["validationOutcome"] =
    authority.activePlan.strategySource === "compatibility_fallback" ||
    authority.approvedCandidate.origin === "compatibility_fallback"
      ? "fallback"
      : authority.approvedCandidate.origin === "repair_rewrite"
        ? "repaired"
        : "pass";
  const repairAttempts: 0 | 1 = outcome === "repaired" ? 1 : 0;
  const hookDiagnostics: HookDiagnostics = Object.freeze({
    contractVersion: authority.activePlan.contractVersion,
    strategyId: authority.activePlan.strategyId,
    strategyVersion: authority.activePlan.strategyVersion,
    strategySource: authority.activePlan.strategySource,
    candidateOrigin: authority.approvedCandidate.origin,
    generationPath,
    requestFingerprint: authority.activePlan.requestFingerprint,
    planFingerprint: authority.activePlan.planFingerprint,
    groundingStatus: authority.validation.groundingStatus,
    validationOutcome: outcome,
    repairAttempts,
    ...(outcome === "fallback"
      ? { fallbackReason: "validated_compatibility_fallback" as const }
      : {}),
    templateInfluenced: Boolean(authority.request.templateId),
    promptIntelligenceInfluenced:
      authority.activePlan.strategySource === "prompt_intelligence" ||
      Boolean(authority.request.openingIntent),
    adapterRan: true,
  });
  return Object.freeze({ hookPlanSnapshot, hookDiagnostics });
}

export function buildTerminalHookAuthority(
  narration: string,
  options: {
    readonly useFallbackPlan?: boolean;
    readonly generationPath?: "script_only" | "audio_first_full";
    /** Sprint 10H.3A — must match the composed narration topic for Hook authority. */
    readonly topic?: string;
    readonly scriptMode?: import("@/types/footiebitz").ScriptMode;
    readonly tone?: import("@/types/footiebitz").Tone;
    readonly durationSeconds?: number;
  } = {},
): RetentionTerminalHookAuthority {
  const generationPath = options.generationPath ?? "script_only";
  const request = normalizeHookRequest({
    topic: options.topic ?? "Spain versus France tactical preview",
    scriptMode: options.scriptMode ?? "story",
    tone: options.tone ?? "dramatic",
    durationSeconds: options.durationSeconds ?? 30,
    generationPath,
  });
  const { plan: primaryPlan } = buildHookPlanFromRequest(request);
  const activePlan = options.useFallbackPlan
    ? buildCompatibilityFallbackPlan(request)
    : primaryPlan;
  const span = extractOpeningSpan(narration);
  if (!span) {
    throw new Error("opening span required for terminal Hook authority");
  }
  const candidate = buildHookCandidate({
    narration,
    request,
    plan: activePlan,
    origin: options.useFallbackPlan
      ? "compatibility_fallback"
      : "model_narration_opening",
    claimRefs: [],
  });
  const validation = validateHookCandidate({
    request,
    plan: activePlan,
    candidate,
    repairBoundExceeded: true,
  });
  if (!validation.ok) {
    throw new Error(
      `terminal Hook authority validation failed for fixture narration (${candidate.openingText})`,
    );
  }
  return Object.freeze({
    request,
    activePlan,
    approvedCandidate: candidate,
    openingClaimRefs: Object.freeze([...candidate.claimRefs]),
    validation,
  });
}

export function toHookTerminalEvidence(
  authority: RetentionTerminalHookAuthority,
): HookedNarrationTerminalEvidence {
  return Object.freeze({
    request: authority.request,
    activePlan: authority.activePlan,
    candidate: authority.approvedCandidate,
    validation: authority.validation,
    openingClaimRefs: authority.openingClaimRefs,
  });
}

export function applyDefaultReadyHistory(
  ledger: RetentionModelCallLedger,
  qualityMode: "cheap" | "balanced" | "best",
): void {
  const snap = ledger.snapshot();
  if (qualityMode !== "cheap" && snap.counts.planner === 0) {
    ledger.consume("planner");
    ledger.recordOutcome("planner", "succeeded");
  }
  if (ledger.snapshot().counts.initial_narration === 0) {
    ledger.consume("initial_narration");
    ledger.recordOutcome("initial_narration", "succeeded");
  }
}

export function readyBridgeWithAuthority(
  candidate: RetentionNarrationCandidate,
  plan: RetentionStoryPlan,
  qualityMode: "cheap" | "balanced" | "best",
  ledger: RetentionModelCallLedger,
  options: {
    readonly useFallbackPlan?: boolean;
    readonly authority?: RetentionTerminalHookAuthority;
  } = {},
): Extract<RetentionHookBridgeResult, { status: "ready" }> {
  applyDefaultReadyHistory(ledger, qualityMode);
  const budget = ledger.snapshot();
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
  const terminalHookAuthority =
    options.authority ??
    buildTerminalHookAuthority(candidate.assembledNarration, {
      useFallbackPlan: options.useFallbackPlan,
    });
  const safeHook = deriveSafeHookEnvelopeFromAuthority(terminalHookAuthority);
  return Object.freeze({
    status: "ready" as const,
    title: "Spain pressure story",
    approvedNarration: candidate.assembledNarration,
    candidate,
    diagnostics: Object.freeze({
      qualityMode,
      plannerAttempts: budget.counts.planner,
      composerAttempts,
      hookAdapterRan: true,
      budget,
      outcome: "hook_approved" as const,
      planFingerprint: plan.planFingerprint,
      candidateFingerprint: candidate.candidateFingerprint,
      compositionAuthority: hasDeterministicRescue
        ? ("deterministic_rescue" as const)
        : ("model_initial" as const),
    }),
    hookPlanSnapshot: safeHook.hookPlanSnapshot,
    hookDiagnostics: safeHook.hookDiagnostics,
    terminalHookAuthority,
  });
}

export function makeEmptyReadyLedger(
  qualityMode: "cheap" | "balanced" | "best",
): RetentionModelCallLedger {
  return createRetentionModelCallLedger(qualityMode);
}
