import type { ExportSubtitleDisplay } from "@/features/export/utils/export-subtitle.utils";
import { SUBTITLE_MAX_VISIBLE_LINES, SUBTITLE_MAX_WIDTH_RATIO } from "@/features/story/utils";
import {
  getExportHighlightSubtitleFrame,
  getFadeUpSubtitleFrame,
  getTypewriterRevealedText,
} from "@/features/story/utils/subtitle-effect.utils";

export interface DrawExportSubtitlesCaptionOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  subtitleY: number;
  scale: number;
  display: ExportSubtitleDisplay;
}

const SUBTITLE_FONT_SIZE = 64;
const SUBTITLE_LINE_HEIGHT_RATIO = 1.3;
const SUBTITLE_BOX_PAD_X = 18;
const SUBTITLE_BOX_PAD_Y = 10;
const SUBTITLE_BOX_RADIUS = 12;
const SUBTITLE_BOX_BACKGROUND = "rgba(0, 0, 0, 0.45)";
const SUBTITLE_BOX_BORDER = "rgba(255, 255, 255, 0.1)";

export interface ExportSubtitleLayoutMetrics {
  fontSize: number;
  lineHeight: number;
  maxBoxWidth: number;
  maxTextWidth: number;
  padX: number;
  padY: number;
}

export function getExportSubtitleLayoutMetrics(scale: number): ExportSubtitleLayoutMetrics {
  const fontSize = SUBTITLE_FONT_SIZE * scale;
  return {
    fontSize,
    lineHeight: fontSize * SUBTITLE_LINE_HEIGHT_RATIO,
    maxBoxWidth: 0,
    maxTextWidth: 0,
    padX: SUBTITLE_BOX_PAD_X * scale,
    padY: SUBTITLE_BOX_PAD_Y * scale,
  };
}

/**
 * Word-wraps text into at most `maxLines` rows using canvas measurement.
 * Overflow beyond maxLines is omitted — chunking should split copy earlier.
 */
export function wrapTextToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = SUBTITLE_MAX_VISIBLE_LINES,
): string[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;

    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) {
        return lines;
      }
      continue;
    }

    current = candidate;
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  return lines;
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
  centerX: number,
  topY: number,
  boxWidth: number,
  boxHeight: number,
  scale: number,
  opacity: number,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = SUBTITLE_BOX_BACKGROUND;
  ctx.strokeStyle = SUBTITLE_BOX_BORDER;
  ctx.lineWidth = Math.max(1, scale);
  roundRectPath(
    ctx,
    centerX - boxWidth / 2,
    topY,
    boxWidth,
    boxHeight,
    SUBTITLE_BOX_RADIUS * scale,
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function measureSubtitleLineWidths(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  fontSize: number,
): number[] {
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  return lines.map((line) => ctx.measureText(line).width);
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
): ExportSubtitleTextBlockSize {
  if (lines.length === 0) {
    return { boxWidth: 0, boxHeight: 0, widestLineWidth: 0 };
  }

  const lineWidths = measureSubtitleLineWidths(ctx, lines, metrics.fontSize);
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
): ExportSubtitleLayoutMetrics {
  const base = getExportSubtitleLayoutMetrics(scale);
  const maxBoxWidth = width * SUBTITLE_MAX_WIDTH_RATIO;
  const maxTextWidth = Math.max(1, maxBoxWidth - base.padX * 2);
  ctx.font = `bold ${base.fontSize}px Arial, Helvetica, sans-serif`;
  return { ...base, maxBoxWidth, maxTextWidth };
}

function resolveDisplayLines(
  ctx: CanvasRenderingContext2D,
  display: ExportSubtitleDisplay,
  maxTextWidth: number,
): string[] {
  const sourceText =
    display.effect === "typewriter"
      ? getTypewriterRevealedText(display.activeChunk, display.effectProgress).trim()
      : display.activeChunk.trim();

  if (!sourceText) {
    return [];
  }

  return wrapTextToLines(ctx, sourceText, maxTextWidth, SUBTITLE_MAX_VISIBLE_LINES);
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
): void {
  const barWidth = 3 * scale;
  const gap = 7 * scale;
  const padX = fontSize * 0.42;
  const padY = fontSize * 0.14;
  const highlight = getExportHighlightSubtitleFrame(chunkElapsedMs, activeChunkDurationMs);
  const textWidth = ctx.measureText(line).width;
  const pillHeight = fontSize + padY * 2;
  const pillFullWidth = textWidth + padX * 2;
  const pillWidth = pillFullWidth * highlight.highlightWidthProgress;
  const barHeight = pillHeight * highlight.barScale;
  const blockWidth = barWidth + gap + pillFullWidth;
  const blockLeft = centerX - blockWidth / 2;
  const pillTop = baselineY - fontSize * 0.82 - padY;
  const barTop = pillTop + (pillHeight - barHeight) / 2;

  const barGradient = ctx.createLinearGradient(0, barTop, 0, barTop + barHeight);
  barGradient.addColorStop(0, "rgba(250, 204, 21, 0.95)");
  barGradient.addColorStop(1, "rgba(234, 179, 8, 0.75)");

  ctx.save();
  ctx.fillStyle = barGradient;
  roundRectPath(ctx, blockLeft, barTop, barWidth, barHeight, barWidth);
  ctx.fill();

  const pillLeft = blockLeft + barWidth + gap;
  ctx.fillStyle = `rgba(255, 255, 255, ${highlight.backgroundAlpha})`;
  roundRectPath(ctx, pillLeft, pillTop, pillWidth, pillHeight, 8 * scale);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(line, pillLeft + padX, baselineY);
  ctx.restore();
}

function drawWrappedSubtitleBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  width: number,
  subtitleY: number,
  scale: number,
  opacity: number,
  yOffset: number,
  display?: ExportSubtitleDisplay,
): void {
  if (lines.length === 0) {
    return;
  }

  const metrics = resolveLayoutMetrics(ctx, width, scale);
  const { boxWidth, boxHeight } = resolveExportSubtitleTextBlockSize(ctx, lines, metrics);
  const boxTop = subtitleY - boxHeight + yOffset;
  const centerX = width / 2;
  const textTopY = boxTop + metrics.padY;
  const useHighlightLines = display?.effect === "highlight";

  if (!useHighlightLines) {
    drawSubtitleBox(ctx, centerX, boxTop, boxWidth, boxHeight, scale, opacity);
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${metrics.fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "center";

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const lineY = textTopY + (index + 1) * metrics.lineHeight;

    if (display?.effect === "highlight") {
      drawHighlightLine(
        ctx,
        line,
        centerX,
        lineY,
        scale,
        metrics.fontSize,
        display.chunkElapsedMs,
        display.activeChunkDurationMs,
      );
    } else {
      ctx.fillText(line, centerX, lineY);
    }
  }

  ctx.restore();
}

function drawActiveChunkLines(
  ctx: CanvasRenderingContext2D,
  display: ExportSubtitleDisplay,
  width: number,
  subtitleY: number,
  scale: number,
  captionOpacity: number,
  captionYOffset: number,
): void {
  const metrics = resolveLayoutMetrics(ctx, width, scale);
  const lines = resolveDisplayLines(ctx, display, metrics.maxTextWidth);
  drawWrappedSubtitleBlock(
    ctx,
    lines,
    width,
    subtitleY,
    scale,
    captionOpacity,
    captionYOffset,
    display,
  );
}

/** Draws bottom-centered export subtitles for the single active chunk. */
export function drawExportSubtitlesCaption(options: DrawExportSubtitlesCaptionOptions): void {
  const { ctx, width, subtitleY, scale, display } = options;
  prepareExportSubtitleLayer(ctx);

  if (!display.activeChunk.trim()) {
    return;
  }

  let captionOpacity = 1;
  let captionYOffset = 0;

  if (display.effect === "fade-up") {
    const fadeUp = getFadeUpSubtitleFrame(display.chunkElapsedMs);
    captionOpacity = fadeUp.opacity;
    captionYOffset = fadeUp.yOffsetPx * scale;
  }

  drawActiveChunkLines(ctx, display, width, subtitleY, scale, captionOpacity, captionYOffset);
  resetExportCanvasDrawState(ctx);
}

/** Draws bottom-centered generated captions without subtitle effects. */
export function drawExportGeneratedCaption(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  width: number,
  height: number,
  subtitleY: number,
  scale: number,
): void {
  prepareExportSubtitleLayer(ctx);

  const metrics = resolveLayoutMetrics(ctx, width, scale);
  const sourceText = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  if (!sourceText) {
    return;
  }

  const wrappedLines = wrapTextToLines(
    ctx,
    sourceText,
    metrics.maxTextWidth,
    SUBTITLE_MAX_VISIBLE_LINES,
  );

  drawWrappedSubtitleBlock(ctx, wrappedLines, width, subtitleY, scale, 1, 0);
  resetExportCanvasDrawState(ctx);
}
