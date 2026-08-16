/**
 * Bounded claim-linked narration support — story-quality Prompt 2.
 * Exact statement equality remains valid. Compression may drop words but
 * must not introduce new factual-risk tokens, entities, results, or certainty.
 * Not unrestricted entailment.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import {
  detectRetentionFactualRisk,
  statementHasRetentionDateSignal,
} from "./retention-factual-risk";
import {
  claimRefSupportsNarrationStatement,
  isClaimEligibleForNarrationSupport,
  normalizeRetentionControllingIdeaStatement,
} from "./retention-claim-support";

const FUNCTION_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "by",
  "as",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "their",
  "his",
  "her",
  "they",
  "we",
  "you",
  "who",
  "which",
  "when",
  "where",
  "how",
  "why",
  "what",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "into",
  "after",
  "before",
  "still",
  "also",
  "just",
  "only",
  "even",
  "more",
  "most",
  "very",
]);

const UNCERTAINTY_WORDS = new Set([
  "maybe",
  "might",
  "may",
  "reportedly",
  "allegedly",
  "unconfirmed",
  "uncertain",
  "unclear",
  "possibly",
  "perhaps",
  "rumoured",
  "rumored",
]);

function tokenize(text: string): string[] {
  return normalizeRetentionControllingIdeaStatement(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 0);
}

function factualRiskTokens(text: string): string[] {
  const tokens = tokenize(text);
  return tokens.filter((token) => {
    if (/\d/.test(token)) return true;
    if (token === "may") return statementHasRetentionDateSignal(text);
    return /^(?:january|february|march|april|june|july|august|september|october|november|december)$/u.test(
      token,
    );
  });
}

function contentTokens(text: string): string[] {
  return tokenize(text).filter((token) => !FUNCTION_WORDS.has(token));
}

function tokenSupported(token: string, sourceTokens: readonly string[]): boolean {
  if (sourceTokens.includes(token)) return true;
  if (token.length < 5) return false;
  return sourceTokens.some(
    (source) =>
      source.length >= 5 &&
      (source.startsWith(token.slice(0, 5)) || token.startsWith(source.slice(0, 5))),
  );
}

/**
 * Conservative compression support for one or more linked eligible claims.
 */
export function claimRefsSupportLinkedNarrationStatement(
  grounding: RetentionGroundingContext,
  claimIds: readonly string[],
  statement: string,
  factHandlingMode:
    | "verified_facts_only"
    | "creative_premise" = "verified_facts_only",
): boolean {
  if (!statement.trim() || claimIds.length === 0) return false;
  if (
    claimIds.some((claimId) =>
      claimRefSupportsNarrationStatement(
        grounding,
        claimId,
        statement,
        factHandlingMode,
      ),
    )
  ) {
    return true;
  }

  const claims = claimIds
    .map((claimId) => grounding.claims.find((claim) => claim.claimId === claimId))
    .filter((claim): claim is NonNullable<typeof claim> => claim != null);
  if (claims.length !== claimIds.length) return false;
  if (
    claims.some(
      (claim) =>
        !isClaimEligibleForNarrationSupport(
          grounding,
          claim.claimId,
          factHandlingMode,
        ),
    )
  ) {
    return false;
  }

  const sourceText = claims.map((claim) => claim.text).join(" ");
  const sourceContent = contentTokens(sourceText);
  const statementContent = contentTokens(statement);
  if (statementContent.length === 0) return false;
  if (statementContent.some((token) => !tokenSupported(token, sourceContent))) {
    return false;
  }

  const sourceRisk = new Set(factualRiskTokens(sourceText));
  if (factualRiskTokens(statement).some((token) => !sourceRisk.has(token))) {
    return false;
  }

  const statementRisk = detectRetentionFactualRisk(statement);
  const sourceRiskSignals = new Set(detectRetentionFactualRisk(sourceText).signals);
  if (
    statementRisk.signals.some(
      (signal) =>
        (signal === "match_result" ||
          signal === "exact_count" ||
          signal === "percentage" ||
          signal === "currency_fee" ||
          signal === "date") &&
        !sourceRiskSignals.has(signal),
    )
  ) {
    return false;
  }

  const sourceUncertainty = tokenize(sourceText).filter((token) =>
    UNCERTAINTY_WORDS.has(token),
  );
  if (sourceUncertainty.length > 0) {
    const spoken = new Set(tokenize(statement));
    if (!sourceUncertainty.some((token) => spoken.has(token))) return false;
  }

  return true;
}

/**
 * Deterministic claim-linked compression: drop filler only. Never add tokens.
 */
export function compressRetentionClaimLinkedNarration(
  text: string,
  maxWords: number,
): string {
  const cleaned = normalizeRetentionControllingIdeaStatement(text).replace(
    /\s*\([^)]*\)\s*/gu,
    " ",
  );
  const tokens = cleaned.split(/\s+/u).filter(Boolean);
  if (tokens.length <= maxWords) return cleaned;
  const kept = tokens.filter((token) => {
    const lower = token.toLowerCase().replace(/[^\p{L}\p{N}'-]+/gu, "");
    if (!lower) return false;
    if (
      FUNCTION_WORDS.has(lower) &&
      !UNCERTAINTY_WORDS.has(lower) &&
      !/\d/.test(token)
    ) {
      return false;
    }
    return true;
  });
  const compact = kept.length > 0 ? kept : tokens;
  if (compact.length <= maxWords) return compact.join(" ");
  const risk = compact.filter(
    (token) =>
      /\d/.test(token) ||
      UNCERTAINTY_WORDS.has(token.toLowerCase()) ||
      /^[A-Z]/.test(token),
  );
  const rest = compact.filter((token) => !risk.includes(token));
  return [...risk, ...rest].slice(0, Math.max(3, maxWords)).join(" ");
}
