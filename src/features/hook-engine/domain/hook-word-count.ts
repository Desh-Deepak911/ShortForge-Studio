/**
 * Shared Hook word-count helper — Sprint 7E.6A.
 * UI, API, and validator must use the same tokenization so limits do not drift.
 */

/** Count whitespace-separated tokens after trim. Empty / whitespace-only → 0. */
export function countHookWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}
