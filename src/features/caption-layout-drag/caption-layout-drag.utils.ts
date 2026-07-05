import {
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  clampCaptionOffsetXPx,
  clampCaptionOffsetYPx,
  mergeCaptionLayoutSettings,
  resolveCaptionLayout,
  resolveSafeAreaInsets,
  type CaptionLayout,
} from "@/features/caption-layout";
import type { FootieScene, FootieScript } from "@/features/story/types";

export interface CaptionDragOffset {
  offsetX: number;
  offsetY: number;
}

export interface CaptionKeyboardStep {
  deltaX: number;
  deltaY: number;
}

/** Converts on-screen pointer delta to reference-frame offset delta (1080×1920). */
export function screenDeltaToReferenceOffsetPx(
  deltaScreenX: number,
  deltaScreenY: number,
  frameWidth: number,
  frameHeight: number,
): CaptionDragOffset {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return { offsetX: 0, offsetY: 0 };
  }

  return {
    offsetX: Math.round(deltaScreenX * (CAPTION_LAYOUT_REFERENCE_WIDTH / frameWidth)),
    offsetY: Math.round(deltaScreenY * (CAPTION_LAYOUT_REFERENCE_HEIGHT / frameHeight)),
  };
}

export function resolveStoredCaptionOffsets(
  scene: Pick<FootieScene, "captionLayout">,
  script?: Pick<FootieScript, "defaultCaptionLayout">,
): CaptionDragOffset {
  const settings = mergeCaptionLayoutSettings(scene.captionLayout, script?.defaultCaptionLayout);
  return {
    offsetX: settings.offsetX ?? 0,
    offsetY: settings.offsetY ?? 0,
  };
}

export function clampCaptionDragOffsets(offsetX: number, offsetY: number): CaptionDragOffset {
  return {
    offsetX: clampCaptionOffsetXPx(offsetX),
    offsetY: clampCaptionOffsetYPx(offsetY),
  };
}

export function applyCaptionDragDelta(
  originOffsetX: number,
  originOffsetY: number,
  deltaScreenX: number,
  deltaScreenY: number,
  frameWidth: number,
  frameHeight: number,
): CaptionDragOffset {
  const delta = screenDeltaToReferenceOffsetPx(
    deltaScreenX,
    deltaScreenY,
    frameWidth,
    frameHeight,
  );

  return clampCaptionDragOffsets(originOffsetX + delta.offsetX, originOffsetY + delta.offsetY);
}

export function resolveCaptionKeyboardStep(event: {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
}): CaptionKeyboardStep | null {
  const magnitude = event.altKey ? 25 : event.shiftKey ? 10 : 1;

  switch (event.key) {
    case "ArrowLeft":
      return { deltaX: -magnitude, deltaY: 0 };
    case "ArrowRight":
      return { deltaX: magnitude, deltaY: 0 };
    case "ArrowUp":
      return { deltaX: 0, deltaY: -magnitude };
    case "ArrowDown":
      return { deltaX: 0, deltaY: magnitude };
    default:
      return null;
  }
}

/** Presentation commit — preserves anchor and all non-offset layout fields. */
export function buildCaptionLayoutOffsetCommitPatch(
  scene: Pick<FootieScene, "captionLayout">,
  script: Pick<FootieScript, "defaultCaptionLayout"> | undefined,
  offsetX: number,
  offsetY: number,
): { captionLayout: CaptionLayout } {
  const merged = mergeCaptionLayoutSettings(scene.captionLayout, script?.defaultCaptionLayout);
  const clamped = clampCaptionDragOffsets(offsetX, offsetY);

  return {
    captionLayout: {
      version: merged.version,
      anchor: merged.anchor,
      textAlign: merged.textAlign,
      offsetX: clamped.offsetX,
      offsetY: clamped.offsetY,
      maxWidthPercent: merged.maxWidthPercent,
      safeAreaEnabled: merged.safeAreaEnabled,
      ...(merged.backgroundOpacity != null ? { backgroundOpacity: merged.backgroundOpacity } : {}),
    },
  };
}

export function resolvePreviewCaptionLayoutForDrag(
  scene: Pick<FootieScene, "captionLayout">,
  script: Pick<FootieScript, "defaultCaptionLayout"> | undefined,
  offsetX: number,
  offsetY: number,
  contentBoxWidth?: number,
  contentBoxHeight?: number,
) {
  const settings = mergeCaptionLayoutSettings(scene.captionLayout, script?.defaultCaptionLayout);

  return resolveCaptionLayout({
    sceneLayout: {
      ...settings,
      offsetX,
      offsetY,
    },
    projectLayout: script?.defaultCaptionLayout,
    canvas: {
      width: CAPTION_LAYOUT_REFERENCE_WIDTH,
      height: CAPTION_LAYOUT_REFERENCE_HEIGHT,
      scale: 1,
    },
    contentBoxWidth,
    contentBoxHeight,
  });
}

export function measureContentBoxInReferencePx(
  pillWidth: number,
  pillHeight: number,
  frameWidth: number,
  frameHeight: number,
): { width: number; height: number } {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return { width: 0, height: 0 };
  }

  return {
    width: Math.max(1, Math.round(pillWidth * (CAPTION_LAYOUT_REFERENCE_WIDTH / frameWidth))),
    height: Math.max(1, Math.round(pillHeight * (CAPTION_LAYOUT_REFERENCE_HEIGHT / frameHeight))),
  };
}

export function resolveCaptionThirdsGuidePercents(): {
  vertical: [number, number];
  horizontal: [number, number];
} {
  return {
    vertical: [100 / 3, (100 * 2) / 3],
    horizontal: [100 / 3, (100 * 2) / 3],
  };
}

export function shouldShowCaptionCenterGuides(
  centerX: number,
  centerY: number,
  thresholdPx = 12,
): { vertical: boolean; horizontal: boolean } {
  const canvasCenterX = CAPTION_LAYOUT_REFERENCE_WIDTH / 2;
  const canvasCenterY = CAPTION_LAYOUT_REFERENCE_HEIGHT / 2;

  return {
    vertical: Math.abs(centerX - canvasCenterX) <= thresholdPx,
    horizontal: Math.abs(centerY - canvasCenterY) <= thresholdPx,
  };
}

export function resolveCaptionSafeAreaGuideInsets(
  safeAreaEnabled: boolean,
): { top: number; right: number; bottom: number; left: number } {
  if (!safeAreaEnabled) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const insets = resolveSafeAreaInsets(
    CAPTION_LAYOUT_REFERENCE_WIDTH,
    CAPTION_LAYOUT_REFERENCE_HEIGHT,
  );

  return {
    top: (insets.top / CAPTION_LAYOUT_REFERENCE_HEIGHT) * 100,
    right: (insets.right / CAPTION_LAYOUT_REFERENCE_WIDTH) * 100,
    bottom: (insets.bottom / CAPTION_LAYOUT_REFERENCE_HEIGHT) * 100,
    left: (insets.left / CAPTION_LAYOUT_REFERENCE_WIDTH) * 100,
  };
}

export function isCaptionDragEnabled(input: {
  enabled: boolean;
  sceneId?: string;
  selectedSceneId: string | null;
  playbackActive: boolean;
  frameEditActive: boolean;
}): boolean {
  return (
    input.enabled &&
    Boolean(input.sceneId) &&
    input.sceneId === input.selectedSceneId &&
    !input.playbackActive &&
    !input.frameEditActive
  );
}
