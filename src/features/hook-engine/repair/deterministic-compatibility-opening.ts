/**
 * Post-freeze hotfix — deterministic compatibility / safe fallback opening.
 * Pure helpers only. Output is never declared valid; callers must validate normally.
 *
 * Usable-body rule (narrow): after the canonical opening span, the remainder must
 * contain at least {@link HOOK_USABLE_NARRATION_BODY_MIN_WORDS} spoken words and
 * at least one letter. A four-word opening alone is never a usable story body.
 */

import { resolveHookExampleSubjectAnchor } from "../domain/hook-subject-tokens";
import { countHookWords } from "../domain/hook-word-count";
import { extractOpeningSpan } from "../validation/extract-opening-span";

/** Minimum body words after the opening span for fallback to reuse prior narration. */
export const HOOK_USABLE_NARRATION_BODY_MIN_WORDS = 12;

/**
 * Build a subject-preserving compatibility opening.
 * Shape: `Nobody saw {anchor} coming.` — at most four Hook words when anchor is one token.
 */
export function buildDeterministicCompatibilityOpening(topic: string): string {
  const { anchor } = resolveHookExampleSubjectAnchor(
    typeof topic === "string" ? topic : "",
  );
  // Single-token display anchor from canonical subject utilities — never invents scores/fees.
  return `Nobody saw ${anchor} coming.`;
}

export interface ReplaceNarrationOpeningResult {
  readonly narration: string;
  readonly previousOpeningText: string;
  readonly openingText: string;
  readonly openingStartOffset: number;
  readonly openingEndOffset: number;
}

/**
 * Replace only the canonical opening span; preserve the remainder byte-for-byte
 * except for a single joining space when the body does not already start with whitespace.
 * Never mutates input. Returns null when the opening span cannot be extracted.
 */
export function replaceNarrationOpeningExact(
  narration: string,
  newOpening: string,
): ReplaceNarrationOpeningResult | null {
  if (typeof narration !== "string" || typeof newOpening !== "string") {
    return null;
  }
  const opening = newOpening.trim();
  if (!opening) {
    return null;
  }

  const span = extractOpeningSpan(narration);
  if (!span) {
    return null;
  }

  const prefix = narration.slice(0, span.openingStartOffset);
  const suffix = narration.slice(span.openingEndOffset);

  let next: string;
  if (suffix.length === 0) {
    next = `${prefix}${opening}`;
  } else if (/^\s/.test(suffix)) {
    next = `${prefix}${opening}${suffix}`;
  } else {
    next = `${prefix}${opening} ${suffix}`;
  }

  const nextSpan = extractOpeningSpan(next);
  if (!nextSpan) {
    return null;
  }

  return Object.freeze({
    narration: next,
    previousOpeningText: span.openingText,
    openingText: nextSpan.openingText,
    openingStartOffset: nextSpan.openingStartOffset,
    openingEndOffset: nextSpan.openingEndOffset,
  });
}

/**
 * Whether prior narration has a reusable story body beyond the opening.
 * Opening-only / near-opening-only text is unusable for terminal fallback reuse.
 */
export function hasUsableHookNarrationBody(narration: string): boolean {
  if (typeof narration !== "string" || !narration.trim()) {
    return false;
  }
  const span = extractOpeningSpan(narration);
  if (!span) {
    return false;
  }
  const body = narration.slice(span.openingEndOffset);
  if (!/\p{L}/u.test(body)) {
    return false;
  }
  const bodyWords = countHookWords(body);
  return bodyWords >= HOOK_USABLE_NARRATION_BODY_MIN_WORDS;
}

/**
 * Apply deterministic compatibility opening to complete narration when possible.
 * Returns original narration unchanged when replacement cannot be performed safely.
 */
export function applyDeterministicCompatibilityOpening(
  narration: string,
  topic: string,
): string {
  const opening = buildDeterministicCompatibilityOpening(topic);
  const replaced = replaceNarrationOpeningExact(narration, opening);
  return replaced?.narration ?? narration;
}
