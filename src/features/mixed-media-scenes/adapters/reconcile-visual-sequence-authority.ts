/**
 * Canonical Sprint 12B render authority.
 *
 * When `mixed-media-scenes-v1` is enabled and a usable `visualSequence` exists:
 *   1. Normalize the sequence inside narration duration.
 *   2. Derive the ExportManifest/mediaTimeline weights deterministically.
 *   3. If a stored `mediaTimeline` disagrees, emit a diagnostic and keep
 *      `visualSequence` as the single timing authority.
 *
 * Production Preview / browser / headless entry points must pass an explicit
 * resolved `mixedMediaScenesEnabled` (or `visualSequenceAuthority: "on"|"force_off"`).
 * Unset capability defaults to `force_off` (fail-closed). `"auto"` is reserved for
 * pure-domain/migration callers that opt in explicitly — never an implicit
 * production activation path.
 *
 * Leaf imports from scene-media-timeline avoid barrel ↔ mixed-media cycles.
 */

import type { ProjectedSceneMediaTimeline } from "@/features/scene-media-timeline/adapters/project-scene-media-timeline";
import { projectSceneMediaTimeline } from "@/features/scene-media-timeline/adapters/project-scene-media-timeline";
import {
  resolveSceneMediaWindows,
  type ResolvedSceneMediaWindow,
} from "@/features/scene-media-timeline/resolution/resolve-media-windows";
import type {
  FootieScene,
  FootieScript,
  SceneMediaTimeline,
  SceneVisualSequence,
} from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import {
  cloneVisualSequence,
  normalizeVisualSequence,
  type NormalizeVisualSequenceResult,
  type VisualSequenceWarning,
} from "../domain/normalize-visual-sequence";
import { visualSequenceToMediaTimeline } from "./visual-sequence-to-media-timeline";

export type VisualSequenceAuthorityMode = "auto" | "on" | "force_off";

export type VisualRenderAuthority =
  | "visual_sequence"
  | "media_timeline"
  | "legacy";

export interface ReconcileVisualSequenceAuthorityResult {
  readonly authority: VisualRenderAuthority;
  readonly fromVisualSequence: boolean;
  readonly divergedFromStoredTimeline: boolean;
  readonly sequence: SceneVisualSequence | undefined;
  readonly canonicalMediaTimeline: SceneMediaTimeline | undefined;
  readonly windows: ResolvedSceneMediaWindow[];
  readonly timelineProjection: ProjectedSceneMediaTimeline;
  readonly sequenceNormalization: NormalizeVisualSequenceResult;
  readonly warnings: readonly VisualSequenceWarning[];
  readonly sceneDurationMs: number;
}

function resolveAuthorityMode(input: {
  readonly visualSequenceAuthority?: VisualSequenceAuthorityMode;
  readonly mixedMediaScenesEnabled?: boolean;
}): VisualSequenceAuthorityMode {
  if (input.visualSequenceAuthority) {
    return input.visualSequenceAuthority;
  }
  if (input.mixedMediaScenesEnabled === true) {
    return "on";
  }
  // false or unset → fail closed (visualSequence never activates implicitly).
  return "force_off";
}

/** True when stored timeline item ids/order/weights disagree with the sequence. */
export function visualSequenceDivergesFromMediaTimeline(
  sequence: SceneVisualSequence,
  mediaTimeline: SceneMediaTimeline | undefined,
): boolean {
  const derived = visualSequenceToMediaTimeline(sequence);
  if (!mediaTimeline || mediaTimeline.version !== 1) {
    return true;
  }
  if (mediaTimeline.items.length !== derived.items.length) {
    return true;
  }
  for (let index = 0; index < derived.items.length; index += 1) {
    const left = derived.items[index]!;
    const right = mediaTimeline.items[index]!;
    if (left.id !== right.id) return true;
    if (left.media.type !== right.media.type) return true;
    if (left.media.url !== right.media.url) return true;
    // Weights are proportional to durationMs; allow exact integer match only.
    if (Math.round(left.durationWeight) !== Math.round(right.durationWeight)) {
      return true;
    }
  }
  return false;
}

function windowsFromSequence(
  sequence: SceneVisualSequence,
): ResolvedSceneMediaWindow[] {
  return sequence.items.map((item, index) => ({
    itemId: item.id,
    itemIndex: index,
    media: item.media,
    startMs: item.startOffsetMs,
    endMs: item.startOffsetMs + item.durationMs,
    durationMs: item.durationMs,
    durationWeight: Math.max(1, item.durationMs),
    provenance: "stored_timeline" as const,
  }));
}

/**
 * Pure read reconciliation — does not mutate the input scene.
 * Documented authority: usable `visualSequence` wins unless mode is `force_off`.
 */
export function reconcileVisualSequenceRenderAuthority(
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
    readonly visualSequenceAuthority?: VisualSequenceAuthorityMode;
    readonly mixedMediaScenesEnabled?: boolean;
  } = {},
): ReconcileVisualSequenceAuthorityResult {
  const mode = resolveAuthorityMode(options);
  const sceneDurationMs = getSceneDurationMs(scene as FootieScene);
  const sequenceNormalization = normalizeVisualSequence(
    scene.visualSequence,
    sceneDurationMs,
  );
  const baseTimeline = projectSceneMediaTimeline(scene);
  const warnings: VisualSequenceWarning[] = [...sequenceNormalization.warnings];

  const sequenceUsable =
    sequenceNormalization.sequence != null &&
    sequenceNormalization.sequence.items.length > 0;
  const preferSequence = sequenceUsable && mode !== "force_off";

  if (preferSequence && sequenceNormalization.sequence) {
    const sequence = cloneVisualSequence(sequenceNormalization.sequence);
    const canonicalMediaTimeline = visualSequenceToMediaTimeline(sequence);
    const diverged = visualSequenceDivergesFromMediaTimeline(
      sequence,
      scene.mediaTimeline,
    );
    if (diverged) {
      warnings.push({
        code: "timeline_diverged_from_sequence",
        message:
          "Stored mediaTimeline disagreed with visualSequence; visualSequence is the render authority.",
      });
    }

    const windows = windowsFromSequence(sequence);
    const timelineProjection: ProjectedSceneMediaTimeline = {
      items: canonicalMediaTimeline.items.map((item) => ({
        id: item.id,
        media: item.media,
        durationWeight: item.durationWeight,
      })),
      fromStoredTimeline: true,
      diagnostics: baseTimeline.diagnostics,
      sceneDurationMs: sequenceNormalization.sceneDurationMs,
    };

    return {
      authority: "visual_sequence",
      fromVisualSequence: true,
      divergedFromStoredTimeline: diverged,
      sequence,
      canonicalMediaTimeline,
      windows,
      timelineProjection,
      sequenceNormalization,
      warnings: Object.freeze(warnings),
      sceneDurationMs: sequenceNormalization.sceneDurationMs,
    };
  }

  const windows = resolveSceneMediaWindows({
    items: baseTimeline.items,
    sceneDurationMs: baseTimeline.sceneDurationMs,
    provenance: baseTimeline.fromStoredTimeline
      ? "stored_timeline"
      : "legacy_virtual",
  });

  return {
    authority: baseTimeline.fromStoredTimeline ? "media_timeline" : "legacy",
    fromVisualSequence: false,
    divergedFromStoredTimeline: false,
    sequence: undefined,
    canonicalMediaTimeline: baseTimeline.fromStoredTimeline
      ? {
          version: 1 as const,
          items: baseTimeline.items.map((item) => ({
            id: item.id,
            media: item.media,
            durationWeight: item.durationWeight,
          })),
        }
      : undefined,
    windows,
    timelineProjection: baseTimeline,
    sequenceNormalization,
    warnings: Object.freeze(warnings),
    sceneDurationMs: baseTimeline.sceneDurationMs,
  };
}

/**
 * Returns a scene copy whose `mediaTimeline` (and normalized `visualSequence`)
 * match the canonical visual authority. Used by export preflight so browser and
 * headless share one repaired story copy.
 */
export function applyVisualSequenceAuthorityToScene(
  scene: FootieScene,
  options: {
    readonly visualSequenceAuthority?: VisualSequenceAuthorityMode;
    readonly mixedMediaScenesEnabled?: boolean;
  } = {},
): {
  readonly scene: FootieScene;
  readonly warnings: readonly VisualSequenceWarning[];
  readonly repaired: boolean;
} {
  const reconciled = reconcileVisualSequenceRenderAuthority(scene, options);
  if (
    !reconciled.fromVisualSequence ||
    !reconciled.sequence ||
    !reconciled.canonicalMediaTimeline
  ) {
    return { scene, warnings: reconciled.warnings, repaired: false };
  }

  const next: FootieScene = {
    ...scene,
    visualSequence: reconciled.sequence,
    mediaTimeline: reconciled.canonicalMediaTimeline,
    media: reconciled.canonicalMediaTimeline.items[0]?.media ?? scene.media,
  };
  return {
    scene: next,
    warnings: reconciled.warnings,
    repaired:
      reconciled.divergedFromStoredTimeline || scene.mediaTimeline == null,
  };
}

/** Repairs every scene on a story copy for shared Preview/Export projection. */
export function applyVisualSequenceAuthorityToStory(
  story: FootieScript,
  options: {
    readonly visualSequenceAuthority?: VisualSequenceAuthorityMode;
    readonly mixedMediaScenesEnabled?: boolean;
  } = {},
): {
  readonly story: FootieScript;
  readonly warnings: string[];
} {
  const warnings: string[] = [];
  const scenes = story.scenes.map((scene) => {
    const applied = applyVisualSequenceAuthorityToScene(scene, options);
    for (const warning of applied.warnings) {
      if (
        warning.code === "timeline_diverged_from_sequence" ||
        applied.repaired
      ) {
        warnings.push(`Scene ${scene.id}: ${warning.message}`);
      }
    }
    return applied.scene;
  });
  return {
    story: { ...story, scenes },
    warnings: [...new Set(warnings)],
  };
}
