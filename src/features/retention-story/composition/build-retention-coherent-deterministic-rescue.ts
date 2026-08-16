/**
 * Canonical coherent fact-grounded deterministic rescue — story-quality Prompt 4.
 * Sole production fallback authority. Builds one continuous narration from
 * Creator Content Contract + Composition Brief. Never emits planning scaffold.
 */

import type { ScriptMode, Tone } from "@/types/footiebitz";

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionCreatorContentUnit } from "../domain/retention-creator-content-contract.types";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import { buildRetentionCreatorContentContract } from "../grounding/build-retention-creator-content-contract";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import {
  buildRetentionParticipantCoverage,
  evaluateRetentionParticipantCoverage,
} from "../strategy/retention-matchup-participant-coverage";
import { resolveRetentionDeterministicSubjectAnchor } from "../strategy/resolve-retention-deterministic-subject-anchor";
import {
  claimRefsSupportLinkedNarrationStatement,
  compressRetentionClaimLinkedNarration,
} from "../strategy/retention-claim-linked-support";
import { buildDeterministicRetentionStrategySeed } from "../strategy/build-retention-strategy-seed";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";
import { allocateRetentionCreatorContentUnits } from "./allocate-retention-creator-content-units";
import { applyRetentionTonePresentation } from "./apply-retention-tone-presentation";
import { assembleRetentionNarrationCandidate } from "./assemble-retention-narration-candidate";
import type { RetentionSegmentDraft } from "./assemble-retention-narration-candidate";
import { buildRetentionCompositionBrief } from "./build-retention-composition-brief";
import { mapRetentionNarrationToBeats } from "./map-retention-narration-to-beats";
import { resolveAuthorizedClaimIdsForBeat } from "./retention-opening-claim-authority";
import type {
  RetentionCompositionBrief,
  RetentionHookStrategyId,
} from "./retention-composition-brief.types";
import type { RetentionNarrationCandidate } from "./retention-narration-candidate.types";

export const RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID =
  "retention-coherent-deterministic-rescue/1" as const;

const rescueRuntime = {
  canonicalInvocations: 0,
  legacyScaffoldInvocations: 0,
};

export function getRetentionCoherentRescueRuntimeProbe(): {
  readonly builderId: typeof RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID;
  readonly canonicalInvocations: number;
  readonly legacyScaffoldInvocations: number;
} {
  return Object.freeze({
    builderId: RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID,
    canonicalInvocations: rescueRuntime.canonicalInvocations,
    legacyScaffoldInvocations: rescueRuntime.legacyScaffoldInvocations,
  });
}

export function resetRetentionCoherentRescueRuntimeProbe(): void {
  rescueRuntime.canonicalInvocations = 0;
  rescueRuntime.legacyScaffoldInvocations = 0;
}

/** Obsolete planning-language builder — must stay unused. */
export function buildLegacyPlanningLanguageFallback(): never {
  rescueRuntime.legacyScaffoldInvocations += 1;
  throw new Error("legacy_planning_language_fallback_unreachable");
}

export type RetentionRescueThread =
  | "tension"
  | "contrast"
  | "chronology"
  | "cause_consequence"
  | "ranking_comparison"
  | "tactical_mechanism"
  | "thesis_counter"
  | "return_redemption"
  | "result_turning_point"
  | "factual_summary";

export interface DeterministicFallbackBuildResult {
  readonly title: string;
  readonly candidate: RetentionNarrationCandidate;
  readonly omittedClaimIds: readonly string[];
  readonly usedClaimIds: readonly string[];
  readonly omittedContentUnitIds: readonly string[];
  readonly usedContentUnitIds: readonly string[];
  readonly coverageWarning: boolean;
  readonly lowContextWarning: boolean;
  readonly hookOpening: string;
  readonly payoffClosing: string;
  readonly thread: RetentionRescueThread;
  readonly hookReconciled: boolean;
}

const OPENING_SKIP = new Set([
  "a",
  "an",
  "the",
  "how",
  "why",
  "what",
  "when",
  "where",
  "who",
  "this",
  "that",
  "these",
  "those",
  "can",
  "with",
  "from",
  "into",
  "about",
  "without",
  "beat",
  "beats",
  "match",
  "review",
  "preview",
  "recap",
  "trace",
  "explain",
  "tell",
  "resets",
  "reset",
  "decide",
  "decides",
  "decided",
  "reshape",
  "reshaped",
  "redefine",
  "redefines",
  "story",
  "tone",
  "news",
  "please",
  "write",
  "dramatic",
  "funny",
  "tactical",
  "emotional",
  "whether",
  "rainy",
  "european",
  "african",
  "asian",
  "american",
  "away",
  "home",
  "young",
  "old",
  "great",
  "late",
  "early",
]);

const GENERIC_SUBJECT_ADJECTIVES = new Set([
  "european",
  "african",
  "asian",
  "american",
  "rainy",
  "young",
  "old",
  "new",
  "big",
  "small",
  "great",
  "late",
  "early",
  "away",
  "home",
  "first",
  "last",
  "next",
  "good",
  "bad",
  "long",
  "short",
  "dramatic",
  "funny",
  "tactical",
  "emotional",
]);

const GENERIC_SUBJECT_NOUNS = new Set([
  "nights",
  "night",
  "days",
  "day",
  "form",
  "story",
  "game",
  "match",
  "tempo",
  "box",
  "nights",
]);

const INCOMPLETE_SUBJECT_TAILS = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on",
  "at",
  "and",
  "or",
  ...GENERIC_SUBJECT_ADJECTIVES,
]);

const FORBIDDEN_SCAFFOLD = [
  /\bcentral idea\b/iu,
  /\bcentral question\b/iu,
  /\bthat connection\b/iu,
  /\bnext part\b/iu,
  /\bnext beat\b/iu,
  /\bthose details\b/iu,
  /\bcomes into focus\b/iu,
  /\bcome into focus\b/iu,
  /\bconsequence keeps growing\b/iu,
  /\bwhat decides\b/iu,
  /\bthe response changes\b/iu,
  /\bwhat happens next\b/iu,
  /\bpressure decides\b/iu,
  /\bthe contest tightens through pressure\b/iu,
];

type SpokenSentence = {
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly contentUnitIds: readonly string[];
};

function ensureTerminalPunctuation(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/[.!?…]$/u.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function foldSubjectWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function isIncompleteSubjectLabel(label: string): boolean {
  const words = label.split(/\s+/u).filter(Boolean);
  if (words.length === 0) return true;
  const last = foldSubjectWord(words[words.length - 1]!);
  if (INCOMPLETE_SUBJECT_TAILS.has(last)) return true;
  if (words.length === 1 && GENERIC_SUBJECT_ADJECTIVES.has(last)) return true;
  if (words.length === 1 && GENERIC_SUBJECT_NOUNS.has(last)) return true;
  return /['’]s$/u.test(words[words.length - 1] ?? "") && words.length === 1;
}

function spokenSubjectLabel(subject: string): string {
  const proper = subject
    .normalize("NFC")
    .match(/(?:[\p{Lu}][\p{L}\p{N}'’-]*)(?:\s+[\p{Lu}][\p{L}\p{N}'’-]*){0,3}/gu)
    ?.map((run) =>
      run
        .split(/\s+/u)
        .filter((word) => {
          const folded = foldSubjectWord(word);
          return (
            folded.length >= 2 &&
            !OPENING_SKIP.has(folded) &&
            !GENERIC_SUBJECT_ADJECTIVES.has(folded)
          );
        })
        .join(" ")
        .trim(),
    )
    .filter((run) => run.split(/\s+/u).some((word) => word.length >= 3))
    .map((run) => run.replace(/[!?.,:;]+$/gu, "").trim())
    .filter((run) => !isIncompleteSubjectLabel(run));
  if (proper?.[0]) return proper[0];
  const picks = subject
    .split(/\s+/u)
    .filter((word) => {
      const folded = foldSubjectWord(word);
      return (
        folded.length >= 3 &&
        !OPENING_SKIP.has(folded) &&
        !GENERIC_SUBJECT_ADJECTIVES.has(folded)
      );
    })
    .slice(0, 4);
  const joined = picks.join(" ").replace(/[!?.,:;]+$/gu, "").trim();
  if (joined && !isIncompleteSubjectLabel(joined)) return joined;
  return "";
}

function declarativeOpening(subject: string, fallbackClause?: string): string {
  const clause = fallbackClause?.replace(/[.!?…]+$/u, "").trim();
  if (clause && countRetentionNarrationWords(clause) >= 3) {
    return ensureTerminalPunctuation(clause);
  }
  const label = spokenSubjectLabel(subject);
  if (label && !isIncompleteSubjectLabel(label)) {
    return ensureTerminalPunctuation(`${label} remains the subject`);
  }
  return "The supplied facts remain in view.";
}

function isAllocatable(unit: RetentionCreatorContentUnit): boolean {
  return (
    unit.kind !== "instruction" &&
    unit.kind !== "forbidden" &&
    (unit.kind === "factual" ||
      unit.kind === "interpretive" ||
      unit.kind === "uncertain")
  );
}

function containsScaffold(text: string): boolean {
  return FORBIDDEN_SCAFFOLD.some((pattern) => pattern.test(text));
}

function speakUnit(
  unit: RetentionCreatorContentUnit,
  remainingWords: number,
  grounding: RetentionGroundingContext | null,
  factHandlingMode: NormalizedStoryContract["factHandlingMode"],
): SpokenSentence | null {
  const exact = ensureTerminalPunctuation(unit.text.trim());
  if (!exact || containsScaffold(exact)) return null;
  const exactWords = countRetentionNarrationWords(exact);
  if (exactWords <= Math.max(remainingWords, 20)) {
    return {
      text: exact,
      claimIds: unit.claimId ? [unit.claimId] : [],
      contentUnitIds: [unit.contentUnitId],
    };
  }
  const compressed = ensureTerminalPunctuation(
    compressRetentionClaimLinkedNarration(
      unit.text,
      Math.max(6, remainingWords),
    ),
  );
  if (unit.claimId && grounding) {
    if (
      claimRefsSupportLinkedNarrationStatement(
        grounding,
        [unit.claimId],
        compressed,
        factHandlingMode,
      )
    ) {
      return {
        text: compressed,
        claimIds: [unit.claimId],
        contentUnitIds: [unit.contentUnitId],
      };
    }
    if (
      claimRefsSupportLinkedNarrationStatement(
        grounding,
        [unit.claimId],
        exact,
        factHandlingMode,
      )
    ) {
      return {
        text: exact,
        claimIds: [unit.claimId],
        contentUnitIds: [unit.contentUnitId],
      };
    }
    return {
      text: exact,
      claimIds: [unit.claimId],
      contentUnitIds: [unit.contentUnitId],
    };
  }
  const spoken = countRetentionNarrationWords(compressed) >= 4 ? compressed : exact;
  return {
    text: spoken,
    claimIds: unit.claimId ? [unit.claimId] : [],
    contentUnitIds: [unit.contentUnitId],
  };
}

function compactReturnRedemptionSentence(text: string): string {
  return text
    .replace(/\bis returning\b/iu, "returns")
    .replace(/\bare returning\b/iu, "return")
    .replace(
      /\bfor\s+(?:his|her|their)\s+first\s+(?:game|match)\s+after\b/iu,
      "after",
    )
    .replace(/^In\s+(his|her|their)\s+return\s+/iu, "On $1 return, ")
    .replace(/\s+/gu, " ")
    .trim();
}

function selectThread(
  scriptMode: ScriptMode,
  contentContract: RetentionCreatorContentContract,
  brief: RetentionCompositionBrief,
  units: readonly RetentionCreatorContentUnit[],
): RetentionRescueThread {
  if (scriptMode === "top_5" && brief.requiredRankingMembership.length > 0) {
    return "ranking_comparison";
  }
  if (scriptMode === "tactical_review") return "tactical_mechanism";
  if (scriptMode === "opinion_debate") return "thesis_counter";
  if (scriptMode === "historical_explainer") return "chronology";
  if (scriptMode === "match_recap") return "result_turning_point";
  if (scriptMode === "match_preview" && brief.requiredParticipants.length >= 2) {
    return "contrast";
  }
  const corpus = [
    contentContract.intendedConflict ?? "",
    contentContract.intendedConsequence ?? "",
    contentContract.controllingIdea,
    ...units.map((unit) => unit.text),
  ].join(" ");
  if (
    /\b(?:ban|return(?:ed)?|comeback|redemption|discarded|revenge)\b/iu.test(
      corpus,
    )
  ) {
    return "return_redemption";
  }
  if (contentContract.intendedConflict) return "tension";
  if (contentContract.intendedConsequence) return "cause_consequence";
  if (units.length <= 1) return "factual_summary";
  return "tension";
}

function connectorFor(
  thread: RetentionRescueThread,
  tone: Tone,
  index: number,
  unitText: string,
): string {
  if (index === 0) return "";
  if (thread === "ranking_comparison") return "";
  if (thread === "chronology" && /\b(?:earlier|then|later|today|still)\b/iu.test(unitText)) {
    return "";
  }
  if (thread === "chronology") return index === 1 ? "Then " : "";
  if (
    (thread === "contrast" || thread === "tension") &&
    /\b(?:but|against|versus|or)\b/iu.test(unitText)
  ) {
    return "";
  }
  if (thread === "contrast" && index === 1) {
    return tone === "dramatic" ? "Now " : "";
  }
  if (thread === "thesis_counter" && /\b(?:may|still|but)\b/iu.test(unitText)) {
    return "";
  }
  if (thread === "tactical_mechanism" && /\bcounter\b/iu.test(unitText)) {
    return "";
  }
  if (thread === "result_turning_point" && /\b(?:then|switch|turning)\b/iu.test(unitText)) {
    return "";
  }
  return "";
}

function creatorQuestion(
  units: readonly RetentionCreatorContentUnit[],
): string | null {
  const found = units.find(
    (unit) =>
      isAllocatable(unit) &&
      (/\?\s*$/u.test(unit.text.trim()) ||
        /\b(?:central|key)\s+question\b[^.?!]*\bwhether\b/iu.test(unit.text)),
  );
  if (!found) return null;
  const source = found.text.trim();
  if (/\?\s*$/u.test(source)) return ensureTerminalPunctuation(source);
  const whether = source.match(
    /\b(?:central|key)\s+question\b[^.?!]*\bwhether\s+(.+?)[.?!…]*$/iu,
  );
  if (whether?.[1]) {
    const clause = whether[1].trim();
    const invert = clause.match(
      /^(.+?)\s+(can|will|should|could|would|does|is|are)\s+(.+)$/iu,
    );
    if (invert?.[1] && invert[2] && invert[3]) {
      const modal = `${invert[2][0]!.toUpperCase()}${invert[2].slice(1).toLowerCase()}`;
      return `${modal} ${invert[1]} ${invert[3].replace(/[.?!…]+$/u, "")}?`;
    }
    return `Whether ${clause.replace(/[.?!…]+$/u, "")}?`;
  }
  return ensureTerminalPunctuation(source);
}

const MATCHUP_SIDE_SKIP = new Set([
  ...OPENING_SKIP,
  "tactical",
  "analysis",
  "clash",
  "fixture",
  "meeting",
]);

function spokenMatchupSides(topic: string): readonly [string, string] | null {
  const match = topic.match(
    /^(.+?)\s+(?:versus|vs\.?|v\.?|against)\s+(.+)$/iu,
  );
  if (!match) return null;
  const clean = (side: string): string =>
    side
      .split(/\s+/u)
      .filter((word) => {
        const folded = word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
        return folded.length >= 2 && !MATCHUP_SIDE_SKIP.has(folded);
      })
      .join(" ")
      .trim();
  const left = clean(match[1]!);
  const right = clean(match[2]!);
  if (!left || !right || left.toLowerCase() === right.toLowerCase()) {
    return null;
  }
  return [left, right];
}

function resolveParticipants(
  brief: RetentionCompositionBrief,
  topic: string,
): readonly string[] {
  if (brief.requiredParticipants.length >= 2) {
    return brief.requiredParticipants;
  }
  const sides = spokenMatchupSides(topic);
  return sides ?? [];
}

function shortClause(text: string, maxWords: number): string {
  return text
    .replace(/[.!?…]+$/u, "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function compactRankingSentence(
  name: string,
  source: string,
  maxWords: number,
): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let reason = source
    .replace(new RegExp(`^${escaped}\\s*[–—:-]?\\s*`, "iu"), "")
    .replace(/^(?:his|her|their)\s+former\s+club\s+/iu, "")
    .trim();
  reason = reason.replace(
    /\bin the way\s+(.+?)\s+did(?:\s+in\s+(?:his|her|their)\s+time)?(?=[.!?…]|$)/iu,
    "as $1 did",
  );
  const directQuestion = reason.match(
    /^the question is whether\s+(.+?)\s+can\s+(.+)$/iu,
  );
  if (directQuestion?.[1] && directQuestion[2]) {
    reason = `can ${directQuestion[1]} ${directQuestion[2].replace(/[.!?…]+$/u, "")}?`;
  }
  const questionTail = reason.match(
    /^(.+?),\s+(?:and\s+)?the question is whether\s+.+$/iu,
  );
  if (
    questionTail?.[1] &&
    countRetentionNarrationWords(questionTail[1]) >= 4
  ) {
    reason = questionTail[1];
  }
  const allowance = Math.max(
    3,
    maxWords - countRetentionNarrationWords(name),
  );
  const sourceWords = reason.split(/\s+/u).filter(Boolean);
  const removable = new Set([
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on",
    "at", "for", "with", "from", "by", "as", "is", "was", "are",
    "were", "been", "being", "this", "that", "these", "those", "it",
    "its", "their", "his", "her", "they", "also", "very",
  ]);
  const compactWords = sourceWords.filter((word) => {
    const folded = word.toLowerCase().replace(/[^\p{L}\p{N}'-]+/gu, "");
    return folded.length > 0 && !removable.has(folded);
  });
  const preserveQuestionGrammar = /^(?:can|will|should|does|do|is|are)\b/iu.test(
    reason,
  );
  const words = (sourceWords.length <= allowance || preserveQuestionGrammar
    ? sourceWords
    : compactWords)
    .slice(0, allowance);
  while (
    words.length > 3 &&
    /^(?:the|a|an|and|or|but|to|for|from|of|in|on|at|with|whether|is|are)$/iu.test(
      words[words.length - 1]!.replace(/[^\p{L}]+/gu, ""),
    )
  ) {
    words.pop();
  }
  const compact = words.join(" ").replace(/[,:;–—-]+$/u, "").trim();
  return ensureTerminalPunctuation(compact ? `${name}: ${compact}` : name);
}

function toQuestion(source: string, subject: string): string {
  const cleaned = source.replace(/[.!?…]+$/u, "").trim();
  if (/\?$/.test(source.trim())) return `${shortClause(source, 12)}?`;
  if (/^(?:can|what|why|how|does|do|is|are|will|should)\b/iu.test(cleaned)) {
    return `${shortClause(cleaned, 12)}?`;
  }
  const whether = cleaned.match(/\bwhether\s+([\s\S]+)$/iu);
  if (whether) {
    return `Whether ${shortClause(whether[1]!, 10)}?`;
  }
  const label = spokenSubjectLabel(subject);
  const compact = shortClause(cleaned, 8);
  if (compact.toLowerCase().includes(label.toLowerCase())) {
    return `${compact}?`;
  }
  return `${label}: ${compact}?`;
}

function buildOpening(input: {
  readonly preserveOpeningText?: string | null;
  readonly brief: RetentionCompositionBrief;
  readonly contentContract: RetentionCreatorContentContract;
  readonly units: readonly RetentionCreatorContentUnit[];
  readonly thread: RetentionRescueThread;
  readonly topic: string;
  readonly scriptMode: ScriptMode;
}): { readonly text: string; readonly reconciled: boolean } {
  if (
    typeof input.preserveOpeningText === "string" &&
    input.preserveOpeningText.trim().length > 0
  ) {
    return {
      text: ensureTerminalPunctuation(input.preserveOpeningText.trim()),
      reconciled: false,
    };
  }

  const style = input.brief.hookStrategy;
  const subject =
    spokenSubjectLabel(input.topic) ||
    spokenSubjectLabel(input.brief.centralSubject);
  const participants = resolveParticipants(input.brief, input.topic);
  const ranking = input.brief.requiredRankingMembership;
  const conflict = input.brief.intendedConflict;
  const consequence = input.brief.intendedConsequence;
  const question = creatorQuestion(input.units);
  const subjectToken = spokenSubjectLabel(input.brief.centralSubject)
    .split(/\s+/u)
    .find((token) => token.length >= 3);
  const mentionsSubject = (text: string): boolean =>
    Boolean(
      subjectToken && new RegExp(subjectToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text),
    );
  const firstUnit =
    input.units.find(
      (unit) =>
        input.contentContract.essentialContentUnitIds.includes(
          unit.contentUnitId,
        ) && mentionsSubject(unit.text),
    ) ??
    input.units.find((unit) =>
      input.contentContract.essentialContentUnitIds.includes(unit.contentUnitId),
    ) ??
    input.units.find((unit) => mentionsSubject(unit.text)) ??
    input.units[0];
  const optionalTexts = new Set(
    input.contentContract.orderedUnits
      .filter((unit) =>
        input.contentContract.optionalContentUnitIds.includes(unit.contentUnitId),
      )
      .map((unit) => unit.text.trim().toLowerCase()),
  );
  const consequenceIsOptional =
    Boolean(consequence) && optionalTexts.has(consequence!.trim().toLowerCase());
  const conflictIsOptional =
    Boolean(conflict) && optionalTexts.has(conflict!.trim().toLowerCase());
  const consequenceOffSubject =
    Boolean(consequence) &&
    Boolean(firstUnit) &&
    mentionsSubject(firstUnit!.text) &&
    !mentionsSubject(consequence!);
  const conflictOffSubject =
    Boolean(conflict) &&
    Boolean(firstUnit) &&
    mentionsSubject(firstUnit!.text) &&
    !mentionsSubject(conflict!);

  if (input.scriptMode === "top_5" && ranking.length > 0) {
    return {
      text: "Who takes number one?",
      reconciled: style !== "countdown_tease" && style !== "auto",
    };
  }

  if (participants.length >= 2 && input.scriptMode !== "top_5") {
    const [left, right] = participants;
    return {
      text: `Can ${left} answer ${right}?`,
      reconciled: style === "countdown_tease",
    };
  }

  if (input.scriptMode === "match_recap" && firstUnit) {
    return {
      text: toQuestion(shortClause(firstUnit.text, 8), subject),
      reconciled: false,
    };
  }

  const autoLike =
    style === "provocative_question" ||
    style === "auto" ||
    style === "cold_open" ||
    style === "curiosity_gap";

  if (question && autoLike) {
    return { text: `${shortClause(question, 12)}?`, reconciled: false };
  }

  if (
    conflict &&
    !conflictIsOptional &&
    !conflictOffSubject &&
    autoLike &&
    input.scriptMode !== "match_recap"
  ) {
    return {
      text: toQuestion(shortClause(conflict, 12), subject),
      reconciled: false,
    };
  }

  if (
    conflict &&
    (style === "stakes_first" ||
      style === "headline_first" ||
      style === "cold_open" ||
      style === "contrarian_claim" ||
      style === "myth_challenge")
  ) {
    return {
      text: ensureTerminalPunctuation(shortClause(conflict, 12)),
      reconciled: false,
    };
  }

  if (style === "curiosity_gap" && (conflict || consequence || firstUnit)) {
    const teaseSource =
      (conflict && !conflictIsOptional ? conflict : null) ??
      (consequence && !consequenceIsOptional ? consequence : null) ??
      firstUnit?.text;
    const tease = shortClause(
      teaseSource ?? firstUnit!.text,
      10,
    );
    return {
      text: ensureTerminalPunctuation(`${tease} is not the last word`),
      reconciled: false,
    };
  }

  const styleNeedsQuestion =
    style === "provocative_question" || style === "countdown_tease";
  const styleNeedsRanking = style === "countdown_tease";

  if (
    consequence &&
    !conflict &&
    !consequenceIsOptional &&
    !consequenceOffSubject &&
    shortClause(consequence, 12).toLowerCase() !==
      shortClause(input.topic, 12).toLowerCase()
  ) {
    if (autoLike) {
      return {
        text: toQuestion(shortClause(consequence, 12), subject),
        reconciled: false,
      };
    }
    return {
      text: ensureTerminalPunctuation(shortClause(consequence, 12)),
      reconciled: styleNeedsQuestion || styleNeedsRanking,
    };
  }

  if (conflict) {
    return {
      text: ensureTerminalPunctuation(shortClause(conflict, 12)),
      reconciled: styleNeedsRanking || style === "provocative_question",
    };
  }

  if (participants.length >= 2) {
    const cue = /\btactical\b/iu.test(input.topic)
      ? "tactical preview"
      : /\brecap\b/iu.test(input.topic)
        ? "recap"
        : /\bpreview\b/iu.test(input.topic)
          ? "preview"
          : "meeting";
    return {
      text: ensureTerminalPunctuation(
        `${participants[0]} meet ${participants[1]} in this ${cue}`,
      ),
      reconciled: true,
    };
  }

  if (firstUnit) {
    const clause = shortClause(firstUnit.text, 12);
    const weakNounPhrase =
      countRetentionNarrationWords(clause) <= 3 &&
      !/^(?:can|what|why|how|does|do|is|are|will|should|who)\b/iu.test(clause);
    if (weakNounPhrase || isIncompleteSubjectLabel(subject)) {
      return {
        text: declarativeOpening(input.brief.centralSubject, clause),
        reconciled: true,
      };
    }
    return {
      text: `${clause}?`,
      reconciled: true,
    };
  }

  return {
    text: isIncompleteSubjectLabel(subject)
      ? declarativeOpening(input.brief.centralSubject)
      : tensionQuestion(subject),
    reconciled: true,
  };
}

function tensionQuestion(subject: string): string {
  const label = spokenSubjectLabel(subject).replace(/^the\s+/iu, "");
  if (!label || isIncompleteSubjectLabel(label)) {
    return declarativeOpening(subject);
  }
  const words = label.split(/\s+/u).filter(Boolean);
  const personLike =
    words.length >= 2 &&
    words.length <= 3 &&
    words.every((word) => /^\p{Lu}/u.test(word));
  if (personLike) {
    return `Can ${label} still answer?`;
  }
  return ensureTerminalPunctuation(`${label} remains the subject`);
}

function capOpening(text: string): string {
  const deRisked = text
    .replace(/\b(?:in|on|at|of|from|during)\s+(?:19|20)\d{2}\b/giu, "")
    .replace(/\b(?:19|20)\d{2}\b/gu, "")
    .replace(/\b\d+(?:\.\d+)?\b/gu, "")
    // Remove dash punctuation without splitting hyphenated names.
    .replace(/\s+[–—-]\s+|\s*[–—]\s*/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const words = (deRisked || text.trim())
    .replace(/[.!?…]+$/u, "")
    .split(/\s+/u)
    .filter(Boolean)
    .filter((word, index, all) => {
      const folded = word.toLowerCase();
      if (index === 0 && (folded === "the" || folded === "a" || folded === "an")) {
        return false;
      }
      if (
        index === all.length - 1 &&
        /^(?:the|a|an|in|on|at|of|for|from|during|to)$/u.test(folded)
      ) {
        return false;
      }
      return true;
    })
    .slice(0, 5);
  if (words.length === 0) return text.trim();
  const joined = words.join(" ");
  const capped = `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
  const alreadyDeclarative =
    /[.!]$/u.test(text.trim()) &&
    words.length >= 4 &&
    !/^(?:can|does|do|is|are|will|should|who|what|why|how|whether)\b/iu.test(capped);
  if (alreadyDeclarative) {
    return words.length <= 5 ? `${capped}?` : ensureTerminalPunctuation(capped);
  }
  const weakLead =
    /^(?:how|what|why)\b/iu.test(capped) &&
    !/\b(?:can|does|do|is|are|will|should)\b/iu.test(capped);
  const question =
    /^(?:can|does|do|is|are|will|should|who|whether)\b/iu.test(capped) &&
    !weakLead
      ? `${capped}?`
      : tensionQuestion(capped);
  const limited = question
    .replace(/[.!?…]+$/u, "")
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
  return `${limited}?`;
}

function buildPayoff(input: {
  readonly brief: RetentionCompositionBrief;
  readonly contentContract: RetentionCreatorContentContract;
  readonly units: readonly RetentionCreatorContentUnit[];
  readonly opening: string;
  readonly scriptMode: ScriptMode;
  readonly thread: RetentionRescueThread;
  readonly topic: string;
}): string {
  const consequence = input.brief.intendedConsequence;
  const conflict = input.brief.intendedConflict;
  const ranking = input.brief.requiredRankingMembership;
  const participants = resolveParticipants(input.brief, input.topic);
  const last = input.units[input.units.length - 1];

  if (input.scriptMode === "top_5" && ranking[0]) {
    const numberOneTokens = ranking[0].split(/\s+/u).filter(Boolean);
    const numberOneQuestion = input.units.find(
      (unit) =>
        numberOneTokens.some((token) => unit.text.includes(token)) &&
        /\b(?:the question is )?whether\b/iu.test(unit.text),
    );
    const whether = numberOneQuestion?.text.match(
      /\b(?:the question is )?whether\s+(.+?)\s+can\s+(.+?)[.!?…]*$/iu,
    );
    if (whether?.[1] && whether[2]) {
      const action = shortClause(
        whether[2].replace(/^(?:now|still)\s+/iu, ""),
        6,
      );
      return `${ranking[0]} is number one, but can ${whether[1]} ${action}?`;
    }
    return ensureTerminalPunctuation(
      `${ranking[0]} stands last as the number-one name`,
    );
  }

  // Payoff authority comes from the full creator contract, not only the body
  // allocation. A rich brief's central question must not disappear merely
  // because earlier facts consumed the short-form body budget.
  const suppliedQuestion = creatorQuestion(input.contentContract.orderedUnits);
  if (
    suppliedQuestion &&
    suppliedQuestion.toLowerCase() !== input.opening.toLowerCase()
  ) {
    return suppliedQuestion;
  }

  if (consequence) {
    const spoken = ensureTerminalPunctuation(
      compressRetentionClaimLinkedNarration(consequence, 18),
    );
    const topicLike =
      shortClause(consequence, 12).toLowerCase() ===
      shortClause(input.topic, 12).toLowerCase();
    if (
      spoken !== input.opening &&
      !containsScaffold(spoken) &&
      !topicLike
    ) {
      return spoken;
    }
  }

  if (
    participants.length >= 2 &&
    input.scriptMode !== "match_recap" &&
    input.scriptMode !== "top_5"
  ) {
    return ensureTerminalPunctuation(
      `Whether ${participants[0]} or ${participants[1]} take the result stays open`,
    );
  }

  if (input.scriptMode === "match_recap" && last) {
    return ensureTerminalPunctuation(
      compressRetentionClaimLinkedNarration(
        input.contentContract.intendedConsequence ?? last.text,
        16,
      ),
    );
  }

  if (input.scriptMode === "opinion_debate") {
    const uncertain =
      input.brief.requiredUncertaintyLanguage[0] ??
      input.contentContract.requiredUncertaintyLanguage[0] ??
      "may";
    const close = compressRetentionClaimLinkedNarration(
      consequence ?? conflict ?? last?.text ?? input.brief.controllingIdea,
      14,
    );
    if (new RegExp(`\\b${uncertain}\\b`, "iu").test(close)) {
      return ensureTerminalPunctuation(close);
    }
    return ensureTerminalPunctuation(`The reading ${uncertain} still stand`);
  }

  if (conflict && ensureTerminalPunctuation(conflict) !== input.opening) {
    return ensureTerminalPunctuation(
      compressRetentionClaimLinkedNarration(conflict, 16),
    );
  }

  if (last) {
    const spoken = ensureTerminalPunctuation(
      compressRetentionClaimLinkedNarration(last.text, 16),
    );
    if (spoken !== input.opening) return spoken;
  }

  return ensureTerminalPunctuation(
    declarativeOpening(input.brief.centralSubject, last?.text),
  );
}

function orderUnitsForMode(
  scriptMode: ScriptMode,
  units: readonly RetentionCreatorContentUnit[],
): RetentionCreatorContentUnit[] {
  if (units.length <= 1) return [...units];
  const copy = [...units];
  if (scriptMode === "historical_explainer") {
    const present = copy.filter((unit) =>
      /\b(?:today|still|now|present)\b/iu.test(unit.text),
    );
    const rest = copy.filter((unit) => !present.includes(unit));
    return [...rest, ...present];
  }
  if (scriptMode === "match_recap") {
    const result = copy.filter((unit) =>
      /\b(?:beat|won|nil|result)\b/iu.test(unit.text),
    );
    const turn = copy.filter((unit) =>
      /\b(?:turning|switch|then)\b/iu.test(unit.text),
    );
    const rest = copy.filter(
      (unit) => !result.includes(unit) && !turn.includes(unit),
    );
    return [...result, ...rest, ...turn.filter((unit) => !result.includes(unit))];
  }
  if (scriptMode === "opinion_debate") {
    const thesis = copy.filter((unit) => unit.kind === "interpretive");
    const uncertain = copy.filter((unit) => unit.kind === "uncertain");
    const rest = copy.filter(
      (unit) => !thesis.includes(unit) && !uncertain.includes(unit),
    );
    return [...thesis, ...rest, ...uncertain];
  }
  return copy;
}

function selectUnits(input: {
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief: RetentionCompositionBrief;
  readonly hardBudget: number;
}): {
  readonly selected: RetentionCreatorContentUnit[];
  readonly usedContentUnitIds: string[];
  readonly omittedContentUnitIds: string[];
} {
  const byId = new Map(
    input.contentContract.orderedUnits.map((unit) => [
      unit.contentUnitId,
      unit,
    ]),
  );
  const selected: RetentionCreatorContentUnit[] = [];
  const used: string[] = [];
  const omitted: string[] = [];
  let remaining = Math.max(
    10,
    Math.floor(input.hardBudget * (input.hardBudget <= 72 ? 0.52 : 0.7)),
  );

  const take = (id: string, force: boolean) => {
    const unit = byId.get(id);
    if (!unit || !isAllocatable(unit)) return;
    if (used.includes(id)) return;
    const cost = Math.max(3, countRetentionNarrationWords(unit.text));
    if (!force && (cost > remaining || remaining < 10) && selected.length > 0) {
      omitted.push(id);
      return;
    }
    selected.push(unit);
    used.push(id);
    remaining = Math.max(0, remaining - Math.min(remaining, cost));
  };

  for (const name of input.brief.requiredRankingMembership) {
    const match = input.contentContract.orderedUnits.find(
      (unit) => isAllocatable(unit) && unit.text.includes(name),
    );
    if (match) take(match.contentUnitId, true);
  }
  for (const id of input.brief.orderedEssentialUnitIds) take(id, true);
  for (const id of input.brief.orderedOptionalUnitIds) {
    if (input.brief.excludedOptionalClaimIds.includes(id)) {
      omitted.push(id);
      continue;
    }
    take(id, false);
  }

  return {
    selected,
    usedContentUnitIds: used,
    omittedContentUnitIds: [
      ...omitted,
      ...input.contentContract.orderedUnits
        .filter(
          (unit) =>
            unit.kind === "forbidden" ||
            (isAllocatable(unit) && !used.includes(unit.contentUnitId)),
        )
        .map((unit) => unit.contentUnitId)
        .filter((id) => !omitted.includes(id) && !used.includes(id)),
    ],
  };
}

function stitchNarration(input: {
  readonly opening: string;
  readonly payoff: string;
  readonly units: readonly RetentionCreatorContentUnit[];
  readonly thread: RetentionRescueThread;
  readonly tone: Tone;
  readonly scriptMode: ScriptMode;
  readonly brief: RetentionCompositionBrief;
  readonly grounding: RetentionGroundingContext | null;
  readonly factHandlingMode: NormalizedStoryContract["factHandlingMode"];
  readonly hardBudget: number;
  readonly topic: string;
}): {
  readonly narration: string;
  readonly hookOpening: string;
  readonly payoffClosing: string;
  readonly usedClaimIds: string[];
  readonly usedContentUnitIds: string[];
} {
  const opening = ensureTerminalPunctuation(input.opening);
  const payoff = ensureTerminalPunctuation(input.payoff);
  const usedClaimIds: string[] = [];
  const usedContentUnitIds: string[] = [];
  const bodyParts: string[] = [];
  let remaining =
    input.hardBudget -
    countRetentionNarrationWords(opening) -
    countRetentionNarrationWords(payoff);

  const openingNorm = opening.toLowerCase();
  const payoffNorm = payoff.toLowerCase();
  const ordered = orderUnitsForMode(input.scriptMode, input.units);

  if (input.scriptMode === "top_5" && input.brief.requiredRankingMembership.length > 0) {
    const members = input.brief.requiredRankingMembership;
    for (const [index, name] of members.entries()) {
      const unit = ordered.find((entry) => entry.text.includes(name));
      if (!unit) {
        bodyParts.push(ensureTerminalPunctuation(name));
        continue;
      }
      const remainingMembers = Math.max(1, members.length - index);
      const memberBudget = Math.max(
        7,
        Math.min(20, remaining - (remainingMembers - 1) * 7),
      );
      const text = compactRankingSentence(name, unit.text, memberBudget);
      if (text.toLowerCase() === openingNorm) continue;
      bodyParts.push(text);
      if (unit.claimId) usedClaimIds.push(unit.claimId);
      usedContentUnitIds.push(unit.contentUnitId);
      remaining -= countRetentionNarrationWords(text);
    }
  } else {
    let bodyIndex = 0;
    for (const unit of ordered) {
      const spokenRaw = speakUnit(
        unit,
        Math.max(8, remaining),
        input.grounding,
        input.factHandlingMode,
      );
      if (!spokenRaw) continue;
      const spoken =
        input.thread === "return_redemption"
          ? {
              ...spokenRaw,
              text: compactReturnRedemptionSentence(spokenRaw.text),
            }
          : spokenRaw;
      const folded = spoken.text.toLowerCase();
      if (folded === openingNorm || folded === payoffNorm) continue;
      if (folded === input.brief.centralSubject.toLowerCase()) continue;
      if (folded.slice(0, 24) === openingNorm.slice(0, 24)) continue;
      if (
        folded === input.topic.toLowerCase() ||
        shortClause(spoken.text, 12).toLowerCase() ===
          shortClause(input.topic, 12).toLowerCase()
      ) {
        continue;
      }
      if (bodyParts.some((part) => part.toLowerCase() === folded)) continue;
      const prefix = connectorFor(
        input.thread,
        input.tone,
        bodyIndex,
        spoken.text,
      );
      const next = prefix ? `${prefix}${spoken.text}` : spoken.text;
      if (containsScaffold(next)) {
        bodyParts.push(spoken.text);
      } else {
        bodyParts.push(ensureTerminalPunctuation(next));
      }
      usedClaimIds.push(...spoken.claimIds);
      usedContentUnitIds.push(...spoken.contentUnitIds);
      remaining -= countRetentionNarrationWords(spoken.text);
      bodyIndex += 1;
      if (remaining <= 4) break;
    }
  }

  const uniqueBody: string[] = bodyParts.filter((part, index, all) => {
    const folded = part.toLowerCase();
    if (folded === openingNorm || folded === payoffNorm) {
      return false;
    }
    if (folded.slice(0, 24) === openingNorm.slice(0, 24)) {
      return false;
    }
    return all.findIndex((other) => other.toLowerCase() === folded) === index;
  });

  let closing = payoff;
  if (
    (closing.toLowerCase() === openingNorm ||
      closing.toLowerCase().slice(0, 24) === openingNorm.slice(0, 24)) &&
    uniqueBody.length > 0
  ) {
    closing = uniqueBody.pop()!;
  }
  if (
    uniqueBody.some(
      (part) => part.toLowerCase().slice(0, 24) === closing.toLowerCase().slice(0, 24),
    )
  ) {
    uniqueBody.splice(
      uniqueBody.findIndex(
        (part) =>
          part.toLowerCase().slice(0, 24) === closing.toLowerCase().slice(0, 24),
      ),
      1,
    );
  }
  if (closing.toLowerCase().slice(0, 24) === openingNorm.slice(0, 24)) {
    closing = uniqueBody[uniqueBody.length - 1] ?? opening;
  }
  const stitchParticipants = resolveParticipants(input.brief, input.topic);
  if (
    uniqueBody.length === 0 &&
    stitchParticipants.length >= 2 &&
    input.scriptMode !== "match_recap" &&
    input.scriptMode !== "top_5"
  ) {
    const [left, right] = stitchParticipants;
    const cue = /\btactical\b/iu.test(input.brief.controllingIdea + input.brief.centralSubject)
      ? "tactical meeting"
      : "meeting";
    uniqueBody.push(
      ensureTerminalPunctuation(`${left} meet ${right} in this ${cue}`),
    );
  }
  if (input.thread === "factual_summary" && uniqueBody.length === 0) {
    closing =
      countRetentionNarrationWords(opening) >= 4
        ? opening
        : ensureTerminalPunctuation(opening);
  }

  const pieces = [opening, ...uniqueBody];
  if (closing.toLowerCase() !== openingNorm) pieces.push(closing);
  const narration = pieces
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();

  return {
    narration,
    hookOpening: opening,
    payoffClosing: closing === opening && uniqueBody.length === 0 ? opening : closing,
    usedClaimIds: [...new Set(usedClaimIds)],
    usedContentUnitIds: [...new Set(usedContentUnitIds)],
  };
}

function applyTone(narration: string, tone: Tone): string {
  return applyRetentionTonePresentation(narration, tone);
}

function ensureParticipants(
  narration: string,
  contract: NormalizedStoryContract,
): string {
  const coverage = buildRetentionParticipantCoverage(contract);
  if (!coverage.required || coverage.groups.length < 2) return narration;
  const evaluation = evaluateRetentionParticipantCoverage({
    coverage,
    narration,
  });
  if (evaluation.passed) return narration;
  const labels = coverage.groups.map((group) => group.displayLabel);
  const insert = ensureTerminalPunctuation(`${labels[0]} meet ${labels[1]}`);
  return `${insert} ${narration}`.replace(/\s+/gu, " ").trim();
}

function preserveUncertainty(
  narration: string,
  required: readonly string[],
  units: readonly RetentionCreatorContentUnit[],
): string {
  const spoken = new Set(
    narration
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(Boolean),
  );
  const missing = required.filter((token) => !spoken.has(token.toLowerCase()));
  if (missing.length === 0) return narration;
  const source = units.find((unit) =>
    missing.some((token) => new RegExp(`\\b${token}\\b`, "iu").test(unit.text)),
  );
  if (!source) return narration;
  const extra = ensureTerminalPunctuation(
    compressRetentionClaimLinkedNarration(source.text, 12),
  );
  if (narration.includes(extra)) return narration;
  return `${narration} ${extra}`.replace(/\s+/gu, " ").trim();
}

function fitHardBudget(narration: string, hardBudget: number): string {
  if (countRetentionNarrationWords(narration) <= hardBudget) return narration;
  // Presentation connectives are optional. Remove one before sacrificing a
  // creator fact or ranking member when the narration only narrowly overruns.
  const withoutClosingLead = narration.replace(
    /(?<=[.!?…]\s)(?:Then|And|Now|Next)\s+(?=\p{Lu})/u,
    "",
  );
  if (countRetentionNarrationWords(withoutClosingLead) <= hardBudget) {
    return withoutClosingLead;
  }
  const sentences = narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  if (sentences.length >= 3) {
    const opening = sentences[0]!;
    const closing = sentences[sentences.length - 1]!;
    const kept = [opening];
    for (const sentence of sentences.slice(1, -1)) {
      const next = [...kept, sentence, closing].join(" ");
      if (countRetentionNarrationWords(next) > hardBudget) continue;
      kept.push(sentence);
    }
    const complete = [...kept, closing].join(" ");
    if (countRetentionNarrationWords(complete) <= hardBudget) return complete;
  }
  return ensureTerminalPunctuation(
    compressRetentionClaimLinkedNarration(narration, hardBudget),
  );
}

function resolveStrategySeed(input: {
  readonly strategySeed?: RetentionStrategySeed | null;
  readonly contract: NormalizedStoryContract;
  readonly grounding?: RetentionGroundingContext | null;
}): RetentionStrategySeed | null {
  if (input.strategySeed) return input.strategySeed;
  if (!input.grounding) return null;
  try {
    const result = buildDeterministicRetentionStrategySeed({
      contract: input.contract,
      grounding: input.grounding,
    });
    return result.status === "ready" ? result.seed : null;
  } catch {
    return null;
  }
}

function fallbackTitle(
  scriptMode: ScriptMode,
  subject: string,
  thread: RetentionRescueThread,
): string {
  const label = spokenSubjectLabel(subject) || "The known facts";
  if (scriptMode === "tactical_review") return `${label}: the tactical question`;
  if (scriptMode === "historical_explainer") return `${label}: the turning point`;
  if (scriptMode === "player_analysis") return `${label}: under pressure`;
  if (scriptMode === "opinion_debate") return `${label}: the case`;
  if (scriptMode === "top_5") return `${label}: the ranking`;
  if (scriptMode === "match_preview") return `${label}: the meeting`;
  if (scriptMode === "match_recap") return `${label}: how it turned`;
  if (thread === "factual_summary") return `${label}: the known facts`;
  return `${label}: the available story`;
}

export function buildRetentionCoherentDeterministicRescue(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding?: RetentionGroundingContext | null;
  readonly title?: string;
  readonly preserveOpeningText?: string | null;
  readonly contentContract?: RetentionCreatorContentContract | null;
  readonly compositionBrief?: RetentionCompositionBrief | null;
  readonly strategySeed?: RetentionStrategySeed | null;
  readonly hookStyle?: string | null;
}): DeterministicFallbackBuildResult {
  rescueRuntime.canonicalInvocations += 1;
  const subject =
    resolveRetentionDeterministicSubjectAnchor(input.contract.topic) ??
    input.contract.topic;
  const grounding = input.grounding ?? null;
  const contentContract =
    input.contentContract ??
    (grounding
      ? buildRetentionCreatorContentContract({
          contract: input.contract,
          grounding,
          centralSubject: subject,
          hookStyle: input.hookStyle ?? null,
        })
      : buildRetentionCreatorContentContract({
          contract: input.contract,
          grounding: {
            version: 1,
            researchIdentity: null,
            claims: [],
          },
          centralSubject: subject,
          hookStyle: input.hookStyle ?? null,
        }));
  const brief =
    input.compositionBrief ??
    buildRetentionCompositionBrief({
      contract: input.contract,
      contentContract,
      hookStyle: (input.hookStyle ??
        contentContract.presentationSettings.hookStyle) as RetentionHookStrategyId,
    });
  const hardBudget = Math.max(
    8,
    brief.durationUtilisation.storyHardWordBudget ||
      input.plan.compressionGoals.targetWordBudget,
  );
  const picked = selectUnits({
    contentContract,
    brief,
    hardBudget,
  });
  const thread = selectThread(
    input.contract.scriptMode,
    contentContract,
    brief,
    picked.selected,
  );
  const openingRaw = buildOpening({
    preserveOpeningText: input.preserveOpeningText,
    brief,
    contentContract,
    units: picked.selected,
    thread,
    topic: input.contract.topic,
    scriptMode: input.contract.scriptMode,
  });
  const opening = {
    text:
      input.preserveOpeningText?.trim()
        ? openingRaw.text
        : capOpening(openingRaw.text),
    reconciled: openingRaw.reconciled,
  };
  const payoff = buildPayoff({
    brief,
    contentContract,
    units: picked.selected,
    opening: opening.text,
    scriptMode: input.contract.scriptMode,
    thread,
    topic: input.contract.topic,
  });
  const stitched = stitchNarration({
    opening: opening.text,
    payoff,
    units: picked.selected,
    thread,
    tone: input.contract.tone,
    scriptMode: input.contract.scriptMode,
    brief,
    grounding,
    factHandlingMode: input.contract.factHandlingMode ?? "verified_facts_only",
    hardBudget,
    topic: input.contract.topic,
  });
  let narration = applyTone(stitched.narration, input.contract.tone);
  narration = ensureParticipants(narration, input.contract);
  narration = preserveUncertainty(
    narration,
    brief.requiredUncertaintyLanguage,
    picked.selected,
  );
  narration = fitHardBudget(narration, hardBudget).replace(/\s+/gu, " ").trim();
  if (containsScaffold(narration)) {
    const stripped = picked.selected
      .map((unit) => ensureTerminalPunctuation(unit.text.trim()))
      .filter((text) => text && !containsScaffold(text))
      .join(" ");
    narration = fitHardBudget(
      (stripped || opening.text).replace(/\s+/gu, " ").trim(),
      hardBudget,
    );
  }

  const allocation = allocateRetentionCreatorContentUnits({
    contentContract,
    beatCount: input.plan.beatPlan.beats.length,
    storyWordBudget: hardBudget,
  });
  const usedClaimIds = [
    ...new Set([
      ...stitched.usedClaimIds,
      ...picked.selected
        .map((unit) => unit.claimId)
        .filter((id): id is string => Boolean(id)),
    ]),
  ];
  const seed = resolveStrategySeed({
    strategySeed: input.strategySeed,
    contract: input.contract,
    grounding,
  });

  const hookOpening = stitched.hookOpening;
  const payoffClosing = stitched.payoffClosing;
  const mapped = seed && grounding
    ? mapRetentionNarrationToBeats({
        narration,
        plan: input.plan,
        grounding,
        strategySeed: seed,
        usedClaimIds,
        hookOpening,
        payoffClosing,
        allowEmptyInternalBeats: true,
      })
    : {
        segments: (() => {
          const beats = input.plan.beatPlan.beats;
          const sentences = narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
          const mappedTexts = beats.map(() => "");
          if (beats.length === 1) {
            mappedTexts[0] = narration;
          } else {
            mappedTexts[0] = sentences[0] ?? narration;
            const remaining = sentences.slice(1);
            const internalSlots = Math.max(0, beats.length - 2);
            if (internalSlots === 0) {
              mappedTexts[mappedTexts.length - 1] = remaining.join(" ");
            } else {
              const payoff = remaining.pop() ?? "";
              for (let index = 0; index < internalSlots; index += 1) {
                const start = Math.floor((index * remaining.length) / internalSlots);
                const end = Math.floor(((index + 1) * remaining.length) / internalSlots);
                mappedTexts[index + 1] = remaining.slice(start, end).join(" ");
              }
              mappedTexts[mappedTexts.length - 1] = payoff;
            }
          }
          return beats.map((beat, index) => {
            const text = mappedTexts[index] ?? "";
          return Object.freeze({
            beatId: beat.id,
            text,
            claimRefs: Object.freeze([] as string[]),
            factualRisk: detectRetentionFactualRisk(text).risky,
          });
          });
        })(),
      };
  const segments = mapped.segments.map((segment) =>
    !segment.factualRisk
      ? Object.freeze({
          ...segment,
          claimRefs: Object.freeze([] as string[]),
        })
      : segment,
  );

  const usedClaimTexts = (grounding?.claims ?? [])
    .filter((claim) => usedClaimIds.includes(claim.claimId))
    .map((claim) => claim.text);
  const safeSegments = segments.map((segment) => {
    const authorized = seed
      ? resolveAuthorizedClaimIdsForBeat(segment.beatId, input.plan, seed)
      : new Set<string>();
    const authorizedRefs = segment.claimRefs.filter((claimId) =>
      authorized.has(claimId),
    );
    if (segment.factualRisk && grounding) {
      const mode =
        input.contract.factHandlingMode ?? "verified_facts_only";
      const supported = authorizedRefs.filter((claimId) =>
        claimRefsSupportLinkedNarrationStatement(
          grounding,
          [claimId],
          segment.text,
          mode,
        ),
      );
      if (supported.length > 0) {
        return Object.freeze({
          ...segment,
          claimRefs: Object.freeze(supported.slice(0, 4)),
        });
      }
      const rebound = usedClaimIds.find(
        (claimId) =>
          authorized.has(claimId) &&
          claimRefsSupportLinkedNarrationStatement(
            grounding,
            [claimId],
            segment.text,
            mode,
          ),
      );
      if (rebound) {
        return Object.freeze({
          ...segment,
          claimRefs: Object.freeze([rebound]),
        });
      }
    }
    if (segment.factualRisk && segment.claimRefs.length === 0 && seed && grounding) {
      const authorized = resolveAuthorizedClaimIdsForBeat(
        segment.beatId,
        input.plan,
        seed,
      );
      const tokens = segment.text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length >= 4);
      const supporting = usedClaimIds.find((claimId) => {
        if (!authorized.has(claimId)) return false;
        const claim = grounding.claims.find((entry) => entry.claimId === claimId);
        if (!claim) return false;
        const claimTokens = claim.text
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((token) => token.length >= 4);
        return tokens.some((token) => claimTokens.includes(token));
      });
      if (supporting) {
        return Object.freeze({
          ...segment,
          claimRefs: Object.freeze([supporting]),
        });
      }
    }
    if (!segment.factualRisk || segment.claimRefs.length > 0) return segment;
    const digits = segment.text.match(/(?:19|20)\d{2}|\d+(?:\.\d+)?/g) ?? [];
    const authorisedDigits =
      digits.length > 0 &&
      digits.every((digit) =>
        usedClaimTexts.some((text) => text.includes(digit)),
      );
    if (authorisedDigits) {
      const authorized = seed
        ? resolveAuthorizedClaimIdsForBeat(segment.beatId, input.plan, seed)
        : new Set<string>();
      const supporting = usedClaimIds.filter((claimId) => {
        if (!authorized.has(claimId)) return false;
        const claim = grounding?.claims.find((entry) => entry.claimId === claimId);
        return Boolean(claim && digits.every((digit) => claim!.text.includes(digit)));
      });
      if (supporting.length > 0) {
        return Object.freeze({
          ...segment,
          claimRefs: Object.freeze(supporting.slice(0, 4)),
          factualRisk: true,
        });
      }
    }
    return segment;
  });

  const assembleFrom = (drafts: readonly RetentionSegmentDraft[]) =>
    assembleRetentionNarrationCandidate({
      origin: "final",
      planFingerprint: input.plan.planFingerprint,
      orderedBeatIds: input.plan.beatPlan.beats.map((beat) => beat.id),
      segments: drafts,
      assemblyGap: " ",
    });

  let candidate = assembleFrom(safeSegments);
  if (candidate.assembledNarration !== narration) {
    const retrySegments =
      seed && grounding
        ? mapRetentionNarrationToBeats({
            narration,
            plan: input.plan,
            grounding,
            strategySeed: seed,
            usedClaimIds,
            hookOpening,
            payoffClosing,
            allowEmptyInternalBeats: true,
          }).segments
        : mapped.segments;
    candidate = assembleFrom(
      retrySegments.map((segment) =>
        Object.freeze({
          ...segment,
          claimRefs: segment.factualRisk
            ? segment.claimRefs
            : Object.freeze([] as string[]),
        }),
      ),
    );
    if (candidate.assembledNarration !== narration) {
      throw new Error("rescue_mapping_lost_accepted_narration");
    }
  }

  const finalUsed = new Set<string>();
  for (const segment of candidate.segments) {
    for (const ref of segment.claimRefs) finalUsed.add(ref);
  }
  for (const claimId of usedClaimIds) {
    const claim = grounding?.claims.find((entry) => entry.claimId === claimId);
    if (!claim) continue;
    const tokens = claim.text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 4);
    if (
      tokens.some((token) =>
        candidate.assembledNarration.toLowerCase().includes(token),
      )
    ) {
      finalUsed.add(claimId);
    }
  }
  const authorizedClaimIds = new Set<string>();
  for (const beat of input.plan.beatPlan.beats) {
    for (const ref of beat.groundingClaimRefs) authorizedClaimIds.add(ref);
  }
  const omittedClaimIds = [...authorizedClaimIds].filter(
    (id) => !finalUsed.has(id),
  );
  const lowContextWarning =
    brief.lowContextWarning ||
    thread === "factual_summary" ||
    picked.selected.length <= 1 ||
    countRetentionNarrationWords(candidate.assembledNarration) <
      Math.max(8, Math.floor(brief.durationUtilisation.minimumUsefulWords * 0.55));

  return {
    title:
      input.title?.trim() ||
      fallbackTitle(input.contract.scriptMode, brief.centralSubject, thread),
    candidate,
    omittedClaimIds: Object.freeze(omittedClaimIds),
    usedClaimIds: Object.freeze([...finalUsed]),
    omittedContentUnitIds: Object.freeze([
      ...new Set([
        ...picked.omittedContentUnitIds,
        ...allocation.omittedOptionalContentUnitIds,
        ...allocation.omittedEssentialContentUnitIds,
      ]),
    ]),
    usedContentUnitIds: Object.freeze([
      ...new Set([
        ...picked.usedContentUnitIds,
        ...stitched.usedContentUnitIds,
      ]),
    ]),
    coverageWarning: allocation.coverageWarning || omittedClaimIds.length > 0,
    lowContextWarning,
    hookOpening,
    payoffClosing,
    thread,
    hookReconciled: opening.reconciled,
  };
}

/** @deprecated Use buildRetentionCoherentDeterministicRescue. */
export function buildDeterministicFallbackNarrationCandidate(
  input: Parameters<typeof buildRetentionCoherentDeterministicRescue>[0],
): DeterministicFallbackBuildResult {
  return buildRetentionCoherentDeterministicRescue(input);
}
