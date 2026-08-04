/**
 * Deterministic engagement-overlay frame planner (scene-local clock only).
 */

import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
  SceneEngagementOverlayV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  engagementOverlayIconsForKind,
  engagementOverlayLabelsForKind,
  type EngagementOverlayIconToken,
} from "./engagement-overlay.presets";
import {
  resolveEngagementOverlayWindow,
  type ResolvedEngagementOverlayWindow,
} from "./resolve-engagement-overlay-window";

export type EngagementOverlayPhase = "hidden" | "entrance" | "hold" | "exit";

/** Reference frame matches export design space (1080×1920). */
export const ENGAGEMENT_OVERLAY_REFERENCE_WIDTH = 1080;
export const ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT = 1920;

export interface EngagementOverlayLayoutBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ResolvedEngagementOverlayFrame {
  readonly visible: boolean;
  readonly phase: EngagementOverlayPhase;
  /** 0–1 progress within the active phase (0 when hidden). */
  readonly progress: number;
  readonly opacity: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly layout: EngagementOverlayLayoutBox;
  readonly kind: EngagementOverlayKind;
  readonly position: EngagementOverlayPosition;
  readonly labels: readonly string[];
  readonly iconTokens: readonly EngagementOverlayIconToken[];
  readonly window: ResolvedEngagementOverlayWindow;
}

export interface ResolveEngagementOverlayFrameInput {
  readonly overlay: unknown;
  readonly sceneDurationMs: number;
  /** Scene-local elapsed ms. */
  readonly sceneElapsedMs: number;
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

function resolvePhaseDurations(windowDurationMs: number): {
  entranceMs: number;
  exitMs: number;
  holdMs: number;
} {
  const entranceMs = Math.min(220, Math.max(120, Math.round(windowDurationMs * 0.16)));
  const exitMs = Math.min(220, Math.max(120, Math.round(windowDurationMs * 0.16)));
  const holdMs = Math.max(0, windowDurationMs - entranceMs - exitMs);
  return { entranceMs, exitMs, holdMs };
}

function layoutForPosition(
  position: EngagementOverlayPosition,
  kind: EngagementOverlayKind,
  frameWidth: number,
  frameHeight: number,
): EngagementOverlayLayoutBox {
  const scaleX = frameWidth / ENGAGEMENT_OVERLAY_REFERENCE_WIDTH;
  const scaleY = frameHeight / ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  const width =
    (kind === "combined" ? 420 : 220) * scale;
  const height = (kind === "combined" ? 64 : 56) * scale;
  const marginX = 48 * scale;
  const marginY = 96 * scale;
  const safeBottom = 280 * scale; // keep clear of common caption band
  const safeTop = 72 * scale;

  let x = marginX;
  let y = safeTop;

  switch (position) {
    case "top-left":
      x = marginX;
      y = safeTop;
      break;
    case "top-center":
      x = (frameWidth - width) / 2;
      y = safeTop;
      break;
    case "top-right":
      x = frameWidth - width - marginX;
      y = safeTop;
      break;
    case "center":
      x = (frameWidth - width) / 2;
      y = (frameHeight - height) / 2;
      break;
    case "bottom-left":
      x = marginX;
      y = frameHeight - height - Math.max(marginY, safeBottom);
      break;
    case "bottom-center":
      x = (frameWidth - width) / 2;
      y = frameHeight - height - Math.max(marginY, safeBottom);
      break;
    case "bottom-right":
      x = frameWidth - width - marginX;
      y = frameHeight - height - Math.max(marginY, safeBottom);
      break;
    default:
      x = frameWidth - width - marginX;
      y = safeTop;
  }

  return {
    x: Math.max(0, Math.min(frameWidth - width, x)),
    y: Math.max(0, Math.min(frameHeight - height, y)),
    width,
    height,
  };
}

function slideDelta(
  position: EngagementOverlayPosition,
  progress: number,
  layout: EngagementOverlayLayoutBox,
): { x: number; y: number } {
  const distance = Math.min(28, layout.height * 0.55);
  const t = 1 - clamp01(progress);
  switch (position) {
    case "top-left":
    case "top-center":
    case "top-right":
      return { x: 0, y: -distance * t };
    case "bottom-left":
    case "bottom-center":
    case "bottom-right":
      return { x: 0, y: distance * t };
    default:
      return { x: 0, y: distance * t * 0.5 };
  }
}

function hiddenFrame(
  window: ResolvedEngagementOverlayWindow,
  overlay: SceneEngagementOverlayV1 | undefined,
  frameWidth: number,
  frameHeight: number,
): ResolvedEngagementOverlayFrame {
  const kind = overlay?.kind ?? "like";
  const position = overlay?.position ?? "top-right";
  return {
    visible: false,
    phase: "hidden",
    progress: 0,
    opacity: 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    layout: layoutForPosition(position, kind, frameWidth, frameHeight),
    kind,
    position,
    labels: engagementOverlayLabelsForKind(kind),
    iconTokens: engagementOverlayIconsForKind(kind),
    window,
  };
}

/**
 * Inter-scene transitions suppress engagement overlays entirely.
 * Intra-scene media transitions do not — destination-scene overlays stay active.
 * Preview and canvas must share this decision.
 */
export function shouldSuppressEngagementOverlayForInterSceneTransition(
  interSceneTransitionActive: boolean,
): boolean {
  return interSceneTransitionActive === true;
}

/**
 * Resolve a deterministic overlay render plan for one scene-local timestamp.
 * Seeking to the same elapsed time always yields the same plan.
 */
export function resolveEngagementOverlayFrame(
  input: ResolveEngagementOverlayFrameInput,
): ResolvedEngagementOverlayFrame {
  const frameWidth =
    typeof input.frameWidth === "number" && input.frameWidth > 0
      ? input.frameWidth
      : ENGAGEMENT_OVERLAY_REFERENCE_WIDTH;
  const frameHeight =
    typeof input.frameHeight === "number" && input.frameHeight > 0
      ? input.frameHeight
      : ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT;

  const window = resolveEngagementOverlayWindow({
    overlay: input.overlay,
    sceneDurationMs: input.sceneDurationMs,
  });

  if (!window.available || !window.overlay) {
    return hiddenFrame(window, window.overlay, frameWidth, frameHeight);
  }

  const elapsed =
    typeof input.sceneElapsedMs === "number" && Number.isFinite(input.sceneElapsedMs)
      ? Math.max(0, input.sceneElapsedMs)
      : 0;

  if (elapsed < window.startOffsetMs || elapsed >= window.endOffsetMs) {
    return hiddenFrame(window, window.overlay, frameWidth, frameHeight);
  }

  const local = elapsed - window.startOffsetMs;
  const { entranceMs, exitMs, holdMs } = resolvePhaseDurations(window.durationMs);
  const layout = layoutForPosition(
    window.overlay.position,
    window.overlay.kind,
    frameWidth,
    frameHeight,
  );
  const labels = engagementOverlayLabelsForKind(window.overlay.kind);
  const iconTokens = engagementOverlayIconsForKind(window.overlay.kind);

  if (local < entranceMs) {
    const progress = entranceMs > 0 ? local / entranceMs : 1;
    const eased = easeOutCubic(progress);
    const slide = slideDelta(window.overlay.position, eased, layout);
    return {
      visible: true,
      phase: "entrance",
      progress: clamp01(progress),
      opacity: eased,
      scale: 0.92 + 0.08 * eased,
      translateX: slide.x,
      translateY: slide.y,
      layout,
      kind: window.overlay.kind,
      position: window.overlay.position,
      labels,
      iconTokens,
      window,
    };
  }

  if (local < entranceMs + holdMs) {
    return {
      visible: true,
      phase: "hold",
      progress: holdMs > 0 ? clamp01((local - entranceMs) / holdMs) : 1,
      opacity: 1,
      scale: 1,
      translateX: 0,
      translateY: 0,
      layout,
      kind: window.overlay.kind,
      position: window.overlay.position,
      labels,
      iconTokens,
      window,
    };
  }

  const exitLocal = local - entranceMs - holdMs;
  const progress = exitMs > 0 ? exitLocal / exitMs : 1;
  const eased = easeInCubic(progress);
  const slide = slideDelta(window.overlay.position, 1 - eased, layout);
  return {
    visible: true,
    phase: "exit",
    progress: clamp01(progress),
    opacity: 1 - eased,
    scale: 1 - 0.06 * eased,
    translateX: slide.x,
    translateY: slide.y,
    layout,
    kind: window.overlay.kind,
    position: window.overlay.position,
    labels,
    iconTokens,
    window,
  };
}
