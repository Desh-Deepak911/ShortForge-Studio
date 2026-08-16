/**
 * Fail-closed generationDisposition assertion — Sprint 10H.5A.
 * QA-only. Creator-safe shape only; no private claim/prompt evidence.
 */

import assert from "node:assert/strict";

import type {
  RetentionFactHandlingMode,
  RetentionGenerationAdaptationId,
  RetentionGenerationDisposition,
  RetentionGenerationDispositionSummary,
} from "@/features/retention-story/production/retention-generation-disposition.types";

const DISPOSITION_KEYS = Object.freeze([
  "disposition",
  "adaptations",
  "factHandlingMode",
  "qualityBelowTarget",
  "approximateWordCount",
  "targetWordBudget",
  "resolvedBeatCount",
  "creatorFacingNotes",
] as const);

const DISPOSITION_OPTIONAL_KEYS = Object.freeze(["acceptanceTrace"] as const);

const VALID_DISPOSITIONS = Object.freeze([
  "optimal",
  "acceptable",
  "fallback",
] as const satisfies readonly RetentionGenerationDisposition[]);

const VALID_ADAPTATIONS = Object.freeze([
  "planner_fallback_used",
  "beat_plan_compacted",
  "hook_style_reconciled",
  "length_rescue_used",
  "quality_below_target",
  "unsupported_facts_omitted",
  "creative_premise_used",
  "deterministic_story_fallback_used",
  "reliability_rescue_used",
  "participant_coverage_reconciled",
] as const satisfies readonly RetentionGenerationAdaptationId[]);

const VALID_FACT_MODES = Object.freeze([
  "verified_facts_only",
  "creative_premise",
] as const satisfies readonly RetentionFactHandlingMode[]);

const MAX_NOTES = 8;
const MAX_NOTE_CHARS = 160;
const MAX_ADAPTATIONS = 12;

const PRIVATE_NOTE_LEAKS: readonly RegExp[] = [
  /promptBlock/i,
  /claimId|claimRefs|claim text/i,
  /fingerprint/i,
  /authority/i,
  /OPENAI_API_KEY/i,
  /\bsk-[A-Za-z0-9_-]{10,}/,
  /Bearer\s+eyJ/,
  /ledgerEvents/i,
  /assembledNarration/i,
  /eligibleClaims/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertFiniteNonNegInt(value: unknown, label: string): number {
  assert.equal(typeof value, "number", `${label} must be number`);
  const n = value as number;
  assert.ok(Number.isFinite(n), `${label} must be finite`);
  assert.ok(Number.isInteger(n), `${label} must be integer`);
  assert.ok(n >= 0, `${label} must be >= 0`);
  return n;
}

/**
 * Assert creator-safe generationDisposition shape and coherence.
 */
export function assertRetentionLiveGenerationDisposition(
  raw: unknown,
  options: {
    readonly expectedFactHandlingMode?: RetentionFactHandlingMode;
    readonly approximateWordCountMax?: number;
  } = {},
): RetentionGenerationDispositionSummary {
  assert.ok(isRecord(raw), "generationDisposition must be an object");
  for (const key of DISPOSITION_KEYS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(raw, key),
      `generationDisposition: missing "${key}"`,
    );
  }
  for (const key of Object.keys(raw)) {
    assert.ok(
      (DISPOSITION_KEYS as readonly string[]).includes(key) ||
        (DISPOSITION_OPTIONAL_KEYS as readonly string[]).includes(key),
      `generationDisposition: unknown/private field "${key}"`,
    );
  }

  assert.ok(
    (VALID_DISPOSITIONS as readonly string[]).includes(
      raw.disposition as string,
    ),
    `generationDisposition.disposition invalid: ${String(raw.disposition)}`,
  );
  assert.ok(
    (VALID_FACT_MODES as readonly string[]).includes(
      raw.factHandlingMode as string,
    ),
    `generationDisposition.factHandlingMode invalid: ${String(raw.factHandlingMode)}`,
  );
  if (options.expectedFactHandlingMode !== undefined) {
    assert.equal(
      raw.factHandlingMode,
      options.expectedFactHandlingMode,
      "generationDisposition.factHandlingMode must match brief",
    );
  }

  assert.equal(typeof raw.qualityBelowTarget, "boolean");

  assert.ok(Array.isArray(raw.adaptations), "adaptations must be an array");
  assert.ok(
    raw.adaptations.length <= MAX_ADAPTATIONS,
    `adaptations exceed max ${MAX_ADAPTATIONS}`,
  );
  const seen = new Set<string>();
  for (const id of raw.adaptations) {
    assert.equal(typeof id, "string", "adaptation ids must be strings");
    assert.ok(
      (VALID_ADAPTATIONS as readonly string[]).includes(id),
      `unknown adaptation id: ${id}`,
    );
    assert.equal(seen.has(id), false, `duplicate adaptation id: ${id}`);
    seen.add(id);
  }

  const wordCount = assertFiniteNonNegInt(
    raw.approximateWordCount,
    "approximateWordCount",
  );
  const targetBudget = assertFiniteNonNegInt(
    raw.targetWordBudget,
    "targetWordBudget",
  );
  const beatCount = assertFiniteNonNegInt(
    raw.resolvedBeatCount,
    "resolvedBeatCount",
  );
  assert.ok(beatCount >= 1 && beatCount <= 12, "resolvedBeatCount out of range");
  assert.ok(targetBudget >= 8 && targetBudget <= 240, "targetWordBudget out of range");
  if (options.approximateWordCountMax !== undefined) {
    assert.ok(
      wordCount <= options.approximateWordCountMax,
      `approximateWordCount ${wordCount} exceeds max ${options.approximateWordCountMax}`,
    );
  }
  // Soft coherence: reported words should not wildly exceed target.
  assert.ok(
    wordCount <= targetBudget + 24,
    "approximateWordCount incoherent vs targetWordBudget",
  );

  assert.ok(
    Array.isArray(raw.creatorFacingNotes),
    "creatorFacingNotes must be an array",
  );
  assert.ok(
    raw.creatorFacingNotes.length <= MAX_NOTES,
    `creatorFacingNotes exceed max ${MAX_NOTES}`,
  );
  for (const note of raw.creatorFacingNotes) {
    assert.equal(typeof note, "string", "creatorFacingNotes entries must be strings");
    assert.ok(
      note.length > 0 && note.length <= MAX_NOTE_CHARS,
      "creatorFacingNotes entry length out of bounds",
    );
    for (const pattern of PRIVATE_NOTE_LEAKS) {
      assert.doesNotMatch(note, pattern);
    }
  }

  assert.equal(
    raw.qualityBelowTarget,
    (raw.adaptations as readonly string[]).includes("quality_below_target"),
    "qualityBelowTarget must match adaptations",
  );

  const adaptations = raw.adaptations as readonly string[];
  const notes = raw.creatorFacingNotes as readonly string[];
  if (adaptations.includes("hook_style_reconciled")) {
    assert.ok(
      notes.some((n) => /hook/i.test(n) && /adjust/i.test(n)),
      "hook_style_reconciled requires creator-facing Hook adjustment note",
    );
  }
  if (adaptations.includes("unsupported_facts_omitted")) {
    assert.ok(
      notes.some((n) => /omitted|reframed|unsupported/i.test(n)),
      "unsupported_facts_omitted requires creator-facing omission note",
    );
  }
  if (adaptations.includes("creative_premise_used")) {
    assert.ok(
      notes.some((n) => /premise|creator-supplied/i.test(n)),
      "creative_premise_used requires creator-facing premise note",
    );
    assert.equal(
      raw.factHandlingMode,
      "creative_premise",
      "creative_premise_used requires factHandlingMode creative_premise",
    );
  }

  if (Object.prototype.hasOwnProperty.call(raw, "acceptanceTrace")) {
    assert.ok(
      isRecord(raw.acceptanceTrace),
      "acceptanceTrace must be an object when present",
    );
    const trace = raw.acceptanceTrace;
    assert.equal(trace.version, 1);
    assert.ok(Array.isArray(trace.events), "acceptanceTrace.events must be array");
    assert.equal(typeof trace.finalNarrationAuthority, "string");
    assert.equal(typeof trace.deterministicRescueEntered, "boolean");
    assert.equal(typeof trace.deterministicRescueAccepted, "boolean");
    assert.equal(typeof trace.modelNarrationAccepted, "boolean");
    assert.equal(typeof trace.rewriteAccepted, "boolean");
    for (const key of Object.keys(trace)) {
      assert.ok(
        [
          "version",
          "events",
          "earliestDecisiveRejection",
          "finalNarrationAuthority",
          "deterministicRescueEntered",
          "deterministicRescueAccepted",
          "modelNarrationAccepted",
          "rewriteAccepted",
        ].includes(key),
        `acceptanceTrace unknown field: ${key}`,
      );
    }
  }

  return raw as unknown as RetentionGenerationDispositionSummary;
}

/**
 * Flexible Explicit Hook: exact fulfillment OR truthful reconciliation.
 */
export function assertFlexibleExplicitHookLiveSemantics(input: {
  readonly hookPlan: {
    readonly strategyId: string;
    readonly strategySource: string;
  };
  readonly hookDiagnostics: {
    readonly strategyId: string;
    readonly strategySource: string;
    readonly adapterRan: boolean;
  };
  readonly disposition: RetentionGenerationDispositionSummary;
  readonly requestedStrategyId: string;
  readonly requestedStrategySource: string;
  readonly writeMyOwnInvolved?: boolean;
}): {
  readonly fulfillment: "exact" | "reconciled";
  readonly resolvedStrategyId: string;
  readonly resolvedStrategySource: string;
} {
  assert.equal(input.writeMyOwnInvolved === true, false);
  assert.equal(input.hookDiagnostics.adapterRan, true);
  assert.equal(
    input.hookDiagnostics.strategyId,
    input.hookPlan.strategyId,
    "Hook plan/diagnostics strategyId mismatch",
  );
  assert.equal(
    input.hookDiagnostics.strategySource,
    input.hookPlan.strategySource,
    "Hook plan/diagnostics strategySource mismatch",
  );

  const resolvedStrategyId = input.hookPlan.strategyId;
  const resolvedStrategySource = input.hookPlan.strategySource;
  const exact =
    resolvedStrategyId === input.requestedStrategyId &&
    resolvedStrategySource === input.requestedStrategySource;
  const reconciled = input.disposition.adaptations.includes(
    "hook_style_reconciled",
  );

  if (exact) {
    assert.equal(
      reconciled,
      false,
      "forged reconciliation adaptation when Hook strategy stayed exact",
    );
    return {
      fulfillment: "exact",
      resolvedStrategyId,
      resolvedStrategySource,
    };
  }

  // Strategy/source changed — must be disclosed via adaptation + creator note.
  assert.equal(
    reconciled,
    true,
    "strategy/source changed without hook_style_reconciled",
  );
  assert.ok(
    input.disposition.creatorFacingNotes.some((n) =>
      /hook/i.test(n) && /adjust/i.test(n),
    ),
    "reconciled Hook requires creator-facing adjustment note",
  );
  assert.ok(
    resolvedStrategyId.length > 0 && resolvedStrategySource.length > 0,
    "resolved Hook identity required after reconciliation",
  );

  return {
    fulfillment: "reconciled",
    resolvedStrategyId,
    resolvedStrategySource,
  };
}

/**
 * Flexible Creative Premise: participants required; premise detail tokens optional
 * when omission is truthfully disclosed.
 */
export function assertFlexibleCreativePremiseLiveSemantics(input: {
  readonly narration: string;
  readonly disposition: RetentionGenerationDispositionSummary;
  readonly requiredParticipants: readonly string[];
  readonly optionalPremiseDetailTokens: readonly string[];
}): {
  readonly premisePath: "all_used" | "partial" | "omitted";
  readonly adaptations: readonly string[];
} {
  assert.equal(
    input.disposition.factHandlingMode,
    "creative_premise",
    "factHandlingMode must be creative_premise",
  );

  const lower = input.narration.toLowerCase();
  for (const token of input.requiredParticipants) {
    assert.ok(
      lower.includes(token.toLowerCase()),
      `required participant missing: ${token}`,
    );
  }

  const present: string[] = [];
  const missing: string[] = [];
  for (const token of input.optionalPremiseDetailTokens) {
    if (lower.includes(token.toLowerCase())) present.push(token);
    else missing.push(token);
  }

  const used = input.disposition.adaptations.includes("creative_premise_used");
  const omitted = input.disposition.adaptations.includes(
    "unsupported_facts_omitted",
  );
  const omissionNote = input.disposition.creatorFacingNotes.some((n) =>
    /omitted|reframed|unsupported/i.test(n),
  );

  if (missing.length === 0) {
    assert.equal(
      used,
      true,
      "all expected premise details present requires creative_premise_used",
    );
    return {
      premisePath: "all_used",
      adaptations: input.disposition.adaptations,
    };
  }

  if (present.length > 0) {
    assert.equal(
      used,
      true,
      "partial premise use requires creative_premise_used",
    );
    assert.equal(
      omitted,
      true,
      "partial premise omission requires unsupported_facts_omitted",
    );
    return {
      premisePath: "partial",
      adaptations: input.disposition.adaptations,
    };
  }

  // All optional premise detail tokens omitted.
  assert.equal(
    omitted,
    true,
    "omitted premise details require unsupported_facts_omitted",
  );
  assert.equal(
    omissionNote,
    true,
    "omitted premise details require creator-facing omission note",
  );
  return {
    premisePath: "omitted",
    adaptations: input.disposition.adaptations,
  };
}
