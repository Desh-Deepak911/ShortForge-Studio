/**
 * Canonical Hook subject-token extraction — Sprint 7E.3A.
 * Shared by validator subject gate and Hook JSON example construction.
 * Leaf module: no imports from story prompts / story generation.
 */

/** Connectives skipped when choosing an example display anchor (not for the gate itself). */
const EXAMPLE_ANCHOR_SKIP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "vs",
  "via",
  "per",
  "over",
  "under",
  "about",
  "after",
  "before",
  "against",
]);

const FALLBACK_EXAMPLE_ANCHOR = "Story";

/**
 * Tokens the subject-preservation gate recognizes.
 * Length ≥ 3; ASCII letter/digit folding matches historical validator behavior
 * (Unicode letters outside a–z are stripped so e.g. "São Paulo" → "paulo").
 */
export function extractHookSubjectTokens(topic: string): readonly string[] {
  return Object.freeze(
    topic
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function capitalizeAnchor(token: string): string {
  if (!token) return FALLBACK_EXAMPLE_ANCHOR;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Recover original casing for a lowercased subject token from the topic string.
 */
function recoverDisplayCasing(topic: string, lowerToken: string): string | undefined {
  const parts = topic.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const part of parts) {
    const folded = part
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (folded === lowerToken) {
      return part.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 28) || undefined;
    }
  }
  return undefined;
}

/**
 * Resolve the subject anchor for Hook JSON examples.
 * Prefers a validator-recognized token (≥3 chars), skips connectives,
 * never prefers a two-letter prefix when a later recognized token exists.
 * When the gate would see zero tokens, returns a safe fallback (vacuous subject).
 */
export function resolveHookExampleSubjectAnchor(topic: string): {
  readonly tokens: readonly string[];
  readonly anchor: string;
  readonly usedFallback: boolean;
} {
  const tokens = extractHookSubjectTokens(topic);
  if (tokens.length === 0) {
    return {
      tokens,
      anchor: FALLBACK_EXAMPLE_ANCHOR,
      usedFallback: true,
    };
  }

  const preferred =
    tokens.find((t) => !EXAMPLE_ANCHOR_SKIP.has(t)) ?? tokens[0]!;
  const display =
    recoverDisplayCasing(topic, preferred) ?? capitalizeAnchor(preferred);

  return {
    tokens,
    anchor: display.slice(0, 28),
    usedFallback: false,
  };
}

/**
 * True when opening text satisfies the Hook subject-preservation rule for topic.
 */
export function openingPreservesHookSubject(
  topic: string,
  openingText: string,
): boolean {
  const tokens = extractHookSubjectTokens(topic);
  if (tokens.length === 0) return true;
  const lower = openingText.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}
