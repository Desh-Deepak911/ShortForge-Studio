/**
 * Bounded duration compression — story-quality Prompt 12.
 * Removes optional connectives only. Never pads. Never drops ranking members,
 * order, reasons, or an explicit number-one payoff.
 */

import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";

const OPTIONAL_SENTENCE_PREFIX =
  /^(?:then|next|finally|also|meanwhile|after that),?\s+/iu;

export interface RetentionBoundedDurationCompressionResult {
  readonly ok: boolean;
  readonly narration: string;
  readonly removedConnectiveCount: number;
  readonly wordCountBefore: number;
  readonly wordCountAfter: number;
  readonly membersPreserved: boolean;
  readonly orderPreserved: boolean;
  readonly numberOnePreserved: boolean;
}

function rankingTokens(name: string): string {
  return name.split(/\s+/u)[0] ?? name;
}

export function applyRetentionBoundedDurationCompression(input: {
  readonly narration: string;
  readonly brief: RetentionCompositionBrief;
}): RetentionBoundedDurationCompressionResult {
  const source = input.narration.replace(/\s+/g, " ").trim();
  const before = countRetentionNarrationWords(source);
  const sentences = source.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  let removed = 0;
  const compressed = sentences
    .map((sentence) => {
      const next = sentence.replace(OPTIONAL_SENTENCE_PREFIX, "");
      if (next !== sentence) removed += 1;
      return next.trim();
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const members = input.brief.requiredRankingMembership;
  const membersPreserved = members.every((name) =>
    compressed.includes(rankingTokens(name)),
  );
  let orderPreserved = true;
  if (members.length >= 2) {
    let cursor = 0;
    for (const name of members) {
      const at = compressed.indexOf(rankingTokens(name), cursor);
      if (at < 0) {
        orderPreserved = false;
        break;
      }
      cursor = at + 1;
    }
  }
  const numberOne = input.brief.rankingNumberOneMember ?? members[0] ?? "";
  const numberOnePreserved =
    !numberOne ||
    (compressed.includes(rankingTokens(numberOne)) &&
      /\b(?:number one|no\.?\s*1|stands last|decisive name|#1)\b/iu.test(
        compressed,
      ));

  const after = countRetentionNarrationWords(compressed);
  const ok =
    compressed.length > 0 &&
    after <= before &&
    membersPreserved &&
    orderPreserved &&
    numberOnePreserved;

  return Object.freeze({
    ok,
    narration: ok ? compressed : source,
    removedConnectiveCount: removed,
    wordCountBefore: before,
    wordCountAfter: ok ? after : before,
    membersPreserved,
    orderPreserved,
    numberOnePreserved,
  });
}
