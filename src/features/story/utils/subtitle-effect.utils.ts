/** Matches `.subtitle-effect-fade-up` in globals.css */
export const FADE_UP_DURATION_MS = 500;
export const FADE_UP_Y_OFFSET_PX = 8;
export const FADE_UP_EASING = {
  cp1x: 0.22,
  cp1y: 1,
  cp2x: 0.36,
  cp2y: 1,
} as const;

export interface FadeUpSubtitleFrame {
  opacity: number;
  yOffsetPx: number;
}

function bezierComponent(t: number, a: number, b: number, c: number): number {
  return ((a * t + b) * t + c) * t;
}

/** CSS cubic-bezier timing — maps linear progress to eased progress. */
export function cubicBezierTiming(
  linearProgress: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
): number {
  const t = Math.min(1, Math.max(0, linearProgress));
  if (t <= 0) {
    return 0;
  }
  if (t >= 1) {
    return 1;
  }

  const cx = 3 * cp1x;
  const bx = 3 * (cp2x - cp1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * cp1y;
  const by = 3 * (cp2y - cp1y) - cy;
  const ay = 1 - cy - by;

  let start = 0;
  let end = 1;

  for (let index = 0; index < 8; index++) {
    const midpoint = (start + end) / 2;
    const x = bezierComponent(midpoint, ax, bx, cx);
    if (x < t) {
      start = midpoint;
    } else {
      end = midpoint;
    }
  }

  const solvedT = (start + end) / 2;
  return bezierComponent(solvedT, ay, by, cy);
}

/** Fade-up frame state for canvas/CSS export at a point within the active chunk. */
export function getFadeUpSubtitleFrame(chunkElapsedMs: number): FadeUpSubtitleFrame {
  const linearProgress = Math.min(1, Math.max(0, chunkElapsedMs / FADE_UP_DURATION_MS));
  const easedProgress = cubicBezierTiming(
    linearProgress,
    FADE_UP_EASING.cp1x,
    FADE_UP_EASING.cp1y,
    FADE_UP_EASING.cp2x,
    FADE_UP_EASING.cp2y,
  );

  return {
    opacity: easedProgress,
    yOffsetPx: (1 - easedProgress) * FADE_UP_Y_OFFSET_PX,
  };
}

/** Matches preview `TypewriterIntervalReveal` pacing for timeline duration estimates. */
export const TYPEWRITER_TARGET_DURATION_MS = 2000;
export const TYPEWRITER_MIN_STEP_MS = 28;
export const TYPEWRITER_MAX_STEP_MS = 48;

export function estimateTypewriterRevealDurationMs(text: string): number {
  const length = Math.max(text.trim().length, 1);
  const stepMs = Math.max(
    TYPEWRITER_MIN_STEP_MS,
    Math.min(TYPEWRITER_MAX_STEP_MS, Math.floor(TYPEWRITER_TARGET_DURATION_MS / length)),
  );
  return stepMs * length;
}

/** Typewriter reveal for export — matches preview `TypewriterProgressReveal`. */
export function getTypewriterRevealedText(text: string, chunkProgress: number): string {
  const normalized = text.trim();
  if (!normalized) {
    return "";
  }

  const clampedProgress = Math.min(1, Math.max(0, chunkProgress));
  if (clampedProgress >= 1) {
    return normalized;
  }

  // First frame of a chunk must show at least one character (never blank at chunk start).
  const visibleLength = Math.max(
    1,
    Math.floor(normalized.length * clampedProgress),
  );
  return normalized.slice(0, visibleLength);
}

export interface HighlightSubtitleFrame {
  /** 0–1 width of the highlight pill relative to full text width. */
  highlightWidthProgress: number;
  /** Vertical scale for the accent bar (0.88–1). */
  barScale: number;
  /** Background alpha for the text pill. */
  backgroundAlpha: number;
}

/** Highlight frame state — grows the pill/bar through the chunk for export. */
export function getHighlightSubtitleFrame(chunkProgress: number): HighlightSubtitleFrame {
  const clampedProgress = Math.min(1, Math.max(0, chunkProgress));
  const easedProgress = cubicBezierTiming(clampedProgress, 0.22, 1, 0.36, 1);

  return {
    highlightWidthProgress: Math.max(0.12, easedProgress),
    barScale: 0.88 + easedProgress * 0.12,
    backgroundAlpha: 0.08 + easedProgress * 0.06,
  };
}

/** Progress through the active subtitle chunk (0–1). */
export function getExportSubtitleEffectProgress(
  chunkElapsedMs: number,
  activeChunkDurationMs: number,
): number {
  return Math.min(1, Math.max(0, chunkElapsedMs / Math.max(1, activeChunkDurationMs)));
}

/** Export highlight frame — reveal over chunk duration with preview-like pulse. */
export function getExportHighlightSubtitleFrame(
  chunkElapsedMs: number,
  activeChunkDurationMs: number,
): HighlightSubtitleFrame {
  const effectProgress = getExportSubtitleEffectProgress(chunkElapsedMs, activeChunkDurationMs);
  const easedReveal = cubicBezierTiming(effectProgress, 0.22, 1, 0.36, 1);
  const pulsePhase = (chunkElapsedMs % 2400) / 2400;
  const pulse = 0.5 + 0.5 * Math.sin(pulsePhase * Math.PI * 2);

  return {
    highlightWidthProgress: Math.max(0.12, easedReveal),
    barScale: 0.88 + pulse * 0.12,
    backgroundAlpha: 0.08 + easedReveal * 0.06 + pulse * 0.04,
  };
}
