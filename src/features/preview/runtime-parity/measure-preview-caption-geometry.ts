/**
 * Measures caption overlay and pill geometry for short vs long active chunks.
 * Correctness is the placement box, not text-align alone.
 */

import { resolvePreviewCaptionOverlayStyle } from "@/features/caption-engine/caption-layout.utils";
import {
  resolvePreviewCaptionVisualBox,
  type PreviewCaptionVisualBox,
} from "@/features/caption-engine/resolve-preview-caption-placement";
import {
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
} from "@/features/caption-layout/caption-layout.defaults";
import { resolveCaptionLayout } from "@/features/caption-layout/caption-layout.engine";
import type {
  CaptionAnchor,
  CaptionLayout,
  CaptionResolvedLayout,
  CaptionTextAlign,
} from "@/features/caption-layout/caption-layout.types";

export interface MeasuredCaptionGeometry {
  readonly anchor: CaptionAnchor;
  readonly textAlign: CaptionTextAlign;
  readonly chunkKind: "short" | "long";
  readonly contentBoxWidth: number;
  readonly overlayLeft: number;
  readonly overlayTop: number;
  readonly overlayWidth: number;
  readonly overlayRight: number;
  readonly overlayBottom: number;
  readonly overlayCenterX: number;
  readonly overlayCenterY: number;
  readonly pillLeft: number;
  readonly pillWidth: number;
  readonly pillCenterX: number;
  readonly usesMaxContentWidth: boolean;
  readonly textAlignCenter: boolean;
  readonly visualBox: PreviewCaptionVisualBox;
}

export interface CaptionGeometryComparison {
  readonly anchor: CaptionAnchor;
  readonly textAlign: CaptionTextAlign;
  readonly short: MeasuredCaptionGeometry;
  readonly long: MeasuredCaptionGeometry;
  readonly placementBoxMoved: boolean;
  readonly overlayCenterDelta: number;
  readonly pillCenterDelta: number;
  readonly anchorReferenceDelta: number;
  readonly correctnessFromTextAlignAlone: boolean;
}

const SHORT_CHUNK_WIDTH = 180;
const LONG_CHUNK_WIDTH = 640;
const CONTENT_BOX_HEIGHT = 72;

export function resolvePreviewCaptionAnchorReferenceDelta(
  anchor: CaptionAnchor,
  shortBox: PreviewCaptionVisualBox,
  longBox: PreviewCaptionVisualBox,
): number {
  const horizontal = anchor.endsWith("_left")
    ? Math.abs(shortBox.left - longBox.left)
    : anchor.endsWith("_right")
      ? Math.abs(shortBox.left + shortBox.width - (longBox.left + longBox.width))
      : Math.abs(shortBox.centerX - longBox.centerX);
  const vertical = anchor.startsWith("top_")
    ? Math.abs(shortBox.top - longBox.top)
    : anchor.startsWith("bottom_")
      ? Math.abs(shortBox.top + shortBox.height - (longBox.top + longBox.height))
      : Math.abs(shortBox.centerY - longBox.centerY);
  return Math.max(horizontal, vertical);
}

function measureFromResolved(input: {
  readonly resolved: CaptionResolvedLayout;
  readonly overlayStyle: ReturnType<typeof resolvePreviewCaptionOverlayStyle>;
  readonly chunkKind: "short" | "long";
  readonly contentBoxWidth: number;
  readonly contentBoxHeight: number;
}): MeasuredCaptionGeometry {
  const visualBox = resolvePreviewCaptionVisualBox(
    input.resolved,
    input.contentBoxWidth,
    input.contentBoxHeight,
  );
  return {
    anchor: input.resolved.anchor,
    textAlign: input.resolved.textAlign,
    chunkKind: input.chunkKind,
    contentBoxWidth: input.contentBoxWidth,
    overlayLeft: visualBox.left,
    overlayTop: visualBox.top,
    overlayWidth: visualBox.width,
    overlayRight: visualBox.left + visualBox.width,
    overlayBottom: visualBox.top + visualBox.height,
    overlayCenterX: visualBox.centerX,
    overlayCenterY: visualBox.centerY,
    pillLeft: visualBox.left,
    pillWidth: visualBox.width,
    pillCenterX: visualBox.centerX,
    usesMaxContentWidth: input.overlayStyle.width === "max-content",
    textAlignCenter: input.resolved.textAlign === "center",
    visualBox,
  };
}

function compareGeometry(
  anchor: CaptionAnchor,
  textAlign: CaptionTextAlign,
  short: MeasuredCaptionGeometry,
  long: MeasuredCaptionGeometry,
): CaptionGeometryComparison {
  const overlayCenterDelta = Math.abs(short.overlayCenterX - long.overlayCenterX);
  const pillCenterDelta = Math.abs(short.pillCenterX - long.pillCenterX);
  const anchorReferenceDelta = resolvePreviewCaptionAnchorReferenceDelta(
    anchor,
    short.visualBox,
    long.visualBox,
  );
  const placementBoxMoved = anchorReferenceDelta > 1;

  return {
    anchor,
    textAlign,
    short,
    long,
    placementBoxMoved,
    overlayCenterDelta,
    pillCenterDelta,
    anchorReferenceDelta,
    correctnessFromTextAlignAlone:
      short.textAlignCenter && long.textAlignCenter && placementBoxMoved,
  };
}

function measureChunk(input: {
  readonly sceneLayout: CaptionLayout;
  readonly chunkKind: "short" | "long";
  readonly contentBoxWidth: number;
}): MeasuredCaptionGeometry {
  const resolved = resolveCaptionLayout({
    sceneLayout: input.sceneLayout,
    projectLayout: {
      version: 2,
      anchor: input.sceneLayout.anchor,
      textAlign: input.sceneLayout.textAlign,
      safeAreaEnabled: true,
    },
    canvas: {
      width: CAPTION_LAYOUT_REFERENCE_WIDTH,
      height: CAPTION_LAYOUT_REFERENCE_HEIGHT,
      scale: 1,
    },
    contentBoxWidth: input.contentBoxWidth,
    contentBoxHeight: CONTENT_BOX_HEIGHT,
  });
  return measureFromResolved({
    resolved,
    overlayStyle: resolvePreviewCaptionOverlayStyle(resolved),
    chunkKind: input.chunkKind,
    contentBoxWidth: input.contentBoxWidth,
    contentBoxHeight: CONTENT_BOX_HEIGHT,
  });
}

export function measurePreviewCaptionGeometry(input: {
  readonly anchor: CaptionAnchor;
  readonly textAlign: CaptionTextAlign;
}): CaptionGeometryComparison {
  const sceneLayout: CaptionLayout = {
    version: 2,
    anchor: input.anchor,
    textAlign: input.textAlign,
    safeAreaEnabled: true,
    maxWidthPercent: 90,
  };
  const short = measureChunk({
    sceneLayout,
    chunkKind: "short",
    contentBoxWidth: SHORT_CHUNK_WIDTH,
  });
  const long = measureChunk({
    sceneLayout,
    chunkKind: "long",
    contentBoxWidth: LONG_CHUNK_WIDTH,
  });
  return compareGeometry(input.anchor, input.textAlign, short, long);
}

/**
 * Preview overlay path: resolve the max-width box, place at the anchor, then
 * grow the max-content box with an anchor-relative translate.
 */
export function measureCurrentPreviewCaptionOverlayShrink(input: {
  readonly anchor: CaptionAnchor;
  readonly textAlign: CaptionTextAlign;
}): CaptionGeometryComparison {
  const sceneLayout: CaptionLayout = {
    version: 2,
    anchor: input.anchor,
    textAlign: input.textAlign,
    safeAreaEnabled: true,
    maxWidthPercent: 90,
  };
  const unresolved = resolveCaptionLayout({
    sceneLayout,
    projectLayout: sceneLayout,
    canvas: {
      width: CAPTION_LAYOUT_REFERENCE_WIDTH,
      height: CAPTION_LAYOUT_REFERENCE_HEIGHT,
      scale: 1,
    },
  });
  const overlayStyle = resolvePreviewCaptionOverlayStyle(unresolved);
  const short = measureFromResolved({
    resolved: unresolved,
    overlayStyle,
    chunkKind: "short",
    contentBoxWidth: SHORT_CHUNK_WIDTH,
    contentBoxHeight: CONTENT_BOX_HEIGHT,
  });
  const long = measureFromResolved({
    resolved: unresolved,
    overlayStyle,
    chunkKind: "long",
    contentBoxWidth: LONG_CHUNK_WIDTH,
    contentBoxHeight: CONTENT_BOX_HEIGHT,
  });
  return compareGeometry(input.anchor, input.textAlign, short, long);
}
