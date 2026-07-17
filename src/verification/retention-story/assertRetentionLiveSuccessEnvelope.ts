/**
 * Sprint 10H.1 / 10H.1A — Canonical Retention live success envelope assertion.
 * Equivalent rigor to assertHookLiveSuccessEnvelope. Throws on any Pass-invalid condition.
 * QA-only — does not modify production generation.
 */
import assert from "node:assert/strict";

import type { QualityMode } from "@/types/footiebitz";
import { extractOpeningSpan } from "@/features/hook-engine";
import {
  resolveRetentionModelCallBudgetPolicy,
  validateRetentionStoryPlanSnapshot,
  validateRetentionValidationSummary,
  type RetentionProductionSafeDiagnostics,
  type RetentionStoryPlanSnapshot,
  type RetentionValidationSummary,
} from "@/features/retention-story";

import { assertHookLiveSuccessEnvelope } from "../hook-engine/assertHookLiveEnvelope";
import { assertRetentionLiveGenerationDisposition } from "./assertRetentionLiveGenerationDisposition";
import type { RetentionGenerationDispositionSummary } from "@/features/retention-story";

export interface AssertRetentionLiveEnvelopeOptions {
  readonly expectedGenerationPath: "script_only" | "audio_first_full";
  readonly expectedFormatStrategyId: string;
  readonly expectedQualityMode: QualityMode;
  /** Requested contract duration (seconds) — never derive word budget from audio/scene duration. */
  readonly requestedDurationSec: number;
  readonly expectedHookStrategyId?: string;
  readonly expectedHookStrategySource?: string;
  /** Expected Write My Own opening; validated via opening-span equality (punct-tolerant). */
  readonly narrationStartsWith?: string;
  /** When set, generationDisposition.factHandlingMode must match. */
  readonly expectedFactHandlingMode?: "verified_facts_only" | "creative_premise";
}

const GENERIC_INTRO =
  /\b(in this (video|short)|today (we|i) (will|are going to)|welcome to|hello (everyone|folks)|let'?s (talk|dive|discuss))\b/i;

const DIAGNOSTIC_REQUIRED_KEYS = Object.freeze([
  "version",
  "terminalState",
  "qualityMode",
  "contractFingerprint",
  "planFingerprint",
  "candidateFingerprint",
  "validationFingerprint",
  "rewriteUsed",
  "safeReasonIds",
  "budget",
] as const);

const DIAGNOSTIC_ALLOWED_KEYS = DIAGNOSTIC_REQUIRED_KEYS;

const BUDGET_REQUIRED_KEYS = Object.freeze([
  "total",
  "totalCeiling",
  "planner",
  "initialNarration",
  "lengthCompression",
  "hookRepair",
  "hookFallback",
  "retentionBodyRewrite",
] as const);

const MAX_SAFE_REASON_IDS = 12;
const MAX_SAFE_REASON_ID_CHARS = 64;
const SAFE_REASON_ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const PRIVATE_LEAK_PATTERNS: readonly RegExp[] = [
  /promptBlock/i,
  /terminalHookAuthority/,
  /postRewriteHookEvidence/,
  /terminalEvidence/,
  /assembledNarration/,
  /eligibleClaims/,
  /avoidanceClaims/,
  /hookDirectiveBlock/,
  /OPENAI_API_KEY/,
  /ledgerEvents/,
  /"claims"\s*:/,
  /candidateText/i,
  /hookClaimRefs/i,
  /\bsk-[A-Za-z0-9_-]{10,}/,
  /Bearer\s+eyJ/,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function assertExactShape(
  record: Record<string, unknown>,
  required: readonly string[],
  label: string,
): void {
  for (const key of required) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(record, key),
      `${label}: missing required field "${key}"`,
    );
  }
  for (const key of Object.keys(record)) {
    assert.ok(
      (required as readonly string[]).includes(key),
      `${label}: unknown/private field "${key}"`,
    );
  }
}

function assertNonNegInt(value: unknown, label: string): asserts value is number {
  assert.equal(typeof value, "number", `${label} must be number`);
  const n = value as number;
  assert.ok(Number.isFinite(n), `${label} must be finite`);
  assert.ok(Number.isInteger(n), `${label} must be integer`);
  assert.ok(n >= 0, `${label} must be >= 0`);
}

function assertBudgetCoherent(
  budget: Record<string, unknown>,
  qualityMode: QualityMode,
  terminalState: "pass_without_rewrite" | "pass_after_rewrite",
): void {
  assertExactShape(budget, BUDGET_REQUIRED_KEYS, "retentionDiagnostics.budget");
  const policy = resolveRetentionModelCallBudgetPolicy(qualityMode);

  assertNonNegInt(budget.total, "budget.total");
  assertNonNegInt(budget.totalCeiling, "budget.totalCeiling");
  assertNonNegInt(budget.planner, "budget.planner");
  assertNonNegInt(budget.initialNarration, "budget.initialNarration");
  assertNonNegInt(budget.lengthCompression, "budget.lengthCompression");
  assertNonNegInt(budget.hookRepair, "budget.hookRepair");
  assertNonNegInt(budget.hookFallback, "budget.hookFallback");
  assertNonNegInt(budget.retentionBodyRewrite, "budget.retentionBodyRewrite");

  const categorySum =
    budget.planner +
    budget.initialNarration +
    budget.lengthCompression +
    budget.hookRepair +
    budget.hookFallback +
    budget.retentionBodyRewrite;

  assert.equal(
    budget.total,
    categorySum,
    `budget.total ${budget.total} must equal category sum ${categorySum}`,
  );

  assert.equal(
    budget.totalCeiling,
    policy.totalCeiling,
    `budget.totalCeiling must match policy ${policy.totalCeiling}`,
  );
  assert.ok(
    budget.total <= policy.totalCeiling,
    `budget.total ${budget.total} exceeds policy ceiling ${policy.totalCeiling}`,
  );

  assert.ok(
    budget.planner <= policy.maxPlanner,
    `budget.planner ${budget.planner} exceeds maxPlanner ${policy.maxPlanner}`,
  );
  assert.ok(
    budget.initialNarration <= policy.maxInitialNarration,
    `budget.initialNarration exceeds max ${policy.maxInitialNarration}`,
  );
  assert.ok(
    budget.lengthCompression <= policy.maxLengthCompression,
    `budget.lengthCompression exceeds max ${policy.maxLengthCompression}`,
  );
  assert.ok(
    budget.hookRepair <= policy.maxHookRepair,
    `budget.hookRepair exceeds max ${policy.maxHookRepair}`,
  );
  assert.ok(
    budget.hookFallback <= policy.maxHookFallback,
    `budget.hookFallback exceeds max ${policy.maxHookFallback}`,
  );
  assert.ok(
    budget.retentionBodyRewrite <= policy.maxRetentionBodyRewrite,
    `budget.retentionBodyRewrite exceeds max ${policy.maxRetentionBodyRewrite}`,
  );

  assert.ok(
    budget.initialNarration >= 1 && budget.initialNarration <= 2,
    "successful narration requires initialNarration of 1–2",
  );

  if (qualityMode === "cheap") {
    assert.equal(budget.planner, 0, "Fast requires planner count 0");
  } else {
    // Sprint 10H.3 — planner is advisory; 0 (fallback) or 1 (enriched) are valid.
    assert.ok(
      budget.planner === 0 || budget.planner === 1,
      "Balanced/Studio require planner count 0 or 1",
    );
  }

  if (terminalState === "pass_after_rewrite") {
    assert.equal(
      budget.retentionBodyRewrite,
      1,
      "pass_after_rewrite requires exactly 1 rewrite call",
    );
  } else {
    assert.equal(
      budget.retentionBodyRewrite,
      0,
      "pass_without_rewrite requires rewrite count 0",
    );
  }
}

function assertSafeReasonIds(value: unknown): void {
  assert.ok(Array.isArray(value), "safeReasonIds must be an array");
  assert.ok(
    value.length <= MAX_SAFE_REASON_IDS,
    `safeReasonIds exceeds max count ${MAX_SAFE_REASON_IDS}`,
  );

  for (const item of value) {
    assert.equal(typeof item, "string", "safeReasonIds entries must be strings");
    assert.ok(
      item.length > 0 && item.length <= MAX_SAFE_REASON_ID_CHARS,
      "safeReasonIds entry length out of bounds",
    );
    assert.ok(
      SAFE_REASON_ID_PATTERN.test(item),
      `safeReasonIds entry is not a sanitized reason identifier: ${item.slice(0, 24)}`,
    );
    assert.doesNotMatch(item, /https?:\/\//i);
    assert.doesNotMatch(item, /\s/);
    assert.doesNotMatch(item, /sk-/i);
    assert.doesNotMatch(item, /prompt|narration|claim|bearer|token/i);
    assert.ok(
      !/[A-Za-z0-9+/=]{48,}/.test(item),
      "safeReasonIds must not contain high-entropy blobs",
    );
  }
}

/**
 * Normalize opening for punct-tolerant equality: collapse whitespace and strip
 * trailing sentence punctuation only. Word content must match exactly.
 */
function normalizeOpeningComparable(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?…]+$/u, "")
    .trim();
}

function countPhraseOccurrences(haystack: string, phrase: string): number {
  if (!phrase) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(phrase, from);
    if (idx < 0) break;
    count += 1;
    from = idx + Math.max(phrase.length, 1);
  }
  return count;
}

/**
 * Write My Own: opening-span authority (not prefix-only).
 * Allows harmless trailing punctuation on the span; rejects appended/changed/
 * moved/duplicated openings.
 */
function assertWriteMyOwnOpeningSpan(
  narration: string,
  expectedOpening: string,
): void {
  const expected = expectedOpening.trim();
  assert.ok(expected.length > 0, "expected Write My Own opening required");

  const span = extractOpeningSpan(narration);
  assert.ok(span, "Write My Own requires extractable opening span");

  const expectedNorm = normalizeOpeningComparable(expected);
  const spanNorm = normalizeOpeningComparable(span.openingText);
  assert.equal(
    spanNorm,
    expectedNorm,
    "Write My Own opening span must match expected opening (punct-tolerant)",
  );

  // Opening must be the first spoken span (not moved later).
  let firstContent = 0;
  while (
    firstContent < narration.length &&
    /\s/.test(narration[firstContent]!)
  ) {
    firstContent += 1;
  }
  assert.equal(
    span.openingStartOffset,
    firstContent,
    "Write My Own opening must be the first spoken span",
  );

  // Reject duplicated opening phrase in the full narration body.
  const bodyAfter = narration.slice(span.openingEndOffset);
  const bodyNorm = normalizeOpeningComparable(bodyAfter);
  assert.equal(
    countPhraseOccurrences(bodyNorm, expectedNorm),
    0,
    "Write My Own opening must not be duplicated later in narration",
  );
}

/**
 * Asserts a successful Retention-capable generate-script JSON response.
 * Throws AssertionError on any coherence failure — never soft-passes.
 */
export function assertRetentionLiveSuccessEnvelope(
  json: Record<string, unknown>,
  options: AssertRetentionLiveEnvelopeOptions,
): {
  narration: string;
  retentionPlan: RetentionStoryPlanSnapshot;
  retentionValidation: RetentionValidationSummary;
  retentionDiagnostics: RetentionProductionSafeDiagnostics;
  generationDisposition: RetentionGenerationDispositionSummary;
} {
  assert.equal(json.success, true, "Retention live Pass requires success === true");

  const { narration } = assertHookLiveSuccessEnvelope(json, {
    expectedGenerationPath: options.expectedGenerationPath,
    expectedStrategyId: options.expectedHookStrategyId as never,
    expectedStrategySource: options.expectedHookStrategySource as never,
  });

  assert.ok(
    Object.prototype.hasOwnProperty.call(json, "retentionPlan"),
    "retentionPlan must be present",
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(json, "retentionValidation"),
    "retentionValidation must be present",
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(json, "retentionDiagnostics"),
    "retentionDiagnostics must be present",
  );
  assert.notEqual(json.retentionPlan, null);
  assert.notEqual(json.retentionValidation, null);
  assert.notEqual(json.retentionDiagnostics, null);

  const planResult = validateRetentionStoryPlanSnapshot(json.retentionPlan);
  assert.equal(planResult.ok, true, "retentionPlan must be valid");
  const validationResult = validateRetentionValidationSummary(
    json.retentionValidation,
  );
  assert.equal(validationResult.ok, true, "retentionValidation must be valid");
  if (!planResult.ok || !validationResult.ok) {
    throw new Error("unreachable");
  }

  const plan = planResult.value;
  const validation = validationResult.value;
  assert.equal(validation.ok, true, "retentionValidation.ok must be true");

  assert.ok(isRecord(json.retentionDiagnostics), "retentionDiagnostics object");
  const diagnostics = json.retentionDiagnostics;

  assert.equal(
    Object.prototype.hasOwnProperty.call(diagnostics, "failureCategory"),
    false,
    "success must not carry failureCategory",
  );

  assertExactShape(
    diagnostics,
    DIAGNOSTIC_ALLOWED_KEYS,
    "retentionDiagnostics",
  );

  assert.equal(diagnostics.version, 1);
  assert.equal(typeof diagnostics.terminalState, "string");
  assert.equal(typeof diagnostics.qualityMode, "string");
  assert.equal(typeof diagnostics.rewriteUsed, "boolean");
  assert.equal(typeof diagnostics.contractFingerprint, "string");
  assert.equal(typeof diagnostics.planFingerprint, "string");
  assert.equal(typeof diagnostics.candidateFingerprint, "string");
  assert.equal(typeof diagnostics.validationFingerprint, "string");
  assert.ok((diagnostics.contractFingerprint as string).length > 0);
  assert.ok((diagnostics.planFingerprint as string).length > 0);
  assert.ok((diagnostics.candidateFingerprint as string).length > 0);
  assert.ok((diagnostics.validationFingerprint as string).length > 0);

  assertSafeReasonIds(diagnostics.safeReasonIds);

  assert.equal(
    diagnostics.qualityMode,
    options.expectedQualityMode,
    "diagnostics.qualityMode must exactly match requested quality",
  );
  assert.equal(
    diagnostics.contractFingerprint,
    plan.contractFingerprint,
    "diagnostics.contractFingerprint must match plan",
  );
  assert.equal(
    diagnostics.planFingerprint,
    plan.planFingerprint,
    "diagnostics.planFingerprint must match plan",
  );
  assert.equal(
    validation.contractFingerprint,
    plan.contractFingerprint,
    "linked contractFingerprint",
  );
  assert.equal(
    validation.planFingerprint,
    plan.planFingerprint,
    "linked planFingerprint",
  );
  assert.equal(
    diagnostics.candidateFingerprint,
    validation.candidateFingerprint,
    "diagnostics.candidateFingerprint must match validation",
  );
  assert.equal(
    diagnostics.validationFingerprint,
    validation.validationFingerprint,
    "diagnostics.validationFingerprint must match validation",
  );
  assert.equal(
    diagnostics.terminalState,
    validation.terminalState,
    "diagnostics.terminalState must match validation",
  );
  assert.equal(
    diagnostics.rewriteUsed,
    validation.rewriteUsed,
    "diagnostics.rewriteUsed must match validation",
  );

  assert.ok(
    validation.terminalState === "pass_without_rewrite" ||
      validation.terminalState === "pass_after_rewrite",
  );
  assert.equal(
    diagnostics.rewriteUsed,
    validation.terminalState === "pass_after_rewrite",
  );

  assert.equal(
    plan.formatStrategyId,
    options.expectedFormatStrategyId,
    `expected formatStrategyId ${options.expectedFormatStrategyId}`,
  );

  assert.ok(isRecord(diagnostics.budget), "budget object required on success");
  assertBudgetCoherent(
    diagnostics.budget,
    options.expectedQualityMode,
    validation.terminalState,
  );

  assert.ok(
    Number.isFinite(options.requestedDurationSec) &&
      options.requestedDurationSec > 0,
    "requestedDurationSec required",
  );
  const wordBudget = Math.round(options.requestedDurationSec * 2.4);
  const words = countWords(narration);
  assert.ok(
    words <= wordBudget,
    `narration words ${words} exceed requested-duration budget ${wordBudget}`,
  );
  assert.equal(GENERIC_INTRO.test(narration), false, "generic introduction forbidden");

  if (options.narrationStartsWith !== undefined) {
    assertWriteMyOwnOpeningSpan(narration, options.narrationStartsWith);
  }

  assert.ok(
    Object.prototype.hasOwnProperty.call(json, "generationDisposition"),
    "generationDisposition must be present on Retention success",
  );
  const generationDisposition = assertRetentionLiveGenerationDisposition(
    json.generationDisposition,
    {
      ...(options.expectedFactHandlingMode
        ? { expectedFactHandlingMode: options.expectedFactHandlingMode }
        : {}),
      approximateWordCountMax: wordBudget + 8,
    },
  );

  const blob = JSON.stringify(json);
  for (const pattern of PRIVATE_LEAK_PATTERNS) {
    assert.doesNotMatch(blob, pattern);
  }

  return {
    narration,
    retentionPlan: plan,
    retentionValidation: validation,
    retentionDiagnostics: diagnostics as unknown as RetentionProductionSafeDiagnostics,
    generationDisposition,
  };
}
