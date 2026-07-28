/**
 * Sprint 7E.1 — Shared Hook-capable success envelope assertion.
 * Both hookPlan and hookDiagnostics are required (OR is forbidden).
 */
import assert from "node:assert/strict";

import type {
  HookDiagnostics,
  HookGenerationPath,
  HookPlanSnapshot,
  HookStrategyId,
  HookStrategySource,
} from "@/features/hook-engine";

export interface AssertHookLiveEnvelopeOptions {
  readonly expectedGenerationPath: HookGenerationPath;
  readonly expectedStrategyId?: HookStrategyId;
  readonly expectedStrategySource?: HookStrategySource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoPrivateLeaks(blob: string): void {
  assert.doesNotMatch(blob, /promptBlock/i);
  assert.doesNotMatch(blob, /hookClaimRefs/i);
  assert.doesNotMatch(blob, /"claims"\s*:/);
  assert.doesNotMatch(blob, /candidateText/i);
  assert.doesNotMatch(blob, /openingTextNormalized/i);
  assert.doesNotMatch(blob, /manualNotes/i);
  assert.doesNotMatch(blob, /Ignore previous instructions/i);
}

/**
 * Asserts a successful Hook-capable generate-script JSON response.
 * Throws AssertionError on any coherence failure.
 */
export function assertHookLiveSuccessEnvelope(
  json: Record<string, unknown>,
  options: AssertHookLiveEnvelopeOptions,
): {
  narration: string;
  hookPlan: HookPlanSnapshot;
  hookDiagnostics: HookDiagnostics;
} {
  assert.equal(json.success, true, "Hook-capable success requires success === true");

  const data = json.data;
  assert.ok(isRecord(data), "success response requires data object");
  const narrationRaw = data.narration;
  assert.equal(typeof narrationRaw, "string", "committed narration must be a string");
  const narration = narrationRaw as string;
  assert.ok(
    narration.trim().length > 0,
    "committed narration must be non-empty after trim (whitespace-only is not success)",
  );

  // Both required — never accept plan OR diagnostics alone.
  assert.ok(
    Object.prototype.hasOwnProperty.call(json, "hookPlan"),
    "hookPlan must be present on successful Hook-capable paths",
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(json, "hookDiagnostics"),
    "hookDiagnostics must be present on successful Hook-capable paths",
  );
  assert.notEqual(json.hookPlan, undefined, "hookPlan must not be undefined");
  assert.notEqual(json.hookPlan, null, "hookPlan must not be null");
  assert.notEqual(json.hookDiagnostics, undefined, "hookDiagnostics must not be undefined");
  assert.notEqual(json.hookDiagnostics, null, "hookDiagnostics must not be null");

  const hookPlan = json.hookPlan as HookPlanSnapshot;
  const hookDiagnostics = json.hookDiagnostics as HookDiagnostics;

  assert.equal(typeof hookPlan.strategyId, "string");
  assert.equal(typeof hookPlan.strategyVersion, "string");
  assert.equal(typeof hookPlan.strategySource, "string");
  assert.equal(typeof hookPlan.requestFingerprint, "string");
  assert.equal(typeof hookPlan.planFingerprint, "string");
  assert.ok(hookPlan.requestFingerprint.length > 0);
  assert.ok(hookPlan.planFingerprint.length > 0);

  assert.equal(hookDiagnostics.adapterRan, true, "diagnostics.adapterRan must be true");
  assert.equal(
    hookDiagnostics.generationPath,
    options.expectedGenerationPath,
    `expected generationPath ${options.expectedGenerationPath}`,
  );

  assert.equal(
    hookDiagnostics.requestFingerprint,
    hookPlan.requestFingerprint,
    "requestFingerprint must match across plan and diagnostics",
  );
  assert.equal(
    hookDiagnostics.planFingerprint,
    hookPlan.planFingerprint,
    "planFingerprint must match across plan and diagnostics",
  );
  assert.equal(
    hookDiagnostics.strategyId,
    hookPlan.strategyId,
    "strategyId must match across plan and diagnostics",
  );
  assert.equal(
    hookDiagnostics.strategyVersion,
    hookPlan.strategyVersion,
    "strategyVersion must match across plan and diagnostics",
  );
  assert.equal(
    hookDiagnostics.strategySource,
    hookPlan.strategySource,
    "strategySource must match across plan and diagnostics",
  );

  if (options.expectedStrategyId !== undefined) {
    assert.equal(hookPlan.strategyId, options.expectedStrategyId);
  }
  if (options.expectedStrategySource !== undefined) {
    assert.equal(hookPlan.strategySource, options.expectedStrategySource);
  }

  assertNoPrivateLeaks(JSON.stringify(json));

  return { narration, hookPlan, hookDiagnostics };
}
