/**
 * Compares engagement-overlay plan bounds in normalized output space.
 * Preview CSS pixels are never treated as the size authority.
 */

import {
  ENGAGEMENT_OVERLAY_MAX_SCALE,
  ENGAGEMENT_OVERLAY_MIN_SCALE,
  ENGAGEMENT_OVERLAY_PRESET_ID,
} from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import {
  ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
  resolveEngagementOverlayFrame,
} from "@/features/engagement-overlays/domain/resolve-engagement-overlay-frame";
import type {
  EngagementOverlaySize,
  SceneEngagementOverlayV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  PREVIEW_RUNTIME_PARITY_OUTPUT_HEIGHT,
  PREVIEW_RUNTIME_PARITY_OUTPUT_WIDTH,
  PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX,
} from "./preview-runtime-parity-contract";

export interface NormalizedCtaBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PreviewCtaNormalizedMeasurement {
  readonly size: EngagementOverlaySize;
  readonly fineScale: number;
  readonly previewWidthPx: number;
  readonly previewHeightPx: number;
  readonly plan: NormalizedCtaBounds;
  readonly preview: NormalizedCtaBounds;
  readonly widthDelta: number;
  readonly heightDelta: number;
  readonly usesOutputSpaceSvgPath: boolean;
}

function overlayFor(size: EngagementOverlaySize, scale: number): SceneEngagementOverlayV1 {
  return {
    version: 1,
    id: `parity-cta-${size}-${scale}`,
    kind: "combined",
    startOffsetMs: 0,
    durationMs: 2_500,
    position: "top-right",
    size,
    scale,
    presetId: ENGAGEMENT_OVERLAY_PRESET_ID,
  };
}

function normalize(
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  frameWidth: number,
  frameHeight: number,
): NormalizedCtaBounds {
  return {
    x: box.x / frameWidth,
    y: box.y / frameHeight,
    width: box.width / frameWidth,
    height: box.height / frameHeight,
  };
}

export function measurePreviewCtaNormalizedBounds(input: {
  readonly size: EngagementOverlaySize;
  readonly fineScale: number;
  readonly previewWidthPx: number;
}): PreviewCtaNormalizedMeasurement {
  const overlay = overlayFor(input.size, input.fineScale);
  const previewHeightPx = Math.round(
    (input.previewWidthPx * PREVIEW_RUNTIME_PARITY_OUTPUT_HEIGHT) /
      PREVIEW_RUNTIME_PARITY_OUTPUT_WIDTH,
  );
  const exportFrame = resolveEngagementOverlayFrame({
    overlay,
    sceneDurationMs: 8_000,
    sceneElapsedMs: 800,
    frameWidth: ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
    frameHeight: ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  });
  const previewFrame = resolveEngagementOverlayFrame({
    overlay,
    sceneDurationMs: 8_000,
    sceneElapsedMs: 800,
    frameWidth: input.previewWidthPx,
    frameHeight: previewHeightPx,
  });
  const plan = normalize(
    exportFrame.layout,
    ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
    ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  );
  const preview = normalize(previewFrame.layout, input.previewWidthPx, previewHeightPx);

  return {
    size: input.size,
    fineScale: input.fineScale,
    previewWidthPx: input.previewWidthPx,
    previewHeightPx,
    plan,
    preview,
    widthDelta: Math.abs(plan.width - preview.width),
    heightDelta: Math.abs(plan.height - preview.height),
    usesOutputSpaceSvgPath: true,
  };
}

export const PREVIEW_RUNTIME_PARITY_CTA_SIZE_CASES: readonly {
  readonly size: EngagementOverlaySize;
  readonly fineScale: number;
}[] = [
  { size: "small", fineScale: 1 },
  { size: "medium", fineScale: 1 },
  { size: "large", fineScale: 1 },
  { size: "medium", fineScale: ENGAGEMENT_OVERLAY_MIN_SCALE },
  { size: "medium", fineScale: ENGAGEMENT_OVERLAY_MAX_SCALE },
];

export function measurePreviewCtaNormalizedBoundMatrix(): readonly PreviewCtaNormalizedMeasurement[] {
  const measurements: PreviewCtaNormalizedMeasurement[] = [];
  for (const sizeCase of PREVIEW_RUNTIME_PARITY_CTA_SIZE_CASES) {
    for (const previewWidthPx of PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX) {
      measurements.push(
        measurePreviewCtaNormalizedBounds({
          size: sizeCase.size,
          fineScale: sizeCase.fineScale,
          previewWidthPx,
        }),
      );
    }
  }
  return measurements;
}
