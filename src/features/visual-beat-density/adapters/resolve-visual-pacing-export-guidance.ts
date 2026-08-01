/**
 * Recoverable Visual pacing export guidance.
 * Authoring metadata only — never a render authority or ExportManifest field.
 */

import type { FootieScript } from "@/features/story/types";

import { evaluateVisualBeatPlanStaleness } from "../domain/evaluate-visual-beat-plan-staleness";
import { projectSceneVisualBeatPlanContext } from "./project-scene-visual-beat-plan";

export const VISUAL_PACING_EXPORT_GUIDANCE_CODES = {
  VISUAL_PACING_DRAFT_NOT_APPLIED: "VISUAL_PACING_DRAFT_NOT_APPLIED",
  VISUAL_PACING_STALE: "VISUAL_PACING_STALE",
  VISUAL_PACING_METADATA_INVALID: "VISUAL_PACING_METADATA_INVALID",
} as const;

export type VisualPacingExportGuidanceCode =
  (typeof VISUAL_PACING_EXPORT_GUIDANCE_CODES)[keyof typeof VISUAL_PACING_EXPORT_GUIDANCE_CODES];

export const VISUAL_PACING_EXPORT_GUIDANCE_MESSAGES: Record<
  VisualPacingExportGuidanceCode,
  string
> = {
  VISUAL_PACING_DRAFT_NOT_APPLIED:
    "A Visual pacing suggestion has not been applied. Export will use the current sequence timing.",
  VISUAL_PACING_STALE:
    "Visual pacing is out of date. Export will use your current sequence timing.",
  VISUAL_PACING_METADATA_INVALID:
    "Saved Visual pacing metadata could not be read. Export will use the current sequence timing.",
};

export interface VisualPacingExportGuidanceItem {
  readonly code: VisualPacingExportGuidanceCode;
  readonly message: string;
  readonly sceneId: string;
}

export interface ResolveVisualPacingExportGuidanceInput {
  /**
   * Explicit authoring capability. Default ignored/fail-closed when not true.
   * Never read from environment here.
   */
  readonly visualBeatDensityEnabled?: boolean;
}

/**
 * Derive recoverable export guidance from a final export-prepared story.
 * Call only after timeline sync, voiceover refit, and mixed-media reconciliation.
 * Never blocks export; never mutates the story.
 */
export function resolveVisualPacingExportGuidance(
  preparedStory: FootieScript,
  input: ResolveVisualPacingExportGuidanceInput = {},
): readonly VisualPacingExportGuidanceItem[] {
  if (input.visualBeatDensityEnabled !== true) {
    return Object.freeze([]);
  }

  const items: VisualPacingExportGuidanceItem[] = [];
  const seen = new Set<VisualPacingExportGuidanceCode>();

  for (const scene of preparedStory.scenes) {
    if (scene.visualBeatPlan === undefined) {
      continue;
    }

    const context = projectSceneVisualBeatPlanContext(scene);
    const projection = evaluateVisualBeatPlanStaleness({
      storedPlan: scene.visualBeatPlan,
      narrationText: context.narrationText,
      sceneDurationMs: context.sceneDurationMs,
      usableMedia: context.usableMedia,
      currentStartOffsetsMs: context.currentStartOffsetsMs,
    });
    let code: VisualPacingExportGuidanceCode | null = null;

    if (projection.effectiveStatus === "invalid") {
      code = VISUAL_PACING_EXPORT_GUIDANCE_CODES.VISUAL_PACING_METADATA_INVALID;
    } else if (projection.effectiveStatus === "stale") {
      code = VISUAL_PACING_EXPORT_GUIDANCE_CODES.VISUAL_PACING_STALE;
    } else if (projection.effectiveStatus === "draft") {
      code = VISUAL_PACING_EXPORT_GUIDANCE_CODES.VISUAL_PACING_DRAFT_NOT_APPLIED;
    } else if (projection.effectiveStatus === "applied") {
      code = null;
    } else {
      // absent — ignore
      code = null;
    }

    if (!code || seen.has(code)) {
      continue;
    }
    seen.add(code);
    items.push({
      code,
      message: VISUAL_PACING_EXPORT_GUIDANCE_MESSAGES[code],
      sceneId: scene.id,
    });
  }

  return Object.freeze(items);
}
