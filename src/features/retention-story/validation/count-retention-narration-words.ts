/**
 * Retention-owned canonical narration word counter — Sprint 10F.
 * Unicode-aware; punctuation-stripped token count. Does not mutate text.
 */

/**
 * Count spoken words for Retention hard word-policy evaluation.
 * Empty / whitespace-only → 0.
 */
export function countRetentionNarrationWords(narration: string): number {
  if (typeof narration !== "string" || !narration.trim()) return 0;
  // Normalize Unicode, strip most punctuation, collapse whitespace.
  const normalized = narration
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[^\p{L}\p{N}'’-]+/gu, " ")
    .trim();
  if (!normalized) return 0;
  return normalized.split(/\s+/).filter(Boolean).length;
}
