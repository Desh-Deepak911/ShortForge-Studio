/**
 * Deterministic frame plan from frozen ExportManifest timing — no wall clock.
 * Pixel size comes from HeadlessRenderTarget, not ExportManifest.output.
 */

import {
  isExportSceneManifestV3,
  resolveExportActiveSceneMediaFrame,
  resolveExportIntraSceneTransitionAtElapsed,
  type ExportManifest,
  type ExportSceneManifestV3,
} from "@/features/export/domain/headless-safe";
import {
  resolveExportCaptionFrames,
  resolveExportFrameTimestampMs,
  resolveExportSceneFrame,
  resolveExportTotalFrames,
  resolveExportTransitionFrame,
  resolveExportVisualTimeMs,
} from "@/features/export/timing";

import type { HeadlessRenderTarget } from "./render-target";

export interface HeadlessFramePlanEntry {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly visualTimeMs: number;
  readonly sceneId: string;
  readonly sceneElapsedMs: number;
  readonly mediaItemId: string | null;
  readonly captionCount: number;
  readonly hasSceneTransition: boolean;
  readonly hasIntraSceneTransition: boolean;
  readonly intraSceneProgress: number | null;
}

export interface HeadlessFramePlan {
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly totalFrames: number;
  readonly renderDurationMs: number;
  readonly frames: readonly HeadlessFramePlanEntry[];
  readonly profileId: string;
}

export function buildHeadlessFramePlan(
  manifest: ExportManifest,
  maxFrames: number,
  target: HeadlessRenderTarget,
):
  | { readonly ok: true; readonly plan: HeadlessFramePlan }
  | { readonly ok: false; readonly message: string } {
  const fps = manifest.output.fps;
  if (fps !== 30 || target.fps !== 30) {
    return { ok: false, message: "Worker requires exactly 30 fps." };
  }

  if (target.width < 2 || target.height < 2) {
    return { ok: false, message: "Invalid render target dimensions." };
  }

  const totalFrames = resolveExportTotalFrames(manifest);
  if (totalFrames < 1 || totalFrames > maxFrames) {
    return {
      ok: false,
      message: `Frame count ${totalFrames} outside worker bounds.`,
    };
  }
  if (totalFrames > target.profile.maxFrames) {
    return {
      ok: false,
      message: `Frame count exceeds profile operational ceiling.`,
    };
  }

  const frames: HeadlessFramePlanEntry[] = [];
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const timestampMs = resolveExportFrameTimestampMs(frameIndex, fps);
    const visualTimeMs = resolveExportVisualTimeMs(manifest, timestampMs);
    const scene = resolveExportSceneFrame(manifest, timestampMs);
    const captions = resolveExportCaptionFrames(manifest, timestampMs);
    const transition = resolveExportTransitionFrame(manifest, timestampMs);
    const active = resolveExportActiveSceneMediaFrame(
      scene.scene,
      scene.sceneElapsedMs,
    );

    let hasIntra = false;
    let intraProgress: number | null = null;
    if (isExportSceneManifestV3(scene.scene)) {
      const intra = resolveExportIntraSceneTransitionAtElapsed(
        scene.scene as ExportSceneManifestV3,
        scene.sceneElapsedMs,
      );
      if (intra) {
        hasIntra = true;
        intraProgress = intra.progress;
      }
    }

    frames.push({
      frameIndex,
      timestampMs,
      visualTimeMs,
      sceneId: scene.scene.id,
      sceneElapsedMs: scene.sceneElapsedMs,
      mediaItemId: active?.item?.id ?? null,
      captionCount: captions.length,
      hasSceneTransition: transition != null,
      hasIntraSceneTransition: hasIntra,
      intraSceneProgress: intraProgress,
    });
  }

  return {
    ok: true,
    plan: {
      fps,
      width: target.width,
      height: target.height,
      totalFrames,
      renderDurationMs: manifest.project.renderDurationMs,
      frames,
      profileId: target.profileId,
    },
  };
}
