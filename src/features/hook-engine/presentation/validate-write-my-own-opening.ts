/**
 * Write My Own opening gate — Sprint 7E.6A.
 * Does not silently rewrite over-limit openings.
 */

import {
  HOOK_MAX_USER_AUTHORED_HOOK_CHARS,
  HOOK_MAX_USER_AUTHORED_HOOK_WORDS,
} from "../domain/hook-contract.constants";
import { countHookWords } from "../domain/hook-word-count";

export type WriteMyOwnOpeningFailureReason =
  | "empty"
  | "over_word_limit"
  | "over_char_limit"
  | "malformed";

export type WriteMyOwnOpeningValidation =
  | {
      readonly ok: true;
      readonly text: string;
      readonly wordCount: number;
      readonly charCount: number;
    }
  | {
      readonly ok: false;
      readonly reason: WriteMyOwnOpeningFailureReason;
      readonly message: string;
      readonly wordCount: number;
      readonly charCount: number;
    };

/**
 * Validate a Write My Own opening for UI + API.
 * Rejects empty, over five words, over 200 chars, or no usable word tokens.
 * Never truncates or rewrites the opening to force acceptance.
 */
function hasUsableSpokenToken(text: string): boolean {
  // Require at least one letter so punctuation-only strings are not openings.
  return /\p{L}/u.test(text);
}

export function validateWriteMyOwnOpening(raw: string): WriteMyOwnOpeningValidation {
  const text = typeof raw === "string" ? raw.trim() : "";
  const wordCount = countHookWords(text);
  const charCount = text.length;

  if (!text) {
    return {
      ok: false,
      reason: "empty",
      message: "Write your opening sentence before generating with Write My Own.",
      wordCount,
      charCount,
    };
  }

  if (wordCount === 0 || !hasUsableSpokenToken(text)) {
    return {
      ok: false,
      reason: "malformed",
      message: "Opening must include a usable spoken phrase.",
      wordCount,
      charCount,
    };
  }

  if (charCount > HOOK_MAX_USER_AUTHORED_HOOK_CHARS) {
    return {
      ok: false,
      reason: "over_char_limit",
      message: `Opening must be ${HOOK_MAX_USER_AUTHORED_HOOK_CHARS} characters or fewer.`,
      wordCount,
      charCount,
    };
  }

  if (wordCount > HOOK_MAX_USER_AUTHORED_HOOK_WORDS) {
    return {
      ok: false,
      reason: "over_word_limit",
      message: `Write My Own openings must be ${HOOK_MAX_USER_AUTHORED_HOOK_WORDS} words or fewer.`,
      wordCount,
      charCount,
    };
  }

  return { ok: true, text, wordCount, charCount };
}

export function formatWriteMyOwnCounter(wordCount: number, charCount: number): string {
  return `${wordCount}/${HOOK_MAX_USER_AUTHORED_HOOK_WORDS} words · ${charCount}/${HOOK_MAX_USER_AUTHORED_HOOK_CHARS} characters`;
}
