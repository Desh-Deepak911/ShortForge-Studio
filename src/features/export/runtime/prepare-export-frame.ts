/**
 * prepareExportFrame — resolve all semantic + media seek state for one frame.
 * Sprint 8D: active media item from frozen mediaTimeline; item-local seek.
 * Sprint 9C: v3 intra-scene transition peers prepared via collision-safe media keys.
 */

import type {
  ExportManifest,
  ExportSceneManifestV3,
} from "@/features/export/domain/export-manifest.types";
import {
  isExportManifestV3,
  isExportManifestV4,
  isExportManifestV5,
} from "@/features/export/domain/export-manifest.types";
import {
  resolveBrandStingLocalElapsedMs,
  resolveBrandStingTerminalElapsedMs,
} from "@/features/brand-sting/domain/resolve-brand-sting-frame";
import { resolveExportActiveSceneMediaFrame } from "@/features/export/domain/resolve-export-active-scene-media-frame";
import { resolveExportIntraSceneTransitionAtElapsed } from "@/features/export/domain/resolve-export-intra-scene-transition";
import {
  resolveExportCaptionFrames,
  resolveExportFrameTimestampMs,
  resolveExportSceneFrame,
  resolveExportTransitionFrame,
  resolveExportVideoSourceTimeMs,
  resolveExportVisualTimeMs,
} from "@/features/export/timing";
import { buildExportMediaCacheKey } from "@/features/export/utils/export-media-cache.utils";
import {
  prepareExportSceneMediaFrame,
  type PrepareExportSceneMediaResult,
} from "@/features/export/utils/export-scene-media-renderer";

import { buildActiveExportDrawScene } from "./active-export-draw-scene";
import type { ExportRenderContext } from "./export-render-context.types";
import type { ExportDrawScene, ExportRenderPlan } from "./prepare-export-from-manifest";
import { assertExportManifest } from "./prepare-export-from-manifest";
import type {
  PreparedExportFrame,
  ResolvedExportIntraSceneTransitionFrame,
} from "./prepared-export-frame.types";

export interface PrepareExportFrameResult {
  readonly frame: PreparedExportFrame;
  /**
   * Collision-safe prepared media keyed by buildExportMediaCacheKey(sceneId, mediaItemId).
   * A map keyed only by sceneId is insufficient for two peers from the same scene.
   */
  readonly preparedByMediaKey: Map<string, PrepareExportSceneMediaResult>;
  /**
   * @deprecated Scene-keyed view for scene-to-scene peers / legacy callers.
   * Primary active item of each prepared scene is also stored here.
   */
  readonly preparedBySceneId: Map<string, PrepareExportSceneMediaResult>;
}

export async function prepareExportFrame(
  manifest: ExportManifest,
  plan: ExportRenderPlan,
  frameIndex: number,
  context: ExportRenderContext,
): Promise<PrepareExportFrameResult> {
  context.cancellation.throwIfCancelled();
  assertExportManifest(manifest);

  const fps = manifest.output.fps;
  const timestampMs = resolveExportFrameTimestampMs(frameIndex, fps);
  const visualTimeMs = resolveExportVisualTimeMs(manifest, timestampMs);

  const brandStingPayload =
    plan.shortForgeBrandStingEnabled &&
    isExportManifestV5(manifest) &&
    manifest.brandSting
      ? manifest.brandSting
      : null;
  const brandStingElapsedMs = brandStingPayload
    ? resolveBrandStingLocalElapsedMs({
        absoluteTimeMs: timestampMs,
        narrationEndMs: brandStingPayload.startMs,
        durationMs: brandStingPayload.durationMs,
      })
    : null;
  // End buffer begins at brandStingEndMs — terminal (invisible) sample, never
  // clamp back to the final branded frame and never restart the sting.
  const brandStingEndMs = brandStingPayload
    ? brandStingPayload.startMs + brandStingPayload.durationMs
    : 0;
  const brandStingTerminalElapsedMs =
    brandStingPayload &&
    brandStingElapsedMs == null &&
    timestampMs >= brandStingEndMs
      ? resolveBrandStingTerminalElapsedMs(brandStingPayload.durationMs)
      : null;
  const activeBrandStingElapsedMs =
    brandStingElapsedMs ?? brandStingTerminalElapsedMs;
  const brandStingFrame =
    brandStingPayload && activeBrandStingElapsedMs != null
      ? {
          brandSting: brandStingPayload,
          elapsedMs: Math.max(0, activeBrandStingElapsedMs),
        }
      : null;

  if (brandStingFrame) {
    const scene = resolveExportSceneFrame(manifest, brandStingPayload!.startMs);
    const drawScene =
      plan.sceneById.get(scene.scene.id) ?? plan.scenes[scene.sceneIndex]!;
    return {
      frame: {
        frameIndex,
        timestampMs,
        visualTimeMs,
        scene,
        drawScene,
        peerDrawScenes: new Map([[drawScene.id, drawScene]]),
        media: {
          drawScene,
          sceneElapsedMs: scene.sceneElapsedMs,
          sceneDurationMs: scene.sceneDurationMs,
          sourceTimeMs: 0,
          holdLastFrame: true,
          mediaItemId: null,
          itemElapsedMs: 0,
          itemDurationMs: scene.sceneDurationMs,
        },
        captions: [],
        transition: null,
        intraSceneTransition: null,
        branding: manifest.branding,
        storyTitle: manifest.project.storyTitle,
        contentDurationMs: manifest.project.contentDurationMs,
        brandSting: brandStingFrame,
      },
      preparedByMediaKey: new Map(),
      preparedBySceneId: new Map(),
    };
  }

  const scene = resolveExportSceneFrame(manifest, timestampMs);
  const drawScene = plan.sceneById.get(scene.scene.id) ?? plan.scenes[scene.sceneIndex]!;
  const captions = resolveExportCaptionFrames(manifest, timestampMs);
  const transition = resolveExportTransitionFrame(manifest, timestampMs);
  const videoTime = resolveExportVideoSourceTimeMs(scene.scene, scene.sceneElapsedMs);
  const active = resolveExportActiveSceneMediaFrame(scene.scene, scene.sceneElapsedMs);

  const peerDrawScenes = new Map<string, ExportDrawScene>();
  peerDrawScenes.set(drawScene.id, drawScene);

  const media = {
    drawScene,
    sceneElapsedMs: scene.sceneElapsedMs,
    sceneDurationMs: scene.sceneDurationMs,
    sourceTimeMs: videoTime.sourceTimeMs,
    holdLastFrame: videoTime.holdLastFrame,
    mediaItemId: videoTime.mediaItemId,
    itemElapsedMs: active?.itemElapsedMs ?? scene.sceneElapsedMs,
    itemDurationMs: active?.itemDurationMs ?? scene.sceneDurationMs,
  };

  const preparedByMediaKey = new Map<string, PrepareExportSceneMediaResult>();
  const preparedBySceneId = new Map<string, PrepareExportSceneMediaResult>();

  const storePrepared = (
    sceneId: string,
    mediaItemId: string | undefined,
    prepared: PrepareExportSceneMediaResult,
  ) => {
    const key = buildExportMediaCacheKey(sceneId, mediaItemId?.trim() || "__scene__");
    preparedByMediaKey.set(key, prepared);
    preparedBySceneId.set(sceneId, prepared);
  };

  // Scene-to-scene transition takes precedence — skip intra-scene overlay prep.
  let intraSceneTransition: ResolvedExportIntraSceneTransitionFrame | null = null;

  if (transition) {
    for (const peer of [transition.fromScene, transition.toScene]) {
      const peerDraw = plan.sceneById.get(peer.id);
      if (!peerDraw) continue;
      peerDrawScenes.set(peer.id, peerDraw);
      const peerElapsed = Math.max(
        0,
        Math.min(visualTimeMs - peer.startMs, peer.durationMs),
      );
      const peerActive = resolveExportActiveSceneMediaFrame(peer, peerElapsed);
      const peerActiveScene = buildActiveExportDrawScene(peerDraw, peerActive, {
        fitWithBlurredBackgroundEnabled: plan.fitWithBlurredBackgroundEnabled,
      });
      context.cancellation.throwIfCancelled();
      const prepared = await prepareExportSceneMediaFrame(
        context.mediaCache,
        peerActiveScene,
        peerElapsed,
        peer.durationMs,
        {
          exportFps: fps,
          mediaItemId: peerActive?.item.id,
          itemElapsedMs: peerActive?.itemElapsedMs,
          itemDurationMs: peerActive?.itemDurationMs,
        },
      );
      context.cancellation.throwIfCancelled();
      storePrepared(peer.id, peerActive?.item.id, prepared);
    }
  } else if (isExportManifestV3(manifest) || isExportManifestV4(manifest)) {
    const manifestScene = scene.scene as ExportSceneManifestV3;
    const resolved = resolveExportIntraSceneTransitionAtElapsed(
      manifestScene,
      scene.sceneElapsedMs,
      fps,
    );

    if (resolved) {
      const fromActive = {
        item: resolved.fromItem,
        itemIndex: resolved.fromItem.index,
        itemElapsedMs: resolved.outgoingItemLocalMs,
        itemDurationMs: resolved.fromItem.durationMs,
        sceneElapsedMs: scene.sceneElapsedMs,
        sceneDurationMs: scene.sceneDurationMs,
        holdingFinalFrame: true,
      };
      const toActive = {
        item: resolved.toItem,
        itemIndex: resolved.toItem.index,
        itemElapsedMs: resolved.incomingItemLocalMs,
        itemDurationMs: resolved.toItem.durationMs,
        sceneElapsedMs: scene.sceneElapsedMs,
        sceneDurationMs: scene.sceneDurationMs,
        holdingFinalFrame: false,
      };

      const fromDrawScene = buildActiveExportDrawScene(drawScene, fromActive, {
        fitWithBlurredBackgroundEnabled: plan.fitWithBlurredBackgroundEnabled,
      });
      const toDrawScene = buildActiveExportDrawScene(drawScene, toActive, {
        fitWithBlurredBackgroundEnabled: plan.fitWithBlurredBackgroundEnabled,
      });
      const fromMediaKey = buildExportMediaCacheKey(
        drawScene.id,
        resolved.fromItem.id,
      );
      const toMediaKey = buildExportMediaCacheKey(drawScene.id, resolved.toItem.id);

      context.cancellation.throwIfCancelled();
      const fromPrepared = await prepareExportSceneMediaFrame(
        context.mediaCache,
        fromDrawScene,
        scene.sceneElapsedMs,
        scene.sceneDurationMs,
        {
          exportFps: fps,
          mediaItemId: resolved.fromItem.id,
          itemElapsedMs: resolved.outgoingItemLocalMs,
          itemDurationMs: resolved.fromItem.durationMs,
        },
      );
      context.cancellation.throwIfCancelled();
      const toPrepared = await prepareExportSceneMediaFrame(
        context.mediaCache,
        toDrawScene,
        scene.sceneElapsedMs,
        scene.sceneDurationMs,
        {
          exportFps: fps,
          mediaItemId: resolved.toItem.id,
          itemElapsedMs: resolved.incomingItemLocalMs,
          itemDurationMs: resolved.toItem.durationMs,
        },
      );
      context.cancellation.throwIfCancelled();

      preparedByMediaKey.set(fromMediaKey, fromPrepared);
      preparedByMediaKey.set(toMediaKey, toPrepared);
      // Primary scene key mirrors incoming (continuing active media after overlay).
      preparedBySceneId.set(drawScene.id, toPrepared);

      intraSceneTransition = {
        sceneId: resolved.sceneId,
        fromItem: resolved.fromItem,
        toItem: resolved.toItem,
        boundary: resolved.boundary,
        effect: resolved.effect,
        progress: resolved.progress,
        requestedDurationMs: resolved.requestedDurationMs,
        effectiveDurationMs: resolved.effectiveDurationMs,
        overlayStartOffsetMs: resolved.overlayStartOffsetMs,
        overlayEndOffsetMs: resolved.overlayEndOffsetMs,
        outgoingItemLocalMs: resolved.outgoingItemLocalMs,
        incomingItemLocalMs: resolved.incomingItemLocalMs,
        fromDrawScene,
        toDrawScene,
        fromMediaKey,
        toMediaKey,
      };

      context.diagnostics.push({
        code: "INTRA_SCENE_TRANSITION_FRAME",
        message: "Prepared v3 intra-scene transition peers",
        detail: {
          manifestVersion: manifest.version,
          rendererContractVersion: manifest.rendererContractVersion,
          sceneId: resolved.sceneId,
          fromItemId: resolved.fromItem.id,
          toItemId: resolved.toItem.id,
          effect: resolved.effect,
          progress: resolved.progress,
          progressCheckpoint:
            resolved.progress < 0.34
              ? "start"
              : resolved.progress < 0.67
                ? "mid"
                : "late",
        },
      });
    }
  }

  if (!transition && !intraSceneTransition) {
    const primaryScene = buildActiveExportDrawScene(drawScene, active, {
      fitWithBlurredBackgroundEnabled: plan.fitWithBlurredBackgroundEnabled,
    });
    context.cancellation.throwIfCancelled();
    const primary = await prepareExportSceneMediaFrame(
      context.mediaCache,
      primaryScene,
      scene.sceneElapsedMs,
      scene.sceneDurationMs,
      {
        exportFps: fps,
        mediaItemId: active?.item.id,
        itemElapsedMs: active?.itemElapsedMs,
        itemDurationMs: active?.itemDurationMs,
      },
    );
    context.cancellation.throwIfCancelled();
    storePrepared(drawScene.id, active?.item.id, primary);
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
      intraSceneTransition,
      branding: manifest.branding,
      storyTitle: manifest.project.storyTitle,
      contentDurationMs: manifest.project.contentDurationMs,
      brandSting: null,
    },
    preparedByMediaKey,
    preparedBySceneId,
  };
}
