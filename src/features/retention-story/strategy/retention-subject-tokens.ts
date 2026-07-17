/**
 * Retention-owned topic subject-token extraction — Sprint 10C / 10C.1.
 * Do not import Hook subject-token helpers.
 *
 * Folding: Unicode NFC → lowercase → NFD diacritic strip → punctuation removal.
 * Comparison uses exact normalized token sets only — never raw substring matching.
 * Short football abbreviations (fc, ac, as, ai, …) count only as standalone tokens.
 */

/** Vacuous connectives ignored as anchors (not meaningful topic words). */
const VACUOUS_CONNECTIVES = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "vs",
  "versus",
  "via",
  "per",
  "over",
  "under",
  "about",
  "after",
  "before",
  "against",
  "between",
  "among",
  "onto",
  "upon",
  "than",
  "then",
  "when",
  "what",
  "which",
  "where",
  "while",
  "how",
  "why",
  "who",
  "whom",
  "its",
  "his",
  "her",
  "their",
  "our",
  "your",
  "are",
  "was",
  "were",
  "been",
  "being",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "not",
  "nor",
  "but",
  "yet",
  "also",
  "just",
  "only",
  "very",
  "more",
  "most",
  "some",
  "any",
  "all",
  "each",
  "every",
  "both",
  "either",
  "neither",
  "one",
  "two",
  "new",
  "old",
]);

/**
 * Meaningful length-2 / short abbreviations common in football topics.
 * Kept only as standalone normalized tokens (never via substring).
 */
const SHORT_MEANINGFUL = new Set([
  "fc",
  "ac",
  "as",
  "ai",
  "cf",
  "sc",
  "af",
  "nk",
  "fk",
  "sk",
  "us",
  "cd",
  "ud",
  "rc",
  "bv",
]);

function foldDiacritics(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Extract stable meaningful subject tokens from a topic string.
 * Output is sorted unique lowercase folded tokens for deterministic comparison.
 */
export function extractRetentionSubjectTokens(
  topic: string,
): readonly string[] {
  if (topic == null || typeof topic !== "string") {
    return Object.freeze([]);
  }

  const folded = foldDiacritics(topic.normalize("NFC").toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  if (!folded) {
    return Object.freeze([]);
  }

  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of folded.split(/\s+/)) {
    if (!part) continue;
    if (VACUOUS_CONNECTIVES.has(part)) continue;
    const keep = part.length >= 3 || SHORT_MEANINGFUL.has(part);
    if (!keep) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    tokens.push(part);
  }

  tokens.sort((a, b) => a.localeCompare(b));
  return Object.freeze(tokens);
}

function tokenSetsIntersect(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right);
  return left.some((token) => rightSet.has(token));
}

/** True when statement tokens include at least one exact topic subject token. */
export function statementPreservesRetentionSubject(
  topic: string,
  statement: string,
): boolean {
  const topicTokens = extractRetentionSubjectTokens(topic);
  if (topicTokens.length === 0) return false;
  if (statement == null || typeof statement !== "string") return false;
  const statementTokens = extractRetentionSubjectTokens(statement);
  return tokenSetsIntersect(topicTokens, statementTokens);
}

/** True when claim text shares at least one exact subject token with the topic. */
export function claimRelevantToRetentionTopic(
  topic: string,
  claimText: string,
): boolean {
  const topicTokens = extractRetentionSubjectTokens(topic);
  if (topicTokens.length === 0) return false;
  if (claimText == null || typeof claimText !== "string") return false;
  const claimTokens = extractRetentionSubjectTokens(claimText);
  return tokenSetsIntersect(topicTokens, claimTokens);
}
