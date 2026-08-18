import type { CSSProperties } from "react";

import {
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY,
  LEGACY_BOTTOM_CENTER_Y_PERCENT,
  mergeCaptionLayoutSettings,
  resolveCaptionBackgroundAlpha,
  resolveCaptionLayout as resolveCaptionLayoutEngine,
  type CaptionLayout,
  type CaptionLayoutResolveInput,
  type CaptionResolvedLayout,
} from "@/features/caption-layout";
import { resolvePreviewCaptionPlacementStyle } from "./resolve-preview-caption-placement";
import type { FootieScene, FootieScript } from "@/features/story/types";

export type {
  CaptionAnchor,
  CaptionLayout,
  CaptionResolvedLayout,
} from "@/features/caption-layout";

export {
  buildSceneCaptionLayoutPatch,
  CAPTION_ANCHORS,
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  clampCaptionMaxWidthPercent,
  clampCaptionOffsetPercent,
  DEFAULT_CAPTION_LAYOUT,
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY,
  LEGACY_BOTTOM_CENTER_Y_PERCENT,
  mergeCaptionLayoutSettings,
  normalizeCaptionAnchor,
} from "@/features/caption-layout";

/** Alias for legacy tests — matches export bottom anchor constant name. */
export const DEFAULT_CAPTION_LAYOUT_BOTTOM_Y_PERCENT = LEGACY_BOTTOM_CENTER_Y_PERCENT;

/** @deprecated Legacy position alias — use `CaptionAnchor`. */
export type CaptionLayoutPosition = "bottom" | "center" | "top" | "top_left" | "custom";

export type CaptionLayoutTextAlign = "center" | "left" | "right";

/** @deprecated Adapter shape for legacy UI/tests — derived from engine settings. */
export interface ResolvedCaptionLayout {
  position: CaptionLayoutPosition;
  xPercent: number;
  yPercent: number;
  backgroundOpacityPercent: number | null;
  textAlign: CaptionLayoutTextAlign;
  usesLegacyBottomPlacement: boolean;
  anchor: CaptionResolvedLayout["anchor"];
}

export function normalizeCaptionLayoutPosition(value: unknown): CaptionLayoutPosition {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "bottom" || normalized === "bottom_center") {
      return "bottom";
    }
    if (normalized === "center") {
      return "center";
    }
    if (normalized === "top" || normalized === "top_center") {
      return "top";
    }
    if (normalized === "top_left") {
      return "top_left";
    }
    if (normalized === "custom") {
      return "custom";
    }
  }

  return "bottom";
}

/** @deprecated Use `clampCaptionOffsetPercent`. */
export function clampCaptionLayoutPercent(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

export function hasCaptionLayoutOverride(
  scene: Pick<FootieScene, "captionLayout">,
  script?: Pick<FootieScript, "defaultCaptionLayout">,
): boolean {
  return Boolean(scene.captionLayout ?? script?.defaultCaptionLayout);
}

function anchorToLegacyPosition(anchor: CaptionResolvedLayout["anchor"]): CaptionLayoutPosition {
  switch (anchor) {
    case "bottom_center":
    case "bottom_left":
    case "bottom_right":
      return "bottom";
    case "center":
      return "center";
    case "top_center":
      return "top";
    case "top_left":
      return "top_left";
    default:
      return "bottom";
  }
}

function buildResolveInput(
  scene: Pick<FootieScene, "captionLayout">,
  script: Pick<FootieScript, "defaultCaptionLayout"> | undefined,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  contentBoxWidth?: number,
  contentBoxHeight?: number,
): CaptionLayoutResolveInput {
  return {
    sceneLayout: scene.captionLayout,
    projectLayout: script?.defaultCaptionLayout,
    canvas: { width: canvasWidth, height: canvasHeight, scale },
    contentBoxWidth,
    contentBoxHeight,
  };
}

/** Resolves merged settings for UI controls. */
export function resolveCaptionLayoutSettings(
  scene: Pick<FootieScene, "captionLayout">,
  script?: Pick<FootieScript, "defaultCaptionLayout">,
): CaptionLayout {
  return mergeCaptionLayoutSettings(scene.captionLayout, script?.defaultCaptionLayout);
}

/** Legacy adapter — maps engine settings to previous ResolvedCaptionLayout shape. */
export function resolveCaptionLayout(
  scene: Pick<FootieScene, "captionLayout">,
  script?: Pick<FootieScript, "defaultCaptionLayout">,
): ResolvedCaptionLayout {
  const settings = resolveCaptionLayoutSettings(scene, script);
  const enginePreview = resolveCaptionLayoutEngine(
    buildResolveInput(scene, script, CAPTION_LAYOUT_REFERENCE_WIDTH, CAPTION_LAYOUT_REFERENCE_HEIGHT, 1),
  );

  return {
    position: anchorToLegacyPosition(enginePreview.anchor),
    xPercent: 50 + ((settings.offsetX ?? 0) / CAPTION_LAYOUT_REFERENCE_WIDTH) * 100,
    yPercent:
      LEGACY_BOTTOM_CENTER_Y_PERCENT +
      ((settings.offsetY ?? 0) / CAPTION_LAYOUT_REFERENCE_HEIGHT) * 100,
    backgroundOpacityPercent: settings.backgroundOpacity ?? null,
    textAlign: settings.textAlign ?? "center",
    usesLegacyBottomPlacement: enginePreview.usesLegacyBottomCenter,
    anchor: enginePreview.anchor,
  };
}

export function resolvePreviewCaptionBackgroundOpacity(layout: ResolvedCaptionLayout): number {
  if (layout.backgroundOpacityPercent != null) {
    return layout.backgroundOpacityPercent / 100;
  }

  return layout.usesLegacyBottomPlacement
    ? DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY / 100
    : DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY / 100;
}

export function resolveExportCaptionBackgroundOpacity(layout: ResolvedCaptionLayout): number {
  if (layout.backgroundOpacityPercent != null) {
    return layout.backgroundOpacityPercent / 100;
  }

  return DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY / 100;
}

export function resolvePreviewCaptionOverlayStyle(resolved: CaptionResolvedLayout): CSSProperties {
  return resolvePreviewCaptionPlacementStyle(resolved);
}

export function resolvePreviewCaptionPillStyle(resolved: CaptionResolvedLayout): CSSProperties {
  if (resolved.usesLegacyBottomCenter) {
    return {};
  }

  const alpha = resolveCaptionBackgroundAlpha(resolved);
  return {
    backgroundColor: `rgba(0, 0, 0, ${alpha.toFixed(3)})`,
    textAlign: resolved.textAlign,
    width: "100%",
  };
}

export interface ExportCaptionPlacement {
  centerX: number;
  boxLeft: number;
  boxTop: number;
  boxBottomY: number;
  textAlign: CaptionResolvedLayout["textAlign"];
  backgroundAlpha: number;
}

export function resolveExportCaptionTextX(
  textAlign: CaptionResolvedLayout["textAlign"],
  boxLeft: number,
  boxWidth: number,
  padX: number,
): number {
  switch (textAlign) {
    case "left":
      return boxLeft + padX;
    case "right":
      return boxLeft + boxWidth - padX;
    default:
      return boxLeft + boxWidth / 2;
  }
}

export function resolveEngineCaptionLayout(
  scene: Pick<FootieScene, "captionLayout">,
  script: Pick<FootieScript, "defaultCaptionLayout"> | undefined,
  width: number,
  height: number,
  scale: number,
  contentBoxWidth?: number,
  contentBoxHeight?: number,
): CaptionResolvedLayout {
  return resolveCaptionLayoutEngine(
    buildResolveInput(scene, script, width, height, scale, contentBoxWidth, contentBoxHeight),
  );
}

export function resolveExportCaptionPlacement(
  scene: Pick<FootieScene, "captionLayout">,
  script: Pick<FootieScript, "defaultCaptionLayout"> | undefined,
  width: number,
  height: number,
  scale: number,
  boxWidth: number,
  boxHeight: number,
): ExportCaptionPlacement {
  const resolved = resolveEngineCaptionLayout(
    scene,
    script,
    width,
    height,
    scale,
    boxWidth,
    boxHeight,
  );

  return {
    centerX: resolved.centerX,
    boxLeft: resolved.x,
    boxTop: resolved.boxTopY,
    boxBottomY: resolved.boxBottomY,
    textAlign: resolved.textAlign,
    backgroundAlpha: resolveCaptionBackgroundAlpha(resolved),
  };
}

/** Resolves caption layout for preview overlays on the reference canvas. */
export function resolvePreviewCaptionLayout(
  scene: Pick<FootieScene, "captionLayout">,
  script?: Pick<FootieScript, "defaultCaptionLayout">,
  contentBoxWidth?: number,
  contentBoxHeight?: number,
): CaptionResolvedLayout {
  return resolveEngineCaptionLayout(
    scene,
    script,
    CAPTION_LAYOUT_REFERENCE_WIDTH,
    CAPTION_LAYOUT_REFERENCE_HEIGHT,
    1,
    contentBoxWidth,
    contentBoxHeight,
  );
}

/** Returns the latest scene from script by id/index — avoids stale playback snapshots. */
export function resolvePreviewCaptionLayoutScene<
  TScene extends Pick<FootieScene, "captionLayout"> & { id?: string },
>(
  script: Pick<FootieScript, "scenes" | "defaultCaptionLayout"> | undefined,
  scene: TScene,
  sceneIndex?: number,
): TScene {
  if (!script?.scenes?.length) {
    return scene;
  }

  if (sceneIndex != null) {
    const indexedScene = script.scenes[sceneIndex];
    if (indexedScene && (!scene.id || indexedScene.id === scene.id)) {
      return indexedScene as unknown as TScene;
    }
  }

  if (scene.id) {
    const matchedScene = script.scenes.find((entry) => entry.id === scene.id);
    if (matchedScene) {
      return matchedScene as unknown as TScene;
    }
  }

  return scene;
}

/** Preview layout resolver — always reads the live scene + script pair. */
export function resolvePreviewCaptionLayoutForScene<
  TScene extends Pick<FootieScene, "captionLayout"> & { id?: string },
>(
  scene: TScene,
  script?: Pick<FootieScript, "scenes" | "defaultCaptionLayout">,
  sceneIndex?: number,
  contentBoxWidth?: number,
  contentBoxHeight?: number,
): CaptionResolvedLayout {
  const layoutScene = resolvePreviewCaptionLayoutScene(script, scene, sceneIndex);
  return resolvePreviewCaptionLayout(
    layoutScene,
    script,
    contentBoxWidth,
    contentBoxHeight,
  );
}
