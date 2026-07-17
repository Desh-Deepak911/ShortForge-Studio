/**
 * Deterministic Hook Engine fingerprints — Sprint 7B.1.
 * Client-safe FNV-1a; does not import ExportManifest fingerprint code.
 */

import {
  HOOK_PLAN_FINGERPRINT_PREFIX,
  HOOK_REQUEST_FINGERPRINT_PREFIX,
} from "./hook-contract.constants";
import type {
  HookGroundingClaim,
  HookGroundingContext,
  HookOpeningIntent,
  HookResolvedConstraints,
  HookStrategyId,
  NormalizedHookRequest,
} from "./hook-contract.types";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** Stable structured serialization for fingerprints and candidate identity. */
export function hookStableStringify(value: unknown): string {
  return stableStringify(value);
}

/** FNV-1a 32-bit → base36 for compact deterministic fingerprints / candidate IDs. */
export function hookStableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableHash(input: string): string {
  return hookStableHash(input);
}

/**
 * Sort claims by stable semantic identity so input order cannot change fingerprints.
 */
export function normalizeGroundingClaimsForFingerprint(
  claims: readonly HookGroundingClaim[],
): readonly HookGroundingClaim[] {
  return [...claims]
    .map((claim) =>
      Object.freeze({
        claimId: claim.claimId,
        text: claim.text,
        provenance: claim.provenance,
        verificationStatus: claim.verificationStatus,
        ...(claim.sourceRef != null ? { sourceRef: claim.sourceRef } : {}),
        permittedForFactualHookUse: claim.permittedForFactualHookUse,
      }),
    )
    .sort((a, b) => {
      const byId = a.claimId.localeCompare(b.claimId);
      if (byId !== 0) return byId;
      return a.text.localeCompare(b.text);
    });
}

function groundingIdentityPayload(grounding: HookGroundingContext): unknown {
  return {
    unavailableResearch: grounding.unavailableResearch,
    researchFingerprint: grounding.researchFingerprint ?? null,
    normalizedGroundingStatus: grounding.normalizedGroundingStatus,
    claims: normalizeGroundingClaimsForFingerprint(grounding.claims).map((claim) => ({
      claimId: claim.claimId,
      text: claim.text,
      provenance: claim.provenance,
      verificationStatus: claim.verificationStatus,
      sourceRef: claim.sourceRef ?? null,
      permittedForFactualHookUse: claim.permittedForFactualHookUse,
    })),
  };
}

function openingIntentIdentityPayload(
  openingIntent: HookOpeningIntent | undefined,
): unknown {
  if (!openingIntent) return null;
  return {
    kind: openingIntent.kind,
    claimRefs: [...openingIntent.claimRefs].sort(),
  };
}

/**
 * Identity of normalized upstream inputs only.
 * Must not include strategy ID/version or resolved constraints.
 */
export function buildHookRequestFingerprint(
  request: Omit<NormalizedHookRequest, "requestFingerprint">,
): string {
  const payload = {
    contractVersion: request.contractVersion,
    topic: request.topic,
    scriptMode: request.scriptMode,
    tone: request.tone,
    durationSeconds: request.durationSeconds,
    templateId: request.templateId ?? null,
    openingStyleAdvisory: request.openingStyleAdvisory ?? null,
    userAuthoredHook: request.userAuthoredHook ?? null,
    requestedStrategyId: request.requestedStrategyId ?? null,
    openingIntent: openingIntentIdentityPayload(request.openingIntent),
    grounding: groundingIdentityPayload(request.grounding),
    generationPath: request.generationPath,
  };
  return `${HOOK_REQUEST_FINGERPRINT_PREFIX}${stableHash(stableStringify(payload))}`;
}

/**
 * Identity of the resolved plan:
 * requestFingerprint + strategyId + strategyVersion + concrete constraints.
 */
export function buildHookPlanFingerprint(input: {
  readonly requestFingerprint: string;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly constraints: HookResolvedConstraints;
}): string {
  const payload = {
    requestFingerprint: input.requestFingerprint,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    constraints: {
      maxOpeningWords: input.constraints.maxOpeningWords,
      maxOpeningSpokenSecondsHint: input.constraints.maxOpeningSpokenSecondsHint,
      mustPreserveSubject: input.constraints.mustPreserveSubject,
      allowQuestionForm: input.constraints.allowQuestionForm,
      allowStatisticClaim: input.constraints.allowStatisticClaim,
      forbidUnverifiedSuperlatives: input.constraints.forbidUnverifiedSuperlatives,
      minProvocativeness: input.constraints.minProvocativeness,
      minClarity: input.constraints.minClarity,
    },
  };
  return `${HOOK_PLAN_FINGERPRINT_PREFIX}${stableHash(stableStringify(payload))}`;
}

/** Recompute and compare request fingerprint; throws on tamper/stale. */
export function assertHookRequestFingerprint(request: NormalizedHookRequest): void {
  const expected = buildHookRequestFingerprint({
    contractVersion: request.contractVersion,
    topic: request.topic,
    scriptMode: request.scriptMode,
    tone: request.tone,
    durationSeconds: request.durationSeconds,
    templateId: request.templateId,
    openingStyleAdvisory: request.openingStyleAdvisory,
    userAuthoredHook: request.userAuthoredHook,
    requestedStrategyId: request.requestedStrategyId,
    openingIntent: request.openingIntent,
    grounding: request.grounding,
    generationPath: request.generationPath,
  });
  if (expected !== request.requestFingerprint) {
    throw new Error(
      "NormalizedHookRequest.requestFingerprint does not match recomputed fingerprint.",
    );
  }
}

/** Recompute and compare plan fingerprint; throws on tamper/stale. */
export function assertHookPlanFingerprint(plan: {
  readonly requestFingerprint: string;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly constraints: HookResolvedConstraints;
  readonly planFingerprint: string;
}): void {
  const expected = buildHookPlanFingerprint({
    requestFingerprint: plan.requestFingerprint,
    strategyId: plan.strategyId,
    strategyVersion: plan.strategyVersion,
    constraints: plan.constraints,
  });
  if (expected !== plan.planFingerprint) {
    throw new Error("HookPlan.planFingerprint does not match recomputed fingerprint.");
  }
}
