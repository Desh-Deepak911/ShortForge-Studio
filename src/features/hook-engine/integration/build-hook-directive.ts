/**
 * Deterministic HookDirective builder — Sprint 7D.2.
 */

import type {
  HookDirective,
  HookPlan,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import { assertRequestPlanCoherence } from "../domain/assert-request-plan-coherence";
import { getHookStrategy } from "../strategies/hook-strategy.registry";
import { isEligibleVerifiedFactualClaim } from "../domain/normalize-hook-request";

const MAX_DIRECTIVE_CLAIM_ENTRIES = 12;
const MAX_DIRECTIVE_CLAIM_TEXT_CHARS = 120;

export interface DirectiveClaimEntry {
  readonly claimId: string;
  readonly text: string;
}

/**
 * Bounded permitted claim map for the directive and model callbacks.
 * Priority: eligible openingIntent claim refs first, then remaining eligible claims.
 */
export function buildBoundedPermittedClaimMap(
  request: NormalizedHookRequest,
): readonly DirectiveClaimEntry[] {
  const eligible = request.grounding.claims.filter(isEligibleVerifiedFactualClaim);
  const byId = new Map(eligible.map((c) => [c.claimId, c]));

  const intentRefs = [
    ...new Set(
      (request.openingIntent?.claimRefs ?? []).filter((id) => byId.has(id)),
    ),
  ];

  const remaining = eligible
    .map((c) => c.claimId)
    .filter((id) => !intentRefs.includes(id))
    .sort();

  const orderedIds = [...intentRefs, ...remaining].slice(0, MAX_DIRECTIVE_CLAIM_ENTRIES);

  return Object.freeze(
    orderedIds.map((claimId) => {
      const claim = byId.get(claimId)!;
      return Object.freeze({
        claimId,
        text: claim.text.replace(/\s+/g, " ").trim().slice(0, MAX_DIRECTIVE_CLAIM_TEXT_CHARS),
      });
    }),
  );
}

export function buildBoundedPermittedClaimIds(
  request: NormalizedHookRequest,
): readonly string[] {
  return Object.freeze(
    buildBoundedPermittedClaimMap(request).map((entry) => entry.claimId),
  );
}

/**
 * Assemble an immutable HookDirective from the active request + plan.
 */
export function buildHookDirective(input: {
  readonly request: NormalizedHookRequest;
  readonly plan: HookPlan;
}): HookDirective {
  const { request, plan } = input;
  assertRequestPlanCoherence(request, plan);

  const strategy = getHookStrategy(plan.strategyId);
  if (!strategy || strategy.version !== plan.strategyVersion) {
    throw new Error(
      `HookDirective rejected: unknown or version-mismatched strategy ${plan.strategyId}.`,
    );
  }

  const constraints = plan.constraints;
  const claimMap = buildBoundedPermittedClaimMap(request);
  const lines: string[] = [
    "HOOK DIRECTIVE (follow exactly — do not speak these labels aloud):",
    `- Strategy: ${strategy.label} (${strategy.id}@${strategy.version})`,
    `- Plan fingerprint: ${plan.planFingerprint}`,
    `- Opening word maximum (hard): ${constraints.maxOpeningWords}`,
    `- Opening spoken-seconds maximum (hard): ${constraints.maxOpeningSpokenSecondsHint}`,
    `- Subject: preserve the creator topic "${request.topic}" in the opening`,
    strategy.promptGuidance,
  ];

  if (!constraints.allowQuestionForm) {
    lines.push("- Do not open with a question.");
  }
  if (!constraints.allowStatisticClaim) {
    lines.push(
      "- Statistics are forbidden in the opening — do not invent or assert any statistics, percentages, fees, rankings, or numeric results.",
    );
  } else {
    lines.push(
      "- Statistics are allowed in the opening only when backed by an eligible permitted claim ID in hookClaimRefs.",
    );
  }
  if (constraints.forbidUnverifiedSuperlatives) {
    lines.push(
      "- Do not use unverified factual superlatives (best/greatest/most/record) without permitted claims.",
    );
  }
  if (request.userAuthoredHook) {
    lines.push(
      `- Prefer this sanitized user-authored opening as the first spoken sentence: "${request.userAuthoredHook}"`,
    );
  }
  if (request.openingStyleAdvisory) {
    lines.push(
      `- Template opening style is advisory only (must not override truth or subject): ${request.openingStyleAdvisory}`,
    );
  }
  if (claimMap.length > 0) {
    lines.push("- Permitted opening claims (reference by claimId in hookClaimRefs only):");
    for (const entry of claimMap) {
      lines.push(`  - ${entry.claimId}: ${entry.text}`);
    }
  } else {
    lines.push(
      "- No permitted factual claim IDs — avoid statistics, dates, fees, rankings, quotes, and unverified superlatives in the opening.",
    );
  }
  lines.push(
    "- Return hookClaimRefs as a separate JSON array of claim IDs used in the opening — never invent IDs.",
  );
  lines.push("- Do not speak planning labels (hook, beat, strategy, directive) aloud.");

  return Object.freeze({
    contractVersion: plan.contractVersion,
    strategyId: plan.strategyId,
    strategyVersion: plan.strategyVersion,
    planFingerprint: plan.planFingerprint,
    promptBlock: lines.join("\n"),
    constraints: Object.freeze({ ...constraints }),
  });
}
