/**
 * Deterministic supported-opening promotion — story-quality Prompt 12.
 * When only the first sentence is unsupported and the remainder is grounded,
 * drop the opening and keep the remaining model bytes. No provider call.
 */

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";
import { evaluateRetentionCanonicalNarrationAcceptance } from "./evaluate-retention-canonical-narration-acceptance";
import { evaluateRetentionHookBodyPayoff } from "./evaluate-retention-hook-body-payoff";
import { evaluateRetentionSpokenClaimGrounding } from "./evaluate-retention-spoken-claim-grounding";

export interface RetentionSupportedOpeningPromotionResult {
  readonly ok: boolean;
  readonly narration: string;
  readonly preservedRemainder: string;
  readonly removedOpening: string;
  readonly promotedOpening: string;
  readonly rewriteType: "supported_opening_promotion";
  readonly providerCalls: 0;
}

function splitSpokenSentences(narration: string): string[] {
  return narration
    .normalize("NFC")
    .trim()
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isCompleteMeaningfulSentence(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!/[.!?…]["”’)»\]]*$/u.test(trimmed)) return false;
  const words = trimmed.replace(/[^\p{L}\p{N}'’-]+/gu, " ").trim().split(/\s+/u);
  if (words.length < 6) return false;
  if (/^(?:why|how|what|when|where|who)\s+[\p{L}'-]+\??$/iu.test(trimmed)) {
    return false;
  }
  return true;
}

function remainderConnectsToPayoff(
  remainder: string,
  brief: RetentionCompositionBrief,
): boolean {
  const payoff = remainder.split(/(?<=[.!?…])\s+/u).filter(Boolean).at(-1) ?? "";
  const subject = brief.centralSubject.split(/\s+/u)[0] ?? "";
  if (subject && new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(remainder)) {
    return payoff.length > 0;
  }
  const idea = brief.controllingIdea.split(/\s+/u).filter((token) => token.length >= 4);
  return idea.some((token) =>
    new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(remainder),
  );
}

export function applyRetentionSupportedOpeningPromotion(input: {
  readonly title: string;
  readonly narration: string;
  readonly contentContract: RetentionCreatorContentContract;
  readonly brief: RetentionCompositionBrief;
  readonly eligibleClaimIds: ReadonlySet<string>;
  readonly grounding?: RetentionGroundingContext | null;
}): RetentionSupportedOpeningPromotionResult {
  const source = input.narration.trim();
  const sentences = splitSpokenSentences(source);
  const removedOpening = sentences[0] ?? "";
  const remainderSentences = sentences.slice(1);
  const preservedRemainder = remainderSentences.join(" ").trim();
  const fail = (promotedOpening = ""): RetentionSupportedOpeningPromotionResult =>
    Object.freeze({
      ok: false,
      narration: source,
      preservedRemainder,
      removedOpening,
      promotedOpening,
      rewriteType: "supported_opening_promotion" as const,
      providerCalls: 0 as const,
    });

  if (sentences.length < 2 || !removedOpening || !preservedRemainder) {
    return fail();
  }

  const openingGrounding = evaluateRetentionSpokenClaimGrounding({
    narration: removedOpening,
    contentContract: input.contentContract,
    eligibleClaimIds: input.eligibleClaimIds,
    grounding: input.grounding,
  });
  const remainderGrounding = evaluateRetentionSpokenClaimGrounding({
    narration: preservedRemainder,
    contentContract: input.contentContract,
    eligibleClaimIds: input.eligibleClaimIds,
    grounding: input.grounding,
  });
  if (openingGrounding.ok || !remainderGrounding.ok) {
    return fail();
  }

  const promotedOpening = remainderSentences[0] ?? "";
  if (!isCompleteMeaningfulSentence(promotedOpening)) {
    return fail(promotedOpening);
  }
  if (!remainderConnectsToPayoff(preservedRemainder, input.brief)) {
    return fail(promotedOpening);
  }

  const relationship = evaluateRetentionHookBodyPayoff({
    narration: preservedRemainder,
    contentContract: input.contentContract,
    brief: input.brief,
  });
  if (!relationship.ok) {
    return fail(promotedOpening);
  }

  const accepted = evaluateRetentionCanonicalNarrationAcceptance({
    raw: {
      title: input.title,
      narration: preservedRemainder,
    },
    contentContract: input.contentContract,
    brief: input.brief,
    eligibleClaimIds: input.eligibleClaimIds,
    grounding: input.grounding,
  });
  if (accepted.decision !== "accept") {
    return fail(promotedOpening);
  }
  if (accepted.narration !== preservedRemainder) {
    return fail(promotedOpening);
  }

  return Object.freeze({
    ok: true,
    narration: preservedRemainder,
    preservedRemainder,
    removedOpening,
    promotedOpening,
    rewriteType: "supported_opening_promotion",
    providerCalls: 0,
  });
}
