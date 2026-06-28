import {
  SUBTITLE_ESTIMATED_CHARS_PER_LINE,
  SUBTITLE_MAX_VISIBLE_LINES,
} from "./subtitle.utils";

export type MeasureTextWidth = (text: string) => number;

export interface WrapSubtitleLinesOptions {
  maxLines?: number;
  maxCharsPerLine?: number;
}

export interface SubtitleDisplayLayout {
  lines: string[];
  /** Scales caption font when wrapped lines exceed the visible line budget. */
  fontScale: number;
}

/** Minimum font scale when fitting overflow copy into the caption box. */
export const SUBTITLE_MIN_FONT_SCALE = 0.72;

/** Hard cap on wrapped rows before font scaling (avoids unreadably small text). */
export const SUBTITLE_OVERFLOW_MAX_LINES = 5;

/** Word-wraps subtitle copy — never drops trailing words. */
export function wrapSubtitleTextToLines(
  text: string,
  maxWidth: number,
  measureWidth: MeasureTextWidth,
  maxLines: number = Number.POSITIVE_INFINITY,
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

    if (current && measureWidth(candidate) > maxWidth) {
      lines.push(current);
      current = word;
      continue;
    }

    current = candidate;
  }

  if (current) {
    lines.push(current);
  }

  if (!Number.isFinite(maxLines) || lines.length <= maxLines) {
    return lines;
  }

  // Prefer additional lines over clipping — caller may scale font to fit.
  return lines;
}

function wrapAllDisplayLines(text: string, maxCharsPerLine: number): string[] {
  return wrapSubtitleTextToLines(
    text,
    maxCharsPerLine,
    (line) => line.length,
    Number.POSITIVE_INFINITY,
  );
}

/**
 * Resolves wrapped lines + optional font scale so overflow copy stays readable
 * without clipping words.
 */
export function resolveSubtitleDisplayLayout(
  text: string,
  options: WrapSubtitleLinesOptions = {},
): SubtitleDisplayLayout {
  const maxLines = options.maxLines ?? SUBTITLE_MAX_VISIBLE_LINES;
  const maxCharsPerLine = options.maxCharsPerLine ?? SUBTITLE_ESTIMATED_CHARS_PER_LINE;
  const normalized = text.trim();

  if (!normalized) {
    return { lines: [], fontScale: 1 };
  }

  const naturalLines = wrapAllDisplayLines(normalized, maxCharsPerLine);

  if (naturalLines.length <= maxLines) {
    return { lines: naturalLines, fontScale: 1 };
  }

  const tighterChars = Math.max(
    10,
    Math.floor((maxCharsPerLine * maxLines) / naturalLines.length),
  );
  const tighterLines = wrapAllDisplayLines(normalized, tighterChars);

  if (tighterLines.length <= maxLines) {
    return { lines: tighterLines, fontScale: 1 };
  }

  const overflowLines = wrapAllDisplayLines(
    normalized,
    Math.max(8, Math.floor(maxCharsPerLine * 0.85)),
  );

  const fontScale = Math.max(
    SUBTITLE_MIN_FONT_SCALE,
    maxLines / Math.max(overflowLines.length, 1),
  );

  return { lines: overflowLines, fontScale };
}

/** Estimates display lines for preview/export metadata without canvas metrics. */
export function wrapSubtitleTextToDisplayLines(
  text: string,
  options: WrapSubtitleLinesOptions = {},
): string[] {
  return resolveSubtitleDisplayLayout(text, options).lines;
}

/** Canvas helper — wraps using measured glyph widths without clipping words. */
export function wrapSubtitleTextForCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = SUBTITLE_MAX_VISIBLE_LINES,
): string[] {
  const layout = resolveSubtitleDisplayLayout(text, { maxLines });
  if (layout.fontScale >= 1) {
    return wrapSubtitleTextToLines(
      text,
      maxWidth,
      (line) => ctx.measureText(line).width,
      Number.POSITIVE_INFINITY,
    ).slice(0, maxLines < layout.lines.length ? SUBTITLE_OVERFLOW_MAX_LINES : maxLines);
  }

  return wrapSubtitleTextToLines(
    text,
    maxWidth * layout.fontScale,
    (line) => ctx.measureText(line).width,
    SUBTITLE_OVERFLOW_MAX_LINES,
  );
}
