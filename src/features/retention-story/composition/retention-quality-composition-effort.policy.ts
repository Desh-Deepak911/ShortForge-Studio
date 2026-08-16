/**
 * Fast / Balanced / Studio composition effort — story-quality Prompt 3.
 * Effort may change. Minimum coherence may not. Ledger ceilings stay authoritative.
 */

import type { QualityMode } from "@/types/footiebitz";

import type { RetentionCompositionQualityEffortPolicy } from "./retention-composition-brief.types";

export const RETENTION_QUALITY_COMPOSITION_EFFORT_VERSION =
  "retention-quality-composition-effort/1" as const;

const TABLE: Record<QualityMode, RetentionCompositionQualityEffortPolicy> = {
  cheap: {
    qualityMode: "cheap",
    plannerCalls: 0,
    narrationFirstComposerCalls: 1,
    boundedRepairWhenPermitted: false,
    targetedBodyRewrite: false,
    automaticRewriteUnlessSafetyRescue: false,
  },
  balanced: {
    qualityMode: "balanced",
    plannerCalls: 1,
    narrationFirstComposerCalls: 1,
    boundedRepairWhenPermitted: true,
    targetedBodyRewrite: false,
    automaticRewriteUnlessSafetyRescue: false,
  },
  best: {
    qualityMode: "best",
    plannerCalls: 1,
    narrationFirstComposerCalls: 1,
    boundedRepairWhenPermitted: true,
    targetedBodyRewrite: true,
    automaticRewriteUnlessSafetyRescue: false,
  },
};

export function resolveRetentionQualityCompositionEffort(
  qualityMode: QualityMode,
): RetentionCompositionQualityEffortPolicy {
  const policy = TABLE[qualityMode];
  return Object.freeze({ ...policy });
}

export function listRetentionQualityCompositionEffort(): readonly RetentionCompositionQualityEffortPolicy[] {
  return Object.freeze(
    (Object.keys(TABLE) as QualityMode[]).map((mode) =>
      resolveRetentionQualityCompositionEffort(mode),
    ),
  );
}
