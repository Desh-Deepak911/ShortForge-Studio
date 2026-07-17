/**
 * Immutable Retention lexical forbidden-introduction registry — Sprint 10F.
 * Pattern match on normalized opening only. Not semantic quality.
 */

export const RETENTION_FORBIDDEN_INTRO_PATTERNS = Object.freeze([
  "in the world of",
  "football has seen",
  "throughout history",
  "when it comes to",
  "there are many",
  "in this video",
  "today we will",
  "today we'll",
  "let's talk about",
  "welcome back",
  "hey guys",
  "in today's video",
  "this video is about",
  "ever since the beginning",
  "from the dawn of",
  "as we all know",
  "it is no secret that",
  "over the years",
] as const);

/**
 * True when the normalized opening text matches a forbidden lexical intro pattern.
 */
export function matchesRetentionForbiddenIntroPattern(openingText: string): boolean {
  if (typeof openingText !== "string" || !openingText.trim()) return false;
  const normalized = openingText
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  for (const pattern of RETENTION_FORBIDDEN_INTRO_PATTERNS) {
    if (normalized.startsWith(pattern)) return true;
  }
  return false;
}
