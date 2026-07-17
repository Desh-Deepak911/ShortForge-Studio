/**
 * Draw a PreparedExportFrame onto the export canvas (Sprint 6C / 9C).
 * Captions consume frozen ExportManifest layout + style (Preview/Export parity).
 *
 * Composition priority:
 * 1. Scene-to-scene transition
 * 2. V3 intra-scene transition
 * 3. Ordinary active media
 */

import { resolveExportCaptionAnimationFromChunk } from "@/features/caption-animation";
import type { CaptionLayout } from "@/features/caption-layout";
import type { CaptionStyle } from "@/features/caption-style";
import type { SubtitleEffect, TransitionEffect } from "@/features/story/types";
import { resolveTransitionEffectLayers } from "@/features/timeline-intelligence/resolve-transition-state.utils";
import {
  drawExportSubtitlesCaption,
  resetExportCanvasDrawState,
} from "@/features/export/utils/export-caption-canvas.utils";
import { drawExportTransitionBackgrounds } from "@/features/export/utils/export-transition-canvas.utils";
import {
  drawSceneMediaFrame,
  exportSceneHasDrawableMedia,
  type PrepareExportSceneMediaResult,
} from "@/features/export/utils/export-scene-media-renderer";
import type { ExportSubtitleDisplay } from "@/features/export/utils/export-subtitle.utils";
import { normalizeCaptionMode } from "@/features/story/utils";
import type { ResolvedExportCaptionFrame } from "@/features/export/timing";
import type { ExportCaptionManifest } from "@/features/export/domain/export-manifest.types";
import { resolveExportActiveSceneMediaFrame } from "@/features/export/domain/resolve-export-active-scene-media-frame";
import { captionLayoutManifestToCaptionLayout } from "@/features/export/domain/resolve-export-caption-layout";

import type { ExportRenderContext } from "./export-render-context.types";
import type { ExportDrawScene } from "./prepare-export-from-manifest";
import type { PreparedExportFrame } from "./prepared-export-frame.types";
import { buildActiveExportDrawScene } from "./active-export-draw-scene";

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, cursorY);
  }
}

function drawExactMediaBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  drawScene: ExportDrawScene,
  context: ExportRenderContext,
  sceneElapsedMs: number,
  sceneDurationMs: number,
  prepared: PrepareExportSceneMediaResult | undefined,
  itemElapsedMs: number,
  itemDurationMs: number,
  mediaItemId: string,
) {
  drawSceneMediaFrame({
    ctx,
    width,
    height,
    scene: drawScene,
    cache: context.mediaCache,
    sceneElapsedMs,
    sceneDurationMs,
    mediaReady: prepared?.ok !== false,
    mediaItemId,
    itemElapsedMs,
    itemDurationMs,
  });
}

function drawSceneBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  drawScene: ExportDrawScene,
  context: ExportRenderContext,
  sceneElapsedMs: number,
  sceneDurationMs: number,
  prepared: PrepareExportSceneMediaResult | undefined,
) {
  const active = resolveExportActiveSceneMediaFrame(
    drawScene.manifestScene,
    sceneElapsedMs,
  );
  const activeScene = buildActiveExportDrawScene(drawScene, active);
  drawSceneMediaFrame({
    ctx,
    width,
    height,
    scene: activeScene,
    cache: context.mediaCache,
    sceneElapsedMs,
    sceneDurationMs,
    mediaReady: prepared?.ok !== false,
    mediaItemId: prepared?.mediaItemId ?? active?.item.id,
    itemElapsedMs: active?.itemElapsedMs ?? sceneElapsedMs,
    itemDurationMs: active?.itemDurationMs ?? sceneDurationMs,
  });
}

function captionStyleFromManifest(caption: ExportCaptionManifest): CaptionStyle {
  const style = caption.style;
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    textColor: style.color,
    backgroundColor: style.backgroundColor,
    backgroundOpacity: style.backgroundOpacity,
    backgroundEnabled: style.backgroundEnabled,
    paddingX: style.paddingX,
    paddingY: style.paddingY,
    cornerRadius: style.cornerRadius,
    lineHeight: style.lineHeight,
  };
}

function captionLayoutFromManifest(caption: ExportCaptionManifest): CaptionLayout | undefined {
  if (caption.layout.usesLegacyBottomCenter) {
    return undefined;
  }
  return captionLayoutManifestToCaptionLayout(caption.layout);
}

function captionToSubtitleDisplay(
  captionFrame: ResolvedExportCaptionFrame,
  scene: {
    captionLayout?: CaptionLayout;
    captionStyle?: CaptionStyle;
    subtitleEffect?: SubtitleEffect;
  },
): ExportSubtitleDisplay {
  const preset = captionFrame.caption.animation.preset;
  const effect: SubtitleEffect =
    preset === "typewriter"
      ? "typewriter"
      : preset === "highlight"
        ? "highlight"
        : "fade-up";

  const animationEnabled = captionFrame.caption.animation.enabled;
  const animationState = animationEnabled
    ? resolveExportCaptionAnimationFromChunk(scene, undefined, {
        text: captionFrame.caption.text,
        chunkElapsedMs: captionFrame.elapsedMs,
        chunkDurationMs: Math.max(1, captionFrame.durationMs),
      })
    : undefined;

  return {
    activeChunk: captionFrame.caption.text,
    lines: [captionFrame.caption.text],
    effect,
    sceneElapsedMs: captionFrame.elapsedMs,
    chunkElapsedMs: captionFrame.elapsedMs,
    activeChunkDurationMs: captionFrame.durationMs,
    effectProgress: captionFrame.progress,
    fontScale: 1,
    animationState,
  };
}

export function drawPreparedExportFrame(
  frame: PreparedExportFrame,
  context: ExportRenderContext,
  preparedBySceneId: Map<string, PrepareExportSceneMediaResult>,
  preparedByMediaKey?: Map<string, PrepareExportSceneMediaResult>,
): void {
  const ctx = context.canvasContext;
  const width = context.width;
  const height = context.height;
  const scale = width / 1080;
  const padX = 72 * scale;
  const titleY = 180 * scale;

  resetExportCanvasDrawState(ctx);
  ctx.clearRect(0, 0, width, height);

  const transition = frame.transition;
  const intra = frame.intraSceneTransition;
  let mediaLayerDraws = 1;

  if (transition) {
    mediaLayerDraws = 2;
    const fromPrepared = preparedBySceneId.get(transition.fromScene.id);
    const toPrepared = preparedBySceneId.get(transition.toScene.id);
    const fromDraw = frame.peerDrawScenes.get(transition.fromScene.id);
    const toDraw = frame.peerDrawScenes.get(transition.toScene.id);
    const effect = transition.transition.type as TransitionEffect;
    const layers = resolveTransitionEffectLayers(effect, transition.progress);

    const fromElapsed = Math.max(
      0,
      Math.min(frame.visualTimeMs - transition.fromScene.startMs, transition.fromScene.durationMs),
    );
    const toElapsed = Math.max(
      0,
      Math.min(frame.visualTimeMs - transition.toScene.startMs, transition.toScene.durationMs),
    );

    drawExportTransitionBackgrounds(ctx, width, height, {
      effect,
      transitionState: {
        opacityFrom: layers.opacityFrom,
        opacityTo: layers.opacityTo,
        transformFrom: layers.transformFrom,
        transformTo: layers.transformTo,
        progress: transition.progress,
      },
      drawFromBackground: (layerCtx, layerWidth, layerHeight) => {
        if (!fromDraw) return;
        drawSceneBackground(
          layerCtx,
          layerWidth,
          layerHeight,
          fromDraw,
          context,
          fromElapsed,
          transition.fromScene.durationMs,
          fromPrepared,
        );
      },
      drawToBackground: (layerCtx, layerWidth, layerHeight) => {
        if (!toDraw) return;
        drawSceneBackground(
          layerCtx,
          layerWidth,
          layerHeight,
          toDraw,
          context,
          toElapsed,
          transition.toScene.durationMs,
          toPrepared,
        );
      },
    });
  } else if (intra) {
    mediaLayerDraws = 2;
    const fromPrepared =
      preparedByMediaKey?.get(intra.fromMediaKey) ??
      preparedBySceneId.get(frame.drawScene.id);
    const toPrepared =
      preparedByMediaKey?.get(intra.toMediaKey) ??
      preparedBySceneId.get(frame.drawScene.id);
    const layers = resolveTransitionEffectLayers(intra.effect, intra.progress);

    drawExportTransitionBackgrounds(ctx, width, height, {
      effect: intra.effect,
      transitionState: {
        opacityFrom: layers.opacityFrom,
        opacityTo: layers.opacityTo,
        transformFrom: layers.transformFrom,
        transformTo: layers.transformTo,
        progress: intra.progress,
      },
      drawFromBackground: (layerCtx, layerWidth, layerHeight) => {
        drawExactMediaBackground(
          layerCtx,
          layerWidth,
          layerHeight,
          intra.fromDrawScene,
          context,
          frame.media.sceneElapsedMs,
          frame.media.sceneDurationMs,
          fromPrepared,
          intra.outgoingItemLocalMs,
          intra.fromItem.durationMs,
          intra.fromItem.id,
        );
      },
      drawToBackground: (layerCtx, layerWidth, layerHeight) => {
        drawExactMediaBackground(
          layerCtx,
          layerWidth,
          layerHeight,
          intra.toDrawScene,
          context,
          frame.media.sceneElapsedMs,
          frame.media.sceneDurationMs,
          toPrepared,
          intra.incomingItemLocalMs,
          intra.toItem.durationMs,
          intra.toItem.id,
        );
      },
    });

    context.diagnostics.push({
      code: "INTRA_SCENE_TRANSITION_DRAW",
      message: "Composited v3 intra-scene transition layers",
      detail: {
        sceneId: intra.sceneId,
        fromItemId: intra.fromItem.id,
        toItemId: intra.toItem.id,
        effect: intra.effect,
        progress: intra.progress,
        mediaLayerDraws,
      },
    });
  } else {
    drawSceneBackground(
      ctx,
      width,
      height,
      frame.drawScene,
      context,
      frame.media.sceneElapsedMs,
      frame.media.sceneDurationMs,
      preparedBySceneId.get(frame.drawScene.id),
    );
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(0,0,0,0.60)");
  overlay.addColorStop(0.35, "rgba(0,0,0,0.15)");
  overlay.addColorStop(1, "rgba(0,0,0,0.90)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  if (frame.branding.watermarkEnabled) {
    const brandOpacity = frame.branding.opacity ?? 0.55;
    ctx.fillStyle = `rgba(255,255,255,${brandOpacity})`;
    ctx.font = `bold ${36 * scale}px Arial, Helvetica, sans-serif`;
    ctx.fillText(frame.branding.watermarkText, padX, 116 * scale);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${48 * scale}px Arial, Helvetica, sans-serif`;
  wrapText(ctx, frame.storyTitle, padX, titleY, width - padX * 2, 58 * scale);

  const activeDrawMediaItemId =
    (intra
      ? preparedByMediaKey?.get(intra.toMediaKey)?.mediaItemId
      : preparedBySceneId.get(frame.drawScene.id)?.mediaItemId) ??
    frame.media.mediaItemId ??
    undefined;
  if (
    !exportSceneHasDrawableMedia(
      context.mediaCache,
      frame.drawScene,
      activeDrawMediaItemId,
    ) &&
    !transition &&
    !intra &&
    frame.drawScene.sceneType
  ) {
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.font = `bold ${32 * scale}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(frame.drawScene.sceneType.toUpperCase(), width / 2, height / 2);
    ctx.textAlign = "left";
  }

  // Scene-to-scene: captions suppressed (unchanged). Intra-scene: captions continue.
  if (transition) {
    return;
  }

  const captionMode = normalizeCaptionMode(frame.drawScene.captionMode);
  const activeCaption = frame.captions[0];
  if (activeCaption && (captionMode === "subtitles" || captionMode === "generated")) {
    const caption = activeCaption.caption;
    const captionLayout = captionLayoutFromManifest(caption);
    const captionStyle = captionStyleFromManifest(caption);
    const scene: {
      captionLayout?: CaptionLayout;
      captionStyle?: CaptionStyle;
      subtitleEffect?: SubtitleEffect;
    } = {
      captionLayout,
      captionStyle,
      subtitleEffect:
        caption.animation.preset === "typewriter"
          ? "typewriter"
          : caption.animation.preset === "highlight"
            ? "highlight"
            : "fade-up",
    };

    drawExportSubtitlesCaption({
      ctx,
      width,
      height,
      scale,
      display: captionToSubtitleDisplay(activeCaption, scene),
      scene,
      script: {
        // Layout/style already resolved onto the caption — avoid default overwrite.
        defaultCaptionLayout: undefined,
        defaultCaptionStyle: undefined,
      },
    });
  }
}
