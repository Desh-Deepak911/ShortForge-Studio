/**
 * Dev-only preview media motion diagnostics (4.2C-4).
 * No production UI. Callers must avoid per-frame console spam.
 */
import {
  resolveMediaMotionStateForSceneTiming,
  resolveSceneMediaMotion,
  type MediaMotionState,
} from "@/features/media-motion";
import type { FootieScene } from "@/features/story/types";
import { getSceneMediaType } from "@/features/story/utils";

import {
  clampPreviewSceneLocalTimeMs,
  resolvePreviewMediaBaseTransform,
} from "./previewMotionAdapter";

export interface PreviewMediaMotionDebugSummary {
  playbackTimeMs: number | null;
  sceneLocalTimeMs: number;
  sceneDurationMs: number;
  presetId: string;
  mediaType: "image" | "video" | "placeholder" | "unknown";
  resolved: MediaMotionState;
}

/** Build a one-shot diagnostic snapshot for preview motion. */
export function buildPreviewMediaMotionDebugSummary(input: {
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  playbackTimeMs?: number | null;
}): PreviewMediaMotionDebugSummary {
  const sceneLocalTimeMs = clampPreviewSceneLocalTimeMs(
    input.sceneElapsedMs,
    input.sceneDurationMs,
  );
  const motion = resolveSceneMediaMotion(input.scene);
  const baseTransform = resolvePreviewMediaBaseTransform(input.scene);
  const resolved = resolveMediaMotionStateForSceneTiming({
    motion,
    baseTransform,
    sceneElapsedMs: sceneLocalTimeMs,
    sceneDurationMs: input.sceneDurationMs,
  });
  const mediaType = getSceneMediaType(input.scene) ?? "unknown";

  return {
    playbackTimeMs: input.playbackTimeMs ?? null,
    sceneLocalTimeMs,
    sceneDurationMs: input.sceneDurationMs,
    presetId: resolved.presetId,
    mediaType,
    resolved,
  };
}

/** Log a diagnostic snapshot once — never call from a render/rAF hot path. */
export function logPreviewMediaMotionDebugSummary(
  input: Parameters<typeof buildPreviewMediaMotionDebugSummary>[0],
  label = "preview-media-motion-debug",
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(`[FootieBitz ${label}]`, buildPreviewMediaMotionDebugSummary(input));
}
