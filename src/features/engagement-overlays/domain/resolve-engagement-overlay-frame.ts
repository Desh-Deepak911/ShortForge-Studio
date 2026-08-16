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
  ENGAGEMENT_OVERLAY_COMBINED_REF_HEIGHT,
  ENGAGEMENT_OVERLAY_COMBINED_REF_WIDTH,
  ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
  ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
  ENGAGEMENT_OVERLAY_MOTION,
  ENGAGEMENT_OVERLAY_SINGLE_REF_HEIGHT,
  ENGAGEMENT_OVERLAY_SINGLE_REF_WIDTH,
  ENGAGEMENT_OVERLAY_TYPE,
  type EngagementOverlayIconToken,
} from "./engagement-overlay.presets";
import {
  resolveEngagementOverlayCaptionSafePlacement,
  type EngagementOverlayCaptionCollisionInput,
  type ResolvedEngagementOverlayCaptionSafePlacement,
} from "./resolve-engagement-overlay-caption-safe-placement";
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
  /** Deterministic active-segment scale. 1 when inactive. */
  readonly pulseScale: number;
  /** Deterministic restrained glow. 0 when inactive. */
  readonly glowOpacity: number;
}

/**
 * Equal-column chrome for Preview/canvas. Always populated, including hidden
 * frames. Coordinates are absolute in the output frame.
 * Icon/label X origins are not precomputed — renderers center the measured
 * icon-plus-label group inside each columnBox.
 */
export interface ResolvedEngagementOverlayChrome {
  readonly paddingX: number;
  readonly paddingY: number;
  readonly columnCount: number;
  readonly columnWidth: number;
  /** Absolute equal-width column bounds. */
  readonly columnBoxes: readonly EngagementOverlayLayoutBox[];
  /** Absolute X of each equal column center. */
  readonly columnCentersX: readonly number[];
  /** Absolute X of separators between columns (empty for single-action). */
  readonly separatorXs: readonly number[];
  readonly separatorHeight: number;
  readonly separatorOpacity: number;
  readonly iconSize: number;
  readonly iconLabelGap: number;
  readonly iconStrokeWidth: number;
  /** Shared vertical center for icons and labels. */
  readonly labelCenterY: number;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly letterSpacingEm: number;
  /** Multiply by segment.glowOpacity for a restrained blur radius. */
  readonly glowBlurScale: number;
  readonly cornerRadius: number;
}

export interface ResolvedEngagementOverlayIconLabelOrigin {
  readonly iconCx: number;
  readonly iconCy: number;
  readonly labelX: number;
  readonly labelY: number;
  readonly groupWidth: number;
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
  readonly chrome: ResolvedEngagementOverlayChrome;
  readonly window: ResolvedEngagementOverlayWindow;
  /** Caption-safe placement decision. Identical for Preview/Browser/Headless. */
  readonly captionSafePlacement: ResolvedEngagementOverlayCaptionSafePlacement;
}

export interface ResolveEngagementOverlayFrameInput {
  readonly overlay: unknown;
  readonly sceneDurationMs: number;
  /** Scene-local elapsed ms. */
  readonly sceneElapsedMs: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  /**
   * Scene-stable caption collision context. Omit when the scene has no captions.
   * Must not be derived from the active caption word.
   */
  readonly captionCollision?: EngagementOverlayCaptionCollisionInput;
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
  const width =
    (kind === "combined"
      ? ENGAGEMENT_OVERLAY_COMBINED_REF_WIDTH
      : ENGAGEMENT_OVERLAY_SINGLE_REF_WIDTH) *
    authorScale *
    scale;
  const height =
    (kind === "combined"
      ? ENGAGEMENT_OVERLAY_COMBINED_REF_HEIGHT
      : ENGAGEMENT_OVERLAY_SINGLE_REF_HEIGHT) *
    authorScale *
    scale;
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

/**
 * Equal-column chrome derived only from the resolved layout box.
 * paddingX * 2 + columnWidth * columnCount === layout.width.
 * Does not assume label widths.
 */
function resolveChrome(
  layout: EngagementOverlayLayoutBox,
  kind: EngagementOverlayKind,
): ResolvedEngagementOverlayChrome {
  const columnCount = kind === "combined" ? 3 : 1;
  const paddingX = layout.height * 0.18;
  const paddingY = layout.height * 0.14;
  const innerWidth = Math.max(0, layout.width - paddingX * 2);
  const columnWidth = columnCount > 0 ? innerWidth / columnCount : 0;
  const fontSize = Math.max(
    ENGAGEMENT_OVERLAY_TYPE.minFontSize,
    layout.height * ENGAGEMENT_OVERLAY_TYPE.fontSizeRatio,
  );
  const iconSize = Math.min(
    layout.height * ENGAGEMENT_OVERLAY_TYPE.iconSizeRatio,
    columnWidth * 0.22,
  );
  const iconLabelGap = layout.height * ENGAGEMENT_OVERLAY_TYPE.iconLabelGapRatio;
  const columnBoxes: EngagementOverlayLayoutBox[] = [];
  const columnCentersX: number[] = [];
  const separatorXs: number[] = [];

  for (let index = 0; index < columnCount; index += 1) {
    const x = layout.x + paddingX + index * columnWidth;
    columnBoxes.push({
      x,
      y: layout.y + paddingY,
      width: columnWidth,
      height: Math.max(0, layout.height - paddingY * 2),
    });
    columnCentersX.push(x + columnWidth / 2);
    if (index < columnCount - 1) {
      separatorXs.push(layout.x + paddingX + (index + 1) * columnWidth);
    }
  }

  return {
    paddingX,
    paddingY,
    columnCount,
    columnWidth,
    columnBoxes,
    columnCentersX,
    separatorXs,
    separatorHeight: layout.height * 0.42,
    separatorOpacity: columnCount > 1 ? 0.35 : 0,
    iconSize,
    iconLabelGap,
    iconStrokeWidth:
      iconSize *
      (ENGAGEMENT_OVERLAY_TYPE.iconStrokeViewBox /
        ENGAGEMENT_OVERLAY_TYPE.iconViewBox),
    labelCenterY: layout.y + layout.height / 2,
    fontSize,
    fontWeight: ENGAGEMENT_OVERLAY_TYPE.fontWeight,
    letterSpacingEm: ENGAGEMENT_OVERLAY_TYPE.letterSpacingEm,
    glowBlurScale: iconSize * 0.9,
    cornerRadius: layout.height / 2,
  };
}

/**
 * Center a measured icon-plus-label group inside a resolved column.
 * Renderers may supply labelWidth from the fixed label text only.
 */
export function resolveEngagementOverlayCenteredIconLabel(input: {
  readonly columnBox: EngagementOverlayLayoutBox;
  readonly iconSize: number;
  readonly iconLabelGap: number;
  readonly labelWidth: number;
  readonly labelCenterY: number;
}): ResolvedEngagementOverlayIconLabelOrigin {
  const labelWidth =
    typeof input.labelWidth === "number" && Number.isFinite(input.labelWidth)
      ? Math.max(0, input.labelWidth)
      : 0;
  const groupWidth = input.iconSize + input.iconLabelGap + labelWidth;
  const groupLeft = input.columnBox.x + (input.columnBox.width - groupWidth) / 2;
  return {
    iconCx: groupLeft + input.iconSize / 2,
    iconCy: input.labelCenterY,
    labelX: groupLeft + input.iconSize + input.iconLabelGap,
    labelY: input.labelCenterY,
    groupWidth,
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
      pulseScale: 1,
      glowOpacity: 0,
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
    const segmentEmphasis = active ? emphasis : 0;
    return {
      index,
      label,
      iconToken: icons[index] ?? icons[0] ?? "heart",
      active,
      settled,
      emphasis: segmentEmphasis,
      confirmation,
      pulseScale: active
        ? 1 +
          ENGAGEMENT_OVERLAY_MOTION.pulseScalePeak * segmentEmphasis +
          (confirmation ? ENGAGEMENT_OVERLAY_MOTION.confirmationPulseExtra : 0)
        : 1,
      glowOpacity: active
        ? ENGAGEMENT_OVERLAY_MOTION.glowOpacityPeak * segmentEmphasis
        : 0,
    };
  });
}

function resolveCaptionSafeLayout(
  requested: EngagementOverlayLayoutBox,
  frameWidth: number,
  frameHeight: number,
  captionCollision?: EngagementOverlayCaptionCollisionInput,
): ResolvedEngagementOverlayCaptionSafePlacement {
  return resolveEngagementOverlayCaptionSafePlacement({
    requested,
    frameWidth,
    frameHeight,
    captionCollision,
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
  readonly captionSafePlacement: ResolvedEngagementOverlayCaptionSafePlacement;
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
    chrome: resolveChrome(input.layout, input.kind),
    window: input.window,
    captionSafePlacement: input.captionSafePlacement,
  };
}

function hiddenFrame(
  window: ResolvedEngagementOverlayWindow,
  overlay: SceneEngagementOverlayV1 | undefined,
  frameWidth: number,
  frameHeight: number,
  captionCollision?: EngagementOverlayCaptionCollisionInput,
): ResolvedEngagementOverlayFrame {
  const kind = overlay?.kind ?? "like";
  const position = overlay?.position ?? "top-right";
  const requested = layoutForPosition(
    position,
    kind,
    overlay?.size ?? ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
    overlay?.scale ?? ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
    frameWidth,
    frameHeight,
  );
  const captionSafePlacement = resolveCaptionSafeLayout(
    requested,
    frameWidth,
    frameHeight,
    captionCollision,
  );
  return buildFrame({
    visible: false,
    phase: "hidden",
    progress: 0,
    opacity: 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    layout: captionSafePlacement.applied,
    kind,
    position,
    holdLocalMs: 0,
    holdMs: 0,
    window,
    captionSafePlacement,
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
    return hiddenFrame(
      window,
      window.overlay,
      frameWidth,
      frameHeight,
      input.captionCollision,
    );
  }

  const elapsed =
    typeof input.sceneElapsedMs === "number" && Number.isFinite(input.sceneElapsedMs)
      ? Math.max(0, input.sceneElapsedMs)
      : 0;

  if (elapsed < window.startOffsetMs || elapsed >= window.endOffsetMs) {
    return hiddenFrame(
      window,
      window.overlay,
      frameWidth,
      frameHeight,
      input.captionCollision,
    );
  }

  const local = elapsed - window.startOffsetMs;
  const { entranceMs, exitMs, holdMs } = resolvePhaseDurations(window.durationMs);
  const requested = layoutForPosition(
    window.overlay.position,
    window.overlay.kind,
    window.overlay.size ?? ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
    window.overlay.scale ?? ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
    frameWidth,
    frameHeight,
  );
  const captionSafePlacement = resolveCaptionSafeLayout(
    requested,
    frameWidth,
    frameHeight,
    input.captionCollision,
  );
  const layout = captionSafePlacement.applied;
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
      scale:
        ENGAGEMENT_OVERLAY_MOTION.entranceScaleFrom +
        (ENGAGEMENT_OVERLAY_MOTION.entranceScaleTo -
          ENGAGEMENT_OVERLAY_MOTION.entranceScaleFrom) *
          eased,
      translateX: slide.x,
      translateY: slide.y,
      layout,
      kind,
      position,
      holdLocalMs: 0,
      holdMs,
      window,
      captionSafePlacement,
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
      captionSafePlacement,
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
    scale: 1 - ENGAGEMENT_OVERLAY_MOTION.exitScaleDelta * eased,
    translateX: slide.x,
    translateY: slide.y,
    layout,
    kind,
    position,
    holdLocalMs: holdMs,
    holdMs,
    window,
    captionSafePlacement,
  });
}
