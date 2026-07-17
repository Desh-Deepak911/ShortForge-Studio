/**
 * Deterministic per-beat suggested word budgets — Sprint 10H.2B.
 * Shares sum exactly to plan.compressionGoals.targetWordBudget from beat timing.
 */

import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";

export interface RetentionSegmentWordBudget {
  readonly beatId: string;
  readonly suggestedWordBudget: number;
}

/**
 * Allocate integer word suggestions proportional to beat duration shares.
 * Uses largest-remainder so the sum equals `totalWordBudget` exactly.
 * When omitted, defaults to plan.compressionGoals.targetWordBudget.
 */
export function allocateRetentionSegmentWordBudgets(
  plan: RetentionStoryPlan,
  totalWordBudget?: number,
): readonly RetentionSegmentWordBudget[] {
  const target =
    typeof totalWordBudget === "number" &&
    Number.isFinite(totalWordBudget) &&
    totalWordBudget > 0
      ? Math.floor(totalWordBudget)
      : plan.compressionGoals.targetWordBudget;
  const beats = plan.beatPlan.beats;
  if (!Number.isFinite(target) || target <= 0 || beats.length === 0) {
    return Object.freeze([]);
  }

  const durations = beats.map((b) =>
    Math.max(1, b.estimatedEndMs - b.estimatedStartMs),
  );
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  const raw = durations.map((d) => (d / totalDuration) * target);
  const floors = raw.map((v) => Math.floor(v));
  let assigned = floors.reduce((a, b) => a + b, 0);
  // Ensure every beat gets at least 1 when target >= beat count.
  if (target >= beats.length) {
    for (let i = 0; i < floors.length; i++) {
      if (floors[i]! < 1) {
        floors[i] = 1;
        assigned += 1;
      }
    }
  }

  const remainders = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  let leftover = target - assigned;
  if (leftover > 0) {
    let cursor = 0;
    while (leftover > 0 && remainders.length > 0) {
      const idx = remainders[cursor % remainders.length]!.i;
      floors[idx]! += 1;
      leftover -= 1;
      cursor += 1;
    }
  } else if (leftover < 0) {
    // Trim from largest non-terminal shares while keeping ≥1 when possible.
    const order = floors
      .map((v, i) => ({ i, v }))
      .sort((a, b) => b.v - a.v || a.i - b.i);
    let need = -leftover;
    for (const entry of order) {
      if (need <= 0) break;
      const minKeep = target >= beats.length ? 1 : 0;
      const reducible = entry.v - minKeep;
      if (reducible <= 0) continue;
      const cut = Math.min(reducible, need);
      floors[entry.i]! -= cut;
      need -= cut;
    }
  }

  return Object.freeze(
    beats.map((beat, i) =>
      Object.freeze({
        beatId: beat.id,
        suggestedWordBudget: floors[i]!,
      }),
    ),
  );
}
