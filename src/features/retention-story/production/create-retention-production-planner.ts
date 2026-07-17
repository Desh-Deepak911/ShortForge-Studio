/**
 * Production Retention planner model adapter — Sprint 10F.3 / 10H.2.
 * Balanced/Studio: at most one structured JSON planner call.
 * Fast uses deterministic planning (zero planner calls) upstream.
 */

import { listRetentionEmotions } from "../strategy/emotion-strategy.registry";
import {
  buildRetentionBeatTemplateFields,
  mapEndingStrategyToTerminalPurpose,
} from "../planning/retention-beat-strategy.registry";
import { canonicalRetentionBeatText } from "../planning/retention-beat-semantics";
import {
  RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS,
  RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
  RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS,
  RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS,
  RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS,
} from "../planning/retention-story-plan.constants";
import type { RetentionBeatPurpose } from "../planning/retention-story-plan.types";
import type {
  RetentionPlannerCallback,
  RetentionPlannerProposal,
  RetentionPlannerRequest,
} from "../planning/retention-planner.types";
import {
  formatBoundedClaimsForPrompt,
  requestRetentionStructuredJson,
} from "./retention-production-model-json";

const BEAT_PURPOSES = [
  "hook_handoff",
  "curiosity",
  "reframe",
  "proof",
  "escalation",
  "conflict",
  "twist",
  "reveal",
  "payoff",
  "challenge",
  "resolution",
] as const;

/** Vocabulary that commonly trips Retention factual-risk on qualitative planner fields. */
const QUALITATIVE_FIELD_BANLIST =
  "digits/years/months; goals/assists/xg/possession/pass accuracy/clean sheets; " +
  "rankings/fees/percentages; quotes/said/says/claimed/according to; " +
  "match-result phrasing (won/lost/drew/beat/defeated + opponent; victory/defeat over); " +
  "unverified superlatives (best/greatest/first ever)";

/** OpenAI Structured Outputs schema — syntactic only; semantic normalize remains fail-closed. */
export function buildRetentionPlannerJsonSchema(
  request: RetentionPlannerRequest,
): Record<string, unknown> {
  const emotions = [...listRetentionEmotions()];
  const beatObject = {
    type: "object",
    additionalProperties: false,
    required: [
      "purpose",
      "emotionalIntent",
      "viewerQuestion",
      "informationContribution",
      "narrationGoal",
      "visualOpportunity",
      "groundingClaimRefs",
    ],
    properties: {
      purpose: { type: "string", enum: [...BEAT_PURPOSES] },
      emotionalIntent: {
        type: "string",
        minLength: 6,
        maxLength: RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS,
      },
      viewerQuestion: {
        type: "string",
        minLength: 6,
        maxLength: RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS,
      },
      informationContribution: {
        type: "string",
        minLength: 6,
        maxLength: RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
      },
      narrationGoal: {
        type: "string",
        minLength: 6,
        maxLength: RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS,
      },
      visualOpportunity: {
        type: "string",
        minLength: 6,
        maxLength: RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS,
      },
      groundingClaimRefs: {
        type: "array",
        items: { type: "string" },
      },
    },
  };

  // Keep strategy schema minimal: emotional curve is derived deterministically
  // from primaryEmotion when curve/secondary are omitted (fail-closed normalize).
  return {
    type: "object",
    additionalProperties: false,
    required: ["strategy", "beats"],
    properties: {
      strategy: {
        type: "object",
        additionalProperties: false,
        required: [
          "controllingIdea",
          "controllingIdeaClaimRefs",
          "primaryEmotion",
        ],
        properties: {
          controllingIdea: { type: "string" },
          controllingIdeaClaimRefs: {
            type: "array",
            items: { type: "string" },
          },
          primaryEmotion: { type: "string", enum: emotions },
        },
      },
      beats: {
        type: "array",
        minItems: request.targetBeatCountRange.min,
        maxItems: request.targetBeatCountRange.max,
        items: beatObject,
      },
    },
  };
}

function buildSafeExampleBeats(request: RetentionPlannerRequest): string | null {
  try {
    const purposes = request.suggestedBeatPurposes;
    const beats = purposes.map((purpose) => {
      const fields = buildRetentionBeatTemplateFields(
        purpose as RetentionBeatPurpose,
        request.topic,
      );
      // Only emit example fields that already pass planner semantic canonicalize.
      const emotionalIntent = canonicalRetentionBeatText(
        fields.emotionalIntent,
        RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS,
      );
      const viewerQuestion = canonicalRetentionBeatText(
        fields.viewerQuestion,
        RETENTION_MAX_BEAT_VIEWER_QUESTION_CHARS,
      );
      const informationContribution = canonicalRetentionBeatText(
        fields.informationContribution,
        RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS,
      );
      const narrationGoal = canonicalRetentionBeatText(
        fields.narrationGoal,
        RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS,
      );
      const visualOpportunity = canonicalRetentionBeatText(
        fields.visualOpportunity,
        RETENTION_MAX_BEAT_VISUAL_OPPORTUNITY_CHARS,
      );
      if (
        !emotionalIntent ||
        !viewerQuestion ||
        !informationContribution ||
        !narrationGoal ||
        !visualOpportunity
      ) {
        return null;
      }
      return {
        purpose,
        emotionalIntent,
        viewerQuestion,
        informationContribution,
        narrationGoal,
        visualOpportunity,
        groundingClaimRefs: [] as string[],
      };
    });
    if (beats.some((b) => b == null)) return null;
    return JSON.stringify(
      {
        strategy: {
          controllingIdea: request.controllingIdeaStatement,
          controllingIdeaClaimRefs: [] as string[],
          primaryEmotion: listRetentionEmotions()[0] ?? "tension",
        },
        beats,
      },
      null,
      0,
    );
  } catch {
    return null;
  }
}

function buildPlannerPrompt(request: RetentionPlannerRequest): string {
  const eligible = formatBoundedClaimsForPrompt(request.eligibleClaims);
  const avoidance = formatBoundedClaimsForPrompt(request.avoidanceClaims);
  const terminalPurpose = mapEndingStrategyToTerminalPurpose(
    request.endingStrategy,
  );
  const emotions = listRetentionEmotions().join(", ");
  const purposes = BEAT_PURPOSES.join(", ");
  const suggested = request.suggestedBeatPurposes.join(", ");
  const example = buildSafeExampleBeats(request);
  const claimsEmpty = request.eligibleClaims.length === 0;

  return [
    "FootieBitz Retention Story planner. Output JSON only. No markdown, prose, or reasoning fields.",
    "Propose one controlling idea strategy and an exact ordered beat list.",
    "Do not invent verified facts. Factual beat contributions require eligible claim IDs only.",
    "Strict accepted schema constraints:",
    `- primaryEmotion: exactly one of [${emotions}]`,
    "- Do NOT invent curve/secondaryEmotion fields; emotional curve is derived from primaryEmotion",
    `- beat.purpose: exactly one of [${purposes}]`,
    `- beats.length must be within ${request.targetBeatCountRange.min}-${request.targetBeatCountRange.max}`,
    `- Prefer beats.purpose sequence EXACTLY: ${suggested}`,
    `- first beat.purpose MUST be hook_handoff; no later hook_handoff`,
    `- terminal (last) beat.purpose MUST be ${terminalPurpose} for endingStrategy=${request.endingStrategy}`,
    "- middle beats must include at least one of: curiosity, reframe, escalation",
    "- required beat fields: purpose, emotionalIntent, viewerQuestion, informationContribution, narrationGoal, visualOpportunity, groundingClaimRefs",
    `- qualitative field max lengths: emotionalIntent/viewerQuestion ≤${RETENTION_MAX_BEAT_EMOTIONAL_INTENT_CHARS}; informationContribution ≤${RETENTION_MAX_BEAT_INFORMATION_CONTRIBUTION_CHARS}; narrationGoal/visualOpportunity ≤${RETENTION_MAX_BEAT_NARRATION_GOAL_CHARS}`,
    "- EVERY qualitative beat field must be non-empty (roughly 6–20 words) and MUST avoid:",
    `  ${QUALITATIVE_FIELD_BANLIST}`,
    "- NEVER put planning labels inside field values (forbidden substrings): controlling idea, viewer question, narration goal, visual opportunity, information contribution, emotional arc, beat plan, hook handoff",
    claimsEmpty
      ? "- eligibleClaims is empty: EVERY groundingClaimRefs MUST be []; controllingIdeaClaimRefs MUST be []; ALL beat fields MUST stay qualitative (no scores/results/stats)"
      : "- factual informationContribution requires exactly one eligible groundingClaimRef that supports the text",
    "- controllingIdea SHOULD reuse seedControllingIdea wording closely and MUST keep topic subject tokens (no invented scores/facts)",
    ...(example
      ? [
          "Safe example (prefer this qualitative register; adapt wording, keep constraints):",
          example,
        ]
      : []),
    "Required JSON shape:",
    '{ "strategy": { "controllingIdea": string, "controllingIdeaClaimRefs": string[], "primaryEmotion": string }, "beats": [ { "purpose": string, "emotionalIntent": string, "viewerQuestion": string, "informationContribution": string, "narrationGoal": string, "visualOpportunity": string, "groundingClaimRefs": string[] } ] }',
    `topic: ${request.topic}`,
    `topicAuthority: ${request.topicAuthority}`,
    `scriptMode: ${request.scriptMode}`,
    `formatStrategyId: ${request.formatStrategyId}`,
    `durationSec: ${request.durationSec}`,
    `qualityMode: ${request.qualityMode}`,
    `pacingProfile: ${request.pacingProfile}`,
    `informationDensity: ${request.informationDensity}`,
    `visualDensity: ${request.visualDensity}`,
    `endingStrategy: ${request.endingStrategy}`,
    `requiredTerminalPurpose: ${terminalPurpose}`,
    `requirePayoff: ${request.requirePayoff}`,
    `forbidGenericIntro: ${request.forbidGenericIntro}`,
    `targetBeatCountRange: ${request.targetBeatCountRange.min}-${request.targetBeatCountRange.max}`,
    `suggestedBeatPurposes: ${suggested}`,
    `seedControllingIdea: ${request.controllingIdeaStatement}`,
    request.manualContext
      ? `manualContext (unverified framing only): ${request.manualContext}`
      : "manualContext: none",
    request.userInstructions
      ? `userInstructions: ${request.userInstructions}`
      : "userInstructions: none",
    "eligibleClaims:",
    eligible || "(none)",
    "avoidanceClaims:",
    avoidance || "(none)",
  ].join("\n");
}

export function createRetentionProductionPlanner(options: {
  readonly model: string;
}): RetentionPlannerCallback {
  const { model } = options;
  return async (request) => {
    const raw = await requestRetentionStructuredJson({
      model,
      prompt: buildPlannerPrompt(request),
      durationSec: request.durationSec,
      kind: "planner",
      // Planner budget derives from permitted beat-count range max.
      beatCount: request.targetBeatCountRange.max,
      temperature: 0.2,
      jsonSchema: {
        name: "retention_planner_proposal",
        description:
          "Retention Story planner proposal: strategy + ordered beats within accepted schema.",
        schema: buildRetentionPlannerJsonSchema(request),
      },
    });
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("planner_proposal_invalid");
    }
    return raw as RetentionPlannerProposal;
  };
}
