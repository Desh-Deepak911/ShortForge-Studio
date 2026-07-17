/**
 * Box-constrained integer-ms beat budget allocation — Sprint 10D.1.
 *
 * Every beat duration is constrained to the active density profile's
 * [minBeatDuration, maxBeatDuration] bounds (with unavoidable ±1ms rounding).
 * Pacing weights redistribute only the residual after minima are assigned.
 */

import type { PacingProfile } from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionBeatBudget } from "./retention-story-plan.types";

function pacingWeights(
  profile: PacingProfile,
  count: number,
): readonly number[] {
  const weights: number[] = [];
  for (let i = 0; i < count; i++) {
    switch (profile) {
      case "front_loaded":
        weights.push(count - i + 1);
        break;
      case "escalating":
        weights.push(i + 2);
        break;
      case "reveal_late":
        weights.push(i >= Math.floor((2 * count) / 3) ? (i + 1) * 2 : i + 1);
        break;
      default:
        weights.push(1);
        break;
    }
  }
  return weights;
}

/**
 * Allocate `count` half-open [startMs, endMs) budgets across durationSec,
 * with every beat duration constrained to [minBeatDurationSec, maxBeatDurationSec].
 */
export function allocateRetentionBeatBudgets(input: {
  readonly durationSec: number;
  readonly count: number;
  readonly pacingProfile: PacingProfile;
  readonly minBeatDurationSec: number;
  readonly maxBeatDurationSec: number;
}): readonly RetentionBeatBudget[] {
  const count = Math.floor(input.count);
  const totalMs = Math.round(input.durationSec * 1000);
  if (
    !Number.isFinite(input.minBeatDurationSec) ||
    !Number.isFinite(input.maxBeatDurationSec) ||
    input.minBeatDurationSec <= 0 ||
    input.maxBeatDurationSec < input.minBeatDurationSec
  ) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Beat budget allocation requires valid density duration bounds.",
    );
  }
  const minMs = Math.max(1, Math.round(input.minBeatDurationSec * 1000));
  const maxMs = Math.max(minMs, Math.round(input.maxBeatDurationSec * 1000));

  if (count < 1) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Beat budget allocation requires at least one beat.",
    );
  }
  if (!Number.isFinite(totalMs) || totalMs < count) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Duration is too short to give every beat a positive budget.",
    );
  }
  if (count * minMs > totalMs) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Beat count cannot satisfy the active minimum beat duration.",
    );
  }
  if (count * maxMs < totalMs) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Beat count cannot satisfy the active maximum beat duration.",
    );
  }

  // 1. Assign every beat its minimum duration.
  const durations = new Array<number>(count).fill(minMs);
  let remaining = totalMs - count * minMs;
  const headroom = durations.map(() => maxMs - minMs);
  const weights = pacingWeights(input.pacingProfile, count);
  const sumW = weights.reduce((a, b) => a + b, 0);

  // 2–3. Distribute remaining by pacing weights, capping at max.
  if (remaining > 0 && sumW > 0) {
    const idealAdds: number[] = [];
    let assigned = 0;
    for (let i = 0; i < count; i++) {
      const ideal = Math.floor((remaining * weights[i]!) / sumW);
      const add = Math.min(ideal, headroom[i]!);
      idealAdds.push(add);
      assigned += add;
    }
    for (let i = 0; i < count; i++) {
      durations[i]! += idealAdds[i]!;
      headroom[i]! -= idealAdds[i]!;
    }
    remaining -= assigned;

    // 4. Redistribute remainder deterministically (highest weight first, stable).
    const order = [...weights.keys()].sort((a, b) => {
      const byWeight = weights[b]! - weights[a]!;
      if (byWeight !== 0) return byWeight;
      return a - b;
    });
    let guard = 0;
    while (remaining > 0 && guard < count * (maxMs + 2)) {
      let progressed = false;
      for (const i of order) {
        if (remaining <= 0) break;
        if (headroom[i]! <= 0) continue;
        durations[i]! += 1;
        headroom[i]! -= 1;
        remaining -= 1;
        progressed = true;
      }
      if (!progressed) break;
      guard += 1;
    }
  }

  // Repair tiny overshoot if minima forced us slightly above (should be rare).
  let sum = durations.reduce((a, b) => a + b, 0);
  if (sum > totalMs) {
    const order = [...weights.keys()].sort((a, b) => {
      const byWeight = weights[a]! - weights[b]!;
      if (byWeight !== 0) return byWeight;
      return b - a;
    });
    let deficit = sum - totalMs;
    for (const i of order) {
      if (deficit <= 0) break;
      const reducible = Math.max(0, durations[i]! - minMs);
      const cut = Math.min(reducible, deficit);
      durations[i]! -= cut;
      deficit -= cut;
    }
    sum = durations.reduce((a, b) => a + b, 0);
  }

  // Final exact-total correction within ±1ms tolerance per beat when needed.
  if (sum !== totalMs) {
    const delta = totalMs - sum;
    const targetIndex =
      input.pacingProfile === "front_loaded"
        ? 0
        : input.pacingProfile === "reveal_late"
          ? count - 1
          : Math.floor(count / 2);
    const next = durations[targetIndex]! + delta;
    if (next >= minMs - 1 && next <= maxMs + 1) {
      durations[targetIndex] = next;
    } else {
      throw new RetentionStoryError(
        "retention_story_plan_mismatch",
        "Beat budget allocation could not satisfy duration bounds exactly.",
      );
    }
  }

  const budgets: RetentionBeatBudget[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const startMs = cursor;
    const endMs = cursor + durations[i]!;
    if (endMs <= startMs) {
      throw new RetentionStoryError(
        "retention_story_plan_mismatch",
        "Beat budget allocation produced a non-positive beat duration.",
      );
    }
    const dur = endMs - startMs;
    if (dur < minMs - 1 || dur > maxMs + 1) {
      throw new RetentionStoryError(
        "retention_story_plan_mismatch",
        "Beat budget allocation violated active density duration bounds.",
      );
    }
    budgets.push(Object.freeze({ startMs, endMs }));
    cursor = endMs;
  }

  if (cursor !== totalMs) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Beat budget allocation failed to consume the exact project duration.",
    );
  }

  return Object.freeze(budgets);
}
