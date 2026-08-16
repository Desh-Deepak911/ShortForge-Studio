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
import { drawBrandSting } from "@/features/brand-sting/render/draw-brand-sting";
import { resolveBrandStingFrame } from "@/features/brand-sting/domain/resolve-brand-sting-frame";
import { drawEngagementOverlay } from "@/features/engagement-overlays/render/draw-engagement-overlay";
import {
  resolveEngagementOverlayFrame,
  shouldSuppressEngagementOverlayForInterSceneTransition,
} from "@/features/engagement-overlays/domain/resolve-engagement-overlay-frame";
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
import { normalizeCaptionMode } from "@/features/story/utils/caption.utils";
import type { ResolvedExportCaptionFrame } from "@/features/export/timing";
import type { ExportCaptionManifest } from "@/features/export/domain/export-manifest.types";
import { resolveExportActiveSceneMediaFrame } from "@/features/export/domain/resolve-export-active-scene-media-frame";
import { captionLayoutManifestToCaptionLayout } from "@/features/export/domain/resolve-export-caption-layout";
import {
  applyLegibilityTextShadow,
  clearLegibilityTextShadow,
  drawLegibilityCaptionScrimIfNeeded,
  drawLegibilityLocalScrim,
  mapCaptionAnchorToLegibilityPlacement,
  resolveLegibilityLayerPlan,
} from "@/features/legibility-layer";

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
  keyframedVisualEffectsEnabled: boolean,
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
    keyframedVisualEffectsEnabled,
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
  keyframedVisualEffectsEnabled: boolean,
  fitWithBlurredBackgroundEnabled = false,
) {
  const active = resolveExportActiveSceneMediaFrame(
    drawScene.manifestScene,
    sceneElapsedMs,
  );
  const activeScene = buildActiveExportDrawScene(drawScene, active, {
    fitWithBlurredBackgroundEnabled,
  });
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
    keyframedVisualEffectsEnabled,
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
  keyframedVisualEffectsEnabled = false,
  fitWithBlurredBackgroundEnabled = false,
): void {
  const ctx = context.canvasContext;
  const width = context.width;
  const height = context.height;
  const scale = width / 1080;
  const padX = 72 * scale;
  const titleY = 180 * scale;

  resetExportCanvasDrawState(ctx);
  ctx.clearRect(0, 0, width, height);

  if (frame.brandSting) {
    const plan = resolveBrandStingFrame({
      sting: {
        version: 1,
        enabled: true,
        title: frame.brandSting.brandSting.title,
        durationMs: frame.brandSting.brandSting.durationMs,
        presetId: frame.brandSting.brandSting.presetId,
        narrationPolicy: frame.brandSting.brandSting.narrationPolicy,
        captionPolicy: frame.brandSting.brandSting.captionPolicy,
        playbackSpeedPolicy: frame.brandSting.brandSting.playbackSpeedPolicy,
      },
      elapsedMs: frame.brandSting.elapsedMs,
      frameWidth: width,
      frameHeight: height,
    });
    drawBrandSting(ctx, plan, width, height);
    return;
  }

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
          keyframedVisualEffectsEnabled,
          fitWithBlurredBackgroundEnabled,
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
          keyframedVisualEffectsEnabled,
          fitWithBlurredBackgroundEnabled,
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
          keyframedVisualEffectsEnabled,
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
          keyframedVisualEffectsEnabled,
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
      keyframedVisualEffectsEnabled,
      fitWithBlurredBackgroundEnabled,
    );
  }

  // Scene-to-scene: captions suppressed (no half-overlay from either
  // adjacent scene). Intra-scene: captions continue.
  // Engagement overlays share the same inter-scene suppression rule.
  const suppressCaptionOverlays =
    shouldSuppressEngagementOverlayForInterSceneTransition(Boolean(transition));

  const captionMode = normalizeCaptionMode(frame.drawScene.captionMode);
  const activeCaptionCandidate = frame.captions[0];
  const captionModeAllowsDraw =
    captionMode === "subtitles" || captionMode === "generated";
  const hasActiveCaption =
    Boolean(activeCaptionCandidate) &&
    captionModeAllowsDraw &&
    !suppressCaptionOverlays;

  const captionPlacement = hasActiveCaption
    ? mapCaptionAnchorToLegibilityPlacement(
        activeCaptionCandidate!.caption.layout.usesLegacyBottomCenter
          ? "bottom_center"
          : activeCaptionCandidate!.caption.layout.anchor,
      )
    : "none";

  const legibilityPlan = resolveLegibilityLayerPlan({
    absoluteContentTimeMs: frame.visualTimeMs,
    contentDurationMs: frame.contentDurationMs,
    storyTitle: frame.storyTitle,
    hasActiveCaption,
    captionPlacement,
    captionStyleBackgroundEnabled:
      activeCaptionCandidate?.caption.style.backgroundEnabled === true,
    captionStyleBackgroundOpacity:
      activeCaptionCandidate?.caption.style.backgroundOpacity ?? 0,
    watermarkEnabled: frame.branding.watermarkEnabled === true,
    suppressCaptionOverlays,
    frameWidth: width,
    frameHeight: height,
  });

  // Local caption scrim only when creator style lacks a sufficient background.
  drawLegibilityCaptionScrimIfNeeded(ctx, legibilityPlan);

  if (legibilityPlan.branding.enabled) {
    const brandOpacity = frame.branding.opacity ?? 0.55;
    applyLegibilityTextShadow(ctx, scale);
    ctx.fillStyle = `rgba(255,255,255,${brandOpacity})`;
    ctx.font = `bold ${36 * scale}px Arial, Helvetica, sans-serif`;
    ctx.fillText(frame.branding.watermarkText, padX, 116 * scale);
    clearLegibilityTextShadow(ctx);
  }

  if (legibilityPlan.title.visible) {
    drawLegibilityLocalScrim(
      ctx,
      legibilityPlan.title.region,
      legibilityPlan.title.opacity,
    );
    ctx.save();
    ctx.globalAlpha = legibilityPlan.title.opacity;
    applyLegibilityTextShadow(ctx, scale);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${48 * scale}px Arial, Helvetica, sans-serif`;
    wrapText(ctx, frame.storyTitle, padX, titleY, width - padX * 2, 58 * scale);
    clearLegibilityTextShadow(ctx);
    ctx.restore();
  }

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

  if (transition) {
    return;
  }

  const engagementOverlays =
    "engagementOverlays" in frame.drawScene.manifestScene
      ? frame.drawScene.manifestScene.engagementOverlays
      : undefined;
  if (engagementOverlays && engagementOverlays.length > 0) {
    const sceneCaption = frame.drawScene.sceneCaption;
    const captionCollision =
      captionModeAllowsDraw && sceneCaption
        ? {
            present: true,
            sceneLayout: captionLayoutFromManifest(sceneCaption),
            projectLayout: undefined,
            sceneStyle: captionStyleFromManifest(sceneCaption),
            projectStyle: undefined,
          }
        : undefined;
    for (const overlay of engagementOverlays) {
      const plan = resolveEngagementOverlayFrame({
        overlay,
        sceneDurationMs: frame.media.sceneDurationMs,
        sceneElapsedMs: frame.media.sceneElapsedMs,
        frameWidth: width,
        frameHeight: height,
        captionCollision,
      });
      drawEngagementOverlay(ctx, plan);
    }
  }

  if (hasActiveCaption && activeCaptionCandidate) {
    const caption = activeCaptionCandidate.caption;
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
      display: captionToSubtitleDisplay(activeCaptionCandidate, scene),
      scene,
      script: {
        // Layout/style already resolved onto the caption — avoid default overwrite.
        defaultCaptionLayout: undefined,
        defaultCaptionStyle: undefined,
      },
    });
  }
}
