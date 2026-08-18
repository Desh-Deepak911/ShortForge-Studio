/**
 * Provider-free CTA measured-parity helpers.
 * Compares shared frame plans in inner-screen and output space.
 * Does not invent a second overlay renderer.
 */

import {
  ENGAGEMENT_OVERLAY_PRESET_ID,
} from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import {
  ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
  resolveEngagementOverlayFrame,
  type ResolvedEngagementOverlayFrame,
} from "@/features/engagement-overlays/domain/resolve-engagement-overlay-frame";
import type { EngagementOverlayCaptionCollisionInput } from "@/features/engagement-overlays/domain/resolve-engagement-overlay-caption-safe-placement";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
  EngagementOverlaySize,
  SceneEngagementOverlayV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  PREVIEW_RUNTIME_PARITY_CTA_FINE_SCALES,
  PREVIEW_RUNTIME_PARITY_CTA_KINDS,
  PREVIEW_RUNTIME_PARITY_CTA_POSITIONS,
  PREVIEW_RUNTIME_PARITY_CTA_SIZES,
  PREVIEW_RUNTIME_PARITY_CTA_TOLERANCE,
  PREVIEW_RUNTIME_PARITY_INNER_SCREEN_WIDTHS_PX,
  PREVIEW_RUNTIME_PARITY_OUTPUT_TARGETS,
  resolvePreviewInnerScreenHeightPx,
  resolvePreviewInnerScreenWidthPx,
} from "./preview-runtime-parity-cta-contract";

export interface CtaNormalizedBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CtaOutputBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const SCENE_DURATION_MS = 8_000;
const HOLD_ELAPSED_MS = 800;

export function buildParityCtaOverlay(input: {
  readonly kind?: EngagementOverlayKind;
  readonly position?: EngagementOverlayPosition;
  readonly size?: EngagementOverlaySize;
  readonly scale?: number;
  readonly startOffsetMs?: number;
  readonly durationMs?: number;
}): SceneEngagementOverlayV1 {
  return {
    version: 1,
    id: `parity-cta-${input.kind ?? "combined"}-${input.size ?? "medium"}`,
    kind: input.kind ?? "combined",
    startOffsetMs: input.startOffsetMs ?? 0,
    durationMs: input.durationMs ?? 2_500,
    position: input.position ?? "top-right",
    size: input.size ?? "medium",
    scale: input.scale ?? 1,
    presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
  };
}

export function resolveParityCtaFrame(input: {
  readonly overlay: SceneEngagementOverlayV1;
  readonly sceneElapsedMs?: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly captionCollision?: EngagementOverlayCaptionCollisionInput;
}): ResolvedEngagementOverlayFrame {
  return resolveEngagementOverlayFrame({
    overlay: input.overlay,
    sceneDurationMs: SCENE_DURATION_MS,
    sceneElapsedMs: input.sceneElapsedMs ?? HOLD_ELAPSED_MS,
    frameWidth: input.frameWidth ?? ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
    frameHeight: input.frameHeight ?? ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
    captionCollision: input.captionCollision,
  });
}

export function normalizeCtaBox(
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  frameWidth: number,
  frameHeight: number,
): CtaNormalizedBox {
  return {
    x: box.x / frameWidth,
    y: box.y / frameHeight,
    width: box.width / frameWidth,
    height: box.height / frameHeight,
  };
}

export function toOutputSpaceBox(
  box: CtaNormalizedBox,
): CtaOutputBox {
  return {
    x: box.x * ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
    y: box.y * ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
    width: box.width * ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
    height: box.height * ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  };
}

export function compareCtaOutputBoxes(
  left: CtaOutputBox,
  right: CtaOutputBox,
): { readonly maxDelta: number; readonly withinOuterTolerance: boolean } {
  const maxDelta = Math.max(
    Math.abs(left.x - right.x),
    Math.abs(left.y - right.y),
    Math.abs(left.width - right.width),
    Math.abs(left.height - right.height),
  );
  return {
    maxDelta,
    withinOuterTolerance: maxDelta <= PREVIEW_RUNTIME_PARITY_CTA_TOLERANCE.outerBoundsPx,
  };
}

export function measureCtaInnerScreenVersusHost(hostWidthPx: number): {
  readonly hostWidthPx: number;
  readonly innerWidthPx: number;
  readonly hostNormalized: CtaNormalizedBox;
  readonly innerNormalized: CtaNormalizedBox;
  readonly planNormalized: CtaNormalizedBox;
  readonly hostPlanWidthDelta: number;
  readonly innerPlanWidthDelta: number;
  readonly hostDiffersFromInner: boolean;
} {
  const overlay = buildParityCtaOverlay({ kind: "combined", size: "medium" });
  const plan = resolveParityCtaFrame({ overlay });
  const planNormalized = normalizeCtaBox(
    plan.layout,
    ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
    ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  );
  const innerWidthPx = resolvePreviewInnerScreenWidthPx(hostWidthPx);
  const innerHeightPx = resolvePreviewInnerScreenHeightPx(innerWidthPx);
  const hostHeightPx = resolvePreviewInnerScreenHeightPx(hostWidthPx);
  const hostFrame = resolveParityCtaFrame({
    overlay,
    frameWidth: hostWidthPx,
    frameHeight: hostHeightPx,
  });
  const innerFrame = resolveParityCtaFrame({
    overlay,
    frameWidth: innerWidthPx,
    frameHeight: innerHeightPx,
  });
  const hostNormalized = normalizeCtaBox(hostFrame.layout, hostWidthPx, hostHeightPx);
  const innerNormalized = normalizeCtaBox(innerFrame.layout, innerWidthPx, innerHeightPx);
  return {
    hostWidthPx,
    innerWidthPx,
    hostNormalized,
    innerNormalized,
    planNormalized,
    hostPlanWidthDelta: Math.abs(hostNormalized.width - planNormalized.width),
    innerPlanWidthDelta: Math.abs(innerNormalized.width - planNormalized.width),
    hostDiffersFromInner: innerWidthPx !== hostWidthPx,
  };
}

export function measureCtaPlanAcrossOutputTargets(overlay: SceneEngagementOverlayV1): readonly {
  readonly label: string;
  readonly normalized: CtaNormalizedBox;
  readonly output: CtaOutputBox;
}[] {
  return PREVIEW_RUNTIME_PARITY_OUTPUT_TARGETS.map((target) => {
    const frame = resolveParityCtaFrame({
      overlay,
      frameWidth: target.width,
      frameHeight: target.height,
    });
    const normalized = normalizeCtaBox(frame.layout, target.width, target.height);
    return {
      label: target.label,
      normalized,
      output: toOutputSpaceBox(normalized),
    };
  });
}

export function measureCtaDuplicateScale(overlay: SceneEngagementOverlayV1): {
  readonly layoutIncludesAuthorScale: boolean;
  readonly frameScaleIsMotionOnly: boolean;
} {
  const hold = resolveParityCtaFrame({ overlay, sceneElapsedMs: HOLD_ELAPSED_MS });
  const entrance = resolveParityCtaFrame({ overlay, sceneElapsedMs: 40 });
  return {
    layoutIncludesAuthorScale: hold.layout.width > 0,
    frameScaleIsMotionOnly: hold.scale === 1 && entrance.scale !== 1,
  };
}

export function measureCtaCaptionCollisionSizeStability(): {
  readonly translated: boolean;
  readonly widthUnchanged: boolean;
  readonly heightUnchanged: boolean;
} {
  const overlay = buildParityCtaOverlay({
    kind: "combined",
    position: "bottom-center",
    size: "large",
  });
  const free = resolveParityCtaFrame({ overlay });
  const collided = resolveParityCtaFrame({
    overlay,
    captionCollision: {
      present: true,
      sceneLayout: { version: 2, anchor: "bottom_center", textAlign: "center" },
    },
  });
  return {
    translated: collided.captionSafePlacement.translated,
    widthUnchanged: Math.abs(free.layout.width - collided.layout.width) < 1e-9,
    heightUnchanged: Math.abs(free.layout.height - collided.layout.height) < 1e-9,
  };
}

export function resolveCtaCheckpointElapsedMs(input: {
  readonly startOffsetMs: number;
  readonly durationMs: number;
  readonly checkpoint:
    | "hidden-before"
    | "entrance-start"
    | "entrance-mid"
    | "hold"
    | "like-active"
    | "share-active"
    | "subscribe-active"
    | "subscribe-confirm"
    | "exit-start"
    | "exit-mid"
    | "hidden-after";
}): number {
  const entranceMs = Math.min(220, Math.max(120, Math.round(input.durationMs * 0.16)));
  const exitMs = entranceMs;
  const holdMs = Math.max(0, input.durationMs - entranceMs - exitMs);
  const beat = holdMs / 3;
  switch (input.checkpoint) {
    case "hidden-before":
      return Math.max(0, input.startOffsetMs - 1);
    case "entrance-start":
      return input.startOffsetMs;
    case "entrance-mid":
      return input.startOffsetMs + entranceMs / 2;
    case "hold":
      return input.startOffsetMs + entranceMs + 40;
    case "like-active":
      return input.startOffsetMs + entranceMs + beat * 0.5;
    case "share-active":
      return input.startOffsetMs + entranceMs + beat * 1.5;
    case "subscribe-active":
    case "subscribe-confirm":
      return input.startOffsetMs + entranceMs + beat * 2.5;
    case "exit-start":
      return input.startOffsetMs + entranceMs + holdMs;
    case "exit-mid":
      return input.startOffsetMs + entranceMs + holdMs + exitMs / 2;
    case "hidden-after":
      return input.startOffsetMs + input.durationMs;
    default: {
      const _exhaustive: never = input.checkpoint;
      return _exhaustive;
    }
  }
}

export function collectCtaMeasuredParityCases(): readonly {
  readonly id: string;
  readonly overlay: SceneEngagementOverlayV1;
  readonly innerWidthPx: number;
}[] {
  const cases: { id: string; overlay: SceneEngagementOverlayV1; innerWidthPx: number }[] = [];
  for (const kind of PREVIEW_RUNTIME_PARITY_CTA_KINDS) {
    cases.push({
      id: `kind-${kind}`,
      overlay: buildParityCtaOverlay({ kind }),
      innerWidthPx: 244,
    });
  }
  for (const position of PREVIEW_RUNTIME_PARITY_CTA_POSITIONS) {
    cases.push({
      id: `position-${position}`,
      overlay: buildParityCtaOverlay({ position }),
      innerWidthPx: 244,
    });
  }
  for (const size of PREVIEW_RUNTIME_PARITY_CTA_SIZES) {
    cases.push({
      id: `size-${size}`,
      overlay: buildParityCtaOverlay({ size }),
      innerWidthPx: 244,
    });
  }
  for (const scale of PREVIEW_RUNTIME_PARITY_CTA_FINE_SCALES) {
    cases.push({
      id: `scale-${scale}`,
      overlay: buildParityCtaOverlay({ scale }),
      innerWidthPx: 244,
    });
  }
  for (const innerWidthPx of PREVIEW_RUNTIME_PARITY_INNER_SCREEN_WIDTHS_PX) {
    cases.push({
      id: `inner-${innerWidthPx}`,
      overlay: buildParityCtaOverlay({}),
      innerWidthPx,
    });
  }
  return cases;
}
