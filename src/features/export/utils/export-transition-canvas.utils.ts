import {
  resolveTransitionEffectLayers,
  resolveTransitionPreviewFilters,
  type TransitionState,
} from "@/features/timeline-intelligence/resolve-transition-state.utils";
import type { TransitionEffect } from "@/features/story/types";

export interface ExportTransitionLayerDrawState {
  opacity: number;
  translateXRatio: number;
  scale: number;
  blurPx: number;
}

export interface DrawExportSceneBackgroundFn {
  (ctx: CanvasRenderingContext2D, width: number, height: number): void;
}

function parseTransformStyle(
  opacity: number,
  transform?: string,
  blurPx = 0,
): ExportTransitionLayerDrawState {
  let translateXRatio = 0;
  let scale = 1;

  if (transform) {
    const translateMatch = transform.match(/translateX\(([-\d.]+)%\)/);
    if (translateMatch) {
      translateXRatio = parseFloat(translateMatch[1]) / 100;
    }

    const scaleMatch = transform.match(/scale\(([\d.]+)\)/);
    if (scaleMatch) {
      scale = parseFloat(scaleMatch[1]);
    }
  }

  return { opacity, translateXRatio, scale, blurPx };
}

function parseBlurPx(filter?: string): number {
  if (!filter) {
    return 0;
  }

  const blurMatch = filter.match(/blur\(([\d.]+)px\)/);
  return blurMatch ? parseFloat(blurMatch[1]) : 0;
}

/** Maps shared transition state to export canvas draw parameters. */
export function getExportTransitionLayerDrawStatesFromTransitionState(
  effect: TransitionEffect,
  state: Pick<
    TransitionState,
    "opacityFrom" | "opacityTo" | "transformFrom" | "transformTo" | "progress"
  >,
): { from: ExportTransitionLayerDrawState; to: ExportTransitionLayerDrawState } {
  const previewStyles = {
    from: {
      opacity: state.opacityFrom,
      transform: state.transformFrom !== "none" ? state.transformFrom : undefined,
    },
    to: {
      opacity: state.opacityTo,
      transform: state.transformTo !== "none" ? state.transformTo : undefined,
    },
  };
  const filters = resolveTransitionPreviewFilters(effect, state.progress);

  return {
    from: parseTransformStyle(
      previewStyles.from.opacity,
      previewStyles.from.transform,
      parseBlurPx(filters.filterFrom),
    ),
    to: parseTransformStyle(
      previewStyles.to.opacity,
      previewStyles.to.transform,
      parseBlurPx(filters.filterTo),
    ),
  };
}

export function getExportTransitionLayerDrawStates(
  effect: TransitionEffect,
  progress: number,
): { from: ExportTransitionLayerDrawState; to: ExportTransitionLayerDrawState } {
  const layers = resolveTransitionEffectLayers(effect, progress);

  return getExportTransitionLayerDrawStatesFromTransitionState(effect, {
    opacityFrom: layers.opacityFrom,
    opacityTo: layers.opacityTo,
    transformFrom: layers.transformFrom,
    transformTo: layers.transformTo,
    progress,
  });
}

function drawExportTransitionLayer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  drawBackground: DrawExportSceneBackgroundFn,
  layer: ExportTransitionLayerDrawState,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  ctx.globalAlpha = layer.opacity;

  if (layer.blurPx > 0) {
    ctx.filter = `blur(${layer.blurPx}px)`;
  }

  ctx.translate(width / 2, height / 2);
  ctx.scale(layer.scale, layer.scale);
  ctx.translate(-width / 2 + layer.translateXRatio * width, -height / 2);

  drawBackground(ctx, width, height);
  ctx.restore();
}

function drawExportTransitionLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: TransitionEffect,
  transitionState: Pick<
    TransitionState,
    "opacityFrom" | "opacityTo" | "transformFrom" | "transformTo" | "progress"
  >,
  drawFromBackground: DrawExportSceneBackgroundFn,
  drawToBackground: DrawExportSceneBackgroundFn,
): void {
  const { from, to } = getExportTransitionLayerDrawStatesFromTransitionState(
    effect,
    transitionState,
  );

  drawExportTransitionLayer(ctx, width, height, drawFromBackground, from);
  drawExportTransitionLayer(ctx, width, height, drawToBackground, to);
}

export interface DrawExportTransitionBackgroundsOptions {
  effect: TransitionEffect;
  transitionState: Pick<
    TransitionState,
    "opacityFrom" | "opacityTo" | "transformFrom" | "transformTo" | "progress"
  >;
  drawFromBackground: DrawExportSceneBackgroundFn;
  drawToBackground: DrawExportSceneBackgroundFn;
}

/** Composites outgoing and incoming scene backgrounds using shared transition state. */
export function drawExportTransitionBackgrounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: DrawExportTransitionBackgroundsOptions,
): void {
  const { effect, transitionState, drawFromBackground, drawToBackground } = options;

  try {
    drawExportTransitionLayers(
      ctx,
      width,
      height,
      effect,
      transitionState,
      drawFromBackground,
      drawToBackground,
    );
  } catch {
    const fadeLayers = resolveTransitionEffectLayers("fade", transitionState.progress);
    drawExportTransitionLayers(
      ctx,
      width,
      height,
      "fade",
      {
        opacityFrom: fadeLayers.opacityFrom,
        opacityTo: fadeLayers.opacityTo,
        transformFrom: fadeLayers.transformFrom,
        transformTo: fadeLayers.transformTo,
        progress: transitionState.progress,
      },
      drawFromBackground,
      drawToBackground,
    );
  }
}
