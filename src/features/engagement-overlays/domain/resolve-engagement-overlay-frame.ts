/**
 * Deterministic engagement-overlay frame planner (scene-local clock only).
 * Combined overlays expose a frozen segment-state plan so Preview and canvas
 * cannot diverge on active index or Subscribe confirmation timing.
 */

import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
  EngagementOverlaySize,
  SceneEngagementOverlayV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  engagementOverlayIconsForKind,
  engagementOverlayLabelsForKind,
  ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
  ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
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

/**
 * Frozen per-segment render state for Preview/canvas parity.
 * Derived only from scene-local elapsed time — never timers or React state.
 */
export interface ResolvedEngagementOverlaySegment {
  readonly index: number;
  readonly label: string;
  readonly iconToken: EngagementOverlayIconToken;
  /** Exactly one segment may be active during hold for combined kinds. */
  readonly active: boolean;
  /** Earlier beats that have finished their emphasis. */
  readonly settled: boolean;
  /** 0–1 deterministic pulse within the active beat (0 when inactive). */
  readonly emphasis: number;
  /** Subscribe confirmation — true only during the final combined beat. */
  readonly confirmation: boolean;
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
  /**
   * Shared segment plan. Length matches labels. Non-combined kinds have a
   * single segment that is never confirmation-active.
   */
  readonly segments: readonly ResolvedEngagementOverlaySegment[];
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
  size: EngagementOverlaySize,
  fineScale: number,
  frameWidth: number,
  frameHeight: number,
): EngagementOverlayLayoutBox {
  const scaleX = frameWidth / ENGAGEMENT_OVERLAY_REFERENCE_WIDTH;
  const scaleY = frameHeight / ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  const sizeMultiplier = size === "small" ? 0.82 : size === "large" ? 1.18 : 1;
  // Medium is the larger legible default; fineScale remains bounded by normalization.
  const authorScale = sizeMultiplier * fineScale;
  const width = (kind === "combined" ? 680 : 300) * authorScale * scale;
  const height = (kind === "combined" ? 112 : 96) * authorScale * scale;
  const marginX = 40 * scale;
  const marginY = 96 * scale;
  const safeBottom = 360 * scale; // reserve the common caption band at every size
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

/**
 * Build frozen segment states from hold-local elapsed time.
 * Combined: three ordered beats Like → Share → Subscribe.
 * Non-combined: one segment, never confirmation, no multi-beat fabrication.
 */
function resolveSegments(input: {
  readonly kind: EngagementOverlayKind;
  readonly phase: EngagementOverlayPhase;
  readonly holdLocalMs: number;
  readonly holdMs: number;
}): readonly ResolvedEngagementOverlaySegment[] {
  const labels = engagementOverlayLabelsForKind(input.kind);
  const icons = engagementOverlayIconsForKind(input.kind);
  const count = labels.length;

  if (input.kind !== "combined" || count <= 1) {
    return labels.map((label, index) => ({
      index,
      label,
      iconToken: icons[index] ?? icons[0] ?? "heart",
      active: false,
      settled: false,
      emphasis: 0,
      confirmation: false,
    }));
  }

  const beatCount = 3;
  let activeIndex = -1;
  let beatProgress = 0;

  if (input.phase === "hold" && input.holdMs > 0) {
    const clampedHold = Math.min(
      Math.max(0, input.holdLocalMs),
      Math.max(0, input.holdMs - Number.EPSILON),
    );
    const beatMs = input.holdMs / beatCount;
    activeIndex = Math.min(
      beatCount - 1,
      Math.max(0, Math.floor(clampedHold / beatMs)),
    );
    const beatStart = activeIndex * beatMs;
    beatProgress = beatMs > 0 ? clamp01((clampedHold - beatStart) / beatMs) : 1;
  }

  // Deterministic pulse: 0 at beat edges, 1 at mid-beat (seek-stable).
  const emphasis =
    activeIndex >= 0 ? Math.sin(clamp01(beatProgress) * Math.PI) : 0;

  return labels.map((label, index) => {
    const active = index === activeIndex;
    const settled = activeIndex >= 0 && index < activeIndex;
    const confirmation = active && index === beatCount - 1;
    return {
      index,
      label,
      iconToken: icons[index] ?? icons[0] ?? "heart",
      active,
      settled,
      emphasis: active ? emphasis : 0,
      confirmation,
    };
  });
}

function buildFrame(input: {
  readonly visible: boolean;
  readonly phase: EngagementOverlayPhase;
  readonly progress: number;
  readonly opacity: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly layout: EngagementOverlayLayoutBox;
  readonly kind: EngagementOverlayKind;
  readonly position: EngagementOverlayPosition;
  readonly holdLocalMs: number;
  readonly holdMs: number;
  readonly window: ResolvedEngagementOverlayWindow;
}): ResolvedEngagementOverlayFrame {
  const labels = engagementOverlayLabelsForKind(input.kind);
  const iconTokens = engagementOverlayIconsForKind(input.kind);
  const segments = resolveSegments({
    kind: input.kind,
    phase: input.phase,
    holdLocalMs: input.holdLocalMs,
    holdMs: input.holdMs,
  });
  return {
    visible: input.visible,
    phase: input.phase,
    progress: input.progress,
    opacity: input.opacity,
    scale: input.scale,
    translateX: input.translateX,
    translateY: input.translateY,
    layout: input.layout,
    kind: input.kind,
    position: input.position,
    labels,
    iconTokens,
    segments,
    window: input.window,
  };
}

function hiddenFrame(
  window: ResolvedEngagementOverlayWindow,
  overlay: SceneEngagementOverlayV1 | undefined,
  frameWidth: number,
  frameHeight: number,
): ResolvedEngagementOverlayFrame {
  const kind = overlay?.kind ?? "like";
  const position = overlay?.position ?? "top-right";
  return buildFrame({
    visible: false,
    phase: "hidden",
    progress: 0,
    opacity: 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    layout: layoutForPosition(
      position,
      kind,
      overlay?.size ?? ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
      overlay?.scale ?? ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
      frameWidth,
      frameHeight,
    ),
    kind,
    position,
    holdLocalMs: 0,
    holdMs: 0,
    window,
  });
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
    window.overlay.size ?? ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
    window.overlay.scale ?? ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
    frameWidth,
    frameHeight,
  );
  const kind = window.overlay.kind;
  const position = window.overlay.position;

  if (local < entranceMs) {
    const progress = entranceMs > 0 ? local / entranceMs : 1;
    const eased = easeOutCubic(progress);
    const slide = slideDelta(position, eased, layout);
    return buildFrame({
      visible: true,
      phase: "entrance",
      progress: clamp01(progress),
      opacity: eased,
      scale: 0.92 + 0.08 * eased,
      translateX: slide.x,
      translateY: slide.y,
      layout,
      kind,
      position,
      holdLocalMs: 0,
      holdMs,
      window,
    });
  }

  if (local < entranceMs + holdMs) {
    const holdLocalMs = local - entranceMs;
    return buildFrame({
      visible: true,
      phase: "hold",
      progress: holdMs > 0 ? clamp01(holdLocalMs / holdMs) : 1,
      opacity: 1,
      scale: 1,
      translateX: 0,
      translateY: 0,
      layout,
      kind,
      position,
      holdLocalMs,
      holdMs,
      window,
    });
  }

  const exitLocal = local - entranceMs - holdMs;
  const progress = exitMs > 0 ? exitLocal / exitMs : 1;
  const eased = easeInCubic(progress);
  const slide = slideDelta(position, 1 - eased, layout);
  return buildFrame({
    visible: true,
    phase: "exit",
    progress: clamp01(progress),
    opacity: 1 - eased,
    scale: 1 - 0.06 * eased,
    translateX: slide.x,
    translateY: slide.y,
    layout,
    kind,
    position,
    holdLocalMs: holdMs,
    holdMs,
    window,
  });
}
