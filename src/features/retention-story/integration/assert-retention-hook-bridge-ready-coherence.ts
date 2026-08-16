/**
 * Canonical ready Hook-bridge assertion — Sprint 10F.1 / 10F.1A / 10F.1B / 10F.1C / 10F.2A.
 * Runtime structural + authority coherence (not cryptographic authenticity).
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import { assertRetentionModelCallLedgerSnapshotCoherence } from "../budget/assert-retention-model-call-ledger-snapshot-coherence";
import type { RetentionModelCallLedgerSnapshot } from "../budget/retention-model-call-budget.types";
import { assertRetentionNarrationCandidateCoherence } from "../composition/assert-retention-narration-candidate-coherence";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { assertRetentionTerminalHookAuthorityCoherence } from "../rewrite/assert-retention-terminal-hook-authority-coherence";
import type { RetentionTerminalHookAuthority } from "../rewrite/retention-terminal-hook-authority.types";
import { RetentionValidationError } from "../validation/retention-validation-errors";
import {
  deriveReadyLedgerPhaseEvidence,
  isReadyLedgerPhaseOrderValid,
} from "./derive-ready-planner-terminal-outcome";
import { assertRetentionSafeHookEnvelopeCoherence } from "./assert-retention-safe-hook-envelope-coherence";
import type { RetentionHookBridgeResult } from "./retention-hook-bridge.types";

export type RetentionHookBridgeReadyResult = Extract<
  RetentionHookBridgeResult,
  { readonly status: "ready" }
>;

export interface AssertRetentionHookBridgeReadyContext {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly plan: RetentionStoryPlan;
  /** Active final candidate under validation. */
  readonly candidate: RetentionNarrationCandidate;
}

const READY_KEYS = new Set([
  "status",
  "title",
  "approvedNarration",
  "candidate",
  "diagnostics",
  "hookPlanSnapshot",
  "hookDiagnostics",
  "lengthWarning",
  "terminalHookAuthority",
]);

const DIAGNOSTIC_KEYS = new Set([
  "qualityMode",
  "plannerAttempts",
  "composerAttempts",
  "hookAdapterRan",
  "budget",
  "outcome",
  "planFingerprint",
  "candidateFingerprint",
  "compositionAuthority",
  "boundedRewriteType",
]);

function assertCompositionAuthorityBinding(
  diagnostics: Record<string, unknown>,
  budget: RetentionModelCallLedgerSnapshot,
): void {
  const authority = diagnostics.compositionAuthority;
  if (authority !== "model_initial" && authority !== "deterministic_rescue") {
    throwBridgeCoherence();
  }
  let detMarkers = 0;
  let modelSuccesses = 0;
  for (const event of budget.events) {
    if (event.category !== "initial_narration") continue;
    if (event.outcome === "skipped_deterministic") detMarkers += 1;
    if (event.outcome === "succeeded") modelSuccesses += 1;
  }
  if (detMarkers > 1) throwBridgeCoherence();
  if (modelSuccesses > 1) throwBridgeCoherence();
  let repairSuccesses = 0;
  for (const event of budget.events) {
    if (
      (event.category === "hook_repair" ||
        event.category === "length_compression") &&
      event.outcome === "succeeded"
    ) {
      repairSuccesses += 1;
    }
  }
  if (authority === "deterministic_rescue") {
    // Active rescued candidate must bind to exactly one deterministic marker.
    if (detMarkers !== 1) throwBridgeCoherence();
  } else {
    // Model-owned candidate cannot borrow a later deterministic marker.
    if (detMarkers !== 0) throwBridgeCoherence();
    if (modelSuccesses !== 1 && !(modelSuccesses === 0 && repairSuccesses === 1)) {
      throwBridgeCoherence();
    }
  }
}

function throwBridgeCoherence(): never {
  throw new RetentionValidationError(
    "hook_bridge_coherence_mismatch",
    "Retention Hook bridge ready result failed coherence checks.",
  );
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Ready-path planner + phase-order evidence — stricter than general ledger rules.
 * Requires shared-ledger planner success for Balanced/Studio; Fast must be zero;
 * lifecycle chronology must match the accepted ready phases.
 */
function assertReadyPlannerEvidence(
  diagnostics: Record<string, unknown>,
  budget: RetentionModelCallLedgerSnapshot,
  qualityMode: RetentionModelCallLedgerSnapshot["qualityMode"],
): void {
  const phase = deriveReadyLedgerPhaseEvidence(budget.events);

  if (qualityMode === "cheap") {
    if (budget.counts.planner !== 0) throwBridgeCoherence();
    if (phase.plannerTerminal !== "none") throwBridgeCoherence();
    if (diagnostics.plannerAttempts !== 0) throwBridgeCoherence();
    if (!isReadyLedgerPhaseOrderValid(phase, "cheap")) throwBridgeCoherence();
    return;
  }

  if (qualityMode === "balanced" || qualityMode === "best") {
    // Sprint 10H.3 — model planning is advisory. Reliability may commit after
    // planner malformed/failed, or with zero planner calls when unavailable.
    if (budget.counts.planner === 1) {
      if (
        phase.plannerTerminal !== "succeeded" &&
        phase.plannerTerminal !== "malformed" &&
        phase.plannerTerminal !== "failed" &&
        phase.plannerTerminal !== "rejected" &&
        phase.plannerTerminal !== "empty"
      ) {
        throwBridgeCoherence();
      }
      if (diagnostics.plannerAttempts !== 1) throwBridgeCoherence();
    } else if (budget.counts.planner === 0) {
      if (phase.plannerTerminal !== "none") throwBridgeCoherence();
      if (diagnostics.plannerAttempts !== 0) throwBridgeCoherence();
    } else {
      throwBridgeCoherence();
    }
    if (!isReadyLedgerPhaseOrderValid(phase, qualityMode)) {
      throwBridgeCoherence();
    }
    return;
  }

  // Ready Hook bridge is not a terminal scenes-only path.
  throwBridgeCoherence();
}

function assertReadyBridgeAttempts(
  diagnostics: Record<string, unknown>,
  budget: RetentionModelCallLedgerSnapshot,
  qualityMode: RetentionModelCallLedgerSnapshot["qualityMode"],
): void {
  if (!isNonNegInt(diagnostics.plannerAttempts)) throwBridgeCoherence();
  if (!isNonNegInt(diagnostics.composerAttempts)) throwBridgeCoherence();

  if (diagnostics.plannerAttempts !== budget.counts.planner) {
    throwBridgeCoherence();
  }

  const composerAttempts =
    budget.counts.initial_narration +
    budget.counts.length_compression +
    budget.counts.hook_repair +
    budget.counts.hook_fallback;
  if (diagnostics.composerAttempts !== composerAttempts) {
    throwBridgeCoherence();
  }

  assertReadyPlannerEvidence(diagnostics, budget, qualityMode);
}

/**
 * Assert a ready Hook bridge is structurally coherent with the active final candidate.
 * Returns a detached deeply frozen ready result.
 */
export function assertRetentionHookBridgeReadyCoherence(
  bridge: unknown,
  context: AssertRetentionHookBridgeReadyContext,
): RetentionHookBridgeReadyResult {
  if (bridge == null || typeof bridge !== "object" || Array.isArray(bridge)) {
    throwBridgeCoherence();
  }
  const record = bridge as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!READY_KEYS.has(key)) throwBridgeCoherence();
  }
  // Pre-rewrite ready bridges must not carry post-rewrite Hook evidence.
  if ("postRewriteHookEvidence" in record) throwBridgeCoherence();
  if (record.status !== "ready") throwBridgeCoherence();
  if (typeof record.title !== "string") throwBridgeCoherence();
  if (typeof record.approvedNarration !== "string") throwBridgeCoherence();
  if (!("terminalHookAuthority" in record)) throwBridgeCoherence();

  const diagnostics = record.diagnostics;
  if (
    diagnostics == null ||
    typeof diagnostics !== "object" ||
    Array.isArray(diagnostics)
  ) {
    throwBridgeCoherence();
  }
  const diag = diagnostics as Record<string, unknown>;
  for (const key of Object.keys(diag)) {
    if (!DIAGNOSTIC_KEYS.has(key)) throwBridgeCoherence();
  }
  if (diag.hookAdapterRan !== true) throwBridgeCoherence();
  if (diag.outcome !== "hook_approved") throwBridgeCoherence();
  if (diag.planFingerprint !== context.plan.planFingerprint) {
    throwBridgeCoherence();
  }
  if (diag.candidateFingerprint !== context.candidate.candidateFingerprint) {
    throwBridgeCoherence();
  }

  const expectedMode =
    context.contract.generationPath === "scenes_only"
      ? "scenes_only"
      : context.contract.qualityMode;
  if (diag.qualityMode !== expectedMode) throwBridgeCoherence();

  let budget: RetentionModelCallLedgerSnapshot;
  try {
    budget = assertRetentionModelCallLedgerSnapshotCoherence(
      diag.budget,
      expectedMode,
      {
        requireClosed: true,
        requireSuccessfulInitialNarration: true,
        requireZeroRetentionBodyRewrite: true,
      },
    );
  } catch (err) {
    if (
      err instanceof RetentionStoryError &&
      err.reason === "model_call_ledger_invalid"
    ) {
      throwBridgeCoherence();
    }
    throw err;
  }

  assertReadyBridgeAttempts(diag, budget, expectedMode);
  assertCompositionAuthorityBinding(diag, budget);

  let nestedCandidate: RetentionNarrationCandidate;
  try {
    nestedCandidate = assertRetentionNarrationCandidateCoherence(
      record.candidate,
      {
        plan: context.plan,
        grounding: context.grounding,
        strategySeed: context.strategySeed,
      },
    );
  } catch {
    throwBridgeCoherence();
  }

  const approvedNarration = record.approvedNarration as string;
  if (approvedNarration !== nestedCandidate.assembledNarration) {
    throwBridgeCoherence();
  }
  if (approvedNarration !== context.candidate.assembledNarration) {
    throwBridgeCoherence();
  }
  if (
    retentionStableStringify(nestedCandidate) !==
    retentionStableStringify(context.candidate)
  ) {
    throwBridgeCoherence();
  }

  let terminalHookAuthority: RetentionTerminalHookAuthority;
  try {
    terminalHookAuthority = assertRetentionTerminalHookAuthorityCoherence(
      record.terminalHookAuthority,
      approvedNarration,
    );
  } catch {
    throwBridgeCoherence();
  }

  if (
    context.contract.generationPath !== "script_only" &&
    context.contract.generationPath !== "audio_first_full"
  ) {
    throwBridgeCoherence();
  }

  let safeHook;
  try {
    safeHook = assertRetentionSafeHookEnvelopeCoherence({
      hookPlanSnapshot: record.hookPlanSnapshot,
      hookDiagnostics: record.hookDiagnostics,
      terminalHookAuthority,
      generationPath: context.contract.generationPath,
    });
  } catch {
    throwBridgeCoherence();
  }

  const ready: RetentionHookBridgeReadyResult = Object.freeze({
    status: "ready",
    title: record.title as string,
    approvedNarration,
    candidate: nestedCandidate,
    diagnostics: Object.freeze({
      qualityMode: expectedMode,
      plannerAttempts: budget.counts.planner,
      composerAttempts:
        budget.counts.initial_narration +
        budget.counts.length_compression +
        budget.counts.hook_repair +
        budget.counts.hook_fallback,
      hookAdapterRan: true as const,
      budget,
      outcome: "hook_approved" as const,
      planFingerprint: context.plan.planFingerprint,
      candidateFingerprint: context.candidate.candidateFingerprint,
      compositionAuthority: diag.compositionAuthority as
        | "model_initial"
        | "deterministic_rescue",
      ...(diag.boundedRewriteType === "opening_repair" ||
      diag.boundedRewriteType === "ranking_payoff_repair" ||
      diag.boundedRewriteType === "grounding_payoff_repair" ||
      diag.boundedRewriteType === "duplicate_payoff_repair" ||
      diag.boundedRewriteType === "supported_opening_promotion" ||
      diag.boundedRewriteType === "duration_compression"
        ? { boundedRewriteType: diag.boundedRewriteType }
        : {}),
    }),
    hookPlanSnapshot: safeHook.hookPlanSnapshot,
    hookDiagnostics: safeHook.hookDiagnostics,
    ...(typeof record.lengthWarning === "string"
      ? { lengthWarning: record.lengthWarning }
      : {}),
    terminalHookAuthority,
  });
  return ready;
}
