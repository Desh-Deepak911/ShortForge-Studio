/**
 * Advisory narration-substance evaluator — provider-free.
 * Detects vacuous planning-scaffold / low creator-fact coverage without
 * blocking generation. Safe diagnostic IDs only (no claim/narration text).
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import { claimRefsSupportLinkedNarrationStatement } from "../strategy/retention-claim-linked-support";
import { countRetentionNarrationWords } from "./count-retention-narration-words";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export type RetentionNarrationSubstanceDiagnosticId =
  | "low_creator_claim_coverage"
  | "low_subject_entity_coverage"
  | "repeated_sentence_stems"
  | "low_segment_lexical_contribution"
  | "hook_promise_without_payoff"
  | "planning_scaffold_leakage"
  | "disconnected_checklist_risk"
  | "known_vacuous_fallback_phrasing";

export interface RetentionNarrationSubstanceEvaluation {
  readonly substanceScore: number;
  /** Advisory — weak/vacuous narration should not be labelled ordinary Pass. */
  readonly qualityBelowTarget: boolean;
  readonly diagnosticIds: readonly RetentionNarrationSubstanceDiagnosticId[];
  readonly planningScaffoldDetected: boolean;
  readonly creatorClaimCoverageRatio: number;
}

const KNOWN_VACUOUS_FALLBACK = [
  /what decides .+outcome\?/iu,
  /begins with a choice whose consequence keeps growing/iu,
  /that connection gives the next part/iu,
  /together,? those details bring .+central idea into focus/iu,
  /that connection brings the central question/iu,
  /brings .+ into focus\.?$/iu,
] as const;

const PLANNING_SCAFFOLD = [
  /\bcentral idea\b/iu,
  /\bcentral question\b/iu,
  /\bconsequence keeps growing\b/iu,
  /\bgives the next part\b/iu,
  /\btogether,? those details\b/iu,
  /\bwhat decides\b/iu,
  /\bthat connection\b/iu,
] as const;

function sharesTokenish(
  left: Iterable<string>,
  right: readonly string[],
): boolean {
  const rightSet = new Set(right);
  for (const token of left) {
    if (rightSet.has(token)) return true;
  }
  return false;
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function sentenceStem(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

function eligibleClaimIds(grounding: RetentionGroundingContext): string[] {
  return grounding.claims
    .filter(
      (claim) =>
        !claim.forbidden &&
        claim.permittedFactualUse &&
        (claim.verification === "verified" ||
          (claim.verification === "unverified" &&
            claim.provenance === "manual_user")),
    )
    .map((claim) => claim.claimId);
}

/**
 * Evaluate whether final narration carries creator substance vs planning filler.
 */
export function evaluateRetentionNarrationSubstance(input: {
  readonly candidate: RetentionNarrationCandidate;
  readonly grounding: RetentionGroundingContext;
  readonly topic: string;
  readonly controllingIdeaStatement?: string;
}): RetentionNarrationSubstanceEvaluation {
  const narration = input.candidate.assembledNarration;
  const segments = input.candidate.segments;
  const diagnostics = new Set<RetentionNarrationSubstanceDiagnosticId>();

  const eligible = eligibleClaimIds(input.grounding);
  const mappedClaimIds = new Set(
    segments.flatMap((segment) => segment.claimRefs ?? []),
  );
  let supportedClaims = 0;
  if (eligible.length > 0) {
    for (const claimId of eligible) {
      const claim = input.grounding.claims.find((c) => c.claimId === claimId);
      if (!claim) continue;
      const sentences = narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
      const subjectTokensForClaim = new Set(
        tokenize(`${input.topic} ${input.controllingIdeaStatement ?? ""}`),
      );
      const claimTokens = tokenize(claim.text).filter((token) => token.length >= 4);
      const distinctiveTokens = claimTokens.filter(
        (token) => !subjectTokensForClaim.has(token),
      );
      const narrationTokens = tokenize(narration);
      const paraphraseHits = distinctiveTokens.filter((token) =>
        narrationTokens.some(
          (spoken) =>
            spoken === token ||
            (spoken.length >= 5 &&
              token.length >= 5 &&
              spoken.startsWith(token.slice(0, 4))),
        ),
      );
      const covered =
        mappedClaimIds.has(claimId) ||
        narration.toLowerCase().includes(claim.text.trim().toLowerCase()) ||
        sentences.some((sentence) =>
          claimRefsSupportLinkedNarrationStatement(
            input.grounding,
            [claimId],
            sentence,
          ),
        ) ||
        segments.some(
          (segment) =>
            (segment.claimRefs?.includes(claimId) ?? false) &&
            claimRefsSupportLinkedNarrationStatement(
              input.grounding,
              segment.claimRefs,
              segment.text,
            ),
        ) ||
        (distinctiveTokens.length >= 2 &&
          paraphraseHits.length / distinctiveTokens.length >= 0.6);
      if (covered) supportedClaims += 1;
    }
  }
  const creatorClaimCoverageRatio =
    eligible.length === 0
      ? 0.45
      : supportedClaims / eligible.length;
  if (eligible.length >= 2 && creatorClaimCoverageRatio < 0.34) {
    diagnostics.add("low_creator_claim_coverage");
  }

  const subjectTokens = new Set(
    tokenize(`${input.topic} ${input.controllingIdeaStatement ?? ""}`).slice(
      0,
      10,
    ),
  );
  const narrationTokens = new Set(tokenize(narration));
  let subjectHits = 0;
  for (const token of subjectTokens) {
    if (narrationTokens.has(token)) subjectHits += 1;
  }
  const subjectCoverage =
    subjectTokens.size === 0 ? 1 : subjectHits / subjectTokens.size;
  if (subjectTokens.size >= 2 && subjectCoverage < 0.25) {
    diagnostics.add("low_subject_entity_coverage");
  }

  const stems = segments.map((s) => sentenceStem(s.text)).filter(Boolean);
  const stemCounts = new Map<string, number>();
  for (const stem of stems) {
    stemCounts.set(stem, (stemCounts.get(stem) ?? 0) + 1);
  }
  let repeatedStemPairs = 0;
  for (const count of stemCounts.values()) {
    if (count >= 2) repeatedStemPairs += count - 1;
  }
  const repeatedStemRatio =
    stems.length <= 1 ? 0 : repeatedStemPairs / Math.max(1, stems.length - 1);
  if (repeatedStemRatio >= 0.34) {
    diagnostics.add("repeated_sentence_stems");
  }

  const uniqueTokens = new Set(tokenize(narration));
  const wordCount = countRetentionNarrationWords(narration);
  const lexicalDensity =
    wordCount <= 0 ? 0 : uniqueTokens.size / Math.max(1, wordCount);
  if (segments.length >= 3 && lexicalDensity < 0.36) {
    diagnostics.add("low_segment_lexical_contribution");
  }

  const spokenSentences = narration
    .split(/(?<=[.!?…])\s+/u)
    .filter(Boolean);
  const spokenOpening = spokenSentences[0] ?? "";
  let hookPayoffScore = 1;
  if (spokenOpening.endsWith("?")) {
    const opening = spokenOpening;
    const body = narration.slice(opening.length).trimStart();
    const openingTokens = tokenize(opening).filter((t) => !subjectTokens.has(t));
    const bodyTokens = tokenize(body);
    const related =
      openingTokens.length === 0
        ? sharesTokenish(tokenize(opening), bodyTokens)
        : openingTokens.some((p) =>
            bodyTokens.some(
              (b) =>
                b === p ||
                (b.length >= 5 && p.length >= 5 && b.startsWith(p.slice(0, 4))),
            ),
          ) ||
          sharesTokenish([...subjectTokens], bodyTokens);
    hookPayoffScore = related ? 1 : 0.2;
    if (!related && openingTokens.length > 0 && bodyTokens.length === 0) {
      diagnostics.add("hook_promise_without_payoff");
    }
  }

  let knownVacuousHits = 0;
  for (const pattern of KNOWN_VACUOUS_FALLBACK) {
    if (pattern.test(narration)) knownVacuousHits += 1;
  }
  if (knownVacuousHits >= 2) {
    diagnostics.add("known_vacuous_fallback_phrasing");
  }

  let scaffoldHits = 0;
  for (const pattern of PLANNING_SCAFFOLD) {
    if (pattern.test(narration)) scaffoldHits += 1;
  }
  const planningScaffoldDetected =
    knownVacuousHits >= 2 || scaffoldHits >= 3 || knownVacuousHits >= 1 && scaffoldHits >= 2;
  if (planningScaffoldDetected) {
    diagnostics.add("planning_scaffold_leakage");
  }

  // Checklist risk: many short segments with weak lexical linking.
  if (
    segments.length >= 4 &&
    lexicalDensity < 0.5 &&
    creatorClaimCoverageRatio < 0.5 &&
    repeatedStemRatio >= 0.2
  ) {
    diagnostics.add("disconnected_checklist_risk");
  }

  const substanceScore = clamp01(
    0.28 * creatorClaimCoverageRatio +
      0.18 * subjectCoverage +
      0.18 * (1 - repeatedStemRatio) +
      0.14 * clamp01(lexicalDensity / 0.55) +
      0.12 * hookPayoffScore +
      0.1 * (planningScaffoldDetected ? 0.05 : 1),
  );

  const adjustedSubstanceScore = planningScaffoldDetected
    ? clamp01(Math.min(substanceScore, 0.32) * 0.7)
    : substanceScore;

  // Advisory below-target: vacuous scaffold / known filler / claim starvation /
  // heavy stem repetition. Low subject overlap alone must not force Studio rewrite.
  const qualityBelowTarget =
    planningScaffoldDetected ||
    diagnostics.has("known_vacuous_fallback_phrasing") ||
    diagnostics.has("repeated_sentence_stems") ||
    (eligible.length >= 3 && creatorClaimCoverageRatio < 0.34) ||
    (adjustedSubstanceScore < 0.34 &&
      diagnostics.has("disconnected_checklist_risk"));

  return Object.freeze({
    substanceScore: adjustedSubstanceScore,
    qualityBelowTarget,
    diagnosticIds: Object.freeze([...diagnostics]),
    planningScaffoldDetected,
    creatorClaimCoverageRatio,
  });
}
