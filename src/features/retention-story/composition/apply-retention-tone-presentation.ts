/**
 * Bounded deterministic tone presentation — story-quality Prompt 5.
 * Tone may change connectives, cadence, and emphasis only.
 */

import type { Tone } from "@/types/footiebitz";

import { statementHasRetentionDateSignal } from "../strategy/retention-factual-risk";

const MONTHS =
  /^(?:january|february|march|april|june|july|august|september|october|november|december)$/u;

const UNCERTAINTY = new Set([
  "may",
  "might",
  "maybe",
  "perhaps",
  "possibly",
  "reportedly",
  "allegedly",
  "unconfirmed",
  "uncertain",
  "unclear",
]);

const SENTENCE_LEAD: Record<Tone, string> = {
  news: "",
  dramatic: "Now",
  funny: "And",
  emotional: "Now",
  tactical: "Next",
};

const CLAUSE_AND: Record<Tone, string> = {
  news: " and ",
  dramatic: " — ",
  funny: ", and ",
  emotional: ", and now ",
  tactical: ", then ",
};

function tokenizeInvariant(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .filter((token) => {
      if (/\d/.test(token)) return true;
      if (MONTHS.test(token)) return true;
      if (token === "may") return statementHasRetentionDateSignal(text);
      if (UNCERTAINTY.has(token)) return true;
      return false;
    });
}

const NAME_SKIP = new Set([
  "then",
  "and",
  "now",
  "next",
  "the",
  "a",
  "an",
  "but",
  "or",
  "this",
  "that",
]);

function properNameTokens(text: string): string[] {
  return (
    text
      .normalize("NFC")
      .match(/\b\p{Lu}[\p{L}\p{N}'’-]*\b/gu)
      ?.map((token) => token.toLowerCase())
      .filter((token) => token.length >= 3 && !NAME_SKIP.has(token)) ?? []
  );
}

/** Names, numbers, dates, scores, and uncertainty markers that tone must not alter. */
export function extractRetentionPresentationInvariantTokens(text: string): string[] {
  return [...tokenizeInvariant(text), ...properNameTokens(text)].sort((a, b) =>
    a.localeCompare(b),
  );
}

function isProperRun(word: string): boolean {
  return /^\p{Lu}[\p{L}\p{N}'’-]*$/u.test(word);
}

function replaceStandaloneAnd(sentence: string, replacement: string): string {
  return sentence.replace(
    /(\S+)\s+and\s+(\S+)/gu,
    (match, left: string, right: string) => {
      if (isProperRun(left) && isProperRun(right)) return match;
      if (/\d/.test(left) || /\d/.test(right)) return match;
      return `${left}${replacement}${right}`;
    },
  );
}

/**
 * Apply conservative tone presentation. Returns the original narration when a
 * safe transformation is unavailable or would change protected tokens.
 */
export function applyRetentionTonePresentation(
  narration: string,
  tone: Tone,
): string {
  const source = narration.replace(/\s+/gu, " ").trim();
  if (!source) return source;
  const sentences = source.split(/(?<=[.!?…])\s+(?=\p{Lu})/u).filter(Boolean);
  let next: string;
  if (sentences.length >= 2 && tone !== "news") {
    const lead = SENTENCE_LEAD[tone];
    next = sentences
      .map((sentence, index) => {
        // Tone is a light presentation treatment, not a beat-by-beat prefix.
        // Repeating the same lead on every fact turns coherent narration into
        // an audible checklist ("Then ... Then ... Then ..."). Apply it only
        // to the closing turn, where it can provide cadence without leaking
        // the invisible beat scaffold.
        if (index === 0 || index !== sentences.length - 1) return sentence;
        if (/^(?:Then|And|Now|Next)\b/u.test(sentence)) return sentence;
        if (lead && new RegExp(`^${lead}\\b`, "iu").test(sentence)) return sentence;
        if (
          lead &&
          /^(?:The|A|An|He|She|It|They|This|That)\b/u.test(sentence)
        ) {
          return `${lead} ${sentence.charAt(0).toLocaleLowerCase()}${sentence.slice(1)}`;
        }
        if (
          /^(?:After|Before|When|While|Once|Until|Since|Because|Although|Though|If|Unless|As|Can|Will|Should|Could|Would|Does|Do|Is|Are|Who|What|Why|How)\b/u.test(
            sentence,
          )
        ) {
          return sentence;
        }
        return `${lead} ${sentence}`;
      })
      .join(" ");
  } else if (sentences.length === 1 && tone !== "news") {
    next = replaceStandaloneAnd(source, CLAUSE_AND[tone]);
  } else {
    next = source;
  }
  next = next.replace(/\s+/gu, " ").trim();
  const before = extractRetentionPresentationInvariantTokens(source);
  const after = extractRetentionPresentationInvariantTokens(next);
  if (before.length !== after.length || before.some((token, i) => token !== after[i])) {
    return source;
  }
  return next;
}
