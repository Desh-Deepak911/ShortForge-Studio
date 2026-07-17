/**
 * Build immutable HookPlan / HookPlanSnapshot — Sprint 7B.1.
 * Tamper-resistant: recomputes fingerprints and resolves strategy internally.
 * Does not persist snapshots.
 */

import {
  assertHookPlanFingerprint,
  assertHookRequestFingerprint,
  buildHookPlanFingerprint,
} from "../domain/hook-fingerprint";
import type {
  HookPlan,
  HookPlanSnapshot,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import { getCompatibilityFallbackStrategy, getHookStrategy } from "./hook-strategy.registry";
import { resolveHookStrategy } from "./resolve-hook-strategy";
import type { HookStrategyResolution } from "./hook-strategy.types";

function freezeGrounding(
  grounding: NormalizedHookRequest["grounding"],
): NormalizedHookRequest["grounding"] {
  return Object.freeze({
    ...grounding,
    claims: Object.freeze(grounding.claims.map((claim) => Object.freeze({ ...claim }))),
  });
}

function freezeConstraints(
  constraints: HookPlan["constraints"],
): HookPlan["constraints"] {
  return Object.freeze({ ...constraints });
}

function resolutionsMatch(
  left: HookStrategyResolution,
  right: HookStrategyResolution,
): boolean {
  return (
    left.strategy.id === right.strategy.id &&
    left.strategy.version === right.strategy.version &&
    left.strategySource === right.strategySource
  );
}

/**
 * Private assembly — constraints and fingerprints always come from registry + helpers.
 */
function assembleHookPlan(
  request: NormalizedHookRequest,
  resolution: HookStrategyResolution,
): HookPlan {
  assertHookRequestFingerprint(request);

  const registered = getHookStrategy(resolution.strategy.id);
  if (!registered || registered.version !== resolution.strategy.version) {
    throw new Error(
      `HookPlan assembly rejected unknown or version-mismatched strategy ${resolution.strategy.id}.`,
    );
  }

  const constraints = freezeConstraints(registered.constraints);
  const planFingerprint = buildHookPlanFingerprint({
    requestFingerprint: request.requestFingerprint,
    strategyId: registered.id,
    strategyVersion: registered.version,
    constraints,
  });

  const intentSummary = `${registered.label}: ${resolution.selectionReason}`.slice(0, 240);

  const plan = Object.freeze({
    contractVersion: request.contractVersion,
    strategyId: registered.id,
    strategyVersion: registered.version,
    strategySource: resolution.strategySource,
    requestFingerprint: request.requestFingerprint,
    planFingerprint,
    grounding: freezeGrounding(request.grounding),
    constraints,
    intentSummary,
  });

  assertHookPlanFingerprint(plan);
  return plan;
}

/**
 * Canonical public plan builder — resolves strategy internally and verifies fingerprints.
 */
export function buildHookPlanFromRequest(request: NormalizedHookRequest): {
  readonly resolution: HookStrategyResolution;
  readonly plan: HookPlan;
  readonly snapshot: HookPlanSnapshot;
} {
  assertHookRequestFingerprint(request);
  const resolution = resolveHookStrategy(request);
  const plan = assembleHookPlan(request, resolution);
  const snapshot = buildHookPlanSnapshot(plan);
  return Object.freeze({ resolution, plan, snapshot });
}

/**
 * Optional public API that accepts a caller resolution.
 * Rejects unless the resolution matches the deterministic resolver result.
 */
export function buildHookPlan(
  request: NormalizedHookRequest,
  resolution: HookStrategyResolution,
): HookPlan {
  assertHookRequestFingerprint(request);
  const expected = resolveHookStrategy(request);
  if (!resolutionsMatch(resolution, expected)) {
    throw new Error(
      "HookPlan rejected: caller resolution does not match deterministic resolveHookStrategy result.",
    );
  }
  return assembleHookPlan(request, expected);
}

/**
 * Serializable snapshot fields only — recomputes expected plan fingerprint first.
 */
export function buildHookPlanSnapshot(plan: HookPlan): HookPlanSnapshot {
  assertHookPlanFingerprint(plan);
  return Object.freeze({
    contractVersion: plan.contractVersion,
    strategyId: plan.strategyId,
    strategyVersion: plan.strategyVersion,
    strategySource: plan.strategySource,
    requestFingerprint: plan.requestFingerprint,
    planFingerprint: plan.planFingerprint,
    resolvedConstraints: freezeConstraints(plan.constraints),
  });
}

/**
 * Narrow Hook-owned builder for compatibility/safe fallback plans.
 * Always uses registered compatibility_punchy — not a general strategy override.
 */
export function buildCompatibilityFallbackPlan(
  request: NormalizedHookRequest,
): HookPlan {
  assertHookRequestFingerprint(request);
  const strategy = getCompatibilityFallbackStrategy();
  const constraints = freezeConstraints(strategy.constraints);
  const planFingerprint = buildHookPlanFingerprint({
    requestFingerprint: request.requestFingerprint,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    constraints,
  });

  const plan = Object.freeze({
    contractVersion: request.contractVersion,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    strategySource: "compatibility_fallback" as const,
    requestFingerprint: request.requestFingerprint,
    planFingerprint,
    grounding: freezeGrounding(request.grounding),
    constraints,
    intentSummary: `${strategy.label}: compatibility/safe fallback plan`.slice(0, 240),
  });

  assertHookPlanFingerprint(plan);
  return plan;
}
