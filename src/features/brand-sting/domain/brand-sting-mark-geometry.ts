/**
 * Renderer-neutral ShortForge forged-diamond mark.
 * Preview and canvas scale these unit-space segments — no remote SVG/image.
 */

export const BRAND_STING_MARK_UNIT = 48;

export interface BrandStingMarkPoint {
  readonly x: number;
  readonly y: number;
}

export interface BrandStingMarkSegment {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface BrandStingMarkRevealClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Unit-space diamond centered at the origin. */
export const BRAND_STING_MARK_DIAMOND: readonly BrandStingMarkPoint[] =
  Object.freeze([
    Object.freeze({ x: 0, y: -18 }),
    Object.freeze({ x: 16, y: 0 }),
    Object.freeze({ x: 0, y: 18 }),
    Object.freeze({ x: -16, y: 0 }),
  ]);

/** Two lower forge accent lines in unit space. */
export const BRAND_STING_MARK_FORGE_LINES: readonly BrandStingMarkSegment[] =
  Object.freeze([
    Object.freeze({ x0: -14, y0: 10, x1: 14, y1: 10 }),
    Object.freeze({ x0: -8, y0: 14, x1: 8, y1: 14 }),
  ]);

export const BRAND_STING_MARK_STROKE_UNIT = 2.2;
export const BRAND_STING_MARK_FILL_OPACITY = 0.08;
export const BRAND_STING_MARK_LINE_CAP = "round" as const;
export const BRAND_STING_MARK_LINE_JOIN = "round" as const;
export const BRAND_STING_MARK_REVEAL_DIRECTION = "left-to-right" as const;

export interface ScaledBrandStingMarkGeometry {
  readonly diamond: readonly BrandStingMarkPoint[];
  readonly forgeLines: readonly BrandStingMarkSegment[];
  readonly strokeWidth: number;
  readonly fillOpacity: number;
  readonly lineCap: typeof BRAND_STING_MARK_LINE_CAP;
  readonly lineJoin: typeof BRAND_STING_MARK_LINE_JOIN;
  readonly revealDirection: typeof BRAND_STING_MARK_REVEAL_DIRECTION;
}

function finiteSize(size: number): number {
  return typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function scaleBrandStingMarkGeometry(
  size: number,
): ScaledBrandStingMarkGeometry {
  const k = finiteSize(size) / BRAND_STING_MARK_UNIT;
  return {
    diamond: BRAND_STING_MARK_DIAMOND.map((point) => ({
      x: point.x * k,
      y: point.y * k,
    })),
    forgeLines: BRAND_STING_MARK_FORGE_LINES.map((line) => ({
      x0: line.x0 * k,
      y0: line.y0 * k,
      x1: line.x1 * k,
      y1: line.y1 * k,
    })),
    strokeWidth: Math.max(1.2, BRAND_STING_MARK_STROKE_UNIT * k),
    fillOpacity: BRAND_STING_MARK_FILL_OPACITY,
    lineCap: BRAND_STING_MARK_LINE_CAP,
    lineJoin: BRAND_STING_MARK_LINE_JOIN,
    revealDirection: BRAND_STING_MARK_REVEAL_DIRECTION,
  };
}

/** Local clip rect around the mark center. Reveal grows left → right. */
export function resolveBrandStingMarkRevealClip(
  size: number,
  reveal: number,
): BrandStingMarkRevealClip {
  const safeSize = finiteSize(size);
  const progress = clamp01(reveal);
  return {
    x: -safeSize,
    y: -safeSize,
    width: safeSize * 2 * progress,
    height: safeSize * 2,
  };
}
