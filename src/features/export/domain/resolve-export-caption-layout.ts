/**
 * Export caption layout resolver — canonical reference-frame → output pixels.
 * Reuses caption-layout.engine; does not invent new placement semantics.
 */
import {
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  resolveCaptionLayout,
  type CaptionLayout,
  type CaptionResolvedLayout,
} from "@/features/caption-layout";
import type { ExportCaptionLayoutManifest } from "@/features/export/domain/export-manifest.types";

export interface ResolvedExportCaptionLayout {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly centerX: number;
  readonly boxLeft: number;
  readonly boxTop: number;
  readonly boxBottomY: number;
  readonly textAlign: CanvasTextAlign;
  readonly maxWidth: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly backgroundOpacityPercent: number | null;
  readonly usesLegacyBottomCenter: boolean;
  readonly resolved: CaptionResolvedLayout;
}

export function captionLayoutManifestToCaptionLayout(
  layout: ExportCaptionLayoutManifest,
): CaptionLayout {
  return {
    version: 2,
    anchor: layout.anchor as CaptionLayout["anchor"],
    textAlign: layout.textAlign as CaptionLayout["textAlign"],
    offsetX: layout.offsetX,
    offsetY: layout.offsetY,
    maxWidthPercent: layout.maxWidthPercent,
    safeAreaEnabled: layout.safeAreaEnabled,
    ...(layout.backgroundOpacity != null
      ? { backgroundOpacity: layout.backgroundOpacity }
      : {}),
  };
}

/**
 * Resolve caption placement for export.
 * Operates in output canvas pixels; offsets were stored in 1080×1920 reference units
 * and are scaled by the layout engine via canvas.scale.
 */
export function resolveExportCaptionLayout(input: {
  layout: ExportCaptionLayoutManifest | CaptionLayout;
  width: number;
  height: number;
  contentBoxWidth?: number;
  contentBoxHeight?: number;
}): ResolvedExportCaptionLayout {
  const isManifest =
    "usesLegacyBottomCenter" in input.layout ||
    ("maxWidthPercent" in input.layout && !("version" in input.layout));

  const manifest = isManifest
    ? (input.layout as ExportCaptionLayoutManifest)
    : null;

  const sceneLayout =
    manifest?.usesLegacyBottomCenter === true
      ? undefined
      : manifest
        ? captionLayoutManifestToCaptionLayout(manifest)
        : (input.layout as CaptionLayout);

  const scale = input.width / CAPTION_LAYOUT_REFERENCE_WIDTH;
  const resolved = resolveCaptionLayout({
    sceneLayout,
    projectLayout: null,
    canvas: {
      width: input.width,
      height: input.height,
      scale,
    },
    contentBoxWidth: input.contentBoxWidth,
    contentBoxHeight: input.contentBoxHeight,
  });

  const offsetX =
    sceneLayout && "offsetX" in sceneLayout ? (sceneLayout.offsetX ?? 0) : 0;
  const offsetY =
    sceneLayout && "offsetY" in sceneLayout ? (sceneLayout.offsetY ?? 0) : 0;

  return {
    anchorX: resolved.centerX,
    anchorY: resolved.boxTopY + (input.contentBoxHeight ?? 0) / 2,
    centerX: resolved.centerX,
    boxLeft: resolved.x,
    boxTop: resolved.boxTopY,
    boxBottomY: resolved.boxBottomY,
    textAlign: resolved.textAlign,
    maxWidth: resolved.maxWidth,
    offsetX,
    offsetY,
    backgroundOpacityPercent: resolved.backgroundOpacityPercent,
    usesLegacyBottomCenter: resolved.usesLegacyBottomCenter,
    resolved,
  };
}

/** Scale a reference-frame X offset into output pixels. */
export function scaleReferenceCaptionOffsetX(offsetX: number, outputWidth: number): number {
  return offsetX * (outputWidth / CAPTION_LAYOUT_REFERENCE_WIDTH);
}

/** Scale a reference-frame Y offset into output pixels. */
export function scaleReferenceCaptionOffsetY(offsetY: number, outputHeight: number): number {
  return offsetY * (outputHeight / CAPTION_LAYOUT_REFERENCE_HEIGHT);
}

export { CAPTION_LAYOUT_REFERENCE_WIDTH, CAPTION_LAYOUT_REFERENCE_HEIGHT };
