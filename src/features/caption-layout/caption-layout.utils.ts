import {
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  CAPTION_OFFSET_X_MAX_PX,
  CAPTION_OFFSET_X_MIN_PX,
  CAPTION_OFFSET_Y_MAX_PX,
  CAPTION_OFFSET_Y_MIN_PX,
  DEFAULT_CAPTION_LAYOUT,
  DEFAULT_CAPTION_SAFE_AREA,
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  LEGACY_BOTTOM_CENTER_Y_PERCENT,
} from "./caption-layout.defaults";
import type {
  CaptionAnchor,
  CaptionLayout,
  CaptionSafeAreaInsets,
  CaptionTextAlign,
} from "./caption-layout.types";
import { CAPTION_LAYOUT_VERSION } from "./caption-layout.types";

const CAPTION_ANCHOR_SET = new Set<CaptionAnchor>([
  "bottom_center",
  "center",
  "top_center",
  "top_left",
  "top_right",
  "center_left",
  "center_right",
  "bottom_left",
  "bottom_right",
]);

const CAPTION_TEXT_ALIGN_SET = new Set<CaptionTextAlign>(["left", "center", "right"]);

export function normalizeCaptionAnchor(value: unknown): CaptionAnchor {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as CaptionAnchor;
    if (CAPTION_ANCHOR_SET.has(normalized)) {
      return normalized;
    }
  }

  return "bottom_center";
}

export function normalizeCaptionTextAlign(value: unknown): CaptionTextAlign {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as CaptionTextAlign;
    if (CAPTION_TEXT_ALIGN_SET.has(normalized)) {
      return normalized;
    }
  }

  return "center";
}

/** @deprecated v1 percent offsets — use clampCaptionOffsetXPx. */
export function clampCaptionOffsetPercent(value: number | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(-100, Math.round(value)));
}

export function clampCaptionOffsetXPx(value: number | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(CAPTION_OFFSET_X_MAX_PX, Math.max(CAPTION_OFFSET_X_MIN_PX, Math.round(value)));
}

export function clampCaptionOffsetYPx(value: number | undefined, fallback = 0): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(CAPTION_OFFSET_Y_MAX_PX, Math.max(CAPTION_OFFSET_Y_MIN_PX, Math.round(value)));
}

export function clampCaptionMaxWidthPercent(value: number | undefined, fallback = 90): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(40, Math.round(value)));
}

export function clampCaptionBackgroundOpacity(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function migrateLegacyPositionToAnchor(
  position: CaptionLayout["position"],
): CaptionAnchor | undefined {
  switch (position) {
    case "bottom":
      return "bottom_center";
    case "center":
      return "center";
    case "top":
      return "top_center";
    case "top_left":
      return "top_left";
    case "custom":
      return "bottom_center";
    default:
      return undefined;
  }
}

function migrateLegacyCustomOffsets(layout: Partial<CaptionLayout>): {
  offsetX: number;
  offsetY: number;
} {
  const xPercent = layout.xPercent ?? 50;
  const yPercent = layout.yPercent ?? LEGACY_BOTTOM_CENTER_Y_PERCENT;
  return {
    offsetX: clampCaptionOffsetPercent(xPercent - 50),
    offsetY: clampCaptionOffsetPercent(yPercent - LEGACY_BOTTOM_CENTER_Y_PERCENT),
  };
}

function migrateStoredOffsetXPx(raw: number | undefined, version: number): number {
  const value = raw ?? 0;
  if (version < 2) {
    return clampCaptionOffsetXPx(Math.round((value / 100) * CAPTION_LAYOUT_REFERENCE_WIDTH));
  }

  return clampCaptionOffsetXPx(value);
}

function migrateStoredOffsetYPx(raw: number | undefined, version: number): number {
  const value = raw ?? 0;
  if (version < 2) {
    return clampCaptionOffsetYPx(Math.round((value / 100) * CAPTION_LAYOUT_REFERENCE_HEIGHT));
  }

  return clampCaptionOffsetYPx(value);
}

/** True when the story has no explicit caption layout settings. */
export function isDefaultCaptionLayoutStorage(
  sceneLayout?: Partial<CaptionLayout> | null,
  projectLayout?: Partial<CaptionLayout> | null,
): boolean {
  return !sceneLayout && !projectLayout;
}

/** Merges scene + project layout and normalizes legacy v0/v1 fields to v2 model. */
export function mergeCaptionLayoutSettings(
  sceneLayout?: Partial<CaptionLayout> | null,
  projectLayout?: Partial<CaptionLayout> | null,
): CaptionLayout {
  const merged: CaptionLayout = {
    ...DEFAULT_CAPTION_LAYOUT,
    ...projectLayout,
    ...sceneLayout,
  };

  const storedVersion = merged.version ?? 1;
  const legacyAnchor = migrateLegacyPositionToAnchor(merged.position);
  const anchor = legacyAnchor ?? normalizeCaptionAnchor(merged.anchor);
  const textAlign = normalizeCaptionTextAlign(merged.textAlign);

  let offsetX = migrateStoredOffsetXPx(merged.offsetX, storedVersion);
  let offsetY = migrateStoredOffsetYPx(merged.offsetY, storedVersion);

  if (merged.position === "custom") {
    const legacyOffsets = migrateLegacyCustomOffsets(merged);
    offsetX = migrateStoredOffsetXPx(legacyOffsets.offsetX, 1);
    offsetY = migrateStoredOffsetYPx(legacyOffsets.offsetY, 1);
  }

  return {
    version: CAPTION_LAYOUT_VERSION,
    anchor,
    textAlign,
    offsetX,
    offsetY,
    maxWidthPercent: clampCaptionMaxWidthPercent(merged.maxWidthPercent),
    safeAreaEnabled: merged.safeAreaEnabled !== false,
    backgroundOpacity: clampCaptionBackgroundOpacity(merged.backgroundOpacity) ?? undefined,
  };
}

/** Factory defaults for Reset Layout — presentation-only fields. */
export function buildResetCaptionLayout(): CaptionLayout {
  return {
    version: CAPTION_LAYOUT_VERSION,
    anchor: "bottom_center",
    textAlign: "center",
    offsetX: 0,
    offsetY: 0,
    maxWidthPercent: DEFAULT_CAPTION_LAYOUT.maxWidthPercent,
    safeAreaEnabled: true,
  };
}

export function resolveCaptionBackgroundOpacityPercent(layout: CaptionLayout): number | null {
  return clampCaptionBackgroundOpacity(layout.backgroundOpacity);
}

export function resolveCaptionBackgroundAlpha(
  layout: CaptionLayout,
  surface: "preview" | "export",
): number {
  const stored = resolveCaptionBackgroundOpacityPercent(layout);
  if (stored != null) {
    return stored / 100;
  }

  if (
    isDefaultCaptionLayoutStorage(undefined, undefined) &&
    surface === "preview"
  ) {
    return 65 / 100;
  }

  return (surface === "preview" ? 65 : DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY) / 100;
}

export function resolveSafeAreaInsets(
  canvasWidth: number,
  canvasHeight: number,
  overrides?: Partial<CaptionSafeAreaInsets>,
): CaptionSafeAreaInsets {
  const source = { ...DEFAULT_CAPTION_SAFE_AREA, ...overrides };
  return {
    top: Math.round(canvasHeight * source.top),
    bottom: Math.round(canvasHeight * source.bottom),
    left: Math.round(canvasWidth * source.left),
    right: Math.round(canvasWidth * source.right),
  };
}

export function buildSceneCaptionLayoutPatch(layout: CaptionLayout): { captionLayout: CaptionLayout } {
  return { captionLayout: layout };
}

export function buildResetCaptionLayoutPatch(): { captionLayout: CaptionLayout } {
  return buildSceneCaptionLayoutPatch(buildResetCaptionLayout());
}
