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
  const lines = premiseDetails
    .normalize("NFC")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_PREMISE_FACTS);

  const claims: RetentionGroundingClaim[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!.slice(0, MAX_FACT_CHARS);
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
