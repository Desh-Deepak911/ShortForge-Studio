/**
 * Canonical Hook generation adapter — Sprint 7D.
 * One adapter for all narration-generating paths. No SI imports.
 */

import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { ScriptMode, Tone } from "@/types/footiebitz";

import { HOOK_CONTRACT_VERSION } from "../domain/hook-contract.constants";
import type {
  HookDirective,
  HookGenerationPath,
  HookPlan,
  HookPlanSnapshot,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import { normalizeHookRequest } from "../domain/normalize-hook-request";
import { isEligibleVerifiedFactualClaim } from "../domain/normalize-hook-request";
import { assertRequestPlanCoherence } from "../domain/assert-request-plan-coherence";
import type { HookSelectableStrategyId } from "../presentation/hook-style-selection";
import { buildHookPlanFromRequest } from "../strategies/build-hook-plan";
import type { HookStrategyResolution } from "../strategies/hook-strategy.types";
import {
  buildHookDirective,
  buildBoundedPermittedClaimIds,
  buildBoundedPermittedClaimMap,
} from "./build-hook-directive";
import { mapNeutralEvidenceToGroundingClaims } from "./map-neutral-evidence-to-grounding";
import type { HookNeutralResearchEvidence } from "./neutral-research-evidence.types";

export interface HookAdapterTemplateContext {
  readonly templateId?: CreatorTemplateId;
  readonly openingStyleAdvisory?: string;
}

export interface BuildHookGenerationContextInput {
  readonly topic: string;
  readonly scriptMode?: ScriptMode;
  readonly tone?: Tone;
  readonly durationSeconds?: number;
  readonly generationPath: HookGenerationPath;
  readonly template?: HookAdapterTemplateContext;
  readonly userAuthoredHook?: string;
  /** Explicit allowlisted Hook Style — Auto = omit. */
  readonly requestedStrategyId?: HookSelectableStrategyId;
  readonly researchEvidence?: HookNeutralResearchEvidence;
  readonly researchUnavailable?: boolean;
}

export interface HookGenerationContext {
  readonly request: NormalizedHookRequest;
  readonly resolution: HookStrategyResolution;
  readonly plan: HookPlan;
  readonly snapshot: HookPlanSnapshot;
  readonly directive: HookDirective;
  readonly permittedClaimIds: readonly string[];
  readonly generationPath: HookGenerationPath;
}

/**
 * Canonical adapter: brief/research/template inputs → immutable Hook generation context.
 */
export function buildHookGenerationContext(
  input: BuildHookGenerationContextInput,
): HookGenerationContext {
  if (input.generationPath === "scenes_only_non_hook") {
    throw new Error(
      "Hook adapter must not run for scenes_only_non_hook generation paths.",
    );
  }

  const mapped = mapNeutralEvidenceToGroundingClaims(input.researchEvidence);
  const unavailableResearch =
    input.researchUnavailable === true || mapped.unavailableResearch;

  const buildRequest = (openingIntent: typeof mapped.openingIntent) =>
    normalizeHookRequest({
      contractVersion: HOOK_CONTRACT_VERSION,
      topic: input.topic,
      scriptMode: input.scriptMode,
      tone: input.tone,
      durationSeconds: input.durationSeconds,
      ...(input.template?.templateId
        ? { templateId: input.template.templateId }
        : {}),
      ...(input.template?.openingStyleAdvisory
        ? { openingStyleAdvisory: input.template.openingStyleAdvisory }
        : {}),
      ...(input.userAuthoredHook
        ? { userAuthoredHook: input.userAuthoredHook }
        : {}),
      ...(input.requestedStrategyId
        ? { requestedStrategyId: input.requestedStrategyId }
        : {}),
      ...(openingIntent ? { openingIntent } : {}),
      groundingInput: {
        claims: mapped.claims,
        unavailableResearch,
        ...(mapped.researchFingerprint
          ? { researchFingerprint: mapped.researchFingerprint }
          : {}),
      },
      generationPath: input.generationPath,
    });

  let request = buildRequest(mapped.openingIntent);

  // Reject evidence intent when eligible claim refs cannot all fit the directive map.
  if (request.openingIntent) {
    const eligibleIntentRefs = request.openingIntent.claimRefs.filter((id) => {
      const claim = request.grounding.claims.find((c) => c.claimId === id);
      return claim ? isEligibleVerifiedFactualClaim(claim) : false;
    });
    const boundedIds = new Set(
      buildBoundedPermittedClaimMap(request).map((entry) => entry.claimId),
    );
    const allExposed = eligibleIntentRefs.every((id) => boundedIds.has(id));
    if (eligibleIntentRefs.length === 0 || !allExposed) {
      request = buildRequest(undefined);
    }
  }

  const built = buildHookPlanFromRequest(request);
  assertRequestPlanCoherence(request, built.plan);

  const directive = buildHookDirective({
    request,
    plan: built.plan,
  });

  if (directive.planFingerprint !== built.plan.planFingerprint) {
    throw new Error("HookDirective planFingerprint must match active HookPlan.");
  }

  const permittedClaimIds = buildBoundedPermittedClaimIds(request);

  // evidence_surprise must never select with a claim absent from the directive.
  if (
    built.plan.strategyId === "evidence_surprise" &&
    request.openingIntent
  ) {
    const permitted = new Set(permittedClaimIds);
    const missing = request.openingIntent.claimRefs.filter(
      (id) =>
        request.grounding.claims.some(
          (c) => c.claimId === id && isEligibleVerifiedFactualClaim(c),
        ) && !permitted.has(id),
    );
    if (missing.length > 0) {
      throw new Error(
        "evidence_surprise selected with eligible claim refs absent from the directive claim map.",
      );
    }
  }

  return Object.freeze({
    request,
    resolution: built.resolution,
    plan: built.plan,
    snapshot: built.snapshot,
    directive,
    permittedClaimIds,
    generationPath: input.generationPath,
  });
}
