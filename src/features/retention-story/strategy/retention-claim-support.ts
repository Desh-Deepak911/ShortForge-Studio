/**
 * Factual claim-support coherence — Sprint 10C.1.
 * v1 boundary: exact normalized statement equality only (no entailment / similarity).
 * Never echo claim text in errors.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { RETENTION_MAX_CONTROLLING_IDEA_CLAIM_REFS } from "./retention-strategy.constants";

/** Canonical statement normalization shared by CI validation and claim support. */
export function normalizeRetentionControllingIdeaStatement(
  text: string,
): string {
  if (text == null || typeof text !== "string") return "";
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeNarrationStatementForSupport(text: string): string {
  return normalizeRetentionControllingIdeaStatement(text)
    .replace(/[.!?…]+$/u, "")
    .trim();
}

export function isClaimEligibleForControllingIdeaSupport(
  grounding: RetentionGroundingContext,
  claimId: string,
): boolean {
  const claim = grounding.claims.find((c) => c.claimId === claimId);
  if (!claim) return false;
  if (claim.forbidden) return false;
  if (!claim.permittedFactualUse) return false;
  if (
    claim.verification === "verified" &&
    (claim.provenance === "research_graph" ||
      claim.provenance === "research_provider")
  ) {
    return true;
  }
  return (
    claim.verification === "unverified" &&
    claim.provenance === "manual_user" &&
    (claim.sourceRef === "creator_brief" ||
      claim.sourceRef === "manual_context" ||
      claim.sourceRef === "manual_notes" ||
      claim.sourceRef === "creative_premise")
  );
}

/**
 * Narration segment claim support — Sprint 10H.3.
 * Verified research and creator-supplied brief/notes claims remain eligible.
 * Creative Premise additionally authorizes explicit story-world premise lines.
 */
export function isClaimEligibleForNarrationSupport(
  grounding: RetentionGroundingContext,
  claimId: string,
  factHandlingMode:
    "verified_facts_only" | "creative_premise" = "verified_facts_only",
): boolean {
  if (isClaimEligibleForControllingIdeaSupport(grounding, claimId)) {
    const claim = grounding.claims.find((c) => c.claimId === claimId);
    if (claim?.sourceRef === "creative_premise") {
      return factHandlingMode === "creative_premise";
    }
    return true;
  }
  if (factHandlingMode !== "creative_premise") return false;
  const claim = grounding.claims.find((c) => c.claimId === claimId);
  if (!claim) return false;
  if (claim.forbidden) return false;
  if (!claim.permittedFactualUse) return false;
  if (claim.provenance !== "manual_user") return false;
  if (claim.sourceRef !== "creative_premise") return false;
  return true;
}

/**
 * Canonicalize claim refs: trim, drop empties, unique, sort, bound.
 * Malformed non-string entries are rejected by returning null.
 */
export function canonicalizeControllingIdeaClaimRefs(
  refs: unknown,
): readonly string[] | null {
  if (refs == null) return Object.freeze([]);
  if (!Array.isArray(refs)) return null;
  const cleaned: string[] = [];
  for (const entry of refs) {
    if (typeof entry !== "string") return null;
    const trimmed = entry.trim();
    if (!trimmed) return null; // empty/malformed entries are not silently accepted
    cleaned.push(trimmed);
  }
  const unique = [...new Set(cleaned)].sort((a, b) => a.localeCompare(b));
  if (unique.length > RETENTION_MAX_CONTROLLING_IDEA_CLAIM_REFS) {
    return null;
  }
  return Object.freeze(unique);
}

/**
 * v1: a claim supports a factual statement only when eligible and
 * normalized semantic statements are exactly equal.
 */
export function claimRefSupportsControllingIdeaStatement(
  grounding: RetentionGroundingContext,
  claimId: string,
  statement: string,
): boolean {
  if (!isClaimEligibleForControllingIdeaSupport(grounding, claimId)) {
    return false;
  }
  const claim = grounding.claims.find((c) => c.claimId === claimId);
  if (!claim) return false;
  const left = normalizeRetentionControllingIdeaStatement(statement);
  const right = normalizeRetentionControllingIdeaStatement(claim.text);
  return left.length > 0 && left === right;
}

/**
 * Exact statement support for narration / beat factual fields — includes
 * Creative Premise creator-asserted claim IDs when mode allows.
 */
export function claimRefSupportsNarrationStatement(
  grounding: RetentionGroundingContext,
  claimId: string,
  statement: string,
  factHandlingMode:
    "verified_facts_only" | "creative_premise" = "verified_facts_only",
): boolean {
  if (claimRefSupportsControllingIdeaStatement(grounding, claimId, statement)) {
    return true;
  }
  if (
    !isClaimEligibleForNarrationSupport(grounding, claimId, factHandlingMode)
  ) {
    return false;
  }
  const claim = grounding.claims.find((c) => c.claimId === claimId);
  if (!claim) return false;
  const left = normalizeNarrationStatementForSupport(statement);
  const right = normalizeNarrationStatementForSupport(claim.text);
  return left.length > 0 && left === right;
}
