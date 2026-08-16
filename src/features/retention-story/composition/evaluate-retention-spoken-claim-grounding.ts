/**
 * Spoken-claim grounding — story-quality Prompt 8 / 9.
 * Final spoken narration is authoritative. Model IDs are hints only.
 * Claim-reference metadata is never an independent hard gate.
 */

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { claimRefsSupportLinkedNarrationStatement } from "../strategy/retention-claim-linked-support";
import {
  detectRetentionFactualRisk,
  statementHasRetentionDateSignal,
} from "../strategy/retention-factual-risk";

export type RetentionSpokenClaimProvenance =
  | "model_supplied_reference"
  | "normalized_reference"
  | "safely_rebound_reference"
  | "unsupported"
  | "non_factual_connective";

export interface RetentionSpokenClaimGroundingResult {
  readonly ok: boolean;
  readonly unsupportedSpokenClaim: boolean;
  readonly ambiguousSpokenClaim: boolean;
  readonly supportingKnownIds: readonly string[];
  readonly droppedUnknownIds: readonly string[];
  readonly sentenceProvenance: readonly RetentionSpokenClaimProvenance[];
}

const DURATION_ABSENCE =
  /\b(?:missed|absent|sidelined|out for|serving)\b[^.]{0,40}\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(?:day|week|month|season|year)s?\b/iu;

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "this",
  "that",
  "these",
  "those",
  "has",
  "have",
  "had",
  "been",
  "being",
  "is",
  "are",
  "was",
  "were",
  "yet",
  "each",
  "side",
  "both",
  "still",
  "now",
  "then",
  "also",
  "into",
  "from",
  "than",
  "its",
  "their",
  "his",
  "her",
  "adding",
]);

const WORD_OR_DIGIT_QUANTITY =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+(?:\.\d+)?)\b/giu;

const SCORE = /\b\d{1,2}\s*[-–]\s*(?:\d{1,2}|nil)\b/iu;

const CAUSAL = /\b(?:because|caused|therefore|which led|resulting in)\b/iu;

const AUDIENCE_BELIEF =
  /(?:\b(?:many|most|everyone|nobody|people|fans|supporters|critics|pundits|few)\b[^.!?]{0,48}\b(?:believe|think|doubt|expect|assume|say|claim)\b|\b(?:common|widespread|public|popular)\s+(?:doubts?|belief|view|opinion|assumption|skepticism)\b|\bwidely\s+(?:believed|doubted|expected|assumed|claimed)\b|\bconventional wisdom\b)/iu;

function fold(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const NAME_SKIP = new Set([
  "can",
  "does",
  "did",
  "will",
  "would",
  "should",
  "could",
  "why",
  "how",
  "what",
  "when",
  "where",
  "who",
  "the",
  "that",
  "this",
  "these",
  "those",
  "then",
  "and",
  "but",
  "for",
  "nor",
  "yet",
  "after",
  "before",
  "both",
  "each",
  "former",
  "now",
  "today",
  "tonight",
  "later",
  "next",
  "finally",
]);

function entityTokens(text: string): string[] {
  return [...text.matchAll(/\b[\p{Lu}][\p{L}'-]{2,}\b/gu)]
    .map((match) => match[0].toLowerCase())
    .filter((token) => !NAME_SKIP.has(token));
}

function contentTokens(text: string): string[] {
  return fold(text)
    .split(/\s+/u)
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

function entityStrippedPredicate(text: string): string {
  return text
    .replace(/\b[\p{Lu}][\p{L}'-]{2,}\b/gu, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\b(?:the|a|an|this|that|these|those|each|side)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function knownIdSet(
  contract: RetentionCreatorContentContract,
  eligibleClaimIds: ReadonlySet<string>,
): Set<string> {
  return new Set([
    ...contract.orderedUnits.map((unit) => unit.contentUnitId),
    ...contract.orderedUnits
      .map((unit) => unit.claimId)
      .filter((id): id is string => id != null),
    ...eligibleClaimIds,
  ]);
}

function stripRankingPayoffCues(text: string): string {
  return text.replace(
    /\b(?:number[- ]one|no\.?\s*1|stands last|decisive name|#1)\b/giu,
    " ",
  );
}

function quantities(text: string): string[] {
  return [...stripRankingPayoffCues(text).matchAll(WORD_OR_DIGIT_QUANTITY)].map(
    (match) => match[0].toLowerCase(),
  );
}

function splitClauses(sentence: string): string[] {
  const parts = sentence
    .split(/\s*(?:,\s+(?:yet|but|and)|;|—|--)\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [sentence];
}

function contractNames(contract: RetentionCreatorContentContract): Set<string> {
  return new Set(
    contract.orderedUnits.flatMap((unit) => entityTokens(unit.text)),
  );
}

function contractQuantities(
  contract: RetentionCreatorContentContract,
): Set<string> {
  return new Set(
    contract.orderedUnits.flatMap((unit) => quantities(unit.text)),
  );
}

function introducesUnsupportedStrictFact(
  clause: string,
  contract: RetentionCreatorContentContract,
): boolean {
  const names = entityTokens(clause);
  const allowedNames = contractNames(contract);
  if (names.some((name) => !allowedNames.has(name))) return true;
  return introducesUnsupportedEscalation(clause, contract);
}

function introducesUnsupportedAudienceBelief(
  clause: string,
  contract: RetentionCreatorContentContract,
): boolean {
  if (!AUDIENCE_BELIEF.test(clause)) return false;
  return !contract.orderedUnits.some((unit) => AUDIENCE_BELIEF.test(unit.text));
}

function introducesUnsupportedEscalation(
  clause: string,
  contract: RetentionCreatorContentContract,
): boolean {
  const clauseQty = quantities(clause);
  const allowedQty = contractQuantities(contract);
  if (clauseQty.some((qty) => !allowedQty.has(qty))) return true;
  if (SCORE.test(clause) && !contract.orderedUnits.some((unit) => SCORE.test(unit.text))) {
    return true;
  }
  if (
    statementHasRetentionDateSignal(clause) &&
    !contract.orderedUnits.some((unit) => statementHasRetentionDateSignal(unit.text))
  ) {
    return true;
  }
  if (CAUSAL.test(clause) && !contract.orderedUnits.some((unit) => CAUSAL.test(unit.text))) {
    return true;
  }
  return false;
}

function expandConservativeSuccessParaphrase(text: string): string {
  return fold(text)
    .replace(/\btasted\s+(?:continental\s+)?glory\b/gu, "won continental titles")
    .replace(/\bclaimed\s+(?:the\s+)?titles?\b/gu, "won titles");
}

function conservativeParaphrase(
  clause: string,
  unitText: string,
): boolean {
  const semanticToken = (token: string): string => {
    if (/^perform(?:ance|ed|ing)?$/u.test(token)) return "perform";
    if (/^struggl(?:e|ed|ing)$/u.test(token)) return "struggle";
    if (/^(?:badly|poor|poorly)$/u.test(token)) return "poor";
    if (/^(?:fail|failed|failure|challenging|difficult|setback|setbacks)$/u.test(token)) {
      return "setback";
    }
    if (/^(?:win|wins|won|winning|victory|victories)$/u.test(token)) {
      return "win";
    }
    if (/^(?:move|moves|moved|moving|go|goes|went|join|joins|joined|transfer)$/u.test(token)) {
      return "move";
    }
    if (/^(?:add|adds|added|adding|strengthen|strengthens|strengthened|bolster|bolsters|bolstered)$/u.test(token)) {
      return "strengthen";
    }
    if (/^(?:arsenal|option|options|resource|resources|weapon|weapons)$/u.test(token)) {
      return "resource";
    }
    if (/^(?:effectively|properly)$/u.test(token)) return "proper";
    if (/^(?:touch|control|controlled|controlling)$/u.test(token)) {
      return "control";
    }
    return token;
  };
  const semanticTokens = (text: string): string[] =>
    contentTokens(expandConservativeSuccessParaphrase(text)).map(semanticToken);
  const clauseToks = semanticTokens(clause);
  const unitToks = semanticTokens(unitText);
  if (unitToks.length === 0 || clauseToks.length === 0) return false;
  const overlap = unitToks.filter((token) => clauseToks.includes(token));
  const shorter = Math.min(unitToks.length, clauseToks.length);
  return overlap.length >= 3 && overlap.length / shorter >= 0.5;
}

function normalizeQuestionDiscourse(text: string): string {
  return fold(text)
    .replace(/\b(?:the\s+)?(?:central|key)\s+question\s+remains\s+whether\b/gu,
      "the central question is whether")
    .replace(/\bthe\s+key\s+question\s+is\s+whether\b/gu,
      "the central question is whether");
}

const STRONG_CERTAINTY =
  /\b(?:definitely|confirmed|proved|already\s+(?:won|lost|beaten)|will\s+definitely)\b/iu;

function escalatesCertainty(
  clause: string,
  units: RetentionCreatorContentContract["orderedUnits"],
): boolean {
  if (!STRONG_CERTAINTY.test(clause) && !/^\s*[\p{L}].*\bwill\b(?!\s+(?:stand|turn|stay|remain|ask))/iu.test(clause)) {
    return false;
  }
  const assertsResolvedOutcome =
    STRONG_CERTAINTY.test(clause) ||
    (/\bwill\b/iu.test(clause) &&
      !/\b(?:whether|or|may|might|can|could)\b/iu.test(clause));
  if (!assertsResolvedOutcome) return false;
  const contractUncertain = units.some((unit) =>
    /\b(?:whether|may|might|asked|question)\b/iu.test(unit.text),
  );
  const contractCertain = units.some((unit) => STRONG_CERTAINTY.test(unit.text));
  return contractUncertain && !contractCertain;
}

function unitSupportsClause(input: {
  readonly unitText: string;
  readonly claimId: string | null;
  readonly clause: string;
  readonly grounding?: RetentionGroundingContext | null;
  readonly factHandlingMode?: "verified_facts_only" | "creative_premise";
  readonly allowParaphrase?: boolean;
}): boolean {
  const clause = input.clause.trim();
  const unit = input.unitText.trim();
  if (!clause || !unit) return false;
  const foldedClause = normalizeQuestionDiscourse(clause);
  const foldedUnit = normalizeQuestionDiscourse(unit);
  if (foldedClause.includes(foldedUnit)) return true;
  if (foldedUnit.includes(foldedClause) && foldedClause.length >= 24) return true;
  const sentencePred = entityStrippedPredicate(input.clause);
  const unitPred = entityStrippedPredicate(input.unitText);
  if (unitPred.length >= 18 && sentencePred.includes(unitPred)) return true;
  if (sentencePred.length >= 18 && unitPred.includes(sentencePred)) return true;
  if (input.claimId && input.grounding) {
    if (
      claimRefsSupportLinkedNarrationStatement(
        input.grounding,
        [input.claimId],
        clause,
        input.factHandlingMode ?? "verified_facts_only",
      )
    ) {
      return true;
    }
  }
  if (input.allowParaphrase === false) return false;
  if (restatesOpenQuestion(clause, unit)) return true;
  return conservativeParaphrase(clause, unit);
}

function restatesOpenQuestion(clause: string, unitText: string): boolean {
  if (!/\bwhether\b/iu.test(clause) || !/\bwhether\b/iu.test(unitText)) {
    return false;
  }
  const clauseNames = entityTokens(clause);
  const unitNames = entityTokens(unitText);
  if (clauseNames.length === 0 || unitNames.length === 0) return false;
  if (!clauseNames.every((name) => unitNames.includes(name))) return false;
  const clausePred = new Set(contentTokens(entityStrippedPredicate(clause)));
  const unitPred = new Set(contentTokens(entityStrippedPredicate(unitText)));
  const shared = [...clausePred].filter((token) => unitPred.has(token));
  return shared.length >= 2;
}

function unitsSupportingClause(
  factUnits: RetentionCreatorContentContract["orderedUnits"],
  clause: string,
  input: {
    readonly grounding?: RetentionGroundingContext | null;
    readonly factHandlingMode?: "verified_facts_only" | "creative_premise";
  },
): RetentionCreatorContentContract["orderedUnits"] {
  const exact = factUnits.filter((unit) =>
    unitSupportsClause({
      unitText: unit.text,
      claimId: unit.claimId,
      clause,
      grounding: input.grounding,
      factHandlingMode: input.factHandlingMode,
      allowParaphrase: false,
    }),
  );
  if (exact.length > 0) return exact;
  return factUnits.filter((unit) =>
    unitSupportsClause({
      unitText: unit.text,
      claimId: unit.claimId,
      clause,
      grounding: input.grounding,
      factHandlingMode: input.factHandlingMode,
      allowParaphrase: true,
    }),
  );
}

function isSubjectEchoConnective(
  sentence: string,
  contract: RetentionCreatorContentContract,
): boolean {
  if (introducesUnsupportedStrictFact(sentence, contract)) return false;
  if (CAUSAL.test(sentence) || STRONG_CERTAINTY.test(sentence)) return false;
  if (DURATION_ABSENCE.test(sentence)) return false;
  const spoken = contentTokens(sentence);
  const subject = contentTokens(contract.centralSubject);
  if (spoken.length === 0 || subject.length === 0) return false;
  return spoken.every((token) => subject.includes(token));
}

function isAmbiguousSupport(
  sentence: string,
  supporters: RetentionCreatorContentContract["orderedUnits"],
): boolean {
  if (supporters.length <= 1) return false;
  const spokenEntities = new Set(entityTokens(sentence));
  const entitySets = supporters.map((unit) => new Set(entityTokens(unit.text)));
  const shared = [...entitySets[0]!].filter((token) =>
    entitySets.every((set) => set.has(token)),
  );
  const distinguishing = entitySets.map((set) =>
    [...set].filter((token) => !shared.includes(token)),
  );
  if (distinguishing.every((tokens) => tokens.length === 0)) return false;
  const named = distinguishing.filter((tokens) =>
    tokens.some((token) => spokenEntities.has(token)),
  );
  return named.length !== 1 && named.length !== distinguishing.length;
}

export function evaluateRetentionSpokenClaimGrounding(input: {
  readonly narration: string;
  readonly contentContract: RetentionCreatorContentContract;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly modelUsedContentIds?: readonly string[];
  readonly grounding?: RetentionGroundingContext | null;
}): RetentionSpokenClaimGroundingResult {
  const known = knownIdSet(input.contentContract, input.eligibleClaimIds);
  const droppedUnknownIds = uniqueIds(
    (input.modelUsedContentIds ?? []).filter((id) => !known.has(id)),
  );
  const factUnits = input.contentContract.orderedUnits.filter(
    (unit) => unit.kind !== "instruction" && unit.kind !== "forbidden",
  );
  const sentences = input.narration.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  const supportingKnownIds: string[] = [];
  const sentenceProvenance: RetentionSpokenClaimProvenance[] = [];
  let unsupportedSpokenClaim = false;
  let ambiguousSpokenClaim = false;

  for (const sentence of sentences) {
    if (isSubjectEchoConnective(sentence, input.contentContract)) {
      sentenceProvenance.push("non_factual_connective");
      continue;
    }
    const clauses = splitClauses(sentence);
    const sentenceSupporters = factUnits.filter((unit) =>
      clauses.some((clause) =>
        unitsSupportingClause(factUnits, clause, {
          grounding: input.grounding,
          factHandlingMode:
            input.contentContract.presentationSettings.factHandlingMode,
        }).includes(unit),
      ),
    );
    let clauseUnsupported = false;
    let clauseFactual = false;
    for (const clause of clauses) {
      const risk = detectRetentionFactualRisk(clause);
      const supporters = unitsSupportingClause(factUnits, clause, {
        grounding: input.grounding,
        factHandlingMode:
          input.contentContract.presentationSettings.factHandlingMode,
      });
      const looksFactual =
        risk.risky ||
        supporters.length > 0 ||
        DURATION_ABSENCE.test(clause) ||
        introducesUnsupportedAudienceBelief(clause, input.contentContract) ||
        introducesUnsupportedStrictFact(clause, input.contentContract);
      if (!looksFactual) continue;
      clauseFactual = true;
      if (
        supporters.length === 0 ||
        escalatesCertainty(clause, factUnits) ||
        introducesUnsupportedEscalation(clause, input.contentContract) ||
        introducesUnsupportedAudienceBelief(clause, input.contentContract)
      ) {
        clauseUnsupported = true;
        continue;
      }
      if (isAmbiguousSupport(clause, supporters)) {
        ambiguousSpokenClaim = true;
        clauseUnsupported = true;
      }
    }

    if (!clauseFactual && sentenceSupporters.length === 0) {
      sentenceProvenance.push("non_factual_connective");
      continue;
    }
    if (clauseUnsupported || sentenceSupporters.length === 0) {
      unsupportedSpokenClaim = true;
      sentenceProvenance.push("unsupported");
      continue;
    }
    if (isAmbiguousSupport(sentence, sentenceSupporters)) {
      ambiguousSpokenClaim = true;
      unsupportedSpokenClaim = true;
      sentenceProvenance.push("unsupported");
      continue;
    }
    const modelHint = (input.modelUsedContentIds ?? []).find(
      (id) =>
        known.has(id) &&
        sentenceSupporters.some(
          (unit) => unit.claimId === id || unit.contentUnitId === id,
        ),
    );
    sentenceProvenance.push(
      modelHint ? "model_supplied_reference" : "safely_rebound_reference",
    );
    for (const unit of sentenceSupporters) {
      const chosen =
        unit.claimId && known.has(unit.claimId)
          ? unit.claimId
          : unit.contentUnitId;
      if (known.has(chosen)) supportingKnownIds.push(chosen);
    }
  }

  return Object.freeze({
    ok: !unsupportedSpokenClaim && !ambiguousSpokenClaim,
    unsupportedSpokenClaim,
    ambiguousSpokenClaim,
    supportingKnownIds: Object.freeze(uniqueIds(supportingKnownIds)),
    droppedUnknownIds: Object.freeze(droppedUnknownIds),
    sentenceProvenance: Object.freeze(sentenceProvenance),
  });
}
