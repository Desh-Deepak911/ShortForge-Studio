/**
 * Production Studio body-rewrite model adapter — Sprint 10F.3.
 * Preserves exact approved opening; structured segments only.
 */

import type { RetentionComposerProposal } from "../composition/retention-narration-candidate.types";
import type {
  RetentionBodyRewriteCallback,
  RetentionBodyRewriteRequest,
} from "../rewrite/retention-rewrite.types";
import {
  formatBoundedClaimsForPrompt,
  requestRetentionStructuredJson,
} from "./retention-production-model-json";

function buildRewritePrompt(request: RetentionBodyRewriteRequest): string {
  const beatBlock = request.beats
    .map(
      (b) =>
        `- ${b.beatId} (${b.purpose}): ${b.narrationGoal}; claimRefs=${b.groundingClaimRefs.join(",") || "none"}`,
    )
    .join("\n");
  const opening = request.immutableApprovedOpening.openingText;
  return [
    "FootieBitz Retention Studio body rewrite. Output JSON only. No markdown or reasoning fields.",
    "Preserve the EXACT approved opening text as the start of the first segment. Do not alter that opening string.",
    "Improve body quality for the missed editorial components while keeping exact beat IDs and order.",
    "Required JSON shape:",
    '{ "title": string, "segments": [ { "beatId": string, "text": string, "claimRefs": string[] } ], "hookClaimRefs": string[] }',
    `immutableApprovedOpening: ${JSON.stringify(opening)}`,
    `targetWordBudget: ${request.targetWordBudget}`,
    `controllingIdea: ${request.controllingIdeaStatement}`,
    `missedQualityComponentIds: ${request.missedQualityComponentIds.join(", ")}`,
    `orderedBeatIds: ${request.orderedBeatIds.join(", ")}`,
    "beats:",
    beatBlock,
    "current assembled narration:",
    request.currentCandidate.assembledNarration,
    "eligibleClaims:",
    formatBoundedClaimsForPrompt(request.eligibleClaims) || "(none)",
    "avoidanceClaims:",
    formatBoundedClaimsForPrompt(request.avoidanceClaims) || "(none)",
  ].join("\n");
}

export function createRetentionProductionRewriteComposer(options: {
  readonly model: string;
  readonly durationSec: number;
}): RetentionBodyRewriteCallback {
  const { model, durationSec } = options;
  return async (request: RetentionBodyRewriteRequest) => {
    const raw = await requestRetentionStructuredJson({
      model,
      prompt: buildRewritePrompt(request),
      durationSec,
      kind: "studio_rewrite",
      beatCount: request.orderedBeatIds.length,
      targetWordBudget: request.targetWordBudget,
    });
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("rewrite_proposal_invalid");
    }
    return raw as RetentionComposerProposal;
  };
}
