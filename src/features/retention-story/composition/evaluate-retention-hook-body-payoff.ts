/**
 * Semantic Hook / body / payoff relationship — story-quality Prompt 7.
 * A Hook is a promise the body and payoff address. It does not need to
 * repeat the same nouns. No topic special cases.
 */

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "this",
  "that",
  "what",
  "who",
  "why",
  "how",
  "when",
  "where",
  "does",
  "do",
  "did",
  "is",
  "are",
  "can",
  "will",
  "would",
  "could",
  "should",
  "tonight",
  "story",
  "match",
  "preview",
  "recap",
  "next",
  "still",
]);

const GENERIC_QUESTION_TOKENS = new Set([
  "decides",
  "decide",
  "outcome",
  "outcomes",
  "happen",
  "happens",
  "next",
  "matter",
  "matters",
]);

const TENSION_CUES = new Set([
  "whether",
  "risk",
  "cost",
  "doubt",
  "pressure",
  "better",
  "worse",
  "stronger",
  "weaker",
  "without",
  "return",
  "fit",
  "first",
  "last",
  "number",
  "versus",
  "against",
  "revenge",
  "decline",
  "redemption",
  "consequence",
  "stakes",
  "conflict",
  "answer",
  "hold",
  "stand",
  "survive",
  "define",
  "season",
  "ranking",
  "watch",
]);

export type RetentionHookBodyPayoffReasonId =
  | "opening_missing"
  | "opening_subject_only"
  | "opening_lacks_contract_promise"
  | "opening_unrelated"
  | "opening_meaningless"
  | "opening_result_leak"
  | "body_does_not_evidence_hook"
  | "payoff_does_not_resolve_hook"
  | "payoff_repeats_previous_consequence";

export type RetentionHookQualityWarningId =
  | "hook_below_style_target"
  | "hook_low_tension"
  | "hook_subject_led"
  | "duration_slightly_under_target"
  | "duration_slightly_over_target"
  | "duration_target_not_fully_met";

const SOFT_HOOK_REASONS: ReadonlySet<RetentionHookBodyPayoffReasonId> = new Set([
  "opening_subject_only",
  "opening_lacks_contract_promise",
]);

const RESULT_LEAK =
  /\b(?:won|lost|drew|beat|defeated)\b[\s\S]{0,24}\b(?:\d{1,2}\s*[-–]\s*(?:\d{1,2}|nil)|the\s+(?:title|final|match))\b/iu;

const REVERSAL_SHAPE =
  /(?:\b(?:not|never|but|yet|despite|although|instead|rather|actually|even|better|worse|stronger|weaker|more|less)\b|[—:])/iu;
const CORRECTION_SHAPE =
  /(?:\b(?:myth|not|never|wrong|but|yet|actually|instead|rather|isn['’]t|wasn['’]t|aren['’]t|doesn['’]t|didn['’]t)\b|[—:])/iu;

function missesSelectedHookStyle(input: {
  readonly strategy: RetentionCompositionBrief["hookStrategy"];
  readonly opening: string;
  readonly subjectOnly: boolean;
  readonly modeAware: boolean;
  readonly rankingNumberOneMember?: string | null;
}): boolean {
  const question = input.opening.includes("?");
  const revealsNumberOne =
    input.rankingNumberOneMember != null &&
    input.opening
      .normalize("NFC")
      .toLocaleLowerCase()
      .includes(input.rankingNumberOneMember.normalize("NFC").toLocaleLowerCase());
  switch (input.strategy) {
    case "provocative_question":
      return !question || input.subjectOnly || !input.modeAware;
    case "contrarian_claim":
      return question || !input.modeAware || !REVERSAL_SHAPE.test(input.opening);
    case "myth_challenge":
      return question || !input.modeAware || !CORRECTION_SHAPE.test(input.opening);
    case "cold_open":
      return question || input.subjectOnly;
    case "headline_first":
      return question || input.subjectOnly;
    case "curiosity_gap":
    case "stakes_first":
      return input.subjectOnly || !input.modeAware;
    case "countdown_tease":
      return input.subjectOnly || !input.modeAware || revealsNumberOne;
    case "auto":
    case "user_written":
      return false;
    default: {
      const _exhaustive: never = input.strategy;
      void _exhaustive;
      return false;
    }
  }
}

export interface RetentionHookBodyPayoffEvaluation {
  readonly ok: boolean;
  readonly reasonIds: readonly RetentionHookBodyPayoffReasonId[];
  readonly qualityWarningIds: readonly RetentionHookQualityWarningId[];
  readonly opening: string;
  readonly body: string;
  readonly payoff: string;
}

export function isRetentionHardHookBodyReason(
  reason: RetentionHookBodyPayoffReasonId,
): boolean {
  return !SOFT_HOOK_REASONS.has(reason);
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length >= 3);
}

function contentTokens(text: string): string[] {
  return tokenize(text).filter((token) => !STOPWORDS.has(token));
}

function consequenceTokens(text: string): string[] {
  return contentTokens(text).map((token) => {
    if (/^(?:add|adds|added|adding|strengthen|strengthens|strengthened|bolster|bolsters|bolstered)$/u.test(token)) {
      return "strengthen";
    }
    if (/^(?:arsenal|option|options|resource|resources|weapon|weapons)$/u.test(token)) {
      return "resource";
    }
    return token;
  });
}

function repeatsPreviousConsequence(narration: string): boolean {
  const sentences = narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  if (sentences.length < 3) return false;
  const previous = [...new Set(consequenceTokens(sentences.at(-2)!))];
  const closing = [...new Set(consequenceTokens(sentences.at(-1)!))];
  if (previous.length < 3 || closing.length < 3) return false;
  const shared = closing.filter((token) => previous.includes(token));
  return shared.length >= 3 && shared.length / Math.min(previous.length, closing.length) >= 0.6;
}

function firstSentence(narration: string): string {
  const trimmed = narration.trim();
  const match = /[.!?…]/.exec(trimmed);
  if (!match || match.index == null) return trimmed;
  return trimmed.slice(0, match.index + 1).trim();
}

function lastSentence(narration: string): string {
  const trimmed = narration.trim();
  const parts = trimmed.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  return parts[parts.length - 1]?.trim() || trimmed;
}

function sharesToken(left: readonly string[], right: readonly string[]): boolean {
  return left.some((token) => right.includes(token));
}

function promiseTokens(
  contract: RetentionCreatorContentContract,
  brief: RetentionCompositionBrief | null,
): string[] {
  const sources = [
    contract.intendedConflict ?? "",
    contract.intendedConsequence ?? "",
    contract.controllingIdea,
    ...contract.orderedUnits
      .filter((unit) => unit.kind !== "instruction" && unit.kind !== "forbidden")
      .map((unit) => unit.text),
    ...(brief?.requiredParticipants ?? []),
    ...(brief?.requiredRankingMembership ?? []),
    brief?.controllingIdea ?? "",
  ];
  return [...new Set(sources.flatMap((text) => contentTokens(text)))];
}

function subjectTokens(
  contract: RetentionCreatorContentContract,
  brief: RetentionCompositionBrief | null,
): string[] {
  return [
    ...contentTokens(contract.centralSubject),
    ...contentTokens(brief?.centralSubject ?? ""),
  ];
}

function resolveSpokenOpening(
  narration: string,
  hookOpening?: string,
): string {
  const spoken = firstSentence(narration);
  const meta = hookOpening?.trim() ?? "";
  if (!meta) return spoken;
  if (narration.startsWith(meta) || spoken === meta) return meta;
  return spoken;
}

function isGenericSwapSurvivingOpening(
  openingContent: readonly string[],
  subject: readonly string[],
): boolean {
  const beyond = openingContent.filter((token) => !subject.includes(token));
  if (beyond.length === 0) return true;
  return beyond.every((token) => GENERIC_QUESTION_TOKENS.has(token));
}

function hasModeAwarePromise(input: {
  readonly openingContent: readonly string[];
  readonly subject: readonly string[];
  readonly promise: readonly string[];
  readonly scriptMode: string;
  readonly opening: string;
}): boolean {
  if (
    sharesToken(
      input.openingContent,
      input.promise.filter((token) => !input.subject.includes(token)),
    )
  ) {
    return true;
  }
  const tension = input.openingContent.some((token) => TENSION_CUES.has(token));
  const namesSubject = sharesToken(input.openingContent, input.subject);
  if (input.scriptMode === "match_preview" || input.scriptMode === "match_recap") {
    return namesSubject && (tension || input.opening.includes("?"));
  }
  if (input.scriptMode === "top_5") {
    return (
      tension ||
      input.openingContent.includes("five") ||
      input.openingContent.includes("ranking") ||
      input.openingContent.includes("watch") ||
      input.opening.includes("?")
    );
  }
  if (input.scriptMode === "player_analysis") {
    return namesSubject && (tension || input.opening.includes("?"));
  }
  return namesSubject && (tension || input.opening.includes("?"));
}

function bodyEvidencesHook(input: {
  readonly bodyTokens: readonly string[];
  readonly promise: readonly string[];
  readonly subject: readonly string[];
  readonly scriptMode: string;
  readonly requiredParticipants: readonly string[];
  readonly requiredRankingMembership: readonly string[];
  readonly narration: string;
}): boolean {
  if (sharesToken(input.bodyTokens, input.promise)) return true;
  if (input.scriptMode === "match_preview" || input.scriptMode === "match_recap") {
    return input.requiredParticipants.every((name) => {
      const token = name.split(/\s+/u)[0] ?? "";
      if (!token) return false;
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped, "i").test(input.narration);
    });
  }
  if (input.scriptMode === "top_5") {
    if (input.requiredRankingMembership.length === 0) return false;
    const sentences = input.narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
    return input.requiredRankingMembership.every((name) => {
      const token = name.split(" ")[0] ?? name;
      const home = sentences.find((sentence) =>
        sentence.toLowerCase().includes(token.toLowerCase()),
      );
      if (!home) return false;
      return contentTokens(home).filter((item) => item !== token.toLowerCase())
        .length >= 2;
    });
  }
  return sharesToken(input.bodyTokens, input.subject);
}

function payoffResolvesHook(input: {
  readonly payoffTokens: readonly string[];
  readonly openingContent: readonly string[];
  readonly promise: readonly string[];
  readonly bodyTokens: readonly string[];
  readonly opening: string;
  readonly payoff: string;
  readonly narration: string;
  readonly scriptMode: string;
  readonly requiredRankingMembership: readonly string[];
}): boolean {
  if (input.scriptMode === "top_5" && input.requiredRankingMembership.length > 0) {
    const numberOneToken =
      input.requiredRankingMembership[0]!.split(" ")[0] ??
      input.requiredRankingMembership[0]!;
    const numberOneCue =
      /\b(?:number one|no\.?\s*1|stands last|decisive name|#1)\b/iu;
    const laterMemberNamed = input.requiredRankingMembership.slice(1).some((name) => {
      const token = name.split(" ")[0] ?? name;
      return Boolean(token) && input.payoff.includes(token);
    });
    if (numberOneCue.test(input.payoff) && laterMemberNamed && !input.payoff.includes(numberOneToken)) {
      return false;
    }
    if (input.payoff.includes(numberOneToken) && numberOneCue.test(input.payoff)) {
      return true;
    }
    if (input.payoff.includes(numberOneToken)) return true;
    if (numberOneCue.test(input.payoff) && !laterMemberNamed) return true;
    const sentences = input.narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
    const lastNumberOneSentence = [...sentences]
      .reverse()
      .find((sentence) => sentence.includes(numberOneToken));
    return Boolean(
      lastNumberOneSentence && numberOneCue.test(lastNumberOneSentence),
    );
  }
  if (sharesToken(input.payoffTokens, input.promise)) return true;
  if (sharesToken(input.payoffTokens, input.openingContent)) return true;
  if (input.opening.includes("?") && sharesToken(input.payoffTokens, input.bodyTokens)) {
    return true;
  }
  const returnsToOpenQuestion = input.payoffTokens.some(
    (token) =>
      TENSION_CUES.has(token) ||
      token === "open" ||
      token === "question" ||
      token === "contest" ||
      token === "meeting" ||
      token === "whether",
  );
  const openingHasTension = input.openingContent.some((token) =>
    TENSION_CUES.has(token),
  );
  if (
    returnsToOpenQuestion &&
    (input.opening.includes("?") || openingHasTension) &&
    (input.scriptMode === "match_preview" ||
      input.scriptMode === "match_recap" ||
      input.scriptMode === "player_analysis" ||
      input.scriptMode === "story")
  ) {
    return true;
  }
  return false;
}

export function evaluateRetentionHookBodyPayoff(input: {
  readonly narration: string;
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief?: RetentionCompositionBrief | null;
  readonly hookOpening?: string;
  readonly payoffClosing?: string;
  readonly userWrittenHookAccepted?: boolean;
}): RetentionHookBodyPayoffEvaluation {
  const narration = input.narration.trim();
  const opening = resolveSpokenOpening(narration, input.hookOpening);
  const payoff = (input.payoffClosing?.trim() &&
  narration.includes(input.payoffClosing.trim())
    ? input.payoffClosing.trim()
    : lastSentence(narration)
  ).trim();
  const openingAt = narration.indexOf(opening);
  const body = (
    openingAt >= 0 ? narration.slice(openingAt + opening.length) : narration
  )
    .replace(payoff, "")
    .trim();
  const reasonIds: RetentionHookBodyPayoffReasonId[] = [];
  const qualityWarningIds: RetentionHookQualityWarningId[] = [];

  if (!opening) {
    reasonIds.push("opening_missing");
    return Object.freeze({
      ok: false,
      reasonIds: Object.freeze(reasonIds),
      qualityWarningIds: Object.freeze(qualityWarningIds),
      opening,
      body,
      payoff,
    });
  }

  const brief = input.brief ?? null;
  const scriptMode = brief?.narrativeArchitecture.scriptMode ?? "story";
  const openingContent = contentTokens(opening);
  const subject = subjectTokens(input.contentContract, brief);
  const promise = promiseTokens(input.contentContract, brief);
  const userWritten = input.userWrittenHookAccepted === true;
  const relevant =
    sharesToken(openingContent, subject) || sharesToken(openingContent, promise);
  const letterWords = opening.replace(/[^\p{L}\s]+/gu, " ").trim();

  if (!userWritten && (openingContent.length === 0 || letterWords.length < 3)) {
    reasonIds.push("opening_meaningless");
  }
  if (!userWritten && RESULT_LEAK.test(opening)) {
    reasonIds.push("opening_result_leak");
  }
  const modeAware = hasModeAwarePromise({
    openingContent,
    subject,
    promise,
    scriptMode,
    opening,
  });
  const subjectOnly = isGenericSwapSurvivingOpening(openingContent, subject);
  if (
    !userWritten &&
    !relevant &&
    !modeAware &&
    !reasonIds.includes("opening_meaningless")
  ) {
    reasonIds.push("opening_unrelated");
  }
  if (!userWritten && subjectOnly) {
    reasonIds.push("opening_subject_only");
    if (relevant) qualityWarningIds.push("hook_subject_led");
  }
  if (!userWritten && !modeAware) {
    reasonIds.push("opening_lacks_contract_promise");
    if (relevant) qualityWarningIds.push("hook_low_tension");
  }
  const hookStrategy = brief?.hookStrategy ?? "auto";
  if (
    !userWritten &&
    relevant &&
    hookStrategy !== "auto" &&
    hookStrategy !== "user_written" &&
    missesSelectedHookStyle({
      strategy: hookStrategy,
      opening,
      subjectOnly,
      modeAware,
      rankingNumberOneMember: brief?.rankingNumberOneMember,
    })
  ) {
    if (!qualityWarningIds.includes("hook_below_style_target")) {
      qualityWarningIds.push("hook_below_style_target");
    }
  }

  const bodyTokens = contentTokens(body || narration.slice(opening.length));
  if (
    !bodyEvidencesHook({
      bodyTokens,
      promise,
      subject,
      scriptMode,
      requiredParticipants: brief?.requiredParticipants ?? [],
      requiredRankingMembership: brief?.requiredRankingMembership ?? [],
      narration,
    })
  ) {
    reasonIds.push("body_does_not_evidence_hook");
  }

  if (
    !payoffResolvesHook({
      payoffTokens: contentTokens(payoff),
      openingContent,
      promise,
      bodyTokens,
      opening,
      payoff,
      narration,
      scriptMode,
      requiredRankingMembership: brief?.requiredRankingMembership ?? [],
    })
  ) {
    reasonIds.push("payoff_does_not_resolve_hook");
  }
  if (repeatsPreviousConsequence(narration)) {
    reasonIds.push("payoff_repeats_previous_consequence");
  }

  const hardReasons = reasonIds.filter(isRetentionHardHookBodyReason);
  return Object.freeze({
    ok: hardReasons.length === 0,
    reasonIds: Object.freeze(reasonIds),
    qualityWarningIds: Object.freeze(qualityWarningIds),
    opening,
    body,
    payoff,
  });
}
