/**
 * Production Retention structured narration composer — Sprint 10F.3 / 10H.2.
 * Exact ordered beat IDs → one segment per beat. No post-hoc paragraph slicing.
 */

import type {
  RetentionComposerCallback,
  RetentionComposerProposal,
  RetentionComposerRequest,
} from "../composition/retention-narration-candidate.types";
import { buildRetentionParticipantCoverage } from "../strategy/retention-matchup-participant-coverage";
import { resolveRetentionDeterministicSubjectAnchor } from "../strategy/resolve-retention-deterministic-subject-anchor";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { freezeRetentionSafeProviderFailure } from "../domain/retention-provider-failure.types";
import { buildRetentionComposerJsonSchema } from "./retention-composer-json-schema";
import {
  formatBoundedClaimsForPrompt,
  requestRetentionStructuredJson,
} from "./retention-production-model-json";
import type { RetentionProductionModelCallKind } from "./resolve-retention-production-max-output-tokens";

export {
  buildRetentionComposerJsonSchema,
  RETENTION_PROMPT5_COMPOSER_JSON_SCHEMA_WITH_OPTIONAL_PROPERTIES,
} from "./retention-composer-json-schema";

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
      "- REQUIRED: first spoken sentence MUST end with '?' and express a real dilemma, reversal, risk, or consequence from the creator contract",
      "- REQUIRED: first spoken sentence MUST include a subject token from the creator topic",
      `- The question must say more than "Why ${subject}?", "Can ${subject} do it?", or a rewritten copy of the topic`,
    ].join("\n");
  }
  return [
    "- first spoken sentence must be concise and complete; never cut meaning merely to hit a fixed word count",
    "- declarative/cold-open/headline allowed unless a question is required",
    "- first spoken sentence MUST include a subject token from the creator topic",
    `- The opening must say more than "${subject} tonight" or a rewritten copy of the topic`,
  ].join("\n");
}

function buildHookStrategyNarrationRule(strategyId: string | null): string {
  switch (strategyId) {
    case "provocative_question":
      return "- PROVOCATIVE QUESTION: ask one pointed, contract-grounded dilemma whose answer is not already contained in the question. Do not repeat the topic as a question.";
    case "contrarian_claim":
      return "- CONTRARIAN TAKE: open with a supported declarative reversal or unexpected implication. The opening MUST NOT be a question and must identify what the supplied evidence changes.";
    case "myth_challenge":
      return "- MYTH CHALLENGE: open with a supported expectation-versus-reality correction. The opening MUST NOT be a question and must not invent a public belief that the creator did not supply.";
    case "curiosity_gap":
      return "- CURIOSITY GAP: reveal a grounded consequence while briefly withholding the supplied reason that the next sentence explains. Do not use a subject-only question.";
    case "stakes_first":
      return "- STAKES FIRST: open with what can be gained, lost, changed, or decided now, using only consequences supported by the creator contract.";
    case "headline_first":
      return "- HEADLINE FIRST: state the largest supplied development directly, then use the body to explain why it matters.";
    case "countdown_tease":
      return "- COUNTDOWN TEASE: promise the ordered reveal and its selection logic without naming the number-one member in the opening.";
    case "cold_open":
      return "- COLD OPEN: enter at the strongest supplied moment or change in circumstances, then widen into context. Do not merely announce the topic.";
    default:
      return "- AUTO HOOK: choose the strongest supplied conflict, consequence, reversal, or promise. Do not merely restate the topic.";
  }
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

function buildComposerPrompt(request: RetentionComposerRequest): string {
  const brief = request.compositionBrief;
  const targetWordBudget = brief.durationUtilisation.storyHardWordBudget;
  const composeTargetWords = brief.durationUtilisation.storyTargetWordBudget;
  const minimumUsefulWords = brief.durationUtilisation.minimumUsefulWords;
  const rankingMemberCount = brief.requiredRankingMembership.length;
  const rankingMemberWordGuide =
    rankingMemberCount > 0
      ? Math.max(
          6,
          Math.floor((composeTargetWords - 12) / rankingMemberCount),
        )
      : 0;
  const claimsEmpty = request.eligibleClaims.length === 0;
  const hookStrategyId = resolveHookStrategyId(request.hookDirectiveBlock);
  const requiresQuestionOpening =
    hookStrategyId === "provocative_question";

  const previousNarration =
    request.previousCandidate?.assembledNarration ||
    request.repairContext?.sourceNarration ||
    "";
  const rejectedOpening =
    previousNarration.trim().match(/^[\s\S]*?[.!?…](?:\s|$)/u)?.[0]?.trim() ??
    previousNarration.trim();
  const previousBlock =
    previousNarration
      ? [
          "previousNarration (rewrite in place as one continuous spoken string; preserve accepted sentences byte-for-byte except the defective span):",
          previousNarration,
        ].join("\n")
      : "previousNarration: none";

  const rankingRepair =
    request.scriptMode === "top_5" &&
    /payoff|number.?one|ranking/i.test(request.repairContext?.reasonCode ?? "");
  const repairBlock =
    request.modelCallKind === "repair" && request.repairContext
      ? [
          "BOUNDED REGION REPAIR (one attempt only):",
          `- rejectionStage: ${request.repairContext.rejectionStage}`,
          `- reasonCode: ${request.repairContext.reasonCode}`,
          rankingRepair
            ? "- Return ONLY the replacement closing sentence in narration. Earlier ranking sentences are preserved byte-for-byte."
            : "- Return ONLY the replacement opening sentence in narration. Body and payoff are preserved byte-for-byte.",
          !rankingRepair && rejectedOpening
            ? `- rejectedOpening: ${rejectedOpening}`
            : "- rejectedOpening: none",
          !rankingRepair
            ? "- The replacement must use a different rhetorical proposition from rejectedOpening, not paraphrase it or repeat the topic."
            : "- Preserve the exact ranking authority while replacing only the closer.",
          "- Do not regenerate the story. Do not add names, statistics, dates, results, allegations, stronger certainty, or new causal claims.",
          "- Immutable creator-content contract, ranking order, certainty, and essential facts must remain unchanged.",
          "- support may list only allowed IDs used by the replacement region.",
        ].join("\n")
      : null;

  const kindGuidance =
    request.modelCallKind === "length_compress"
      ? [
          `LENGTH COMPRESSION: rewrite the previous narration so total words are ≤ ${targetWordBudget} (exact hard ceiling).`,
          `Prefer staying near ${composeTargetWords} words. Never end mid-sentence. Do not add facts.`,
          `Count the narration words before returning JSON. More than ${targetWordBudget} words is invalid.`,
        ].join(" ")
      : request.modelCallKind === "repair"
        ? `Revise only the rejected defect while preserving facts, ranking membership, uncertainty, and accepted narration. Keep total words ≤ ${targetWordBudget}.`
        : request.modelCallKind === "compatibility_fallback" ||
            request.modelCallKind === "safe_fallback"
          ? `Revise the continuous narration to satisfy Hook opening constraints while preserving facts, ranking membership, and uncertainty. Keep total words ≤ ${targetWordBudget}.`
          : "Write the full continuous spoken narration first. Do not write one isolated utterance per beat.";

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
    "FootieBitz Retention narration-first composer. Output JSON only. No markdown, prose, or reasoning fields.",
    kindGuidance,
    ...(repairBlock ? [repairBlock] : []),
    "Required JSON shape:",
    '{ "title": string, "narration": string, "support": { "sentenceIndex": number, "contentUnitId": string }[] }',
    "Write ONE continuous spoken narration. Do not emit beat segments, Hook copies, payoff copies, planning labels, or emotional labels.",
    "Hook, payoff, and beats are derived after speech. support may be [] and may use only allowed IDs.",
    "Rules:",
    "- Creator Content Contract determines substance. Settings determine presentation only.",
    "- Follow hook → evidence → escalation → payoff using causal, chronological, contrastive, or ranking relationships.",
    "- Essential facts before optional details. If overfull, omit optional units rather than inventing.",
    "- If the brief is sparse, write a shorter coherent narration. Do not invent facts or repeat transitions.",
    "- No Markdown headings or bullet narration unless top_5 needs audible ranking numbers.",
    "- No 'central idea', 'that connection', 'next part', 'next beat', or equivalent scaffold.",
    "- No fact-by-fact checklist. No repeated conclusion. No generic call to focus on the subject.",
    "- State each supporting reason once. Do not repeat the same evidence or conclusion using synonyms in adjacent sentences.",
    "- Never invent audience consensus or skepticism such as 'many doubt', 'common belief', or 'critics say' unless the creator supplied that attribution.",
    "- Required participants and ranking membership must appear. Never merge or drop a ranking entry.",
    request.scriptMode === "top_5"
      ? [
          "- RANKING RESPONSIBILITY: name every required member in the requested order.",
          `- ${brief.rankingPresentationInstruction}`,
          `- RANKING LENGTH IS STRICT: the entire narration must contain no more than ${targetWordBudget} words. Count before returning.`,
          `- Structure: one tease of at most 8 words; then exactly one sentence per member of at most ${rankingMemberWordGuide} words; then one number-one closer of at most 8 words.`,
          `- The opening tease must be its own sentence and must not name ${brief.rankingNumberOneMember ?? "the number-one member"} or any ranked member. Do not spoil number one before the payoff.`,
          "- Use one supplied reason per member. Compress the reason instead of restating its question or adding a hoped-for impact.",
          "- Give one supported reason for each member. Do not invent or amplify a reason.",
          "- Close by explicitly identifying the exact number-one member as number one / stands last / the decisive name.",
          `- Safest closing form: \"${brief.rankingNumberOneMember ?? "The named member"} is number one.\"`,
          "- The number-one closer must not add an achievement, expectation, role, reason, or prediction. Do not explain the number-one choice again.",
          "- The closing must be a consequence or central payoff, not a generic 'central idea' sentence.",
        ].join("\n")
      : "- Ranking membership applies only when the brief lists ranked members.",
    "- Required uncertainty must survive. Forbidden inventions stay forbidden.",
    "- Do not add unsupported facts or certainty. Tone may change cadence only.",
    claimsEmpty
      ? "- No factual units: support MUST be []; narration MUST avoid: " +
        NARRATION_BANLIST
      : [
          `- allowedContentIds: ${request.contentAuthority.orderedEssentialUnits
            .concat(request.contentAuthority.orderedOptionalUnits)
            .map((unit) => unit.contentUnitId)
            .join(", ") || "(none)"}`,
          `- allowedClaimIds: ${[...request.eligibleClaims.map((claim) => claim.claimId)].join(", ") || "(none)"}`,
          "- support.contentUnitId must be one of those IDs; never invent or alter IDs",
          "- connective or editorial clauses may omit support",
        ].join("\n"),
    `- Story-level word range: aim for ${minimumUsefulWords}–${composeTargetWords} words; ${targetWordBudget} is the hard ceiling, not an exact count.`,
    `- Duration class ${brief.durationUtilisation.durationClass}: ${brief.durationUtilisation.rationale}`,
    `- Hook strategy ${brief.hookStrategy}: ${brief.hookStrategyRationale}`,
    buildHookStrategyNarrationRule(hookStrategyId ?? brief.hookStrategy),
    "- Opening must name a real tension, consequence, contradiction, risk, or promise from the contract. A short question with only subject tokens is insufficient.",
    "- Do not copy the topic sentence into the opening. Do not repeat the opening question as the closing sentence; the payoff must advance, answer, or sharpen it.",
    "- Body must evidence that opening. Payoff must resolve, answer, or deliberately sharpen it.",
    openingRule,
    ...(matchupCoverageRule ? [matchupCoverageRule] : []),
    "Narrative architecture phases (do not speak these labels):",
    ...brief.narrativeArchitecture.phaseIntents.map((intent, i) =>
      `${i + 1}. ${brief.narrativeArchitecture.phaseIds[i]} — ${intent}`,
    ),
    `Tone ${brief.toneGuidance.tone}: ${brief.toneGuidance.cadenceGuidance} ${brief.toneGuidance.languageGuidance}`,
    ...brief.toneGuidance.forbiddenPresentationalMoves.map((rule) => `- ${rule}`),
    hookStrategyId
      ? `activeHookStrategyId: ${hookStrategyId}`
      : "activeHookStrategyId: unresolved",
    `modelCallKind: ${request.modelCallKind}`,
    `topic: ${request.topic}`,
    `topicAuthority: ${request.topicAuthority}`,
    `scriptMode: ${request.scriptMode}`,
    `durationSec: ${request.durationSec}`,
    `qualityMode: ${request.qualityMode}`,
    `qualityEffort: planner=${brief.qualityEffort.plannerCalls} composer=1 rewrite=${brief.qualityEffort.targetedBodyRewrite}`,
    `centralSubject: ${brief.centralSubject}`,
    `controllingIdea: ${brief.controllingIdea}`,
    `intendedConflict: ${brief.intendedConflict ?? "(none)"}`,
    `intendedConsequence: ${brief.intendedConsequence ?? "(none)"}`,
    `requiredParticipants: ${brief.requiredParticipants.join(", ") || "(none)"}`,
    `requiredRankingMembership: ${brief.requiredRankingMembership.join(", ") || "(none)"}`,
    `requiredUncertaintyLanguage: ${brief.requiredUncertaintyLanguage.join(", ") || "(none)"}`,
    `forbiddenInventionIds: ${brief.forbiddenInventionIds.join(", ") || "(none)"}`,
    `structuralObligations: ${brief.structuralObligations.join(", ") || "(none)"}`,
    `lowContextWarning: ${brief.lowContextWarning}`,
    `omittedOptionalClaimIds: ${request.omittedOptionalClaimIds.join(", ") || "(none)"}`,
    "contentAuthority.orderedEssentialUnits:",
    request.contentAuthority.orderedEssentialUnits
      .map(
        (unit) =>
          `- ${unit.creatorOrder} ${unit.contentUnitId} claim=${unit.claimId ?? "none"} ${unit.kind}/${unit.authority}: ${unit.text}`,
      )
      .join("\n") || "(none)",
    "contentAuthority.orderedOptionalUnits:",
    request.contentAuthority.orderedOptionalUnits
      .map(
        (unit) =>
          `- ${unit.creatorOrder} ${unit.contentUnitId} claim=${unit.claimId ?? "none"} ${unit.kind}/${unit.authority}: ${unit.text}`,
      )
      .join("\n") || "(none)",
    request.hookDirectiveBlock
      ? `hookDirectiveBlock:\n${request.hookDirectiveBlock}`
      : "hookDirectiveBlock: none",
    request.manualContext
      ? `creatorNotes (creator-supplied; use faithfully without presenting as independently verified): ${request.manualContext}`
      : "manualContext: none",
    request.userInstructions
      ? `userInstructions: ${request.userInstructions}`
      : "userInstructions: none",
    previousBlock,
    "Invisible Retention beat scaffold (do not narrate these labels):",
    request.orderedBeatIds.join(", "),
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
          "Retention narration-first composer proposal: title + one continuous narration.",
        schema: buildRetentionComposerJsonSchema(request),
      },
    });
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention composer response could not be used.",
        {
          normalizeSeam: "response_schema_mismatch",
          safeProviderFailure: freezeRetentionSafeProviderFailure({
            class: "response_schema_mismatch",
            endpointFamily: "responses",
            configuredModel: model,
            failurePhase: "response_schema",
            retryCount: 0,
          }),
        },
      );
    }
    const proposal = raw as Record<string, unknown>;
    if (typeof proposal.title !== "string" || typeof proposal.narration !== "string") {
      throw new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention composer response could not be used.",
        {
          normalizeSeam: "response_schema_mismatch",
          safeProviderFailure: freezeRetentionSafeProviderFailure({
            class: "response_schema_mismatch",
            endpointFamily: "responses",
            configuredModel: model,
            failurePhase: "response_schema",
            retryCount: 0,
          }),
        },
      );
    }
    return raw as RetentionComposerProposal;
  };
}
