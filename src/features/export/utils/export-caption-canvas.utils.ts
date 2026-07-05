import { resolveExportCaptionPlacement, resolveExportCaptionTextX } from "@/features/caption-engine/caption-layout.utils";
import {
  applyExportCaptionTextDrawState,
  drawExportCaptionStyledLine,
  formatExportCaptionLineText,
  isDefaultCaptionStyleStorage,
  LEGACY_EXPORT_CAPTION_BOX_BORDER,
  resetExportCaptionTextDrawState,
  resolveExportCaptionBackgroundFill,
  resolveExportCaptionStyleForDisplay,
  resolveExportCaptionStyleFromSceneDisplay,
  resolveExportCaptionStyleMetrics,
  resolveCaptionStyleMaxLines,
  type ExportCaptionStyleMetadata,
} from "@/features/caption-style";
import {
  resolveTikTokMotionOverlay,
  resolveTikTokMotionVisualState,
} from "@/features/caption-engine/tiktok-motion-caption-style.utils";
import {
  resolveNewsMotionOverlay,
  resolveNewsMotionVisualState,
  NEWS_MOTION_STYLE_TOKENS,
  type NewsMotionVisualState,
} from "@/features/caption-engine/news-motion-caption-style.utils";
import {
  resolveSportsMotionOverlay,
  resolveSportsMotionVisualState,
  SPORTS_MOTION_STYLE_TOKENS,
  type SportsMotionVisualState,
} from "@/features/caption-engine/sports-motion-caption-style.utils";
import type { ExportSubtitleDisplay } from "@/features/export/utils/export-subtitle.utils";
import type { FootieScene, FootieScript } from "@/features/story/types";
import {
  resolveCaptionAnimationTranslateYPx,
  resolveExportCaptionHighlightFrame,
} from "@/features/caption-animation";
import {
  resolveSubtitleDisplayLayout,
  SUBTITLE_MIN_FONT_SCALE,
  wrapSubtitleTextToLines,
} from "@/features/story/utils/subtitle-layout.utils";
import { SUBTITLE_MAX_VISIBLE_LINES, SUBTITLE_MAX_WIDTH_RATIO } from "@/features/story/utils";
import {
  getTypewriterRevealedText,
} from "@/features/story/utils/subtitle-effect.utils";

export interface DrawExportSubtitlesCaptionOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scale: number;
  display: ExportSubtitleDisplay;
  scene: Pick<FootieScene, "captionLayout" | "captionStyle">;
  script?: Pick<FootieScript, "defaultCaptionLayout" | "defaultCaptionStyle">;
}

export interface ExportSubtitleLayoutMetrics {
  fontSize: number;
  lineHeight: number;
  maxBoxWidth: number;
  maxTextWidth: number;
  padX: number;
  padY: number;
}

export function getExportSubtitleLayoutMetrics(
  scale: number,
  exportStyle: ExportCaptionStyleMetadata = resolveExportCaptionStyleForDisplay(undefined),
  fontScale = 1,
): ExportSubtitleLayoutMetrics {
  const styleMetrics = resolveExportCaptionStyleMetrics(exportStyle, scale, fontScale);
  return {
    fontSize: styleMetrics.fontSize,
    lineHeight: styleMetrics.lineHeight,
    maxBoxWidth: 0,
    maxTextWidth: 0,
    padX: styleMetrics.padX,
    padY: styleMetrics.padY,
  };
}

/** Resets canvas draw state so subtitle frames never inherit prior alpha/composite settings. */
export function resetExportCanvasDrawState(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Resets canvas draw state before drawing subtitle copy for one frame. */
export function prepareExportSubtitleLayer(ctx: CanvasRenderingContext2D): void {
  resetExportCanvasDrawState(ctx);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number,
  radius: number,
) {
  const r = Math.min(radius, boxWidth / 2, boxHeight / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + boxWidth - r, y);
  ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + r);
  ctx.lineTo(x + boxWidth, y + boxHeight - r);
  ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - r, y + boxHeight);
  ctx.lineTo(x + r, y + boxHeight);
  ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSubtitleBox(
  ctx: CanvasRenderingContext2D,
  boxLeft: number,
  topY: number,
  boxWidth: number,
  boxHeight: number,
  scale: number,
  opacity: number,
  exportStyle: ExportCaptionStyleMetadata,
  backgroundAlpha?: number,
): void {
  const styleMetrics = resolveExportCaptionStyleMetrics(exportStyle, scale);
  if (!styleMetrics.backgroundEnabled) {
    return;
  }

  const alpha = backgroundAlpha ?? styleMetrics.backgroundAlpha;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = resolveExportCaptionBackgroundFill(styleMetrics, alpha);
  ctx.strokeStyle = styleMetrics.boxBorderColor || LEGACY_EXPORT_CAPTION_BOX_BORDER;
  ctx.lineWidth = Math.max(1, scale);
  roundRectPath(
    ctx,
    boxLeft,
    topY,
    boxWidth,
    boxHeight,
    styleMetrics.cornerRadius,
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function measureSubtitleLineWidths(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  fontSize: number,
  exportStyle: ExportCaptionStyleMetadata,
  scale: number,
): number[] {
  applyExportCaptionTextDrawState(ctx, fontSize, exportStyle, scale);
  const widths = lines.map((line) => ctx.measureText(line).width);
  resetExportCaptionTextDrawState(ctx);
  return widths;
}

export interface ExportSubtitleTextBlockSize {
  boxWidth: number;
  boxHeight: number;
  widestLineWidth: number;
}

/** Measures wrapped lines and returns one content-sized pill around the text block. */
export function resolveExportSubtitleTextBlockSize(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  metrics: ExportSubtitleLayoutMetrics,
  exportStyle: ExportCaptionStyleMetadata = resolveExportCaptionStyleForDisplay(undefined),
  scale = 1,
): ExportSubtitleTextBlockSize {
  if (lines.length === 0) {
    return { boxWidth: 0, boxHeight: 0, widestLineWidth: 0 };
  }

  const lineWidths = measureSubtitleLineWidths(
    ctx,
    lines,
    metrics.fontSize,
    exportStyle,
    scale,
  );
  const widestLineWidth = Math.max(...lineWidths, 0);
  const textBlockHeight = lines.length * metrics.lineHeight;
  const boxWidth = Math.min(metrics.maxBoxWidth, widestLineWidth + metrics.padX * 2);
  const boxHeight = textBlockHeight + metrics.padY * 2;

  return { boxWidth, boxHeight, widestLineWidth };
}

/** Content-sized pill width capped at 90% of frame — matches preview max-width behavior. */
export function resolveExportSubtitleBoxWidth(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  metrics: ExportSubtitleLayoutMetrics,
): number {
  return resolveExportSubtitleTextBlockSize(ctx, lines, metrics).boxWidth;
}

function resolveLayoutMetrics(
  ctx: CanvasRenderingContext2D,
  width: number,
  scale: number,
  fontScale = 1,
  exportStyle: ExportCaptionStyleMetadata = resolveExportCaptionStyleForDisplay(undefined),
): ExportSubtitleLayoutMetrics {
  const base = getExportSubtitleLayoutMetrics(scale, exportStyle, fontScale);
  const maxBoxWidth = width * SUBTITLE_MAX_WIDTH_RATIO;
  const maxTextWidth = Math.max(1, maxBoxWidth - base.padX * 2);
  applyExportCaptionTextDrawState(ctx, base.fontSize, exportStyle, scale);
  return {
    ...base,
    lineHeight: base.fontSize * exportStyle.lineHeightRatio,
    maxBoxWidth,
    maxTextWidth,
  };
}

function resolveDisplayLines(
  ctx: CanvasRenderingContext2D,
  display: ExportSubtitleDisplay,
  maxTextWidth: number,
  fontScale: number,
  maxLines = SUBTITLE_MAX_VISIBLE_LINES,
): string[] {
  const sourceText =
    display.animationState && display.effect === "typewriter"
      ? display.animationState.visibleText.trim()
      : display.effect === "typewriter"
        ? getTypewriterRevealedText(display.activeChunk, display.effectProgress).trim()
        : display.activeChunk.trim();

  if (!sourceText) {
    return [];
  }

  if (display.lines.length > 0) {
    return display.lines;
  }

  const layout = resolveSubtitleDisplayLayout(sourceText, { maxLines });
  const effectiveScale = Math.min(fontScale, layout.fontScale);

  return wrapSubtitleTextToLines(
    sourceText,
    maxTextWidth / Math.max(SUBTITLE_MIN_FONT_SCALE, effectiveScale),
    (line) => ctx.measureText(line).width,
    Number.POSITIVE_INFINITY,
  );
}

function drawHighlightLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  centerX: number,
  baselineY: number,
  scale: number,
  fontSize: number,
  chunkElapsedMs: number,
  activeChunkDurationMs: number,
  sportsMotion?: SportsMotionVisualState | null,
  newsMotion?: NewsMotionVisualState | null,
): void {
  const barWidth = 3 * scale;
  const gap = 7 * scale;
  const padX = fontSize * 0.42;
  const padY = fontSize * 0.14;
  const pillRadius = 8 * scale;
  const overlayRadius = Math.min(pillRadius, fontSize * 0.35);
  const highlight = resolveExportCaptionHighlightFrame(chunkElapsedMs, activeChunkDurationMs);
  const bounceScale = sportsMotion?.usesSportsGlow ? sportsMotion.bounceScale : 1;
  const slideOffsetPx = newsMotion?.usesNewsLowerThird ? newsMotion.slideOffsetPx * scale : 0;
  const lineCenterY = baselineY - fontSize * 0.41;
  const fontWeight = newsMotion?.usesNewsLowerThird
    ? NEWS_MOTION_STYLE_TOKENS.fontWeight
    : "700";

  ctx.save();

  if (slideOffsetPx !== 0) {
    ctx.translate(0, slideOffsetPx);
  }

  if (bounceScale !== 1) {
    ctx.translate(centerX, lineCenterY);
    ctx.scale(bounceScale, bounceScale);
    ctx.translate(-centerX, -lineCenterY);
  }

  if (sportsMotion?.usesSportsGlow) {
    ctx.shadowBlur = SPORTS_MOTION_STYLE_TOKENS.glowBlurPx * scale;
    ctx.shadowColor = SPORTS_MOTION_STYLE_TOKENS.glowColor;
  }

  ctx.font = `${fontWeight} ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.letterSpacing = newsMotion?.usesNewsLowerThird
    ? `${fontSize * NEWS_MOTION_STYLE_TOKENS.letterSpacingEm}px`
    : "0px";
  const textWidth = ctx.measureText(line).width;
  const pillHeight = fontSize + padY * 2;
  const pillFullWidth = textWidth + padX * 2;
  const overlayWidth = pillFullWidth * highlight.highlightWidthProgress;
  const barHeight = pillHeight * highlight.barScale;
  const blockWidth = barWidth + gap + pillFullWidth;
  const blockLeft = centerX - blockWidth / 2;
  const pillLeft = blockLeft + barWidth + gap;
  const pillTop = baselineY - fontSize * 0.82 - padY;
  const barTop = pillTop + (pillHeight - barHeight) / 2;

  const barGradient = ctx.createLinearGradient(0, barTop, 0, barTop + barHeight);
  if (newsMotion?.usesNewsLowerThird) {
    barGradient.addColorStop(0, NEWS_MOTION_STYLE_TOKENS.barGradientStart);
    barGradient.addColorStop(1, NEWS_MOTION_STYLE_TOKENS.barGradientEnd);
  } else {
    barGradient.addColorStop(0, "rgba(250, 204, 21, 0.95)");
    barGradient.addColorStop(1, "rgba(234, 179, 8, 0.75)");
  }

  ctx.fillStyle = barGradient;
  roundRectPath(ctx, blockLeft, barTop, barWidth, barHeight, barWidth);
  ctx.fill();

  ctx.fillStyle = `rgba(255, 255, 255, ${highlight.backgroundAlpha})`;
  roundRectPath(ctx, pillLeft, pillTop, pillFullWidth, pillHeight, pillRadius);
  ctx.fill();

  if (overlayWidth > 0) {
    ctx.save();
    roundRectPath(ctx, pillLeft, pillTop, pillFullWidth, pillHeight, pillRadius);
    ctx.clip();
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    roundRectPath(ctx, pillLeft, pillTop, overlayWidth, pillHeight, overlayRadius);
    ctx.fill();
    ctx.restore();
  }

  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(line, pillLeft + padX, baselineY);
  ctx.restore();
}

function drawWrappedSubtitleBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  width: number,
  height: number,
  scale: number,
  opacity: number,
  yOffset: number,
  scene: Pick<FootieScene, "captionLayout" | "captionStyle">,
  script: Pick<FootieScript, "defaultCaptionLayout" | "defaultCaptionStyle"> | undefined,
  display?: ExportSubtitleDisplay,
  fontScale = 1,
): void {
  if (lines.length === 0) {
    return;
  }

  const exportStyle = resolveExportCaptionStyleFromSceneDisplay(scene, script, display);
  const tiktokOverlay = display
    ? resolveTikTokMotionOverlay({
        captionPreset: display.captionPreset,
        subtitleEffect: display.effect,
        captionTooShortForEffect: display.captionTooShortForEffect,
      })
    : null;
  const tiktokMotion = resolveTikTokMotionVisualState(
    tiktokOverlay ?? {
      presetId: "minimal",
      usesTikTokMotionOverlay: false,
      usesLegacyTypewriterFallback: false,
    },
    display?.animationState,
  );
  const sportsOverlay = display
    ? resolveSportsMotionOverlay({
        captionPreset: display.captionPreset,
        subtitleEffect: display.effect,
        captionTooShortForEffect: display.captionTooShortForEffect,
        subtitleAvailableDurationMs:
          display.subtitleAvailableDurationMs ?? display.activeChunkDurationMs,
      })
    : null;
  const sportsMotion = resolveSportsMotionVisualState(
    sportsOverlay ?? {
      presetId: "minimal",
      usesSportsMotionOverlay: false,
      usesLegacyHighlightFallback: false,
    },
    display?.animationState,
  );
  const newsOverlay = display
    ? resolveNewsMotionOverlay({
        captionPreset: display.captionPreset,
        subtitleEffect: display.effect,
        captionTooShortForEffect: display.captionTooShortForEffect,
        subtitleAvailableDurationMs:
          display.subtitleAvailableDurationMs ?? display.activeChunkDurationMs,
      })
    : null;
  const newsMotion = resolveNewsMotionVisualState(
    newsOverlay ?? {
      presetId: "minimal",
      usesNewsMotionOverlay: false,
      usesLegacyHighlightFallback: false,
    },
    display?.animationState,
  );
  const metrics = resolveLayoutMetrics(ctx, width, scale, fontScale, exportStyle);
  const { boxWidth, boxHeight } = resolveExportSubtitleTextBlockSize(
    ctx,
    lines,
    metrics,
    exportStyle,
    scale,
  );
  const placement = resolveExportCaptionPlacement(scene, script, width, height, scale, boxWidth, boxHeight);
  const centerX = placement.centerX;
  const boxLeft = placement.boxLeft;
  const boxTop = placement.boxBottomY - boxHeight + yOffset;
  const textTopY = boxTop + metrics.padY;
  const blockCenterY = boxTop + boxHeight / 2;
  const textX = resolveExportCaptionTextX(placement.textAlign, boxLeft, boxWidth, metrics.padX);
  const useHighlightLines = display?.effect === "highlight";

  if (!useHighlightLines) {
    drawSubtitleBox(ctx, boxLeft, boxTop, boxWidth, boxHeight, scale, opacity, exportStyle, placement.backgroundAlpha);
  }

  ctx.save();
  ctx.globalAlpha = opacity;

  if (tiktokMotion.popScale !== 1 && display?.effect === "typewriter") {
    ctx.translate(centerX, blockCenterY);
    ctx.scale(tiktokMotion.popScale, tiktokMotion.popScale);
    ctx.translate(-centerX, -blockCenterY);
  }

  for (let index = 0; index < lines.length; index++) {
    const line = formatExportCaptionLineText(lines[index]!, exportStyle);
    const lineY = textTopY + (index + 1) * metrics.lineHeight;

    if (display?.effect === "highlight") {
      ctx.font = `bold ${metrics.fontSize}px Arial, Helvetica, sans-serif`;
      ctx.letterSpacing = "0px";
      ctx.fillStyle = "#ffffff";
      drawHighlightLine(
        ctx,
        line,
        centerX,
        lineY,
        scale,
        metrics.fontSize,
        display.animationState?.localElapsedMs ?? display.chunkElapsedMs,
        Math.max(1, display.subtitleAvailableDurationMs ?? display.activeChunkDurationMs),
        sportsMotion,
        newsMotion,
      );
    } else {
      const usesStoredCaptionStyle = !isDefaultCaptionStyleStorage(
        scene.captionStyle,
        script?.defaultCaptionStyle,
      );
      drawExportCaptionStyledLine(
        ctx,
        line,
        textX,
        lineY,
        exportStyle,
        metrics.fontSize,
        scale,
        placement.textAlign,
        usesStoredCaptionStyle,
      );
    }
  }

  ctx.restore();
}

function drawActiveChunkLines(
  ctx: CanvasRenderingContext2D,
  display: ExportSubtitleDisplay,
  width: number,
  height: number,
  scale: number,
  captionOpacity: number,
  captionYOffset: number,
  scene: Pick<FootieScene, "captionLayout" | "captionStyle">,
  script: Pick<FootieScript, "defaultCaptionLayout" | "defaultCaptionStyle"> | undefined,
): void {
  const fontScale = display.fontScale ?? 1;
  const exportStyle = resolveExportCaptionStyleFromSceneDisplay(scene, script, display);
  const maxLines = resolveCaptionStyleMaxLines(scene, script);
  const metrics = resolveLayoutMetrics(ctx, width, scale, fontScale, exportStyle);
  const lines = resolveDisplayLines(ctx, display, metrics.maxTextWidth, fontScale, maxLines);
  drawWrappedSubtitleBlock(
    ctx,
    lines,
    width,
    height,
    scale,
    captionOpacity,
    captionYOffset,
    scene,
    script,
    display,
    fontScale,
  );
}

/** Draws export subtitles for the single active chunk. */
export function drawExportSubtitlesCaption(options: DrawExportSubtitlesCaptionOptions): void {
  const { ctx, width, height, scale, display, scene, script } = options;
  prepareExportSubtitleLayer(ctx);

  if (!display.activeChunk.trim()) {
    return;
  }

  let captionOpacity = 1;
  let captionYOffset = 0;

  if (display.animationState) {
    captionOpacity = display.animationState.opacity;
    captionYOffset = resolveCaptionAnimationTranslateYPx(display.animationState.transform) * scale;
  }

  drawActiveChunkLines(ctx, display, width, height, scale, captionOpacity, captionYOffset, scene, script);
  resetExportCanvasDrawState(ctx);
}

/** Word-wraps text into rows using canvas measurement — never drops trailing words. */
export function wrapTextToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = SUBTITLE_MAX_VISIBLE_LINES,
): string[] {
  const layout = resolveSubtitleDisplayLayout(text, { maxLines });
  return wrapSubtitleTextToLines(
    text,
    maxWidth,
    (line) => ctx.measureText(line).width,
    Number.POSITIVE_INFINITY,
  ).slice(0, layout.lines.length > maxLines ? layout.lines.length : undefined);
}

/** Draws generated captions without subtitle effects. */
export function drawExportGeneratedCaption(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  width: number,
  height: number,
  scale: number,
  scene: Pick<FootieScene, "captionLayout" | "captionStyle">,
  script?: Pick<FootieScript, "defaultCaptionLayout" | "defaultCaptionStyle">,
): void {
  prepareExportSubtitleLayer(ctx);

  const exportStyle = resolveExportCaptionStyleFromSceneDisplay(scene, script);
  const maxLines = resolveCaptionStyleMaxLines(scene, script);
  const metrics = resolveLayoutMetrics(ctx, width, scale, 1, exportStyle);
  const sourceText = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  if (!sourceText) {
    return;
  }

  const textLayout = resolveSubtitleDisplayLayout(sourceText, {
    maxLines,
  });
  const wrappedLines = wrapSubtitleTextToLines(
    sourceText,
    metrics.maxTextWidth,
    (line) => ctx.measureText(line).width,
    Number.POSITIVE_INFINITY,
  );

  drawWrappedSubtitleBlock(
    ctx,
    wrappedLines,
    width,
    height,
    scale,
    1,
    0,
    scene,
    script,
    {
      activeChunk: sourceText,
      lines: wrappedLines.slice(0, textLayout.lines.length),
      effect: "fade-up",
      sceneElapsedMs: 0,
      chunkElapsedMs: 0,
      activeChunkDurationMs: 1,
      effectProgress: 1,
    },
    Math.min(1, textLayout.fontScale),
  );
  resetExportCanvasDrawState(ctx);
}
