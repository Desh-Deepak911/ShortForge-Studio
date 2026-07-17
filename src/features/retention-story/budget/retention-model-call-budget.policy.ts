/**
 * Immutable QualityMode → model-call budget policy — Sprint 10E.
 */

import type { QualityMode } from "@/types/footiebitz";
import type { RetentionModelCallBudgetPolicy } from "./retention-model-call-budget.types";

function freezePolicy(
  policy: RetentionModelCallBudgetPolicy,
): RetentionModelCallBudgetPolicy {
  return Object.freeze({ ...policy });
}

/**
 * Resolve the path-global budget policy for a generation attempt.
 * Scenes-only is represented as qualityMode `"scenes_only"`.
 */
export function resolveRetentionModelCallBudgetPolicy(
  qualityMode: QualityMode | "scenes_only",
): RetentionModelCallBudgetPolicy {
  switch (qualityMode) {
    case "cheap":
      // Sprint 10H.3 — +1 initial narration reserved for reliability rescue.
      return freezePolicy({
        qualityMode: "cheap",
        maxPlanner: 0,
        maxInitialNarration: 2,
        maxLengthCompression: 1,
        maxHookRepair: 1,
        maxHookFallback: 1,
        maxRetentionBodyRewrite: 0,
        totalCeiling: 5,
      });
    case "balanced":
      return freezePolicy({
        qualityMode: "balanced",
        maxPlanner: 1,
        maxInitialNarration: 2,
        maxLengthCompression: 1,
        maxHookRepair: 1,
        maxHookFallback: 1,
        maxRetentionBodyRewrite: 0,
        totalCeiling: 6,
      });
    case "best":
      return freezePolicy({
        qualityMode: "best",
        maxPlanner: 1,
        maxInitialNarration: 2,
        maxLengthCompression: 1,
        maxHookRepair: 1,
        maxHookFallback: 1,
        maxRetentionBodyRewrite: 1,
        totalCeiling: 7,
      });
    case "scenes_only":
      return freezePolicy({
        qualityMode: "scenes_only",
        maxPlanner: 0,
        maxInitialNarration: 0,
        maxLengthCompression: 0,
        maxHookRepair: 0,
        maxHookFallback: 0,
        maxRetentionBodyRewrite: 0,
        totalCeiling: 0,
      });
    default: {
      const _exhaustive: never = qualityMode;
      void _exhaustive;
      return resolveRetentionModelCallBudgetPolicy("balanced");
    }
  }
}
