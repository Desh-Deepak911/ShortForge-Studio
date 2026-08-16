/**
 * Deterministic brand-sting frame planner (sting-local clock only).
 * Same elapsed millisecond always yields the same plan.
 */

import type { ShortForgeBrandStingV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  BRAND_STING_COLORS,
  BRAND_STING_LEAD_IN,
  BRAND_STING_LEAD_IN_DISPLAY,
  BRAND_STING_LOCKED_TITLE,
  BRAND_STING_LOCKUP_CENTER_Y_RATIO,
  BRAND_STING_MARK_SIZE_REF,
  isBrandStingDurationMs,
  type BrandStingDurationMs,
} from "./brand-sting.presets";
import { normalizeShortForgeBrandSting } from "./normalize-brand-sting";

export type BrandStingPhase = "hidden" | "entrance" | "hold" | "exit";

export const BRAND_STING_REFERENCE_WIDTH = 1080;
export const BRAND_STING_REFERENCE_HEIGHT = 1920;

export interface BrandStingMarkGeometry {
  readonly cx: number;
  readonly cy: number;
  readonly size: number;
  /** 0–1 left-to-right clip reveal. Not mark opacity. */
  readonly reveal: number;
  /** Independent fade. Exit uses this, not a leftover reveal clip. */
  readonly opacity: number;
}

export interface BrandStingGlowPlan {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly opacity: number;
  readonly color: string;
}

export interface BrandStingRingMarkerPlan {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
}

export interface BrandStingRingPlan {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly opacity: number;
  readonly strokeWidth: number;
  readonly markerOpacity: number;
  readonly markers: readonly BrandStingRingMarkerPlan[];
}

export interface BrandStingBeamPlan {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly opacity: number;
}

export interface BrandStingAccentLinePlan {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 0–1 draw progress from the lockup center. */
  readonly reveal: number;
  readonly opacity: number;
}

/**
 * Exact project timeline equations for an optional trailing sting.
 * Visible sting occupies [brandStingStartMs, brandStingEndMs).
 * End buffer, when present, begins only at brandStingEndMs.
 */
export interface BrandStingTimelineBounds {
  readonly narrationEndMs: number;
  readonly brandStingStartMs: number;
  readonly brandStingEndMs: number;
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
  readonly endBufferMs: number;
  readonly durationMs: number;
}

export function resolveBrandStingTimelineBounds(input: {
  readonly narrationEndMs: number;
  readonly endBufferMs: number;
  /** 0 when sting is absent / capability-off. */
  readonly brandStingDurationMs: number;
}): BrandStingTimelineBounds {
  const narrationEndMs = Number.isFinite(input.narrationEndMs)
    ? Math.max(0, Math.round(input.narrationEndMs))
    : 0;
  const endBufferMs = Number.isFinite(input.endBufferMs)
    ? Math.max(0, Math.round(input.endBufferMs))
    : 0;
  const durationMs =
    Number.isFinite(input.brandStingDurationMs) &&
    input.brandStingDurationMs > 0 &&
    isBrandStingDurationMs(input.brandStingDurationMs)
      ? input.brandStingDurationMs
      : 0;
  const brandStingStartMs = narrationEndMs;
  const brandStingEndMs = narrationEndMs + durationMs;
  const contentDurationMs = brandStingEndMs;
  const renderDurationMs = contentDurationMs + endBufferMs;
  return {
    narrationEndMs,
    brandStingStartMs,
    brandStingEndMs,
    contentDurationMs,
    renderDurationMs,
    endBufferMs,
    durationMs,
  };
}

/**
 * Preview playback ceiling.
 * - No authoritative sting: exact legacy MasterTimeline.renderDurationMs
 *   (same basis as resolvePreviewDurationSec × 1000), including any end buffer.
 * - Authoritative sting: brandStingEndMs = contentEndMs + sting duration.
 *   Export-only end buffer is excluded after the sting (no gap before it).
 */
export function resolvePreviewPlaybackDurationMs(input: {
  readonly contentEndMs: number;
  readonly renderDurationMs: number;
  /** Authoritative sting duration only; 0 when loading/off/invalid/removed. */
  readonly brandStingDurationMs: number;
}): number {
  const contentEndMs = Number.isFinite(input.contentEndMs)
    ? Math.max(0, Math.round(input.contentEndMs))
    : 0;
  const renderDurationMs = Number.isFinite(input.renderDurationMs)
    ? Math.max(0, Math.round(input.renderDurationMs))
    : 0;
  const stingMs =
    Number.isFinite(input.brandStingDurationMs) &&
    input.brandStingDurationMs > 0 &&
    isBrandStingDurationMs(input.brandStingDurationMs)
      ? input.brandStingDurationMs
      : 0;
  if (stingMs > 0) {
    return contentEndMs + stingMs;
  }
  return renderDurationMs;
}

export interface ResolvedBrandStingFrame {
  readonly visible: boolean;
  readonly phase: BrandStingPhase;
  /** 0–1 progress within the active phase. */
  readonly progress: number;
  readonly durationMs: BrandStingDurationMs;
  readonly elapsedMs: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly backgroundTop: string;
  readonly backgroundBottom: string;
  readonly accentGlow: string;
  readonly accentGlowOpacity: number;
  readonly mark: BrandStingMarkGeometry;
  readonly leadIn: typeof BRAND_STING_LEAD_IN;
  readonly leadInDisplay: typeof BRAND_STING_LEAD_IN_DISPLAY;
  readonly leadInOpacity: number;
  readonly leadInTranslateY: number;
  readonly leadInY: number;
  readonly leadInFontSize: number;
  readonly title: typeof BRAND_STING_LOCKED_TITLE;
  readonly titlePrimary: "ShortForge";
  readonly titleSecondary: "Studio";
  readonly titleOpacity: number;
  readonly titleScale: number;
  readonly titleTranslateY: number;
  readonly titleY: number;
  readonly titleFontSize: number;
  readonly subtitleOpacity: number;
  readonly subtitleScale: number;
  readonly subtitleTranslateY: number;
  readonly subtitleY: number;
  readonly subtitleFontSize: number;
  readonly lockupCenterY: number;
  readonly lockupOpacity: number;
  readonly glow: BrandStingGlowPlan;
  readonly rings: readonly BrandStingRingPlan[];
  readonly beams: readonly BrandStingBeamPlan[];
  readonly accentLine: BrandStingAccentLinePlan;
  readonly exiting: boolean;
}

export interface ResolveBrandStingFrameInput {
  readonly sting: unknown;
  /** Sting-local elapsed ms (0 at sting start). */
  readonly elapsedMs: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(t: number): number {
  const p = clamp01(t);
  return 1 - (1 - p) ** 3;
}

function easeInCubic(t: number): number {
  const p = clamp01(t);
  return p ** 3;
}

function phaseDurations(durationMs: BrandStingDurationMs): {
  entranceMs: number;
  holdMs: number;
  exitMs: number;
} {
  const entranceMs = Math.round(durationMs * 0.28);
  const exitMs = Math.round(durationMs * 0.22);
  const holdMs = Math.max(0, durationMs - entranceMs - exitMs);
  return { entranceMs, holdMs, exitMs };
}

const RING_COUNT = 3;

function resolveLockupLayout(frameWidth: number, frameHeight: number) {
  const scale = Math.min(
    frameWidth / BRAND_STING_REFERENCE_WIDTH,
    frameHeight / BRAND_STING_REFERENCE_HEIGHT,
  );
  const lockupCenterY = frameHeight * BRAND_STING_LOCKUP_CENTER_Y_RATIO;
  const markSize = BRAND_STING_MARK_SIZE_REF * scale;
  return {
    scale,
    lockupCenterY,
    markSize,
    markCx: frameWidth / 2,
    markCy: lockupCenterY - 86 * scale,
    leadInY: lockupCenterY + 6 * scale,
    titleY: lockupCenterY + 52 * scale,
    subtitleY: lockupCenterY + 104 * scale,
    accentLineY: lockupCenterY + 136 * scale,
    leadInFontSize: 24 * scale,
    titleFontSize: 72 * scale,
    subtitleFontSize: 38 * scale,
    glowRadius: 240 * scale,
    accentLineFullWidth: 88 * scale,
    accentLineHeight: 2.5 * scale,
  };
}

const RING_MARKER_ANGLES = [
  [Math.PI * 0.2, Math.PI * 1.2],
  [Math.PI * 0.45, Math.PI * 1.45],
  [Math.PI * 0.7, Math.PI * 1.7],
] as const;

function resolveRings(
  normalizedElapsed: number,
  scale: number,
  intensity: number,
  cx: number,
  cy: number,
): readonly BrandStingRingPlan[] {
  const u = clamp01(normalizedElapsed);
  const rings: BrandStingRingPlan[] = [];
  for (let index = 0; index < RING_COUNT; index += 1) {
    const start = 0.1 + index * 0.035;
    const expand = clamp01((u - start) / 0.22);
    const fade = 1 - clamp01((u - start - 0.16) / 0.3);
    const eased = easeOutCubic(expand);
    const radius = (150 + index * 95) * scale * (0.42 + 0.58 * eased);
    const markerOpacity = 0.1 * fade * eased * intensity;
    const markerRadius = Math.max(1.1, 2.1 * scale);
    const angles = RING_MARKER_ANGLES[index] ?? RING_MARKER_ANGLES[0]!;
    rings.push({
      cx,
      cy,
      radius,
      opacity: 0.16 * fade * eased * intensity,
      strokeWidth: Math.max(1, 1.6 * scale),
      markerOpacity,
      markers: angles.map((angle) => ({
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        radius: markerRadius,
        opacity: markerOpacity,
      })),
    });
  }
  return rings;
}

function resolveBeams(
  frameWidth: number,
  lockupCenterY: number,
  scale: number,
  glowOpacity: number,
): readonly BrandStingBeamPlan[] {
  const opacity = glowOpacity * 0.06;
  return [
    {
      x0: frameWidth * 0.08,
      y0: 0,
      x1: frameWidth / 2 - 20 * scale,
      y1: lockupCenterY,
      opacity,
    },
    {
      x0: frameWidth * 0.92,
      y0: 0,
      x1: frameWidth / 2 + 20 * scale,
      y1: lockupCenterY,
      opacity,
    },
  ];
}

function hiddenFrame(
  durationMs: BrandStingDurationMs,
  elapsedMs: number,
  frameWidth: number,
  frameHeight: number,
): ResolvedBrandStingFrame {
  const layout = resolveLockupLayout(frameWidth, frameHeight);
  return {
    visible: false,
    phase: "hidden",
    progress: 0,
    durationMs,
    elapsedMs,
    frameWidth,
    frameHeight,
    backgroundTop: BRAND_STING_COLORS.backgroundTop,
    backgroundBottom: BRAND_STING_COLORS.backgroundBottom,
    accentGlow: BRAND_STING_COLORS.accentGlow,
    accentGlowOpacity: 0,
    mark: {
      cx: layout.markCx,
      cy: layout.markCy,
      size: layout.markSize,
      reveal: 0,
      opacity: 0,
    },
    leadIn: BRAND_STING_LEAD_IN,
    leadInDisplay: BRAND_STING_LEAD_IN_DISPLAY,
    leadInOpacity: 0,
    leadInTranslateY: 0,
    leadInY: layout.leadInY,
    leadInFontSize: layout.leadInFontSize,
    title: BRAND_STING_LOCKED_TITLE,
    titlePrimary: "ShortForge",
    titleSecondary: "Studio",
    titleOpacity: 0,
    titleScale: 1,
    titleTranslateY: 0,
    titleY: layout.titleY,
    titleFontSize: layout.titleFontSize,
    subtitleOpacity: 0,
    subtitleScale: 1,
    subtitleTranslateY: 0,
    subtitleY: layout.subtitleY,
    subtitleFontSize: layout.subtitleFontSize,
    lockupCenterY: layout.lockupCenterY,
    lockupOpacity: 0,
    glow: {
      cx: layout.markCx,
      cy: layout.lockupCenterY,
      radius: layout.glowRadius,
      opacity: 0,
      color: BRAND_STING_COLORS.accentGlow,
    },
    rings: resolveRings(0, layout.scale, 0, layout.markCx, layout.lockupCenterY),
    beams: resolveBeams(frameWidth, layout.lockupCenterY, layout.scale, 0),
    accentLine: {
      x: layout.markCx,
      y: layout.accentLineY,
      width: 0,
      height: layout.accentLineHeight,
      reveal: 0,
      opacity: 0,
    },
    exiting: false,
  };
}

/**
 * Half-open sting window [narrationEndMs, narrationEndMs + durationMs).
 * At narrationEndMs → elapsed 0; at/after brandStingEndMs → null
 * (caller may sample terminal elapsed = durationMs for end-buffer fill).
 */
export function resolveBrandStingLocalElapsedMs(input: {
  readonly absoluteTimeMs: number;
  readonly narrationEndMs: number;
  readonly durationMs: number;
}): number | null {
  const { absoluteTimeMs, narrationEndMs, durationMs } = input;
  if (
    !Number.isFinite(absoluteTimeMs) ||
    !Number.isFinite(narrationEndMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return null;
  }
  if (absoluteTimeMs < narrationEndMs) return null;
  const local = absoluteTimeMs - narrationEndMs;
  if (local >= durationMs) return null;
  return Math.max(0, local);
}

/** Last visible sting-local sample (brandStingEndMs − 1). */
export function resolveBrandStingFinalElapsedMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.max(0, Math.round(durationMs) - 1);
}

/**
 * Terminal / end-buffer sample: resolveBrandStingFrame(…, durationMs) → invisible.
 * Never clamps back to the final visible branded frame.
 */
export function resolveBrandStingTerminalElapsedMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.round(durationMs);
}

export function resolveBrandStingFrame(
  input: ResolveBrandStingFrameInput,
): ResolvedBrandStingFrame {
  const frameWidth =
    typeof input.frameWidth === "number" && input.frameWidth > 0
      ? input.frameWidth
      : BRAND_STING_REFERENCE_WIDTH;
  const frameHeight =
    typeof input.frameHeight === "number" && input.frameHeight > 0
      ? input.frameHeight
      : BRAND_STING_REFERENCE_HEIGHT;
  const sting = normalizeShortForgeBrandSting(input.sting);
  const durationMs = sting && isBrandStingDurationMs(sting.durationMs)
    ? sting.durationMs
    : 2500;
  if (!sting || sting.enabled !== true) {
    return hiddenFrame(durationMs, 0, frameWidth, frameHeight);
  }

  const elapsedMs = Number.isFinite(input.elapsedMs)
    ? Math.max(0, input.elapsedMs)
    : 0;
  if (elapsedMs >= durationMs) {
    return hiddenFrame(durationMs, elapsedMs, frameWidth, frameHeight);
  }

  const layout = resolveLockupLayout(frameWidth, frameHeight);
  const { scale } = layout;
  const { entranceMs, holdMs, exitMs } = phaseDurations(durationMs);
  const normalizedElapsed = durationMs > 0 ? elapsedMs / durationMs : 0;

  let phase: BrandStingPhase = "hold";
  let progress = 1;
  let leadInOpacity = 1;
  let leadInTranslateY = 0;
  let titleOpacity = 1;
  let titleScale = 1;
  let titleTranslateY = 0;
  let subtitleOpacity = 1;
  let subtitleScale = 1;
  let subtitleTranslateY = 0;
  let markReveal = 1;
  let markOpacity = 1;
  let accentLineReveal = 1;
  let accentGlowOpacity = 0.32;
  let lockupOpacity = 1;
  let exiting = false;

  if (elapsedMs < entranceMs) {
    phase = "entrance";
    progress = entranceMs > 0 ? elapsedMs / entranceMs : 1;
    const e = easeOutCubic(progress);
    accentGlowOpacity = 0.12 + 0.2 * e;
    markReveal = easeOutCubic(clamp01((progress - 0.08) / 0.42));
    markOpacity = 1;
    accentLineReveal = easeOutCubic(clamp01((progress - 0.62) / 0.33));
    leadInOpacity = clamp01((progress - 0.38) / 0.28);
    leadInTranslateY = 12 * (1 - leadInOpacity) * scale;
    titleOpacity = easeOutCubic(clamp01((progress - 0.48) / 0.32));
    titleScale = 0.94 + 0.06 * titleOpacity;
    titleTranslateY = 22 * (1 - titleOpacity) * scale;
    subtitleOpacity = easeOutCubic(clamp01((progress - 0.58) / 0.32));
    subtitleScale = 0.96 + 0.04 * subtitleOpacity;
    subtitleTranslateY = 16 * (1 - subtitleOpacity) * scale;
  } else if (elapsedMs < entranceMs + holdMs) {
    phase = "hold";
    progress = holdMs > 0 ? (elapsedMs - entranceMs) / holdMs : 1;
    leadInOpacity = 1;
    titleOpacity = 1;
    subtitleOpacity = 1;
    markReveal = 1;
    markOpacity = 1;
    accentLineReveal = 1;
    accentGlowOpacity = 0.32;
  } else {
    phase = "exit";
    exiting = true;
    progress = exitMs > 0 ? (elapsedMs - entranceMs - holdMs) / exitMs : 1;
    const e = easeInCubic(progress);
    lockupOpacity = 1 - e;
    leadInOpacity = lockupOpacity;
    leadInTranslateY = -8 * e * scale;
    titleOpacity = lockupOpacity;
    titleScale = 1 - 0.04 * e;
    titleTranslateY = -16 * e * scale;
    subtitleOpacity = lockupOpacity;
    subtitleScale = 1 - 0.03 * e;
    subtitleTranslateY = -10 * e * scale;
    markReveal = 1;
    markOpacity = lockupOpacity;
    accentLineReveal = 1 - e;
    accentGlowOpacity = 0.32 * (1 - e);
  }

  const accentWidth = layout.accentLineFullWidth * clamp01(accentLineReveal);
  const glowOpacity = clamp01(accentGlowOpacity);

  return {
    visible:
      titleOpacity > 0.001 ||
      markOpacity > 0.001 ||
      leadInOpacity > 0.001 ||
      glowOpacity > 0.001,
    phase,
    progress: clamp01(progress),
    durationMs,
    elapsedMs,
    frameWidth,
    frameHeight,
    backgroundTop: BRAND_STING_COLORS.backgroundTop,
    backgroundBottom: BRAND_STING_COLORS.backgroundBottom,
    accentGlow: BRAND_STING_COLORS.accentGlow,
    accentGlowOpacity: glowOpacity,
    mark: {
      cx: layout.markCx,
      cy: layout.markCy,
      size: layout.markSize,
      reveal: clamp01(markReveal),
      opacity: clamp01(markOpacity),
    },
    leadIn: BRAND_STING_LEAD_IN,
    leadInDisplay: BRAND_STING_LEAD_IN_DISPLAY,
    leadInOpacity: clamp01(leadInOpacity),
    leadInTranslateY,
    leadInY: layout.leadInY,
    leadInFontSize: layout.leadInFontSize,
    title: BRAND_STING_LOCKED_TITLE,
    titlePrimary: "ShortForge",
    titleSecondary: "Studio",
    titleOpacity: clamp01(titleOpacity),
    titleScale,
    titleTranslateY,
    titleY: layout.titleY,
    titleFontSize: layout.titleFontSize,
    subtitleOpacity: clamp01(subtitleOpacity),
    subtitleScale,
    subtitleTranslateY,
    subtitleY: layout.subtitleY,
    subtitleFontSize: layout.subtitleFontSize,
    lockupCenterY: layout.lockupCenterY,
    lockupOpacity: clamp01(lockupOpacity),
    glow: {
      cx: layout.markCx,
      cy: layout.lockupCenterY,
      radius: layout.glowRadius,
      opacity: glowOpacity * 0.55,
      color: BRAND_STING_COLORS.accentGlow,
    },
    rings: resolveRings(
      normalizedElapsed,
      scale,
      lockupOpacity,
      layout.markCx,
      layout.lockupCenterY,
    ),
    beams: resolveBeams(frameWidth, layout.lockupCenterY, scale, glowOpacity),
    accentLine: {
      x: layout.markCx - accentWidth / 2,
      y: layout.accentLineY,
      width: accentWidth,
      height: layout.accentLineHeight,
      reveal: clamp01(accentLineReveal),
      opacity: 0.92 * clamp01(accentLineReveal) * lockupOpacity,
    },
    exiting,
  };
}

/** Type guard helper for callers that already hold a normalized sting. */
export function isEnabledBrandSting(
  value: unknown,
): value is ShortForgeBrandStingV1 {
  const sting = normalizeShortForgeBrandSting(value);
  return Boolean(sting?.enabled);
}
