/**
 * Deterministic opening-span extractor — Sprint 7C.
 * Hook-owned; must not import Studio Intelligence.
 */

import type { HookOpeningSpan } from "../domain/hook-contract.types";

/** Abbreviations that do not end a sentence when followed by a period. */
const ABBREVIATIONS = new Set(
  [
    "mr",
    "mrs",
    "ms",
    "dr",
    "prof",
    "sr",
    "jr",
    "vs",
    "v",
    "eg",
    "e.g",
    "ie",
    "i.e",
    "etc",
    "approx",
    "st",
    "ave",
    "inc",
    "ltd",
    "co",
    "fig",
    "vol",
    "no",
    "dept",
    "univ",
    "gen",
    "capt",
    "col",
    "sgt",
    "u.s",
    "u.k",
    "ph.d",
    "a.m",
    "p.m",
  ].map((s) => s.toLowerCase()),
);

const SENTENCE_TERMINATORS = new Set([".", "!", "?", "。", "！", "？", "…"]);

const CLOSING_TRAILERS = new Set([
  '"',
  "'",
  "”",
  "’",
  "»",
  ")",
  "]",
  "}",
  "»",
]);

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isLetter(ch: string): boolean {
  return /[A-Za-z\u00C0-\u024F]/.test(ch);
}

function isDigit(ch: string): boolean {
  return /[0-9]/.test(ch);
}

function wordBeforePeriod(text: string, periodIndex: number): string {
  let i = periodIndex - 1;
  while (i >= 0 && !isWhitespace(text[i]!)) {
    i -= 1;
  }
  return text.slice(i + 1, periodIndex).toLowerCase();
}

function isInitialPeriod(text: string, periodIndex: number): boolean {
  // Single letter before period, optionally after whitespace or start.
  let i = periodIndex - 1;
  while (i >= 0 && text[i] === ".") {
    // skip chained initials handled separately
    i -= 1;
  }
  if (i < 0) return false;
  const ch = text[i]!;
  if (!isLetter(ch)) return false;
  const before = i - 1;
  if (before < 0 || isWhitespace(text[before]!) || text[before] === ".") {
    return true;
  }
  return false;
}

function isDecimalPeriod(text: string, periodIndex: number): boolean {
  const before = text[periodIndex - 1];
  const after = text[periodIndex + 1];
  return Boolean(before && after && isDigit(before) && isDigit(after));
}

function isEllipsisAt(text: string, index: number): boolean {
  if (text[index] === "…") return true;
  if (text[index] !== ".") return false;
  // Three or more ASCII periods
  let count = 0;
  let i = index;
  while (i < text.length && text[i] === ".") {
    count += 1;
    i += 1;
  }
  return count >= 3;
}

function isAbbreviationPeriod(text: string, periodIndex: number): boolean {
  if (isDecimalPeriod(text, periodIndex)) return true;
  if (isInitialPeriod(text, periodIndex)) return true;

  const token = wordBeforePeriod(text, periodIndex);
  if (!token) return false;

  // Strip trailing periods inside token (e.g. e.g)
  const normalized = token.replace(/\.$/, "");
  if (ABBREVIATIONS.has(normalized) || ABBREVIATIONS.has(token)) {
    return true;
  }

  // Multi-dot abbreviation like e.g. / i.e. / U.S.
  if (/^[a-z](?:\.[a-z])+$/i.test(token) || /^[a-z]\.[a-z]\.$/i.test(token + ".")) {
    const compact = token.replace(/\./g, "").toLowerCase();
    if (compact === "eg" || compact === "ie" || compact === "us" || compact === "uk") {
      return true;
    }
  }

  return false;
}

function consumeClosingTrailers(text: string, exclusiveEnd: number): number {
  let end = exclusiveEnd;
  while (end < text.length && CLOSING_TRAILERS.has(text[end]!)) {
    end += 1;
  }
  return end;
}

function findSentenceEnd(text: string, start: number): number | null {
  let i = start;
  while (i < text.length) {
    const ch = text[i]!;

    // Newline before a terminator ⇒ first-line fallback (unterminated first line).
    if (ch === "\n" || ch === "\r") {
      return null;
    }

    if (ch === "…" || (ch === "." && isEllipsisAt(text, i))) {
      // Ellipsis ends the sentence; consume all consecutive periods.
      let end = i + 1;
      while (end < text.length && text[end] === ".") end += 1;
      return consumeClosingTrailers(text, end);
    }

    if (SENTENCE_TERMINATORS.has(ch)) {
      if (ch === "." && isAbbreviationPeriod(text, i)) {
        i += 1;
        continue;
      }
      return consumeClosingTrailers(text, i + 1);
    }

    i += 1;
  }
  return null;
}

function findFirstNonEmptyLineEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && text[end] !== "\n" && text[end] !== "\r") {
    end += 1;
  }
  // Trim trailing whitespace on the line from the exclusive end for cleaner span,
  // but keep interior spaces. Offsets must still slice to openingText.
  while (end > start && isWhitespace(text[end - 1]!)) {
    end -= 1;
  }
  return end;
}

function normalizeForAnalysis(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the first non-empty linguistic sentence from complete narration.
 * Does not silently truncate based on strategy word/time limits.
 */
export function extractOpeningSpan(narration: string): HookOpeningSpan | null {
  if (typeof narration !== "string" || narration.length === 0) {
    return null;
  }

  let start = 0;
  while (start < narration.length && isWhitespace(narration[start]!)) {
    start += 1;
  }
  if (start >= narration.length) {
    return null;
  }

  const sentenceEnd = findSentenceEnd(narration, start);
  const end =
    sentenceEnd != null ? sentenceEnd : findFirstNonEmptyLineEnd(narration, start);

  if (end <= start) {
    return null;
  }

  const openingText = narration.slice(start, end);
  if (!openingText.trim()) {
    return null;
  }

  const openingTextNormalized = normalizeForAnalysis(openingText);

  return Object.freeze({
    openingText,
    openingTextNormalized,
    openingStartOffset: start,
    openingEndOffset: end,
  });
}
