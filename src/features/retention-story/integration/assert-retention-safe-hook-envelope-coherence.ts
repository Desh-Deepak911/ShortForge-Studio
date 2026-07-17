/**
 * Safe Hook envelope coherence — Sprint 10F.3A / 10F.3B.
 * Rebuilds expected HookPlanSnapshot from terminal Hook authority and validates
 * diagnostics as total, fail-closed terminal evidence. Terminal Hook authority
 * remains ephemeral and is never returned.
 */

import {
  buildHookPlanSnapshot,
  type HookDiagnostics,
  type HookGenerationPath,
  type HookLengthEnforcementKind,
  type HookPlanSnapshot,
  type HookValidationOutcome,
} from "@/features/hook-engine";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import type { RetentionPostRewriteHookEvidence } from "../rewrite/retention-terminal-hook-authority.types";
import type { RetentionTerminalHookAuthority } from "../rewrite/retention-terminal-hook-authority.types";

const HOOK_DIAGNOSTICS_KEYS = Object.freeze([
  "contractVersion",
  "strategyId",
  "strategyVersion",
  "strategySource",
  "candidateOrigin",
  "generationPath",
  "requestFingerprint",
  "planFingerprint",
  "fallbackReason",
  "groundingStatus",
  "validationOutcome",
  "repairAttempts",
  "compressionRevalidated",
  "lengthEnforcement",
  "templateInfluenced",
  "promptIntelligenceInfluenced",
  "adapterRan",
] as const);

const REQUIRED_DIAGNOSTIC_KEYS = Object.freeze([
  "contractVersion",
  "strategyId",
  "strategyVersion",
  "strategySource",
  "candidateOrigin",
  "generationPath",
  "requestFingerprint",
  "planFingerprint",
  "groundingStatus",
  "validationOutcome",
  "repairAttempts",
  "templateInfluenced",
  "promptIntelligenceInfluenced",
  "adapterRan",
] as const);

const SUCCESS_OUTCOMES = Object.freeze([
  "pass",
  "repaired",
  "fallback",
] as const satisfies readonly HookValidationOutcome[]);

const LENGTH_ENFORCEMENT_VALUES = Object.freeze([
  "none",
  "compressed",
  "truncated",
  "compressed_then_truncated",
] as const satisfies readonly HookLengthEnforcementKind[]);

/** Bounded private-data-free fallback reason IDs for successful ready bridges. */
const SAFE_FALLBACK_REASON_IDS = Object.freeze([
  "validated_compatibility_fallback",
  "validated_safe_fallback",
] as const);

const FALLBACK_REASON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

function throwEnvelope(message = "Safe Hook envelope coherence failed."): never {
  throw new RetentionStoryError("hook_terminal_failure", message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assertNoUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) throwEnvelope();
  }
}

function assertRequiredKeys(
  record: Record<string, unknown>,
  required: readonly string[],
): void {
  for (const key of required) {
    if (!(key in record)) throwEnvelope();
  }
}

function isSafeFallbackReasonId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    FALLBACK_REASON_PATTERN.test(value) &&
    (SAFE_FALLBACK_REASON_IDS as readonly string[]).includes(value)
  );
}

function deriveTemplateInfluenced(
  authority: RetentionTerminalHookAuthority,
): boolean {
  return Boolean(authority.request.templateId);
}

function derivePromptIntelligenceInfluenced(
  authority: RetentionTerminalHookAuthority,
): boolean {
  return (
    authority.activePlan.strategySource === "prompt_intelligence" ||
    Boolean(authority.request.openingIntent)
  );
}

function assertSuccessfulOutcomeCoherence(input: {
  readonly outcome: "pass" | "repaired" | "fallback";
  readonly repairAttempts: 0 | 1;
  readonly candidateOrigin: string;
  readonly strategySource: string;
  readonly fallbackReason: string | undefined;
}): void {
  const {
    outcome,
    repairAttempts,
    candidateOrigin,
    strategySource,
    fallbackReason,
  } = input;

  if (outcome === "repaired") {
    if (repairAttempts !== 1) throwEnvelope();
    if (candidateOrigin !== "repair_rewrite") throwEnvelope();
    if (strategySource === "compatibility_fallback") throwEnvelope();
    if (fallbackReason !== undefined) throwEnvelope();
    return;
  }

  if (outcome === "fallback") {
    if (strategySource !== "compatibility_fallback") throwEnvelope();
    if (candidateOrigin !== "compatibility_fallback") throwEnvelope();
    if (!isSafeFallbackReasonId(fallbackReason)) throwEnvelope();
    if (repairAttempts !== 0 && repairAttempts !== 1) throwEnvelope();
    return;
  }

  // ordinary pass
  if (repairAttempts !== 0) throwEnvelope();
  if (fallbackReason !== undefined) throwEnvelope();
  if (strategySource === "compatibility_fallback") throwEnvelope();
  if (
    candidateOrigin !== "model_narration_opening" &&
    candidateOrigin !== "user_authored"
  ) {
    throwEnvelope();
  }
}

/**
 * Validate safe Hook snapshot + diagnostics against terminal Hook authority.
 * Returns detached frozen safe fields only (never the authority).
 *
 * When `postRewriteHookEvidence` is present, diagnostics must still describe
 * the accepted pre-rewrite Hook history; post-rewrite evidence is validated
 * separately by post-rewrite bridge coherence.
 */
export function assertRetentionSafeHookEnvelopeCoherence(input: {
  readonly hookPlanSnapshot: unknown;
  readonly hookDiagnostics: unknown;
  readonly terminalHookAuthority: RetentionTerminalHookAuthority;
  readonly generationPath: HookGenerationPath;
  readonly postRewriteHookEvidence?: RetentionPostRewriteHookEvidence | null;
}): {
  readonly hookPlanSnapshot: HookPlanSnapshot;
  readonly hookDiagnostics: HookDiagnostics;
} {
  const { terminalHookAuthority: authority, generationPath } = input;

  let expectedSnapshot: HookPlanSnapshot;
  try {
    expectedSnapshot = buildHookPlanSnapshot(authority.activePlan);
  } catch {
    throwEnvelope();
  }

  if (!isPlainObject(input.hookPlanSnapshot)) throwEnvelope();
  if (
    retentionStableStringify(input.hookPlanSnapshot) !==
    retentionStableStringify(expectedSnapshot)
  ) {
    throwEnvelope();
  }

  if (!isPlainObject(input.hookDiagnostics)) throwEnvelope();
  const diag = input.hookDiagnostics;
  assertNoUnknownKeys(diag, HOOK_DIAGNOSTICS_KEYS);
  assertRequiredKeys(diag, REQUIRED_DIAGNOSTIC_KEYS);

  const plan = authority.activePlan;
  const candidate = authority.approvedCandidate;
  const validation = authority.validation;
  const request = authority.request;

  // Recomputed creator-influence / identity authority — caller must match.
  const expectedTemplateInfluenced = deriveTemplateInfluenced(authority);
  const expectedPromptIntelligenceInfluenced =
    derivePromptIntelligenceInfluenced(authority);

  if (diag.contractVersion !== plan.contractVersion) throwEnvelope();
  if (diag.strategyId !== plan.strategyId) throwEnvelope();
  if (diag.strategyVersion !== plan.strategyVersion) throwEnvelope();
  if (diag.strategySource !== plan.strategySource) throwEnvelope();
  if (diag.requestFingerprint !== plan.requestFingerprint) throwEnvelope();
  if (diag.requestFingerprint !== request.requestFingerprint) throwEnvelope();
  if (diag.planFingerprint !== plan.planFingerprint) throwEnvelope();
  if (diag.generationPath !== generationPath) throwEnvelope();
  if (diag.generationPath !== request.generationPath) throwEnvelope();
  if (diag.adapterRan !== true) throwEnvelope();
  if (diag.candidateOrigin !== candidate.origin) throwEnvelope();
  if (diag.groundingStatus !== validation.groundingStatus) throwEnvelope();
  if (diag.templateInfluenced !== expectedTemplateInfluenced) throwEnvelope();
  if (diag.promptIntelligenceInfluenced !== expectedPromptIntelligenceInfluenced) {
    throwEnvelope();
  }

  // Ready-bridge success outcomes only — rejects fail / generation_failed /
  // unknown values before any further diagnostic authority is accepted.
  if (!(SUCCESS_OUTCOMES as readonly string[]).includes(diag.validationOutcome as string)) {
    throwEnvelope();
  }
  if (
    diag.validationOutcome !== "pass" &&
    diag.validationOutcome !== "repaired" &&
    diag.validationOutcome !== "fallback"
  ) {
    throwEnvelope();
  }

  if (typeof diag.repairAttempts !== "number") throwEnvelope();
  if (!Number.isFinite(diag.repairAttempts)) throwEnvelope();
  if (!Number.isInteger(diag.repairAttempts)) throwEnvelope();
  if (diag.repairAttempts !== 0 && diag.repairAttempts !== 1) throwEnvelope();
  const repairAttempts = diag.repairAttempts as 0 | 1;

  let lengthEnforcement: HookLengthEnforcementKind | undefined;
  if ("lengthEnforcement" in diag) {
    if (typeof diag.lengthEnforcement !== "string") throwEnvelope();
    if (
      !(LENGTH_ENFORCEMENT_VALUES as readonly string[]).includes(
        diag.lengthEnforcement,
      )
    ) {
      throwEnvelope();
    }
    lengthEnforcement = diag.lengthEnforcement as HookLengthEnforcementKind;
  }

  let compressionRevalidated: boolean | undefined;
  if ("compressionRevalidated" in diag) {
    if (typeof diag.compressionRevalidated !== "boolean") throwEnvelope();
    compressionRevalidated = diag.compressionRevalidated;
  }

  let fallbackReason: string | undefined;
  if ("fallbackReason" in diag) {
    if (!isSafeFallbackReasonId(diag.fallbackReason)) throwEnvelope();
    fallbackReason = diag.fallbackReason;
  }

  assertSuccessfulOutcomeCoherence({
    outcome: diag.validationOutcome,
    repairAttempts,
    candidateOrigin: candidate.origin,
    strategySource: plan.strategySource,
    fallbackReason,
  });

  // Post-rewrite: preserve pre-rewrite Hook-history diagnostics; never invent
  // repair/fallback history from post-rewrite evidence alone.
  if (input.postRewriteHookEvidence != null) {
    if (candidate.origin === "post_retention_body_rewrite") throwEnvelope();
    if (diag.candidateOrigin === "post_retention_body_rewrite") throwEnvelope();
    // Evidence must be a plain object with rebuilt candidate + validation —
    // structural proof only; detailed coherence owned by post-rewrite assert.
    if (!isPlainObject(input.postRewriteHookEvidence as unknown)) {
      throwEnvelope();
    }
    const evidence = input.postRewriteHookEvidence as unknown as Record<
      string,
      unknown
    >;
    if (!isPlainObject(evidence.rebuiltCandidate)) throwEnvelope();
    if (!isPlainObject(evidence.validation)) throwEnvelope();
    if (
      (evidence.rebuiltCandidate as { origin?: unknown }).origin !==
      "post_retention_body_rewrite"
    ) {
      throwEnvelope();
    }
  }

  const validatedDiagnostics: HookDiagnostics = Object.freeze({
    contractVersion: plan.contractVersion,
    strategyId: plan.strategyId,
    strategyVersion: plan.strategyVersion,
    strategySource: plan.strategySource,
    candidateOrigin: candidate.origin,
    generationPath,
    requestFingerprint: plan.requestFingerprint,
    planFingerprint: plan.planFingerprint,
    ...(fallbackReason !== undefined ? { fallbackReason } : {}),
    groundingStatus: validation.groundingStatus,
    validationOutcome: diag.validationOutcome,
    repairAttempts,
    ...(compressionRevalidated === true
      ? { compressionRevalidated: true as const }
      : {}),
    ...(lengthEnforcement !== undefined ? { lengthEnforcement } : {}),
    templateInfluenced: expectedTemplateInfluenced,
    promptIntelligenceInfluenced: expectedPromptIntelligenceInfluenced,
    adapterRan: true as const,
  });

  return Object.freeze({
    hookPlanSnapshot: expectedSnapshot,
    hookDiagnostics: validatedDiagnostics,
  });
}
