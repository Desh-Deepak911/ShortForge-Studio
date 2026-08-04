/**
 * Deterministic brand-sting frame planner (sting-local clock only).
 * Same elapsed millisecond always yields the same plan.
 */

import type { ShortForgeBrandStingV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  BRAND_STING_COLORS,
  BRAND_STING_LEAD_IN,
  BRAND_STING_LOCKED_TITLE,
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
  /** 0–1 forged-line reveal progress. */
  readonly reveal: number;
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
  readonly backgroundTop: string;
  readonly backgroundBottom: string;
  readonly accentGlow: string;
  readonly accentGlowOpacity: number;
  readonly mark: BrandStingMarkGeometry;
  readonly leadIn: typeof BRAND_STING_LEAD_IN;
  readonly leadInOpacity: number;
  readonly title: typeof BRAND_STING_LOCKED_TITLE;
  readonly titlePrimary: "ShortForge";
  readonly titleSecondary: "Studio";
  readonly titleOpacity: number;
  readonly titleScale: number;
  readonly titleTranslateY: number;
  readonly subtitleOpacity: number;
  readonly subtitleScale: number;
  readonly subtitleTranslateY: number;
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

function hiddenFrame(
  durationMs: BrandStingDurationMs,
  elapsedMs: number,
): ResolvedBrandStingFrame {
  return {
    visible: false,
    phase: "hidden",
    progress: 0,
    durationMs,
    elapsedMs,
    backgroundTop: BRAND_STING_COLORS.backgroundTop,
    backgroundBottom: BRAND_STING_COLORS.backgroundBottom,
    accentGlow: BRAND_STING_COLORS.accentGlow,
    accentGlowOpacity: 0,
    mark: { cx: 0, cy: 0, size: 0, reveal: 0 },
    leadIn: BRAND_STING_LEAD_IN,
    leadInOpacity: 0,
    title: BRAND_STING_LOCKED_TITLE,
    titlePrimary: "ShortForge",
    titleSecondary: "Studio",
    titleOpacity: 0,
    titleScale: 1,
    titleTranslateY: 0,
    subtitleOpacity: 0,
    subtitleScale: 1,
    subtitleTranslateY: 0,
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
  const sting = normalizeShortForgeBrandSting(input.sting);
  const durationMs = sting && isBrandStingDurationMs(sting.durationMs)
    ? sting.durationMs
    : 2500;
  if (!sting || sting.enabled !== true) {
    return hiddenFrame(durationMs, 0);
  }

  const elapsedMs = Number.isFinite(input.elapsedMs)
    ? Math.max(0, input.elapsedMs)
    : 0;
  if (elapsedMs >= durationMs) {
    return hiddenFrame(durationMs, elapsedMs);
  }

  const frameWidth = input.frameWidth ?? BRAND_STING_REFERENCE_WIDTH;
  const frameHeight = input.frameHeight ?? BRAND_STING_REFERENCE_HEIGHT;
  const scale = Math.min(
    frameWidth / BRAND_STING_REFERENCE_WIDTH,
    frameHeight / BRAND_STING_REFERENCE_HEIGHT,
  );
  const { entranceMs, holdMs, exitMs } = phaseDurations(durationMs);

  let phase: BrandStingPhase = "hold";
  let progress = 1;
  let leadInOpacity = 1;
  let titleOpacity = 1;
  let titleScale = 1;
  let titleTranslateY = 0;
  let subtitleOpacity = 1;
  let subtitleScale = 1;
  let subtitleTranslateY = 0;
  let markReveal = 1;
  let accentGlowOpacity = 0.85;
  let exiting = false;

  if (elapsedMs < entranceMs) {
    phase = "entrance";
    progress = entranceMs > 0 ? elapsedMs / entranceMs : 1;
    const e = easeOutCubic(progress);
    leadInOpacity = clamp01((progress - 0.05) / 0.55);
    titleOpacity = e;
    titleScale = 0.92 + 0.08 * e;
    titleTranslateY = (28 * (1 - e)) * scale;
    subtitleOpacity = clamp01((progress - 0.18) / 0.82);
    subtitleScale = 0.96 + 0.04 * easeOutCubic(subtitleOpacity);
    subtitleTranslateY = (18 * (1 - subtitleOpacity)) * scale;
    markReveal = e;
    accentGlowOpacity = 0.35 + 0.5 * e;
  } else if (elapsedMs < entranceMs + holdMs) {
    phase = "hold";
    progress = holdMs > 0 ? (elapsedMs - entranceMs) / holdMs : 1;
    leadInOpacity = 1;
    titleOpacity = 1;
    subtitleOpacity = 1;
    markReveal = 1;
    accentGlowOpacity = 0.85;
  } else {
    phase = "exit";
    exiting = true;
    progress = exitMs > 0 ? (elapsedMs - entranceMs - holdMs) / exitMs : 1;
    const e = easeInCubic(progress);
    leadInOpacity = 1 - e;
    titleOpacity = 1 - e;
    titleScale = 1 - 0.04 * e;
    titleTranslateY = (-16 * e) * scale;
    subtitleOpacity = 1 - e;
    subtitleScale = 1 - 0.03 * e;
    subtitleTranslateY = (-10 * e) * scale;
    markReveal = 1 - 0.35 * e;
    accentGlowOpacity = 0.85 * (1 - e);
  }

  const safeTop = 220 * scale;
  const markSize = 96 * scale;
  const markCy = safeTop + markSize * 0.55;

  return {
    visible: titleOpacity > 0.001 || markReveal > 0.001 || leadInOpacity > 0.001,
    phase,
    progress: clamp01(progress),
    durationMs,
    elapsedMs,
    backgroundTop: BRAND_STING_COLORS.backgroundTop,
    backgroundBottom: BRAND_STING_COLORS.backgroundBottom,
    accentGlow: BRAND_STING_COLORS.accentGlow,
    accentGlowOpacity: clamp01(accentGlowOpacity),
    mark: {
      cx: frameWidth / 2,
      cy: markCy,
      size: markSize,
      reveal: clamp01(markReveal),
    },
    leadIn: BRAND_STING_LEAD_IN,
    leadInOpacity: clamp01(leadInOpacity),
    title: BRAND_STING_LOCKED_TITLE,
    titlePrimary: "ShortForge",
    titleSecondary: "Studio",
    titleOpacity: clamp01(titleOpacity),
    titleScale,
    titleTranslateY,
    subtitleOpacity: clamp01(subtitleOpacity),
    subtitleScale,
    subtitleTranslateY,
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
