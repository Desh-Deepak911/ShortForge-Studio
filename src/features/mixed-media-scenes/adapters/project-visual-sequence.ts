/**
 * Shared visual-plan projection for Preview / Browser / Headless.
 * Delegates to reconcileVisualSequenceRenderAuthority — the single timing seam.
 */

import type { ProjectedSceneMediaTimeline } from "@/features/scene-media-timeline/adapters/project-scene-media-timeline";
import type { ResolvedSceneMediaWindow } from "@/features/scene-media-timeline/resolution/resolve-media-windows";
import type { FootieScene } from "@/features/story/types";

import type {
  NormalizeVisualSequenceResult,
  VisualSequenceWarning,
} from "../domain/normalize-visual-sequence";
import {
  reconcileVisualSequenceRenderAuthority,
  type VisualRenderAuthority,
  type VisualSequenceAuthorityMode,
} from "./reconcile-visual-sequence-authority";

export interface ProjectedSceneVisualPlan {
  readonly windows: ResolvedSceneMediaWindow[];
  readonly fromVisualSequence: boolean;
  readonly fromStoredTimeline: boolean;
  readonly authority: VisualRenderAuthority;
  readonly divergedFromStoredTimeline: boolean;
  readonly warnings: readonly VisualSequenceWarning[];
  readonly sceneDurationMs: number;
  readonly timelineProjection: ProjectedSceneMediaTimeline;
  readonly sequenceNormalization: NormalizeVisualSequenceResult;
}

export function projectSceneVisualPlan(
  scene: Pick<
    FootieScene,
    | "id"
    | "image"
    | "uploadedImage"
    | "media"
    | "mediaTimeline"
    | "visualSequence"
    | "duration"
    | "durationMs"
  >,
  options: {
    readonly mixedMediaScenesEnabled?: boolean;
    readonly visualSequenceAuthority?: VisualSequenceAuthorityMode;
  } = {},
): ProjectedSceneVisualPlan {
  const reconciled = reconcileVisualSequenceRenderAuthority(scene, options);
  return {
    windows: reconciled.windows,
    fromVisualSequence: reconciled.fromVisualSequence,
    fromStoredTimeline: reconciled.timelineProjection.fromStoredTimeline,
    authority: reconciled.authority,
    divergedFromStoredTimeline: reconciled.divergedFromStoredTimeline,
    warnings: reconciled.warnings,
    sceneDurationMs: reconciled.sceneDurationMs,
    timelineProjection: reconciled.timelineProjection,
    sequenceNormalization: reconciled.sequenceNormalization,
  };
}
