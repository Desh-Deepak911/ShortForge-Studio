import type { CSSProperties } from "react";

import type { CaptionLayout, CaptionLayoutPosition, FootieScene, FootieScript } from "@/features/story/types";

/** Matches export `height - 320 * scale` on a 1920px-tall frame. */
export const DEFAULT_CAPTION_LAYOUT_BOTTOM_Y_PERCENT = 83.33;

export const DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY = 65;
export const DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY = 45;

export type CaptionLayoutTextAlign = "center" | "left";

export interface ResolvedCaptionLayout {
  position: CaptionLayoutPosition;
  xPercent: number;
  yPercent: number;
  backgroundOpacityPercent: number | null;
  textAlign: CaptionLayoutTextAlign;
  usesLegacyBottomPlacement: boolean;
}

const CAPTION_LAYOUT_POSITIONS = new Set<CaptionLayoutPosition>([
  "bottom",
  "center",
  "top",
  "top_left",
  "custom",
]);

const CAPTION_LAYOUT_PRESETS: Record<
  Exclude<CaptionLayoutPosition, "custom">,
  Pick<ResolvedCaptionLayout, "xPercent" | "yPercent" | "textAlign">
> = {
  bottom: { xPercent: 50, yPercent: DEFAULT_CAPTION_LAYOUT_BOTTOM_Y_PERCENT, textAlign: "center" },
  center: { xPercent: 50, yPercent: 52, textAlign: "center" },
  top: { xPercent: 50, yPercent: 15, textAlign: "center" },
  top_left: { xPercent: 12, yPercent: 15, textAlign: "left" },
};

export function normalizeCaptionLayoutPosition(value: unknown): CaptionLayoutPosition {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as CaptionLayoutPosition;
    if (CAPTION_LAYOUT_POSITIONS.has(normalized)) {
      return normalized;
    }
  }

  return "bottom";
}

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

export function resolveCaptionLayout(
  scene: Pick<FootieScene, "captionLayout">,
  script?: Pick<FootieScript, "defaultCaptionLayout">,
): ResolvedCaptionLayout {
  const merged: CaptionLayout = {
    position: "bottom",
    ...script?.defaultCaptionLayout,
    ...scene.captionLayout,
  };

  const position = normalizeCaptionLayoutPosition(merged.position);
  const preset =
    position === "custom"
      ? CAPTION_LAYOUT_PRESETS.bottom
      : CAPTION_LAYOUT_PRESETS[position];

  const xPercent =
    position === "custom"
      ? clampCaptionLayoutPercent(merged.xPercent, preset.xPercent)
      : preset.xPercent;
  const yPercent =
    position === "custom"
      ? clampCaptionLayoutPercent(merged.yPercent, preset.yPercent)
      : preset.yPercent;

  const usesLegacyBottomPlacement =
    !scene.captionLayout &&
    !script?.defaultCaptionLayout &&
    position === "bottom" &&
    merged.backgroundOpacity == null;

  return {
    position,
    xPercent,
    yPercent,
    backgroundOpacityPercent:
      merged.backgroundOpacity == null
        ? null
        : clampCaptionLayoutPercent(
            merged.backgroundOpacity,
            DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
          ),
    textAlign: preset.textAlign,
    usesLegacyBottomPlacement,
  };
}

export function buildSceneCaptionLayoutPatch(layout: CaptionLayout): Pick<FootieScene, "captionLayout"> {
  return { captionLayout: layout };
}

export function resolvePreviewCaptionBackgroundOpacity(layout: ResolvedCaptionLayout): number {
  if (layout.backgroundOpacityPercent != null) {
    return layout.backgroundOpacityPercent / 100;
  }

  return DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY / 100;
}

export function resolveExportCaptionBackgroundOpacity(layout: ResolvedCaptionLayout): number {
  if (layout.backgroundOpacityPercent != null) {
    return layout.backgroundOpacityPercent / 100;
  }

  return DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY / 100;
}

export function resolvePreviewCaptionOverlayStyle(layout: ResolvedCaptionLayout): CSSProperties {
  if (layout.usesLegacyBottomPlacement) {
    return {};
  }

  const shared: CSSProperties = {
    pointerEvents: "none",
    position: "absolute",
    zIndex: 10,
    display: "flex",
    boxSizing: "border-box",
    maxWidth: "100%",
    overflow: "hidden",
  };

  if (layout.textAlign === "left") {
    return {
      ...shared,
      left: `${layout.xPercent}%`,
      top: `${layout.yPercent}%`,
      transform: "translate(0, 0)",
      justifyContent: "flex-start",
      width: "auto",
      maxWidth: "90%",
    };
  }

  const translateY =
    layout.position === "center" ? "-50%" : layout.position === "top" ? "0" : "-100%";

  return {
    ...shared,
    left: `${layout.xPercent}%`,
    top: `${layout.yPercent}%`,
    transform: `translate(-50%, ${translateY})`,
    justifyContent: "center",
    paddingInline: "6%",
    width: "max-content",
    maxWidth: "90%",
  };
}

export function resolvePreviewCaptionPillStyle(layout: ResolvedCaptionLayout): CSSProperties {
  const opacity = resolvePreviewCaptionBackgroundOpacity(layout);
  if (layout.usesLegacyBottomPlacement) {
    return {};
  }

  return {
    backgroundColor: `rgba(0, 0, 0, ${opacity.toFixed(3)})`,
  };
}

export interface ExportCaptionPlacement {
  centerX: number;
  boxBottomY: number;
  backgroundAlpha: number;
}

export function resolveExportCaptionPlacement(
  layout: ResolvedCaptionLayout,
  width: number,
  height: number,
  scale: number,
  boxWidth: number,
  boxHeight: number,
): ExportCaptionPlacement {
  const backgroundAlpha = resolveExportCaptionBackgroundOpacity(layout);

  if (layout.usesLegacyBottomPlacement) {
    return {
      centerX: width / 2,
      boxBottomY: height - 320 * scale,
      backgroundAlpha,
    };
  }

  const centerX =
    layout.textAlign === "left"
      ? width * (layout.xPercent / 100) + boxWidth / 2
      : width * (layout.xPercent / 100);
  const anchorY = height * (layout.yPercent / 100);

  let boxBottomY: number;
  if (layout.position === "center") {
    boxBottomY = anchorY + boxHeight / 2;
  } else if (layout.position === "top" || layout.position === "top_left") {
    boxBottomY = anchorY + boxHeight;
  } else {
    boxBottomY = anchorY;
  }

  return {
    centerX,
    boxBottomY,
    backgroundAlpha,
  };
}
