/**
 * Post-rewrite Hook-bridge coherence — Sprint 10F.2 / 10F.2A.
 * Requires retention_body_rewrite === 1, accepted chronology, and real
 * post-rewrite Hook evidence (rebuilt candidate + recomputed validation).
 * Does not weaken the pre-rewrite ready assertion (rewrite === 0).
 */

import { buildHookCandidate } from "@/features/hook-engine/validation/build-hook-candidate";
import { validateHookCandidate } from "@/features/hook-engine/validation/validate-hook-candidate";

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
import {
  deriveReadyLedgerPhaseEvidence,
  isReadyLedgerPhaseOrderValid,
} from "../integration/derive-ready-planner-terminal-outcome";
import type { RetentionHookBridgeReadyResult } from "../integration/assert-retention-hook-bridge-ready-coherence";
import { assertRetentionSafeHookEnvelopeCoherence } from "../integration/assert-retention-safe-hook-envelope-coherence";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { RetentionValidationError } from "../validation/retention-validation-errors";
import { assertRetentionTerminalHookAuthorityCoherence } from "./assert-retention-terminal-hook-authority-coherence";
import type {
  RetentionPostRewriteHookEvidence,
  RetentionTerminalHookAuthority,
} from "./retention-terminal-hook-authority.types";

export interface AssertRetentionHookBridgePostRewriteContext {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly plan: RetentionStoryPlan;
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
  "postRewriteHookEvidence",
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

function throwBridgeCoherence(): never {
  throw new RetentionValidationError(
    "hook_bridge_coherence_mismatch",
    "Retention Hook bridge post-rewrite result failed coherence checks.",
  );
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function assertPostRewritePhaseOrder(
  budget: RetentionModelCallLedgerSnapshot,
): void {
  if (budget.qualityMode !== "best") throwBridgeCoherence();

  const phase = deriveReadyLedgerPhaseEvidence(budget.events);
  if (!isReadyLedgerPhaseOrderValid(phase, "best")) throwBridgeCoherence();

  const rewriteAttempted = budget.events.find(
    (e) =>
      e.category === "retention_body_rewrite" && e.outcome === "attempted",
  );
  const rewriteSucceeded = budget.events.find(
    (e) =>
      e.category === "retention_body_rewrite" && e.outcome === "succeeded",
  );
  if (!rewriteAttempted || !rewriteSucceeded) throwBridgeCoherence();
  const compositionSequence =
    phase.initialSucceededSequence ?? phase.hookRepairSucceededSequence;
  if (compositionSequence == null) throwBridgeCoherence();
  if (rewriteAttempted.sequence <= compositionSequence) {
    throwBridgeCoherence();
  }
  if (rewriteSucceeded.sequence <= rewriteAttempted.sequence) {
    throwBridgeCoherence();
  }

  const rewriteAttempts = budget.events.filter(
    (e) =>
      e.category === "retention_body_rewrite" && e.outcome === "attempted",
  );
  if (rewriteAttempts.length !== 1) throwBridgeCoherence();
}

function assertPostRewriteHookEvidence(
  evidence: unknown,
  authority: RetentionTerminalHookAuthority,
  approvedNarration: string,
): RetentionPostRewriteHookEvidence {
  if (
    evidence == null ||
    typeof evidence !== "object" ||
    Array.isArray(evidence)
  ) {
    throwBridgeCoherence();
  }
  const record = evidence as Record<string, unknown>;
  if (!("rebuiltCandidate" in record) || !("validation" in record)) {
    throwBridgeCoherence();
  }

  let rebuilt;
  try {
    rebuilt = buildHookCandidate({
      narration: approvedNarration,
      request: authority.request,
      plan: authority.activePlan,
      origin: "post_retention_body_rewrite",
      claimRefs: authority.openingClaimRefs,
    });
  } catch {
    throwBridgeCoherence();
  }

  const suppliedCandidate = record.rebuiltCandidate as {
    readonly candidateId?: string;
    readonly planFingerprint?: string;
    readonly openingText?: string;
  };
  if (suppliedCandidate.candidateId !== rebuilt.candidateId) {
    throwBridgeCoherence();
  }
  if (suppliedCandidate.planFingerprint !== authority.activePlan.planFingerprint) {
    throwBridgeCoherence();
  }
  if (suppliedCandidate.openingText !== rebuilt.openingText) {
    throwBridgeCoherence();
  }

  const recomputed = validateHookCandidate({
    request: authority.request,
    plan: authority.activePlan,
    candidate: rebuilt,
    repairBoundExceeded: true,
  });
  if (!recomputed.ok) throwBridgeCoherence();

  const suppliedValidation = record.validation as {
    readonly ok?: boolean;
    readonly candidateId?: string;
    readonly planFingerprint?: string;
  };
  if (suppliedValidation.ok !== true) throwBridgeCoherence();
  if (suppliedValidation.candidateId !== rebuilt.candidateId) {
    throwBridgeCoherence();
  }
  if (
    suppliedValidation.planFingerprint !== authority.activePlan.planFingerprint
  ) {
    throwBridgeCoherence();
  }
  if (recomputed.candidateId !== suppliedValidation.candidateId) {
    throwBridgeCoherence();
  }

  return Object.freeze({
    rebuiltCandidate: rebuilt,
    validation: Object.freeze({ ...recomputed }),
  });
}

/**
 * Assert a post-rewrite ready Hook bridge is coherent with the final candidate.
 */
export function assertRetentionHookBridgePostRewriteCoherence(
  bridge: unknown,
  context: AssertRetentionHookBridgePostRewriteContext,
): RetentionHookBridgeReadyResult {
  if (bridge == null || typeof bridge !== "object" || Array.isArray(bridge)) {
    throwBridgeCoherence();
  }
  const record = bridge as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!READY_KEYS.has(key)) throwBridgeCoherence();
  }
  if (record.status !== "ready") throwBridgeCoherence();
  if (typeof record.title !== "string") throwBridgeCoherence();
  if (typeof record.approvedNarration !== "string") throwBridgeCoherence();
  if (!("terminalHookAuthority" in record)) throwBridgeCoherence();
  if (!("postRewriteHookEvidence" in record)) throwBridgeCoherence();

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
  if (context.contract.qualityMode !== "best") throwBridgeCoherence();
  if (diag.qualityMode !== "best") throwBridgeCoherence();

  let budget: RetentionModelCallLedgerSnapshot;
  try {
    budget = assertRetentionModelCallLedgerSnapshotCoherence(
      diag.budget,
      "best",
      {
        requireClosed: true,
        requireSuccessfulInitialNarration: true,
        requireSuccessfulRetentionBodyRewrite: true,
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

  if (!isNonNegInt(diag.plannerAttempts)) throwBridgeCoherence();
  if (!isNonNegInt(diag.composerAttempts)) throwBridgeCoherence();
  if (diag.plannerAttempts !== budget.counts.planner) throwBridgeCoherence();
  if (budget.counts.planner !== 1) throwBridgeCoherence();
  if (budget.counts.retention_body_rewrite !== 1) throwBridgeCoherence();

  const composerAttempts =
    budget.counts.initial_narration +
    budget.counts.length_compression +
    budget.counts.hook_repair +
    budget.counts.hook_fallback;
  if (diag.composerAttempts !== composerAttempts) throwBridgeCoherence();

  assertPostRewritePhaseOrder(budget);

  // Sprint 10H.3B — composition authority must bind to ledger markers.
  const compositionAuthority = diag.compositionAuthority;
  if (
    compositionAuthority !== "model_initial" &&
    compositionAuthority !== "deterministic_rescue"
  ) {
    throwBridgeCoherence();
  }
  {
    let detMarkers = 0;
    let modelSuccesses = 0;
    for (const event of budget.events) {
      if (event.category !== "initial_narration") continue;
      if (event.outcome === "skipped_deterministic") detMarkers += 1;
      if (event.outcome === "succeeded") modelSuccesses += 1;
    }
    let repairSuccesses = 0;
    for (const event of budget.events) {
      if (event.category === "hook_repair" && event.outcome === "succeeded") {
        repairSuccesses += 1;
      }
    }
    if (detMarkers > 1 || modelSuccesses > 1) throwBridgeCoherence();
    if (compositionAuthority === "deterministic_rescue") {
      if (detMarkers !== 1) throwBridgeCoherence();
    } else if (
      detMarkers !== 0 ||
      (modelSuccesses !== 1 && !(modelSuccesses === 0 && repairSuccesses === 1))
    ) {
      throwBridgeCoherence();
    }
  }

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

  if (
    nestedCandidate.origin !== "after_body_rewrite" &&
    nestedCandidate.origin !== "after_length_enforcement" &&
    nestedCandidate.origin !== "final"
  ) {
    throwBridgeCoherence();
  }

  let terminalHookAuthority: RetentionTerminalHookAuthority;
  try {
    // Pre-rewrite authority remains valid when the rewritten narration still
    // carries the exact approved opening (opening-derived candidate identity).
    terminalHookAuthority = assertRetentionTerminalHookAuthorityCoherence(
      record.terminalHookAuthority,
      approvedNarration,
    );
  } catch {
    throwBridgeCoherence();
  }

  const postRewriteHookEvidence = assertPostRewriteHookEvidence(
    record.postRewriteHookEvidence,
    terminalHookAuthority,
    approvedNarration,
  );

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
      postRewriteHookEvidence,
    });
  } catch {
    throwBridgeCoherence();
  }

  return Object.freeze({
    status: "ready",
    title: record.title as string,
    approvedNarration,
    candidate: nestedCandidate,
    diagnostics: Object.freeze({
      qualityMode: "best",
      plannerAttempts: budget.counts.planner,
      composerAttempts,
      hookAdapterRan: true as const,
      budget,
      outcome: "hook_approved" as const,
      planFingerprint: context.plan.planFingerprint,
      candidateFingerprint: context.candidate.candidateFingerprint,
      compositionAuthority: compositionAuthority as
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
    postRewriteHookEvidence,
  });
}
