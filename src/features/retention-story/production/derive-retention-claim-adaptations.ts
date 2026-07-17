/**
 * Derive claim-related generation adaptations from the committed candidate —
 * Sprint 10H.3A. Never expose claim IDs/text in returned adaptations.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionGenerationAdaptationId } from "./retention-generation-disposition.types";

export function deriveRetentionClaimAdaptations(input: {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly candidate: RetentionNarrationCandidate;
  readonly premiseDetails?: string | null;
  readonly manualContext?: string | null;
  /** Claim IDs authorized on the plan that the fallback could not fit. */
  readonly omittedAuthorizedClaimIds?: readonly string[];
}): readonly RetentionGenerationAdaptationId[] {
  const out: RetentionGenerationAdaptationId[] = [];
  const mode = input.contract.factHandlingMode ?? "verified_facts_only";

  const usedRefs = new Set<string>();
  for (const seg of input.candidate.segments) {
    for (const ref of seg.claimRefs) usedRefs.add(ref);
  }

  if (mode === "creative_premise") {
    const premiseDetails = (input.premiseDetails ?? "").trim();
    const premiseClaims = input.grounding.claims.filter(
      (c) =>
        c.sourceRef === "creative_premise" &&
        c.permittedFactualUse &&
        !c.forbidden,
    );
    const usedPremise = premiseClaims.some((c) => usedRefs.has(c.claimId));
    if (usedPremise) {
      out.push("creative_premise_used");
    }
    // Empty details: guidance only — do not claim usage.
    if (premiseDetails.length === 0) {
      // no creative_premise_used
    } else if (premiseClaims.length > 0 && !usedPremise) {
      out.push("unsupported_facts_omitted");
    } else if (
      (input.omittedAuthorizedClaimIds?.length ?? 0) > 0 &&
      usedPremise
    ) {
      // Partial fit — some authorized premise claims omitted.
      out.push("unsupported_facts_omitted");
    }
  } else {
    // Verified-only: creator manual/inferred facts that cannot support narration
    // were omitted when present in grounding or supplied as factual manualContext.
    const unverifiedCreator = input.grounding.claims.some(
      (c) =>
        (c.provenance === "manual_user" || c.provenance === "inferred") &&
        !c.forbidden &&
        !c.permittedFactualUse,
    );
    const usedUnsupported = input.grounding.claims.some(
      (c) =>
        usedRefs.has(c.claimId) &&
        (!c.permittedFactualUse || c.forbidden),
    );
    const manual = (input.manualContext ?? "").trim();
    const manualLooksFactual =
      manual.length > 0 &&
      (/\b\d+\s*[-–]\s*\d+\b/.test(manual) ||
        /\b\d+\s+(fouls?|tackles?|goals?|shots?)\b/i.test(manual) ||
        /\bxg\b/i.test(manual));
    if ((unverifiedCreator || manualLooksFactual) && !usedUnsupported) {
      out.push("unsupported_facts_omitted");
    }
  }

  return Object.freeze([...new Set(out)]);
}
