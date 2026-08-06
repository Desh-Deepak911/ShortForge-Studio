/**
 * Parse creator-supplied premise facts — Sprint 10H.3 Creative Premise mode.
 * Facts are creator_asserted (manual_user / unverified) — never research_verified.
 */

import type { RetentionGroundingClaim } from "../domain/retention-story-contract.types";

const MAX_PREMISE_FACTS = 12;
const MAX_FACT_CHARS = 200;

function slugToken(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `premise_${index + 1}_${base || "fact"}`;
}

/**
 * One fact per line. Empty lines ignored. Deterministic claim IDs.
 */
export function parseCreativePremiseFacts(
  premiseDetails: string | null | undefined,
): readonly RetentionGroundingClaim[] {
  if (typeof premiseDetails !== "string" || !premiseDetails.trim()) {
    return Object.freeze([]);
  }
  const facts = premiseDetails
    .normalize("NFC")
    // Creators naturally use either one fact per line or a prose paragraph.
    // Preserve complete sentence punctuation while splitting both forms so a
    // rich paragraph cannot collapse into one oversized, unusable claim.
    .split(/(?:\r?\n)+|(?<=[.!?…])\s+/u)
    .map((fact) => fact.replace(/\s+/g, " ").trim())
    .filter((fact) => fact.length > 0)
    .slice(0, MAX_PREMISE_FACTS);

  const claims: RetentionGroundingClaim[] = [];
  for (let i = 0; i < facts.length; i++) {
    const text = facts[i]!.slice(0, MAX_FACT_CHARS);
    if (!text) continue;
    claims.push(
      Object.freeze({
        claimId: slugToken(text, i),
        text,
        provenance: "manual_user",
        verification: "unverified",
        // Creative Premise explicitly authorizes these creator-asserted facts.
        permittedFactualUse: true,
        forbidden: false,
        sourceRef: "creative_premise",
      }),
    );
  }
  return Object.freeze(claims);
}
