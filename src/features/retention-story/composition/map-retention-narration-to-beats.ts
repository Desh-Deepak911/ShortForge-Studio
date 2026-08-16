/**
 * Deterministic narration → Retention beat mapping — story-quality Prompt 3.
 * Preserves narration byte-for-byte. Boundaries only at safe sentence/clause
 * or last-resort word boundaries. Never inserts paragraph breaks.
 */

import type {
  RetentionFactHandlingMode,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { claimRefsSupportLinkedNarrationStatement } from "../strategy/retention-claim-linked-support";
import { canonicalizeControllingIdeaClaimRefs } from "../strategy/retention-claim-support";
import { detectRetentionFactualRisk } from "../strategy/retention-factual-risk";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionSegmentDraft } from "./assemble-retention-narration-candidate";
import { canonicalizeRetentionSegmentText } from "./canonicalize-retention-segment-text";
import { resolveAuthorizedClaimIdsForBeat } from "./retention-opening-claim-authority";

const UNCERTAINTY_MATCH_STOP = new Set([
  "may",
  "might",
  "maybe",
  "perhaps",
  "possibly",
  "reportedly",
  "allegedly",
  "unconfirmed",
  "uncertain",
  "unclear",
  "rumoured",
  "rumored",
]);

function contentTokens(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length >= 3 && !UNCERTAINTY_MATCH_STOP.has(token));
}

function collectCutOffsets(narration: string): number[] {
  const cuts = new Set<number>();
  const sentence = /[.!?…]["”’)»\]]*(?=\s+\S)/gu;
  let match: RegExpExecArray | null;
  while ((match = sentence.exec(narration)) != null) {
    cuts.add(match.index + match[0].length);
  }
  const clause = /(?:;|—|–)(?=\s+\S)/gu;
  while ((match = clause.exec(narration)) != null) {
    cuts.add(match.index + match[0].length);
  }
  const comma = /,(?=\s+\S)/gu;
  while ((match = comma.exec(narration)) != null) {
    const left = narration.slice(0, match.index).trim().split(/\s+/u).length;
    const right = narration.slice(match.index + 1).trim().split(/\s+/u).length;
    if (left >= 4 && right >= 4) cuts.add(match.index + match[0].length);
  }
  return [...cuts].sort((a, b) => a - b);
}

function collectSentenceCutOffsets(narration: string): number[] {
  const cuts: number[] = [];
  const sentence = /[.!?…]["”’)»\]]*(?=\s+\S)/gu;
  let match: RegExpExecArray | null;
  while ((match = sentence.exec(narration)) != null) {
    cuts.push(match.index + match[0].length);
  }
  return cuts;
}

function preserveTerminalSentenceCut(
  narration: string,
  chosen: readonly number[],
  needed: number,
  pool: readonly number[],
): number[] {
  if (needed <= 0) return [];
  const terminalBoundary = collectSentenceCutOffsets(narration).at(-1);
  if (terminalBoundary == null) return [...chosen].sort((a, b) => a - b);
  const before = chosen
    .filter((cut) => cut < terminalBoundary)
    .slice(0, Math.max(0, needed - 1));
  for (const cut of [...pool].reverse()) {
    if (before.length >= needed - 1) break;
    if (cut < terminalBoundary && !before.includes(cut)) before.push(cut);
  }
  if (before.length !== needed - 1) {
    return [...chosen].sort((a, b) => a - b);
  }
  return [...before, terminalBoundary].sort((a, b) => a - b);
}

function wordBoundaryCuts(narration: string): number[] {
  const cuts: number[] = [];
  const re = /\s+(?=\S)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(narration)) != null) {
    cuts.push(match.index);
  }
  return cuts;
}

function chooseCuts(narration: string, needed: number): number[] {
  if (needed <= 0) return [];
  const preferred = collectCutOffsets(narration);
  if (preferred.length >= needed) {
    const step = preferred.length / needed;
    const chosen: number[] = [];
    for (let i = 0; i < needed; i++) {
      const idx = Math.min(preferred.length - 1, Math.floor((i + 1) * step) - 1);
      const cut = preferred[idx]!;
      if (!chosen.includes(cut)) chosen.push(cut);
    }
    if (chosen.length === needed) {
      return preserveTerminalSentenceCut(
        narration,
        chosen,
        needed,
        preferred,
      );
    }
  }
  const words = wordBoundaryCuts(narration);
  const pool = [...new Set([...preferred, ...words])].sort((a, b) => a - b);
  if (pool.length < needed) {
    throw new RetentionStoryError(
      "composer_segment_mismatch",
      "Retention narration cannot be mapped onto Retention beats at safe boundaries.",
    );
  }
  const step = pool.length / needed;
  const chosen: number[] = [];
  for (let i = 0; i < needed; i++) {
    const idx = Math.min(pool.length - 1, Math.floor((i + 1) * step) - 1);
    let cut = pool[idx]!;
    let guard = 0;
    while (chosen.includes(cut) && guard < pool.length) {
      cut = pool[Math.min(pool.length - 1, idx + guard)]!;
      guard += 1;
    }
    if (!chosen.includes(cut)) chosen.push(cut);
  }
  if (chosen.length !== needed) {
    throw new RetentionStoryError(
      "composer_segment_mismatch",
      "Retention narration beat mapping could not place distinct boundaries.",
    );
  }
  return preserveTerminalSentenceCut(narration, chosen, needed, pool);
}

function sliceAtCuts(narration: string, cuts: readonly number[]): string[] {
  const bounds = [0, ...cuts, narration.length];
  const slices: string[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    let start = bounds[i]!;
    let end = bounds[i + 1]!;
    while (start < end && /\s/.test(narration[start]!)) start += 1;
    while (end > start && /\s/.test(narration[end - 1]!)) end -= 1;
    const slice = narration.slice(start, end);
    if (!slice) {
      throw new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention narration mapping produced an empty beat span.",
      );
    }
    slices.push(slice);
  }
  return slices;
}

function claimIdsForSlice(input: {
  readonly slice: string;
  readonly beatId: string;
  readonly usedClaimIds: readonly string[];
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly factHandlingMode: RetentionFactHandlingMode;
}): readonly string[] {
  const authorized = resolveAuthorizedClaimIdsForBeat(
    input.beatId,
    input.plan,
    input.strategySeed,
  );
  const sliceTokens = contentTokens(input.slice);
  const planRefs =
    input.plan.beatPlan.beats.find((beat) => beat.id === input.beatId)
      ?.groundingClaimRefs ?? [];
  const candidates = [...new Set([...input.usedClaimIds, ...planRefs])];
  const matched = candidates.filter((claimId) => {
    if (!authorized.has(claimId)) return false;
    const claim = input.grounding.claims.find((entry) => entry.claimId === claimId);
    if (!claim) return false;
    const claimTokens = contentTokens(claim.text);
    return claimTokens.some((token) => sliceTokens.includes(token));
  });
  const supporting = matched.filter((claimId) =>
    claimRefsSupportLinkedNarrationStatement(
      input.grounding,
      [claimId],
      input.slice,
      input.factHandlingMode,
    ),
  );
  const chosen =
    supporting.length > 0
      ? supporting
      : claimRefsSupportLinkedNarrationStatement(
            input.grounding,
            matched.slice(0, 4),
            input.slice,
            input.factHandlingMode,
          )
        ? matched.slice(0, 4)
        : [];
  const refs = canonicalizeControllingIdeaClaimRefs(chosen.slice(0, 4));
  return refs ?? [];
}

export function mapRetentionNarrationToBeats(input: {
  readonly narration: string;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly usedClaimIds?: readonly string[];
  readonly hookOpening?: string;
  readonly payoffClosing?: string;
  readonly allowEmptyInternalBeats?: boolean;
  readonly factHandlingMode?: RetentionFactHandlingMode;
}): {
  readonly segments: readonly RetentionSegmentDraft[];
  readonly narration: string;
  readonly hookOpening: string;
  readonly payoffClosing: string;
} {
  const narration = input.narration.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!narration || /[\n\r]/.test(input.narration)) {
    throw new RetentionStoryError(
      "composer_proposal_invalid",
      "Retention narration-first proposal must be one continuous spoken string.",
    );
  }
  if (narration !== input.narration.normalize("NFC").replace(/\s+/g, " ").trim()) {
    throw new RetentionStoryError(
      "composer_proposal_invalid",
      "Retention narration-first proposal is not in canonical spoken form.",
    );
  }
  const beatIds = input.plan.beatPlan.beats.map((beat) => beat.id);
  if (beatIds.length === 0) {
    throw new RetentionStoryError(
      "composer_segment_mismatch",
      "Retention narration mapping requires Retention beats.",
    );
  }
  const words = narration.split(/\s+/u).filter(Boolean);
  const sentences = narration.split(/(?<=[.!?…])\s+(?=\p{Lu})/u).filter(Boolean);
  const allowEmptyInternal =
    input.allowEmptyInternalBeats === true &&
    (words.length < beatIds.length || sentences.length < beatIds.length);
  let slices: string[];
  if (allowEmptyInternal && sentences.length < beatIds.length) {
    slices = beatIds.map(() => "");
    slices[0] = sentences[0] ?? narration;
    if (sentences.length > 1) {
      slices[slices.length - 1] = sentences[sentences.length - 1]!;
      const middles = sentences.slice(1, -1);
      for (let i = 0; i < middles.length && i + 1 < slices.length - 1; i++) {
        slices[i + 1] = middles[i]!;
      }
      if (middles.length > Math.max(0, slices.length - 2)) {
        const overflow = middles.slice(Math.max(0, slices.length - 2));
        slices[slices.length - 1] = [...overflow, slices[slices.length - 1]]
          .filter(Boolean)
          .join(" ");
      }
    }
    const spoken = slices.filter((slice) => slice.length > 0).join(" ");
    if (spoken !== narration) {
      throw new RetentionStoryError(
        "composer_segment_mismatch",
        "Retention narration mapping is not byte-faithful.",
      );
    }
  } else {
    if (words.length < beatIds.length) {
      throw new RetentionStoryError(
        "composer_segment_mismatch",
        "Retention narration is too short to map onto Retention beats.",
      );
    }
    const cuts = chooseCuts(narration, beatIds.length - 1);
    slices = sliceAtCuts(narration, cuts);
    if (slices.join(" ") !== narration) {
      throw new RetentionStoryError(
        "composer_segment_mismatch",
        "Retention narration mapping is not byte-faithful.",
      );
    }
  }

  const hookOpening =
    input.hookOpening?.trim() ||
    (narration.match(/^[^.!?…]+[.!?…]/u)?.[0] ?? slices[0]!);
  const payoffClosing =
    input.payoffClosing?.trim() ||
    (narration.match(/[^.!?…]+[.!?…]\s*$/u)?.[0]?.trim() ?? slices[slices.length - 1]!);

  const usedClaimIds = input.usedClaimIds ?? [];
  const segments = beatIds.map((beatId, index) => {
    const raw = slices[index] ?? "";
    if (raw.length === 0) {
      return Object.freeze({
        beatId,
        text: "",
        claimRefs: Object.freeze([] as string[]),
        factualRisk: false,
      });
    }
    const text = canonicalizeRetentionSegmentText(raw);
    if (text == null || text !== raw) {
      throw new RetentionStoryError(
        "composer_proposal_invalid",
        "Retention mapped beat text is not canonical.",
      );
    }
    const claimRefs = claimIdsForSlice({
      slice: text,
      beatId,
      usedClaimIds,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      factHandlingMode: input.factHandlingMode ?? "verified_facts_only",
    });
    const factualRisk = detectRetentionFactualRisk(text).risky;
    return Object.freeze({
      beatId,
      text,
      claimRefs,
      factualRisk,
    });
  });

  return Object.freeze({
    segments: Object.freeze(segments),
    narration,
    hookOpening,
    payoffClosing,
  });
}
