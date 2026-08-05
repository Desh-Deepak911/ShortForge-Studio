/**
 * Safe deterministic subject anchor — Sprint 10D.1.
 *
 * Ungrounded deterministic plan text must not echo unverified factual-risk topic
 * wording (scores, rankings, fees, dates, etc.). When the topic is risky, derive a
 * qualitative subject anchor from ordered topic tokens while preserving at least
 * one exact canonical subject token. Never invent a replacement subject and never
 * treat the creator topic as verified evidence.
 */

import { detectRetentionFactualRisk } from "./retention-factual-risk";
import { extractRetentionSubjectTokens } from "./retention-subject-tokens";

/** Standalone club/org prefixes skipped when a stronger later anchor exists. */
const CLUB_PREFIXES = new Set(["fc", "ac", "as", "cf", "sc", "af", "nk", "fk", "sk"]);

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

const MAX_QUALITATIVE_ANCHOR_WORDS = 12;
const MAX_QUALITATIVE_ANCHOR_CHARS = 96;
const CREATOR_INSTRUCTION_PREFIX =
  /^(?:(?:please\s+)?(?:tell|create|write|explain|cover|show|describe|make)\b(?:\s+(?:me|us))?(?:\s+(?:a|an|the))?(?:\s+story\s+(?:about|of))?\s*)/i;

function foldToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function buildBoundedQualitativeAnchor(topic: string): string {
  const firstThought = topic.split(/[\n.!?]+/u)[0]?.trim() || topic;
  const withoutInstruction =
    firstThought.replace(CREATOR_INSTRUCTION_PREFIX, "").trim() || firstThought;
  if (
    withoutInstruction.length <= MAX_QUALITATIVE_ANCHOR_CHARS &&
    withoutInstruction.split(/\s+/).filter(Boolean).length <=
      MAX_QUALITATIVE_ANCHOR_WORDS
  ) {
    return withoutInstruction;
  }

  const words = withoutInstruction.split(/\s+/).filter(Boolean);
  let bounded = words.slice(0, MAX_QUALITATIVE_ANCHOR_WORDS).join(" ");
  while (bounded.length > MAX_QUALITATIVE_ANCHOR_CHARS && words.length > 1) {
    words.pop();
    bounded = words
      .slice(0, MAX_QUALITATIVE_ANCHOR_WORDS)
      .join(" ");
  }
  return bounded || topic;
}

interface OrderedDisplayToken {
  readonly display: string;
  readonly folded: string;
}

/**
 * Ordered (not alphabetically sorted) meaningful topic tokens with display forms.
 * Preserves Unicode/diacritics in `display` where present in the topic.
 */
export function extractOrderedRetentionSubjectTokens(
  topic: string,
): readonly OrderedDisplayToken[] {
  if (topic == null || typeof topic !== "string") {
    return Object.freeze([]);
  }
  const nfc = topic.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!nfc) return Object.freeze([]);

  const parts = nfc.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: OrderedDisplayToken[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const folded = foldToken(part);
    if (!folded) continue;
    const keep = folded.length >= 3 || SHORT_MEANINGFUL.has(folded);
    if (!keep) continue;
    if (seen.has(folded)) continue;
    seen.add(folded);
    out.push(Object.freeze({ display: part.normalize("NFC"), folded }));
  }
  return Object.freeze(out);
}

/**
 * Resolve a safe subject string for ungrounded deterministic plan semantics.
 * Returns null when the topic has no usable subject tokens (punctuation-only, etc.).
 */
export function resolveRetentionDeterministicSubjectAnchor(
  topic: string,
): string | null {
  if (topic == null || typeof topic !== "string") return null;
  const normalized = topic.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const canonicalTokens = extractRetentionSubjectTokens(normalized);
  if (canonicalTokens.length === 0) return null;

  const ordered = extractOrderedRetentionSubjectTokens(normalized);
  if (ordered.length === 0) return null;

  const risky = detectRetentionFactualRisk(normalized).risky;
  if (!risky) {
    // Preserve concise topics verbatim. A creator may also enter a full brief;
    // bound that prose before it enters the short controlling-idea contract.
    return buildBoundedQualitativeAnchor(normalized);
  }

  // Prefer meaningful tokens (≥3) that are not standalone club prefixes when a
  // stronger later anchor exists (FC Barcelona → Barcelona).
  const candidates = ordered.filter((token, index) => {
    if (!CLUB_PREFIXES.has(token.folded)) return true;
    const hasLaterStrong = ordered
      .slice(index + 1)
      .some((later) => later.folded.length >= 3);
    return !hasLaterStrong;
  });

  const preferred =
    candidates.find((token) => token.folded.length >= 3) ??
    candidates[0] ??
    ordered[0]!;

  // Short-only subjects (e.g. AI FC): join remaining short tokens in order.
  if (preferred.folded.length < 3) {
    const shortOnly = (candidates.length > 0 ? candidates : ordered).filter(
      (token) => SHORT_MEANINGFUL.has(token.folded),
    );
    if (shortOnly.length > 0) {
      const joined = shortOnly.map((t) => t.display).join(" ");
      const joinedTokens = extractRetentionSubjectTokens(joined);
      if (
        joinedTokens.length > 0 &&
        joinedTokens.some((t) => canonicalTokens.includes(t))
      ) {
        return joined;
      }
    }
  }

  // Must preserve at least one exact canonical topic subject token.
  if (!canonicalTokens.includes(preferred.folded)) {
    const fallback = ordered.find((token) =>
      canonicalTokens.includes(token.folded),
    );
    return fallback?.display ?? null;
  }

  return preferred.display;
}
