/**
 * Story-level creator-content allocation — story-quality Prompt 2.
 * Duration compresses and prioritises. It does not make a fact ineligible
 * merely because it exceeds one beat's average word share.
 */

import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";
import type {
  RetentionCreatorContentAllocation,
  RetentionCreatorContentContract,
  RetentionCreatorContentUnit,
} from "../domain/retention-creator-content-contract.types";
import { compressRetentionClaimLinkedNarration } from "../strategy/retention-claim-linked-support";

function unitWordCost(unit: RetentionCreatorContentUnit): number {
  return Math.max(3, countRetentionNarrationWords(unit.text));
}

function isAllocatable(unit: RetentionCreatorContentUnit): boolean {
  return (
    unit.kind !== "instruction" &&
    unit.kind !== "forbidden" &&
    (unit.kind === "factual" ||
      unit.kind === "interpretive" ||
      unit.kind === "uncertain")
  );
}

export function allocateRetentionCreatorContentUnits(input: {
  readonly contentContract: RetentionCreatorContentContract;
  readonly beatCount: number;
  readonly storyWordBudget?: number;
}): RetentionCreatorContentAllocation {
  const beatCount = Math.max(2, input.beatCount);
  const budget =
    input.storyWordBudget ?? input.contentContract.storyWordBudget;
  const reserved = Math.max(16, Math.floor(budget * 0.28));
  let remaining = Math.max(8, budget - reserved);

  const byId = new Map(
    input.contentContract.orderedUnits.map((unit) => [unit.contentUnitId, unit]),
  );
  const essential = input.contentContract.essentialContentUnitIds
    .map((id) => byId.get(id))
    .filter((unit): unit is RetentionCreatorContentUnit =>
      Boolean(unit && isAllocatable(unit)),
    );
  const optional = input.contentContract.optionalContentUnitIds
    .map((id) => byId.get(id))
    .filter((unit): unit is RetentionCreatorContentUnit =>
      Boolean(unit && isAllocatable(unit)),
    );

  const usedEssential: string[] = [];
  const omittedEssential: string[] = [];
  const usedOptional: string[] = [];
  const omittedOptional: string[] = [];
  const assigned: string[] = [];

  for (const unit of essential) {
    const cost = Math.min(
      unitWordCost(unit),
      countRetentionNarrationWords(
        compressRetentionClaimLinkedNarration(unit.text, remaining),
      ),
    );
    if (remaining <= 0 && usedEssential.length > 0) {
      omittedEssential.push(unit.contentUnitId);
      continue;
    }
    usedEssential.push(unit.contentUnitId);
    assigned.push(unit.contentUnitId);
    remaining -= Math.min(remaining, Math.max(3, cost));
  }

  for (const unit of optional) {
    const cost = unitWordCost(unit);
    if (cost > remaining) {
      omittedOptional.push(unit.contentUnitId);
      continue;
    }
    usedOptional.push(unit.contentUnitId);
    assigned.push(unit.contentUnitId);
    remaining -= cost;
  }

  const middleCount = Math.max(1, beatCount - 2);
  const beatAssignments = Array.from({ length: beatCount }, (_, beatIndex) => {
    if (beatIndex === 0 || beatIndex === beatCount - 1) {
      return Object.freeze({
        beatIndex,
        contentUnitIds: Object.freeze([] as string[]),
      });
    }
    return Object.freeze({
      beatIndex,
      contentUnitIds: Object.freeze([] as string[]),
    });
  });

  const mutable = beatAssignments.map((entry) => [...entry.contentUnitIds]);
  assigned.forEach((id, index) => {
    const unit = byId.get(id);
    const words = unit ? unitWordCost(unit) : 8;
    const span = words > Math.floor(budget / beatCount) + 4 ? 2 : 1;
    const start = 1 + (index % middleCount);
    for (let offset = 0; offset < span; offset += 1) {
      const beatIndex = Math.min(beatCount - 2, start + offset);
      if (beatIndex <= 0 || beatIndex >= beatCount - 1) continue;
      if (!mutable[beatIndex]!.includes(id)) mutable[beatIndex]!.push(id);
    }
  });

  // Multiple short related units may share one middle beat.
  const frozenAssignments = mutable.map((ids, beatIndex) =>
    Object.freeze({
      beatIndex,
      contentUnitIds: Object.freeze(ids),
    }),
  );

  return Object.freeze({
    usedEssentialContentUnitIds: Object.freeze(usedEssential),
    usedOptionalContentUnitIds: Object.freeze(usedOptional),
    omittedOptionalContentUnitIds: Object.freeze(omittedOptional),
    omittedEssentialContentUnitIds: Object.freeze(omittedEssential),
    coverageWarning: omittedEssential.length > 0,
    beatAssignments: Object.freeze(frozenAssignments),
  });
}
