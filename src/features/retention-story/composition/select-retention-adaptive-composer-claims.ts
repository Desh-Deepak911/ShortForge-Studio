/**
 * Adaptive composer claim inclusion — story-quality Prompt 3.
 * Essential units, required membership, and required participants are never
 * dropped for an arbitrary eight-claim cap. Optional units fill remaining room.
 */

import { resolveStoryDurationClass } from "../domain/resolve-format-strategy";
import { compressRetentionClaimLinkedNarration } from "../strategy/retention-claim-linked-support";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import {
  RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_EXTENDED,
  RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_SHORT,
  RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_ULTRA_SHORT,
  RETENTION_MAX_COMPOSER_REQUEST_CLAIMS_HARD,
} from "./retention-narration-candidate.constants";
import type { RetentionComposerClaimSummary } from "./retention-narration-candidate.types";

export function resolveRetentionComposerRequestClaimCharBudget(
  durationSec: number,
): number {
  const durationClass = resolveStoryDurationClass(durationSec);
  if (durationClass === "ultra_short") {
    return RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_ULTRA_SHORT;
  }
  if (durationClass === "short") {
    return RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_SHORT;
  }
  return RETENTION_MAX_COMPOSER_REQUEST_CLAIM_CHARS_EXTENDED;
}

function claimChars(claim: RetentionComposerClaimSummary): number {
  return claim.claimId.length + claim.text.length;
}

function isRequiredClaim(
  claim: RetentionComposerClaimSummary,
  requiredClaimIds: ReadonlySet<string>,
): boolean {
  return requiredClaimIds.has(claim.claimId);
}

function compressClaimText(
  claim: RetentionComposerClaimSummary,
): RetentionComposerClaimSummary {
  const risk = detectRetentionFactualRisk(claim.text);
  const compressed = compressRetentionClaimLinkedNarration(claim.text, 28);
  const nextText = compressed.trim() || claim.text;
  if (risk.risky && !detectRetentionFactualRisk(nextText).risky) {
    return claim;
  }
  return Object.freeze({
    ...claim,
    text: nextText,
  });
}

export function selectRetentionAdaptiveComposerClaims(input: {
  readonly eligibleClaims: readonly RetentionComposerClaimSummary[];
  readonly requiredClaimIds: readonly string[];
  readonly optionalClaimIds: readonly string[];
  readonly durationSec: number;
}): {
  readonly included: readonly RetentionComposerClaimSummary[];
  readonly excludedOptionalClaimIds: readonly string[];
  readonly compressed: boolean;
  readonly charBudget: number;
} {
  const charBudget = resolveRetentionComposerRequestClaimCharBudget(
    input.durationSec,
  );
  const required = new Set(input.requiredClaimIds);
  const optionalOrder = input.optionalClaimIds;
  const byId = new Map(input.eligibleClaims.map((claim) => [claim.claimId, claim]));

  const requiredClaims = input.eligibleClaims.filter((claim) =>
    isRequiredClaim(claim, required),
  );
  const optionalClaims = optionalOrder
    .map((id) => byId.get(id))
    .filter((claim): claim is RetentionComposerClaimSummary => claim != null)
    .filter((claim) => !required.has(claim.claimId));
  const remainingEligible = input.eligibleClaims.filter(
    (claim) =>
      !required.has(claim.claimId) &&
      !optionalClaims.some((optional) => optional.claimId === claim.claimId),
  );

  let compressed = false;
  let workingRequired = [...requiredClaims];
  let usedChars = workingRequired.reduce((sum, claim) => sum + claimChars(claim), 0);
  if (
    usedChars > charBudget ||
    workingRequired.length > RETENTION_MAX_COMPOSER_REQUEST_CLAIMS_HARD
  ) {
    workingRequired = workingRequired.map((claim) => {
      const next = compressClaimText(claim);
      if (next.text !== claim.text) compressed = true;
      return next;
    });
    usedChars = workingRequired.reduce((sum, claim) => sum + claimChars(claim), 0);
  }

  const included: RetentionComposerClaimSummary[] = [...workingRequired];
  const excludedOptional: string[] = [];

  for (const claim of [...optionalClaims, ...remainingEligible]) {
    if (included.length >= RETENTION_MAX_COMPOSER_REQUEST_CLAIMS_HARD) {
      if (optionalOrder.includes(claim.claimId)) {
        excludedOptional.push(claim.claimId);
      }
      continue;
    }
    const nextChars = usedChars + claimChars(claim);
    if (nextChars > charBudget) {
      const compact = compressClaimText(claim);
      if (usedChars + claimChars(compact) > charBudget) {
        if (optionalOrder.includes(claim.claimId)) {
          excludedOptional.push(claim.claimId);
        }
        continue;
      }
      compressed = compressed || compact.text !== claim.text;
      included.push(compact);
      usedChars += claimChars(compact);
      continue;
    }
    included.push(claim);
    usedChars = nextChars;
  }

  return Object.freeze({
    included: Object.freeze(included),
    excludedOptionalClaimIds: Object.freeze(excludedOptional),
    compressed,
    charBudget,
  });
}
