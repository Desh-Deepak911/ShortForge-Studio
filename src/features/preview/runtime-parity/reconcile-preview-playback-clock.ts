/**
 * Production adapter over the Prompt 1 clock contract.
 * No second clock and no independent media-item timer.
 */

import type { FootieScene } from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import {
  resolvePreviewClockAuthority,
} from "./resolve-preview-clock-authority";
import type { PreviewClockKind } from "./preview-runtime-parity-states";

export function resolveSceneTimelineBounds(
  scene: FootieScene | undefined,
  fallbackIndex: number,
): { startMs: number; endMs: number; durationMs: number } {
  const durationMs = scene ? getSceneDurationMs(scene) : 0;
  const startMs =
    scene && typeof scene.startMs === "number" && Number.isFinite(scene.startMs)
      ? Math.max(0, scene.startMs)
      : fallbackIndex === 0
        ? 0
        : 0;
  const endMs =
    scene && typeof scene.endMs === "number" && Number.isFinite(scene.endMs)
      ? Math.max(startMs, scene.endMs)
      : startMs + durationMs;
  return { startMs, endMs, durationMs };
}

export function resolveIdlePreviewSceneElapsedMs(input: {
  readonly scene: FootieScene | undefined;
  readonly sceneIndex: number;
  readonly timelineMs: number;
}): number {
  const bounds = resolveSceneTimelineBounds(input.scene, input.sceneIndex);
  const local = input.timelineMs - bounds.startMs;
  if (local < 0) {
    return 0;
  }
  if (bounds.durationMs <= 0) {
    return 0;
  }
  if (local >= bounds.durationMs) {
    return Math.max(0, bounds.durationMs - 1);
  }
  return local;
}

export function resolvePlaySceneStartMs(input: {
  readonly clockKind: PreviewClockKind;
  readonly playbackScope: "scene" | "story" | null;
  readonly sceneIndex: number;
  readonly scopedSceneIndex: number | null;
  readonly timelineMs: number;
  readonly startMs: number;
  readonly endMs: number;
}): { readonly startMs: number; readonly resume: boolean } {
  const canResume =
    input.clockKind === "paused" &&
    input.playbackScope === "scene" &&
    input.scopedSceneIndex === input.sceneIndex &&
    input.timelineMs >= input.startMs &&
    input.timelineMs < input.endMs;
  return {
    startMs: canResume ? input.timelineMs : input.startMs,
    resume: canResume,
  };
}

export function resolvePreviewClockAfterMediaMutation(input: {
  readonly scenes: readonly FootieScene[];
  readonly sceneIndex: number;
  readonly timelineMs: number;
  readonly clockKind: PreviewClockKind;
}): ReturnType<typeof resolvePreviewClockAuthority> {
  if (input.clockKind === "completed-scene" || input.clockKind === "completed-story") {
    return resolvePreviewClockAuthority({
      action: "restart-scene",
      scenes: input.scenes,
      sceneIndex: input.sceneIndex,
      timelineMs: input.timelineMs,
    });
  }
  const scene = input.scenes[input.sceneIndex];
  const bounds = resolveSceneTimelineBounds(scene, input.sceneIndex);
  const clamped = Math.min(
    Math.max(input.timelineMs, bounds.startMs),
    Math.max(bounds.startMs, bounds.endMs > bounds.startMs ? bounds.endMs - 1 : bounds.startMs),
  );
  return resolvePreviewClockAuthority({
    action: "seek",
    scenes: input.scenes,
    sceneIndex: input.sceneIndex,
    timelineMs: input.timelineMs,
    seekTimelineMs: clamped,
  });
}

export function buildPreviewMediaPlanSignature(
  scenes: readonly FootieScene[],
  sceneIndex: number,
): string {
  const scene = scenes[sceneIndex];
  if (!scene) {
    return "";
  }
  const timeline = (scene.mediaTimeline?.items ?? [])
    .map((item) => `${item.id}:${item.media.url ?? ""}`)
    .join(",");
  const visual = (scene.visualSequence?.items ?? [])
    .map((item) => `${item.id}:${item.media?.url ?? ""}`)
    .join(",");
  return `${scene.id}|${scene.media?.url ?? ""}|${timeline}|${visual}`;
}

export function resolvePreviewClockAfterSceneSelection(input: {
  readonly scenes: readonly FootieScene[];
  readonly sceneIndex: number;
  readonly timelineMs: number;
  readonly clockKind: PreviewClockKind;
  readonly isPlaying: boolean;
}): ReturnType<typeof resolvePreviewClockAuthority> | null {
  if (input.isPlaying) {
    return null;
  }
  const bounds = resolveSceneTimelineBounds(input.scenes[input.sceneIndex], input.sceneIndex);
  const outside = input.timelineMs < bounds.startMs || input.timelineMs >= bounds.endMs;
  const completed =
    input.clockKind === "completed-scene" || input.clockKind === "completed-story";
  if (!completed && !outside) {
    return null;
  }
  return resolvePreviewClockAuthority({
    action: "select-scene",
    scenes: input.scenes,
    sceneIndex: input.sceneIndex,
    timelineMs: input.timelineMs,
    targetSceneIndex: input.sceneIndex,
  });
}
