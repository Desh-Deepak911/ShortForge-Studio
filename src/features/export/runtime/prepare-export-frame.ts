/**
 * prepareExportFrame — resolve all semantic + media seek state for one frame.
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import {
  resolveExportCaptionFrames,
  resolveExportFrameTimestampMs,
  resolveExportSceneFrame,
  resolveExportTransitionFrame,
  resolveExportVideoSourceTimeMs,
  resolveExportVisualTimeMs,
} from "@/features/export/timing";
import {
  prepareExportSceneMediaFrame,
  type PrepareExportSceneMediaResult,
} from "@/features/export/utils/export-scene-media-renderer";

import type { ExportRenderContext } from "./export-render-context.types";
import type { ExportDrawScene, ExportRenderPlan } from "./prepare-export-from-manifest";
import type { PreparedExportFrame } from "./prepared-export-frame.types";

export interface PrepareExportFrameResult {
  readonly frame: PreparedExportFrame;
  readonly preparedBySceneId: Map<string, PrepareExportSceneMediaResult>;
}

export async function prepareExportFrame(
  manifest: ExportManifest,
  plan: ExportRenderPlan,
  frameIndex: number,
  context: ExportRenderContext,
): Promise<PrepareExportFrameResult> {
  context.cancellation.throwIfCancelled();

  const fps = manifest.output.fps;
  const timestampMs = resolveExportFrameTimestampMs(frameIndex, fps);
  const visualTimeMs = resolveExportVisualTimeMs(manifest, timestampMs);
  const scene = resolveExportSceneFrame(manifest, timestampMs);
  const drawScene = plan.sceneById.get(scene.scene.id) ?? plan.scenes[scene.sceneIndex]!;
  const captions = resolveExportCaptionFrames(manifest, timestampMs);
  const transition = resolveExportTransitionFrame(manifest, timestampMs);
  const videoTime = resolveExportVideoSourceTimeMs(scene.scene, scene.sceneElapsedMs);

  const peerDrawScenes = new Map<string, ExportDrawScene>();
  peerDrawScenes.set(drawScene.id, drawScene);

  const media = {
    drawScene,
    sceneElapsedMs: scene.sceneElapsedMs,
    sceneDurationMs: scene.sceneDurationMs,
    sourceTimeMs: videoTime.sourceTimeMs,
    holdLastFrame: videoTime.holdLastFrame,
  };

  const preparedBySceneId = new Map<string, PrepareExportSceneMediaResult>();

  const primary = await prepareExportSceneMediaFrame(
    context.mediaCache,
    drawScene,
    scene.sceneElapsedMs,
    scene.sceneDurationMs,
    { exportFps: fps },
  );
  preparedBySceneId.set(drawScene.id, primary);

  if (transition) {
    for (const peer of [transition.fromScene, transition.toScene]) {
      const peerDraw = plan.sceneById.get(peer.id);
      if (!peerDraw) continue;
      peerDrawScenes.set(peer.id, peerDraw);
      if (preparedBySceneId.has(peer.id)) continue;
      const peerElapsed = Math.max(
        0,
        Math.min(visualTimeMs - peer.startMs, peer.durationMs),
      );
      const prepared = await prepareExportSceneMediaFrame(
        context.mediaCache,
        peerDraw,
        peerElapsed,
        peer.durationMs,
        { exportFps: fps },
      );
      preparedBySceneId.set(peer.id, prepared);
    }
  }

  context.cancellation.throwIfCancelled();

  return {
    frame: {
      frameIndex,
      timestampMs,
      visualTimeMs,
      scene,
      drawScene,
      peerDrawScenes,
      media,
      captions,
      transition,
      branding: manifest.branding,
      storyTitle: manifest.project.storyTitle,
    },
    preparedBySceneId,
  };
}
