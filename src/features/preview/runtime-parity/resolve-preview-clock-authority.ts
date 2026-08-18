/**
 * Deterministic Preview clock transitions for the parity contract.
 * Models stop / replay / scene switch / story completion without a second engine.
 */

import type { FootieScene } from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import type { PreviewClockKind, PreviewRuntimeParityClockState } from "./preview-runtime-parity-states";

export type PreviewClockAction =
  | "play"
  | "pause"
  | "seek"
  | "restart-scene"
  | "restart-story"
  | "complete-scene"
  | "complete-story"
  | "return-to-scene"
  | "select-scene";

export interface ResolvePreviewClockAuthorityInput {
  readonly action: PreviewClockAction;
  readonly scenes: readonly FootieScene[];
  readonly sceneIndex: number;
  readonly timelineMs: number;
  readonly seekTimelineMs?: number;
  readonly targetSceneIndex?: number;
}

function sceneStartMs(scene: FootieScene | undefined, fallbackIndex: number): number {
  if (!scene) return 0;
  if (typeof scene.startMs === "number" && Number.isFinite(scene.startMs)) {
    return Math.max(0, scene.startMs);
  }
  return fallbackIndex === 0 ? 0 : 0;
}

function storyEndMs(scenes: readonly FootieScene[]): number {
  const last = scenes[scenes.length - 1];
  if (!last) return 0;
  if (typeof last.endMs === "number" && Number.isFinite(last.endMs)) {
    return Math.max(0, last.endMs);
  }
  return scenes.reduce((sum, scene) => sum + getSceneDurationMs(scene), 0);
}

function holdLastMs(endMs: number): number {
  return endMs > 0 ? Math.max(0, endMs - 1) : 0;
}

export function resolvePreviewClockAuthority(
  input: ResolvePreviewClockAuthorityInput,
): PreviewRuntimeParityClockState & {
  readonly exitsInspection: boolean;
  readonly sceneIndex: number;
} {
  const scenes = input.scenes;
  const current = scenes[input.sceneIndex];
  const currentStart = sceneStartMs(current, input.sceneIndex);
  const currentDuration = current ? getSceneDurationMs(current) : 0;
  const currentEnd = currentStart + currentDuration;
  const storyEnd = storyEndMs(scenes);

  let kind: PreviewClockKind = "idle";
  let timelineMs = input.timelineMs;
  let sceneIndex = input.sceneIndex;
  let exitsInspection = false;

  switch (input.action) {
    case "play":
      kind = "playing";
      exitsInspection = true;
      break;
    case "pause":
      kind = "paused";
      break;
    case "seek":
      timelineMs =
        typeof input.seekTimelineMs === "number" && Number.isFinite(input.seekTimelineMs)
          ? Math.max(0, input.seekTimelineMs)
          : timelineMs;
      kind = "idle";
      break;
    case "restart-scene":
      timelineMs = currentStart;
      kind = "idle";
      exitsInspection = true;
      break;
    case "restart-story":
      timelineMs = 0;
      sceneIndex = 0;
      kind = "idle";
      exitsInspection = true;
      break;
    case "complete-scene":
      timelineMs = holdLastMs(currentEnd);
      kind = "completed-scene";
      break;
    case "complete-story":
      timelineMs = holdLastMs(storyEnd);
      sceneIndex = Math.max(0, scenes.length - 1);
      kind = "completed-story";
      break;
    case "return-to-scene":
    case "select-scene": {
      const nextIndex =
        typeof input.targetSceneIndex === "number" &&
        Number.isFinite(input.targetSceneIndex)
          ? Math.max(0, Math.min(scenes.length - 1, Math.floor(input.targetSceneIndex)))
          : input.sceneIndex;
      const next = scenes[nextIndex];
      sceneIndex = nextIndex;
      timelineMs = sceneStartMs(next, nextIndex);
      kind = "idle";
      exitsInspection = true;
      break;
    }
    default: {
      const _exhaustive: never = input.action;
      return _exhaustive;
    }
  }

  const scene = scenes[sceneIndex];
  const start = sceneStartMs(scene, sceneIndex);
  const duration = scene ? getSceneDurationMs(scene) : 0;
  const sceneElapsedMs = Math.max(0, timelineMs - start);

  return {
    kind,
    timelineMs,
    sceneElapsedMs,
    sceneId: scene?.id ?? null,
    holdingFinalFrame: duration > 0 && sceneElapsedMs >= duration,
    exitsInspection,
    sceneIndex,
  };
}
