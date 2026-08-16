/**
 * Bounded opening / ranking-payoff repair — story-quality Prompt 10.
 * Replaces only the defective region. Body and the other region stay byte-identical.
 * Does not invent names, statistics, dates, results, allegations, or certainty.
 */

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";
import { evaluateRetentionCanonicalNarrationAcceptance } from "./evaluate-retention-canonical-narration-acceptance";
import { evaluateRetentionSpokenClaimGrounding } from "./evaluate-retention-spoken-claim-grounding";

export type RetentionBoundedRewriteType =
  | "opening_repair"
  | "ranking_payoff_repair"
  | "grounding_payoff_repair"
  | "duplicate_payoff_repair"
  | "supported_opening_promotion"
  | "duration_compression";

export interface RetentionBoundedRegionRepairResult {
  readonly ok: boolean;
  readonly narration: string;
  readonly preservedBody: string;
  readonly preservedPayoff: string;
  readonly preservedPrefix: string;
  readonly replacement: string;
  readonly rewriteType: RetentionBoundedRewriteType;
  readonly inventionRejected: boolean;
}

function firstSentence(narration: string): string {
  const trimmed = narration.trim();
  const match = /[.!?…]/.exec(trimmed);
  if (!match || match.index == null) return trimmed;
  return trimmed.slice(0, match.index + 1).trim();
}

function lastSentence(narration: string): string {
  const trimmed = narration.trim();
  const parts = trimmed.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  return parts[parts.length - 1]?.trim() || trimmed;
}

function splitOpening(narration: string): { opening: string; rest: string } {
  const opening = firstSentence(narration);
  const at = narration.indexOf(opening);
  const rest = at >= 0 ? narration.slice(at + opening.length).trimStart() : "";
  return { opening, rest };
}

function introducesInvention(
  replacement: string,
  contract: RetentionCreatorContentContract,
  eligibleClaimIds: ReadonlySet<string>,
  grounding?: RetentionGroundingContext | null,
): boolean {
  const groundingResult = evaluateRetentionSpokenClaimGrounding({
    narration: replacement,
    contentContract: contract,
    eligibleClaimIds,
    grounding,
  });
  return !groundingResult.ok;
}

export function applyRetentionBoundedOpeningRepair(input: {
  readonly title: string;
  readonly narration: string;
  readonly replacementOpening: string;
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief: RetentionCompositionBrief;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly grounding?: RetentionGroundingContext | null;
}): RetentionBoundedRegionRepairResult {
  const source = input.narration.trim();
  const { rest } = splitOpening(source);
  const payoff = lastSentence(source);
  const body = rest.replace(payoff, "").trim();
  const replacement = input.replacementOpening.trim();
  const inventionRejected = introducesInvention(
    replacement,
    input.contentContract,
    input.eligibleClaimIds,
    input.grounding,
  );
  if (!replacement || inventionRejected) {
    return Object.freeze({
      ok: false,
      narration: source,
      preservedBody: body,
      preservedPayoff: payoff,
      preservedPrefix: "",
      replacement,
      rewriteType: "opening_repair",
      inventionRejected,
    });
  }
  const gap = rest.startsWith(" ") || rest.length === 0 ? "" : " ";
  const narration = `${replacement}${gap}${rest}`.trim();
  const accepted = evaluateRetentionCanonicalNarrationAcceptance({
    raw: {
      title: input.title,
      narration,
    },
    contentContract: input.contentContract,
    brief: input.brief,
    eligibleClaimIds: input.eligibleClaimIds,
    grounding: input.grounding,
  });
  const rebuilt = splitOpening(narration);
  const rebuiltPayoff = lastSentence(narration);
  const rebuiltBody = rebuilt.rest.replace(rebuiltPayoff, "").trim();
  const preserved =
    rebuiltBody === body && rebuiltPayoff === payoff && rebuilt.rest === rest;
  return Object.freeze({
    ok: accepted.decision === "accept" && preserved,
    narration,
    preservedBody: body,
    preservedPayoff: payoff,
    preservedPrefix: "",
    replacement,
    rewriteType: "opening_repair",
    inventionRejected: false,
  });
}

export function applyRetentionBoundedRankingPayoffRepair(input: {
  readonly title: string;
  readonly narration: string;
  readonly replacementClosing: string;
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief: RetentionCompositionBrief;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly grounding?: RetentionGroundingContext | null;
  /** Replace a defective final sentence; otherwise append a missing payoff. */
  readonly replaceExistingClosing?: boolean;
}): RetentionBoundedRegionRepairResult {
  const source = input.narration.trim();
  const { rest } = splitOpening(source);
  const payoff = lastSentence(source);
  const body = rest.replace(payoff, "").trim();
  const replacement = input.replacementClosing.trim();
  const inventionRejected = introducesInvention(
    replacement,
    input.contentContract,
    input.eligibleClaimIds,
    input.grounding,
  );
  if (!replacement || inventionRejected) {
    return Object.freeze({
      ok: false,
      narration: source,
      preservedBody: body,
      preservedPayoff: payoff,
      preservedPrefix: source,
      replacement,
      rewriteType: "ranking_payoff_repair",
      inventionRejected,
    });
  }
  const payoffStart = source.lastIndexOf(payoff);
  const preservedPrefix = input.replaceExistingClosing
    ? source.slice(0, Math.max(0, payoffStart)).trimEnd()
    : source;
  const narration = `${preservedPrefix} ${replacement}`.replace(/\s+/g, " ").trim();
  const accepted = evaluateRetentionCanonicalNarrationAcceptance({
    raw: {
      title: input.title,
      narration,
    },
    contentContract: input.contentContract,
    brief: input.brief,
    eligibleClaimIds: input.eligibleClaimIds,
    grounding: input.grounding,
  });
  const prefixPreserved = narration.startsWith(preservedPrefix);
  return Object.freeze({
    ok: accepted.decision === "accept" && prefixPreserved,
    narration,
    preservedBody: body,
    preservedPayoff: payoff,
    preservedPrefix,
    replacement,
    rewriteType: "ranking_payoff_repair",
    inventionRejected: false,
  });
}

export function applyRetentionBoundedGroundingPayoffRepair(input: {
  readonly title: string;
  readonly narration: string;
  readonly replacementClosing: string;
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief: RetentionCompositionBrief;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly grounding?: RetentionGroundingContext | null;
}): RetentionBoundedRegionRepairResult {
  const source = input.narration.trim();
  const payoff = lastSentence(source);
  const payoffStart = source.lastIndexOf(payoff);
  const preservedPrefix = source.slice(0, Math.max(0, payoffStart)).trimEnd();
  const withoutUnsupportedClosing = evaluateRetentionCanonicalNarrationAcceptance({
    raw: { title: input.title, narration: preservedPrefix },
    contentContract: input.contentContract,
    brief: input.brief,
    eligibleClaimIds: input.eligibleClaimIds,
    grounding: input.grounding,
  });
  const consequenceUnit = input.brief.intendedConsequence
    ? input.contentContract.orderedUnits.find(
        (unit) =>
          unit.text.trim() === input.brief.intendedConsequence?.trim(),
      )
    : null;
  const consequenceRetained =
    consequenceUnit == null ||
    (withoutUnsupportedClosing.proposal != null &&
      [consequenceUnit.contentUnitId, consequenceUnit.claimId]
        .filter((id): id is string => id != null)
        .some((id) =>
          withoutUnsupportedClosing.proposal!.usedContentIds.includes(id),
        ));
  if (
    preservedPrefix &&
    withoutUnsupportedClosing.decision === "accept" &&
    consequenceRetained
  ) {
    return Object.freeze({
      ok: true,
      narration: preservedPrefix,
      preservedBody: preservedPrefix,
      preservedPayoff: payoff,
      preservedPrefix,
      replacement: "",
      rewriteType: "grounding_payoff_repair",
      inventionRejected: false,
    });
  }
  const replacementRaw = input.replacementClosing.trim();
  const replacement = replacementRaw
    ? /[.!?…]$/u.test(replacementRaw)
      ? replacementRaw
      : `${replacementRaw}.`
    : "";
  const inventionRejected = introducesInvention(
    replacement,
    input.contentContract,
    input.eligibleClaimIds,
    input.grounding,
  );
  if (!preservedPrefix || !replacement || inventionRejected) {
    return Object.freeze({
      ok: false,
      narration: source,
      preservedBody: preservedPrefix,
      preservedPayoff: payoff,
      preservedPrefix,
      replacement,
      rewriteType: "grounding_payoff_repair",
      inventionRejected,
    });
  }
  const narration = `${preservedPrefix} ${replacement}`.replace(/\s+/g, " ").trim();
  const accepted = evaluateRetentionCanonicalNarrationAcceptance({
    raw: { title: input.title, narration },
    contentContract: input.contentContract,
    brief: input.brief,
    eligibleClaimIds: input.eligibleClaimIds,
    grounding: input.grounding,
  });
  return Object.freeze({
    ok: accepted.decision === "accept" && narration.startsWith(preservedPrefix),
    narration,
    preservedBody: preservedPrefix,
    preservedPayoff: payoff,
    preservedPrefix,
    replacement,
    rewriteType: "grounding_payoff_repair",
    inventionRejected: false,
  });
}

export function applyRetentionDuplicatePayoffRepair(input: {
  readonly title: string;
  readonly narration: string;
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief: RetentionCompositionBrief;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly grounding?: RetentionGroundingContext | null;
}): RetentionBoundedRegionRepairResult {
  const source = input.narration.trim();
  const sentences = source.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  const payoff = sentences.at(-1)?.trim() ?? "";
  if (sentences.length < 3 || !payoff) {
    return Object.freeze({
      ok: false,
      narration: source,
      preservedBody: source,
      preservedPayoff: payoff,
      preservedPrefix: source,
      replacement: "",
      rewriteType: "duplicate_payoff_repair",
      inventionRejected: false,
    });
  }
  const preserved = [...sentences.slice(0, -2), payoff];
  const narration = preserved.join(" ").trim();
  const accepted = evaluateRetentionCanonicalNarrationAcceptance({
    raw: { title: input.title, narration },
    contentContract: input.contentContract,
    brief: input.brief,
    eligibleClaimIds: input.eligibleClaimIds,
    grounding: input.grounding,
  });
  return Object.freeze({
    ok: accepted.decision === "accept",
    narration,
    preservedBody: sentences.slice(0, -2).join(" "),
    preservedPayoff: payoff,
    preservedPrefix: sentences.slice(0, -2).join(" "),
    replacement: payoff,
    rewriteType: "duplicate_payoff_repair",
    inventionRejected: false,
  });
}

export function buildDeterministicRankingNumberOneCloser(input: {
  readonly brief: RetentionCompositionBrief;
  readonly narration: string;
}): string | null {
  const ranking = input.brief.requiredRankingMembership;
  if (ranking.length === 0) return null;
  const numberOne = ranking[0]!;
  const token = numberOne.split(" ")[0] ?? numberOne;
  if (!input.narration.includes(token)) return null;
  return `${numberOne} stands last as the number-one name.`;
}

export function extractReplacementOpening(proposalNarration: string): string {
  return firstSentence(proposalNarration.trim());
}

export function extractReplacementClosing(proposalNarration: string): string {
  return lastSentence(proposalNarration.trim());
}
