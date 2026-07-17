/**
 * Production Retention structured narration composer — Sprint 10F.3 / 10H.2.
 * Exact ordered beat IDs → one segment per beat. No post-hoc paragraph slicing.
 */

import { RETENTION_MAX_SEGMENT_CLAIM_REFS } from "../composition/retention-narration-candidate.constants";
import type {
  RetentionComposerCallback,
  RetentionComposerProposal,
  RetentionComposerRequest,
} from "../composition/retention-narration-candidate.types";
import { buildRetentionParticipantCoverage } from "../strategy/retention-matchup-participant-coverage";
import { resolveRetentionDeterministicSubjectAnchor } from "../strategy/resolve-retention-deterministic-subject-anchor";
import {
  formatBoundedClaimsForPrompt,
  requestRetentionStructuredJson,
} from "./retention-production-model-json";
import type { RetentionProductionModelCallKind } from "./resolve-retention-production-max-output-tokens";

/** Short topic-derived label for ≤5-word opening examples (never hard-coded teams). */
function topicOpeningSubjectLabel(
  topic: string,
  scriptMode: RetentionComposerRequest["scriptMode"],
): string {
  const coverage = buildRetentionParticipantCoverage({ topic, scriptMode });
  const raw =
    coverage.required && coverage.groups[0]
      ? coverage.groups[0]!.displayLabel
      : (resolveRetentionDeterministicSubjectAnchor(topic) ?? "this topic");
  const words = raw.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return words.join(" ") || "this topic";
}

function buildTopicAnchoredOpeningRule(
  topic: string,
  scriptMode: RetentionComposerRequest["scriptMode"],
  requiresQuestionOpening: boolean,
): string {
  const subject = topicOpeningSubjectLabel(topic, scriptMode);
  if (requiresQuestionOpening) {
    return [
      "- REQUIRED: first spoken sentence MUST end with '?' AND be ≤5 words",
      "- REQUIRED: first spoken sentence MUST include a subject token from the creator topic",
      `- Safe opening examples derived from this topic: "Why ${subject}?"; "Can ${subject} hold?"; "${subject} tonight?"`,
    ].join("\n");
  }
  return [
    "- first spoken sentence MUST be ≤5 words (Hook opening constraint), then continue the beat body",
    "- declarative/cold-open/headline allowed unless a question is required",
    "- first spoken sentence MUST include a subject token from the creator topic",
    `- Example shape (adapt to this topic): "${subject} tonight."`,
  ].join("\n");
}

const NARRATION_BANLIST =
  "digits/years/months; goals/assists/xg/possession/pass accuracy/clean sheets; " +
  "rankings/fees/percentages; quotes/said/says/claimed; " +
  "match-result phrasing (won/lost/drew/beat/defeated + opponent; victory/defeat over); " +
  "unverified superlatives (best/greatest/first ever)";

function mapComposerKind(
  modelCallKind: RetentionComposerRequest["modelCallKind"],
): RetentionProductionModelCallKind {
  switch (modelCallKind) {
    case "length_compress":
      return "length_compression";
    case "repair":
      return "hook_repair";
    case "compatibility_fallback":
    case "safe_fallback":
      return "hook_fallback";
    case "body_rewrite":
      // Body rewrite uses the dedicated rewrite adapter; never this path.
      return "studio_rewrite";
    case "initial":
      return "initial_composer";
    default: {
      const _exhaustive: never = modelCallKind;
      void _exhaustive;
      return "initial_composer";
    }
  }
}

function resolveHookStrategyId(
  hookDirectiveBlock: string | null | undefined,
): string | null {
  if (!hookDirectiveBlock) return null;
  const match = /\(([a-z][a-z0-9_]{0,63})@[0-9.]+\)/i.exec(hookDirectiveBlock);
  return match?.[1] ?? null;
}

function buildComposerJsonSchema(
  request: RetentionComposerRequest,
): Record<string, unknown> {
  const claimsEmpty = request.eligibleClaims.length === 0;
  const maxRefs = claimsEmpty ? 0 : RETENTION_MAX_SEGMENT_CLAIM_REFS;
  const beatIds = [...request.orderedBeatIds];
  const segmentObject = {
    type: "object",
    additionalProperties: false,
    required: ["beatId", "text", "claimRefs"],
    properties: {
      beatId: { type: "string", enum: beatIds },
      text: { type: "string" },
      claimRefs: {
        type: "array",
        items: { type: "string" },
        maxItems: maxRefs,
      },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "segments", "hookClaimRefs"],
    properties: {
      title: { type: "string" },
      segments: {
        type: "array",
        minItems: beatIds.length,
        maxItems: beatIds.length,
        items: segmentObject,
      },
      hookClaimRefs: {
        type: "array",
        items: { type: "string" },
        maxItems: maxRefs,
      },
    },
  };
}

function buildComposerPrompt(request: RetentionComposerRequest): string {
  const beatBlock = request.beats
    .map(
      (b, i) =>
        `${i + 1}. beatId=${b.beatId} purpose=${b.purpose}\n` +
        `   suggestedWordBudget: ${b.suggestedWordBudget}\n` +
        `   emotionalIntent: ${b.emotionalIntent}\n` +
        `   viewerQuestion: ${b.viewerQuestion}\n` +
        `   informationContribution: ${b.informationContribution}\n` +
        `   narrationGoal: ${b.narrationGoal}\n` +
        `   visualOpportunity: ${b.visualOpportunity}\n` +
        `   groundingClaimRefs: ${b.groundingClaimRefs.join(", ") || "(none)"}`,
    )
    .join("\n");

  const targetWordBudget = request.targetWordBudget;
  // Leave headroom for Hook repair/fallback expansions (hard word gate is absolute).
  const composeTargetWords = Math.max(
    request.orderedBeatIds.length * 4,
    Math.floor(targetWordBudget * 0.68),
  );
  const claimsEmpty = request.eligibleClaims.length === 0;
  const hookStrategyId = resolveHookStrategyId(request.hookDirectiveBlock);
  const requiresQuestionOpening =
    hookStrategyId === "provocative_question" ||
    hookStrategyId === "curiosity_gap" ||
    /\bquestion\b/i.test(request.hookDirectiveBlock ?? "") ||
    /\bquestion\b/i.test(request.hookHandoff.openingPsychologicalFunction);

  const previousBlock =
    request.previousCandidate != null
      ? [
          "previousStructuredCandidate (shorten in place; keep beatIds/order; preserve opening sentence byte-for-byte when present):",
          ...request.previousCandidate.segments.map(
            (segment, i) =>
              `${i + 1}. beatId=${segment.beatId}\n   text: ${segment.text}`,
          ),
        ].join("\n")
      : "previousStructuredCandidate: none";

  const kindGuidance =
    request.modelCallKind === "length_compress"
      ? [
          `LENGTH COMPRESSION: rewrite from previousStructuredCandidate so total words are ≤ ${targetWordBudget} (exact hard ceiling).`,
          `Hard requirement: total words MUST be ≤ ${composeTargetWords} (safer headroom under ${targetWordBudget}).`,
          "Keep exact beatIds/order. One short complete spoken utterance per beat ending in . ! or ?.",
          "Each segment text SHOULD be ≤ its suggestedWordBudget words.",
          "Preserve the first spoken opening sentence exactly. Terminal payoff MUST stay a complete meaningful sentence.",
          "Do not add new facts. Never end mid-sentence. Never emit fragments.",
        ].join(" ")
      : request.modelCallKind === "repair" ||
          request.modelCallKind === "compatibility_fallback" ||
          request.modelCallKind === "safe_fallback"
        ? `Revise segments to satisfy Hook opening constraints while preserving beat order and controlling idea. Keep total words ≤ ${targetWordBudget}. Every segment must be a complete spoken utterance. Keep the requested Hook strategy identity (do not invent a different opening style).`
        : "Compose concise spoken narration segments for each beat in exact order.";

  const openingRule = buildTopicAnchoredOpeningRule(
    request.topic,
    request.scriptMode,
    requiresQuestionOpening,
  );

  const matchupCoverageRule =
    request.scriptMode === "match_preview" ||
    request.scriptMode === "match_recap"
      ? [
          "- MATCHUP COVERAGE: for explicit versus/vs/against topics, the COMPLETE narration MUST name both participant sides",
          "- Opening may name only one side; a later body beat MUST name the opposing side",
          "- Do not invent scores, results, statistics, or events to satisfy coverage",
        ].join("\n")
      : null;

  return [
    "FootieBitz Retention narration composer. Output JSON only. No markdown, prose, or reasoning fields.",
    kindGuidance,
    "Required JSON shape:",
    '{ "title": string, "segments": [ { "beatId": string, "text": string, "claimRefs": string[] } ], "hookClaimRefs": string[] }',
    "Rules:",
    "- segments must include exactly one entry per orderedBeatId, same order",
    "- do not invent verified facts; factual claims need eligible claim refs only",
    claimsEmpty
      ? "- eligibleClaims is empty: EVERY claimRefs and hookClaimRefs MUST be []; narration MUST avoid: " +
        NARRATION_BANLIST
      : "- claimRefs may only use eligible claim IDs that support the segment text",
    "- first segment is the spoken opening region for Hook Engine",
    `- exact total word budget: total narration words MUST be ≤ ${targetWordBudget}`,
    `- compose target: ~${composeTargetWords} words total (leave headroom under the exact budget)`,
    "- respect each beat suggestedWordBudget (they sum to the exact total budget)",
    "- EACH segment MUST be one complete spoken utterance ending with . ! or ?",
    "- NO segment may end mid-sentence or on a dangling article/preposition/conjunction/auxiliary",
    "- terminal/payoff segment MUST be a complete spoken payoff sentence",
    "- progress the story: opening curiosity → escalation → clear complete payoff",
    "- preserve controlling-idea continuity across every segment",
    "- use concrete visual language tied to each beat visualOpportunity",
    "- avoid repetition across segments and avoid generic introductions (In today's… / Welcome to…)",
    openingRule,
    ...(matchupCoverageRule ? [matchupCoverageRule] : []),
    hookStrategyId ? `activeHookStrategyId: ${hookStrategyId}` : "activeHookStrategyId: unresolved",
    `modelCallKind: ${request.modelCallKind}`,
    `topic: ${request.topic}`,
    `topicAuthority: ${request.topicAuthority}`,
    `scriptMode: ${request.scriptMode}`,
    `durationSec: ${request.durationSec}`,
    `targetWordBudget: ${targetWordBudget}`,
    `qualityMode: ${request.qualityMode}`,
    `controllingIdea: ${request.controllingIdeaStatement}`,
    `controllingIdeaClaimRefs: ${request.controllingIdeaClaimRefs.join(", ") || "(none)"}`,
    `orderedBeatIds: ${request.orderedBeatIds.join(", ")}`,
    `hookHandoff.openingPsychologicalFunction: ${request.hookHandoff.openingPsychologicalFunction}`,
    `hookHandoff.nextBeatPurpose: ${request.hookHandoff.nextBeatPurpose}`,
    request.hookDirectiveBlock
      ? `hookDirectiveBlock:\n${request.hookDirectiveBlock}`
      : "hookDirectiveBlock: none",
    request.manualContext
      ? `manualContext (unverified): ${request.manualContext}`
      : "manualContext: none",
    request.userInstructions
      ? `userInstructions: ${request.userInstructions}`
      : "userInstructions: none",
    previousBlock,
    "beats:",
    beatBlock,
    "eligibleClaims:",
    formatBoundedClaimsForPrompt(request.eligibleClaims) || "(none)",
    "avoidanceClaims:",
    formatBoundedClaimsForPrompt(request.avoidanceClaims) || "(none)",
  ].join("\n");
}

export function createRetentionProductionComposer(options: {
  readonly model: string;
}): RetentionComposerCallback {
  const { model } = options;
  return async (request) => {
    const raw = await requestRetentionStructuredJson({
      model,
      prompt: buildComposerPrompt(request),
      durationSec: request.durationSec,
      kind: mapComposerKind(request.modelCallKind),
      beatCount: request.orderedBeatIds.length,
      targetWordBudget: request.targetWordBudget,
      temperature: request.modelCallKind === "initial" ? 0.35 : 0.4,
      jsonSchema: {
        name: "retention_composer_proposal",
        description:
          "Retention narration composer proposal: title + exact ordered beat segments.",
        schema: buildComposerJsonSchema(request),
      },
    });
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("composer_proposal_invalid");
    }
    return raw as RetentionComposerProposal;
  };
}
