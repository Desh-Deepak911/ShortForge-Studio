/**
 * Total coherence for ephemeral Retention terminal Hook authority — Sprint 10F.2A.
 */

import { assertRequestPlanCoherence } from "@/features/hook-engine/domain/assert-request-plan-coherence";
import { buildHookCandidate } from "@/features/hook-engine/validation/build-hook-candidate";
import { validateHookCandidate } from "@/features/hook-engine/validation/validate-hook-candidate";
import { extractOpeningSpan } from "@/features/hook-engine/validation/extract-opening-span";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import { RetentionValidationError } from "../validation/retention-validation-errors";
import type { RetentionTerminalHookAuthority } from "./retention-terminal-hook-authority.types";

function throwAuthority(): never {
  throw new RetentionValidationError(
    "hook_bridge_coherence_mismatch",
    "Retention terminal Hook authority failed coherence checks.",
  );
}

/**
 * Assert and return a detached frozen canonical terminal Hook authority.
 * Forged original/fallback plan swaps fail closed.
 */
export function assertRetentionTerminalHookAuthorityCoherence(
  authority: unknown,
  approvedNarration: string,
): RetentionTerminalHookAuthority {
  if (
    authority == null ||
    typeof authority !== "object" ||
    Array.isArray(authority)
  ) {
    throwAuthority();
  }
  const record = authority as Record<string, unknown>;
  const allowed = new Set([
    "request",
    "activePlan",
    "approvedCandidate",
    "openingClaimRefs",
    "validation",
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throwAuthority();
  }
  for (const key of allowed) {
    if (!(key in record)) throwAuthority();
  }

  const request = record.request;
  const activePlan = record.activePlan;
  const approvedCandidate = record.approvedCandidate;
  const validation = record.validation;
  const openingClaimRefs = record.openingClaimRefs;

  if (request == null || typeof request !== "object") throwAuthority();
  if (activePlan == null || typeof activePlan !== "object") throwAuthority();
  if (approvedCandidate == null || typeof approvedCandidate !== "object") {
    throwAuthority();
  }
  if (validation == null || typeof validation !== "object") throwAuthority();
  if (!Array.isArray(openingClaimRefs)) throwAuthority();

  try {
    assertRequestPlanCoherence(
      request as RetentionTerminalHookAuthority["request"],
      activePlan as RetentionTerminalHookAuthority["activePlan"],
    );
  } catch {
    throwAuthority();
  }

  const plan = activePlan as RetentionTerminalHookAuthority["activePlan"];
  const req = request as RetentionTerminalHookAuthority["request"];
  const suppliedCandidate =
    approvedCandidate as RetentionTerminalHookAuthority["approvedCandidate"];
  const suppliedValidation =
    validation as RetentionTerminalHookAuthority["validation"];

  if (suppliedCandidate.planFingerprint !== plan.planFingerprint) {
    throwAuthority();
  }
  if (suppliedValidation.planFingerprint !== plan.planFingerprint) {
    throwAuthority();
  }

  let rebuilt;
  try {
    rebuilt = buildHookCandidate({
      narration: approvedNarration,
      request: req,
      plan,
      origin: suppliedCandidate.origin,
      claimRefs: openingClaimRefs as readonly string[],
    });
  } catch {
    throwAuthority();
  }

  if (rebuilt.candidateId !== suppliedCandidate.candidateId) throwAuthority();
  if (rebuilt.planFingerprint !== plan.planFingerprint) throwAuthority();
  if (rebuilt.openingText !== suppliedCandidate.openingText) throwAuthority();
  if (rebuilt.openingStartOffset !== suppliedCandidate.openingStartOffset) {
    throwAuthority();
  }
  if (rebuilt.openingEndOffset !== suppliedCandidate.openingEndOffset) {
    throwAuthority();
  }
  {
    const a = [...rebuilt.claimRefs].sort();
    const b = [...(openingClaimRefs as readonly string[])].sort();
    if (retentionStableStringify(a) !== retentionStableStringify(b)) {
      throwAuthority();
    }
  }

  const recomputed = validateHookCandidate({
    request: req,
    plan,
    candidate: rebuilt,
    repairBoundExceeded: true,
  });

  if (!recomputed.ok) throwAuthority();
  if (
    !recomputed.hardGatesPassed.grounding ||
    !recomputed.hardGatesPassed.safety
  ) {
    throwAuthority();
  }
  if (
    !recomputed.strategyThresholdsPassed.provocativeness ||
    !recomputed.strategyThresholdsPassed.clarity
  ) {
    throwAuthority();
  }
  if (
    !recomputed.openingLimitsPassed.wordLimit ||
    !recomputed.openingLimitsPassed.spokenDurationLimit
  ) {
    throwAuthority();
  }
  if (recomputed.planFingerprint !== plan.planFingerprint) throwAuthority();
  if (recomputed.candidateId !== rebuilt.candidateId) throwAuthority();

  // Supplied validation must match recomputed authority identity.
  if (suppliedValidation.candidateId !== recomputed.candidateId) {
    throwAuthority();
  }
  if (suppliedValidation.ok !== true) throwAuthority();

  const span = extractOpeningSpan(approvedNarration);
  if (!span) throwAuthority();
  if (span.openingStartOffset !== 0) throwAuthority();
  if (span.openingText !== rebuilt.openingText) throwAuthority();
  if (span.openingEndOffset !== rebuilt.openingEndOffset) throwAuthority();
  if (
    approvedNarration.slice(0, rebuilt.openingEndOffset) !== rebuilt.openingText
  ) {
    throwAuthority();
  }

  return Object.freeze({
    request: req,
    activePlan: plan,
    approvedCandidate: rebuilt,
    openingClaimRefs: Object.freeze([...rebuilt.claimRefs]),
    validation: Object.freeze({ ...recomputed }),
  });
}
