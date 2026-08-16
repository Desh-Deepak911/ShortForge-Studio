/**
 * Rescue promotion / remap fidelity — story-quality Prompt 5.
 * Accepted canonical rescue narration must survive Hook promotion and remapping
 * except for an explicitly authorised opening replacement.
 */

function firstSpokenOpeningEnd(narration: string): number | null {
  const match = narration.match(/^[^.!?…]+[.!?…]["”’)»\]]*/u);
  if (match) return match[0].length;
  return narration.length > 0 ? narration.length : null;
}

export interface RetentionRescuePromotionFidelityInput {
  readonly canonicalNarration: string;
  readonly promotedNarration: string;
  readonly authorisedHookReplacement?: boolean;
  readonly canonicalUsedContentIds: readonly string[];
  readonly promotedUsedContentIds: readonly string[];
  readonly essentialContentIds?: readonly string[];
  readonly requiredParticipants?: readonly string[];
  readonly requiredRankingMembers?: readonly string[];
  readonly requiredUncertaintyMarkers?: readonly string[];
}

export type RetentionRescuePromotionFidelityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

function present(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function assertRetentionRescuePromotionFidelity(
  input: RetentionRescuePromotionFidelityInput,
): RetentionRescuePromotionFidelityResult {
  const canonical = input.canonicalNarration.replace(/\s+/gu, " ").trim();
  const promoted = input.promotedNarration.replace(/\s+/gu, " ").trim();
  if (!canonical) {
    return { ok: false, reason: "canonical_rescue_narration_missing" };
  }
  if (!promoted) {
    return { ok: false, reason: "promoted_narration_missing" };
  }

  const canonicalOpeningEnd = firstSpokenOpeningEnd(canonical);
  const promotedOpeningEnd = firstSpokenOpeningEnd(promoted);
  if (canonicalOpeningEnd == null || promotedOpeningEnd == null) {
    return { ok: false, reason: "opening_span_unavailable" };
  }

  const canonicalBody = canonical.slice(canonicalOpeningEnd);
  const promotedBody = promoted.slice(promotedOpeningEnd);
  if (input.authorisedHookReplacement) {
    if (canonicalBody !== promotedBody) {
      return { ok: false, reason: "unauthorised_body_rewrite" };
    }
  } else if (canonical !== promoted) {
    return { ok: false, reason: "unexplained_narration_loss" };
  }

  const essential = input.essentialContentIds ?? [];
  for (const id of essential) {
    if (
      input.canonicalUsedContentIds.includes(id) &&
      !input.promotedUsedContentIds.includes(id)
    ) {
      return { ok: false, reason: "essential_content_id_lost" };
    }
  }

  for (const participant of input.requiredParticipants ?? []) {
    if (present(canonical, participant) && !present(promoted, participant)) {
      return { ok: false, reason: "required_participant_lost" };
    }
  }

  for (const member of input.requiredRankingMembers ?? []) {
    if (present(canonical, member) && !present(promoted, member)) {
      return { ok: false, reason: "required_ranking_member_lost" };
    }
  }

  for (const marker of input.requiredUncertaintyMarkers ?? []) {
    const pattern = new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "u");
    if (pattern.test(canonical) && !pattern.test(promoted)) {
      return { ok: false, reason: "required_uncertainty_lost" };
    }
  }

  return { ok: true };
}
