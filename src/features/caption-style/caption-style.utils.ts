import {
  DEFAULT_CAPTION_RESOLVED_STYLE,
  DEFAULT_CAPTION_STYLE,
} from "./caption-style.defaults";
import type {
  CaptionOverflowBehavior,
  CaptionResolvedStyle,
  CaptionStyle,
  CaptionTextTransform,
} from "./caption-style.types";
import { CAPTION_STYLE_VERSION } from "./caption-style.types";

const TEXT_TRANSFORMS = new Set<CaptionTextTransform>([
  "none",
  "uppercase",
  "lowercase",
  "capitalize",
]);

const OVERFLOW_BEHAVIORS = new Set<CaptionOverflowBehavior>(["clip", "ellipsis", "wrap"]);

function normalizeTextTransform(value: unknown): CaptionTextTransform {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as CaptionTextTransform;
    if (TEXT_TRANSFORMS.has(normalized)) {
      return normalized;
    }
  }

  return "none";
}

function normalizeOverflowBehavior(value: unknown): CaptionOverflowBehavior {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as CaptionOverflowBehavior;
    if (OVERFLOW_BEHAVIORS.has(normalized)) {
      return normalized;
    }
  }

  return "wrap";
}

function normalizeFontWeight(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function clampPercent(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampPositive(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, value);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function hasStyleFields(style: Partial<CaptionStyle> | null | undefined): boolean {
  if (!style) {
    return false;
  }

  return Object.keys(style).some((key) => key !== "version" && style[key as keyof CaptionStyle] != null);
}

/** Merges scene override, project default, and engine defaults into one resolved style. */
export function mergeCaptionStyleSettings(
  sceneStyle?: Partial<CaptionStyle> | null,
  projectStyle?: Partial<CaptionStyle> | null,
): CaptionResolvedStyle {
  const base = DEFAULT_CAPTION_RESOLVED_STYLE;
  const merged: CaptionStyle = {
    ...DEFAULT_CAPTION_STYLE,
    ...projectStyle,
    ...sceneStyle,
    version: CAPTION_STYLE_VERSION,
  };

  return {
    version: CAPTION_STYLE_VERSION,
    fontFamily: merged.fontFamily?.trim() || base.fontFamily,
    fontWeight: normalizeFontWeight(merged.fontWeight, base.fontWeight),
    fontSize: clampPositive(merged.fontSize, base.fontSize),
    textColor: merged.textColor?.trim() || base.textColor,
    backgroundColor: merged.backgroundColor?.trim() || base.backgroundColor,
    backgroundOpacity: clampPercent(merged.backgroundOpacity, base.backgroundOpacity),
    outlineColor: merged.outlineColor?.trim() || base.outlineColor,
    outlineWidth: clampCaptionStyleOutlineWidth(merged.outlineWidth, base.outlineWidth),
    shadowColor: merged.shadowColor?.trim() || base.shadowColor,
    shadowBlur: clampCaptionStyleShadowBlur(merged.shadowBlur, base.shadowBlur),
    shadowOffsetX: clampCaptionStyleShadowOffset(merged.shadowOffsetX, base.shadowOffsetX),
    shadowOffsetY: clampCaptionStyleShadowOffset(merged.shadowOffsetY, base.shadowOffsetY),
    cornerRadius: clampPositive(merged.cornerRadius, base.cornerRadius),
    paddingX: clampPositive(merged.paddingX, base.paddingX),
    paddingY: clampPositive(merged.paddingY, base.paddingY),
    lineHeight: clampPositive(merged.lineHeight, base.lineHeight),
    letterSpacing: merged.letterSpacing ?? base.letterSpacing,
    textTransform: normalizeTextTransform(merged.textTransform),
    maxLines: Math.max(1, Math.round(merged.maxLines ?? base.maxLines)),
    overflowBehavior: normalizeOverflowBehavior(merged.overflowBehavior),
    backgroundEnabled: normalizeBoolean(merged.backgroundEnabled, base.backgroundEnabled),
    outlineEnabled: normalizeBoolean(merged.outlineEnabled, base.outlineEnabled),
    shadowEnabled: normalizeBoolean(merged.shadowEnabled, base.shadowEnabled),
    glowEnabled: normalizeBoolean(merged.glowEnabled, base.glowEnabled),
    glowColor: merged.glowColor?.trim() || base.glowColor,
    glowBlur: clampPositive(merged.glowBlur, base.glowBlur),
    gradientEnabled: normalizeBoolean(merged.gradientEnabled, base.gradientEnabled),
    gradientStartColor: merged.gradientStartColor?.trim() || base.gradientStartColor,
    gradientEndColor: merged.gradientEndColor?.trim() || base.gradientEndColor,
    gradientDirection: merged.gradientDirection ?? base.gradientDirection,
  };
}

export function isDefaultCaptionStyleStorage(
  sceneStyle?: Partial<CaptionStyle> | null,
  projectStyle?: Partial<CaptionStyle> | null,
): boolean {
  return !hasStyleFields(sceneStyle) && !hasStyleFields(projectStyle);
}

export const CAPTION_STYLE_PADDING_MIN = 0;
export const CAPTION_STYLE_PADDING_MAX = 48;
export const CAPTION_STYLE_CORNER_RADIUS_MIN = 0;
export const CAPTION_STYLE_CORNER_RADIUS_MAX = 32;
export const CAPTION_STYLE_MAX_LINES_MIN = 1;
export const CAPTION_STYLE_MAX_LINES_MAX = 5;

export function clampCaptionStylePadding(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(CAPTION_STYLE_PADDING_MAX, Math.max(CAPTION_STYLE_PADDING_MIN, Math.round(value)));
}

export function clampCaptionStyleCornerRadius(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    CAPTION_STYLE_CORNER_RADIUS_MAX,
    Math.max(CAPTION_STYLE_CORNER_RADIUS_MIN, Math.round(value)),
  );
}

export function clampCaptionStyleBackgroundOpacity(
  value: number | undefined,
  fallback: number,
): number {
  return clampPercent(value, fallback);
}

export function clampCaptionStyleMaxLines(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    CAPTION_STYLE_MAX_LINES_MAX,
    Math.max(CAPTION_STYLE_MAX_LINES_MIN, Math.round(value)),
  );
}

export function normalizeCaptionStyleBackgroundColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return fallback;
}

export function normalizeCaptionStyleTextColor(value: unknown, fallback: string): string {
  return normalizeCaptionStyleBackgroundColor(value, fallback);
}

export const CAPTION_STYLE_FONT_SIZE_MIN = 32;
export const CAPTION_STYLE_FONT_SIZE_MAX = 96;
export const CAPTION_STYLE_LETTER_SPACING_MIN = -0.05;
export const CAPTION_STYLE_LETTER_SPACING_MAX = 0.2;
export const CAPTION_STYLE_LINE_HEIGHT_MIN = 1;
export const CAPTION_STYLE_LINE_HEIGHT_MAX = 2;

export const CAPTION_STYLE_FONT_FAMILY_OPTIONS = [
  { id: "inter", label: "Inter", value: "Inter, system-ui, sans-serif" },
  { id: "poppins", label: "Poppins", value: "Poppins, system-ui, sans-serif" },
  { id: "montserrat", label: "Montserrat", value: "Montserrat, system-ui, sans-serif" },
  { id: "bebas-neue", label: "Bebas Neue", value: '"Bebas Neue", Impact, sans-serif' },
  { id: "oswald", label: "Oswald", value: "Oswald, system-ui, sans-serif" },
  { id: "anton", label: "Anton", value: "Anton, Impact, sans-serif" },
] as const;

export const CAPTION_STYLE_FONT_WEIGHT_OPTIONS = [
  { label: "Light", value: "300" },
  { label: "Regular", value: "400" },
  { label: "Medium", value: "500" },
  { label: "SemiBold", value: "600" },
  { label: "Bold", value: "700" },
  { label: "ExtraBold", value: "800" },
] as const;

export const CAPTION_STYLE_TEXT_TRANSFORM_OPTIONS: { value: CaptionTextTransform; label: string }[] = [
  { value: "none", label: "None" },
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "capitalize", label: "Capitalize" },
];

export function clampCaptionStyleFontSize(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    CAPTION_STYLE_FONT_SIZE_MAX,
    Math.max(CAPTION_STYLE_FONT_SIZE_MIN, Math.round(value)),
  );
}

export function clampCaptionStyleLetterSpacing(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value * 100) / 100;
  return Math.min(
    CAPTION_STYLE_LETTER_SPACING_MAX,
    Math.max(CAPTION_STYLE_LETTER_SPACING_MIN, rounded),
  );
}

export function clampCaptionStyleLineHeight(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value * 100) / 100;
  return Math.min(
    CAPTION_STYLE_LINE_HEIGHT_MAX,
    Math.max(CAPTION_STYLE_LINE_HEIGHT_MIN, rounded),
  );
}

export function clampCaptionStyleFontWeight(value: string | undefined, fallback: string): string {
  const normalized = normalizeFontWeight(value, fallback);
  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric)) {
    const clamped = Math.min(900, Math.max(100, Math.round(numeric / 100) * 100));
    return String(clamped);
  }

  return normalized;
}

export function normalizeCaptionStyleFontFamily(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  return value.trim();
}

export function applyCaptionTextTransform(text: string, transform: CaptionTextTransform): string {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b(\w)(\w*)/g, (_, first: string, rest: string) =>
        first.toUpperCase() + rest.toLowerCase(),
      );
    default:
      return text;
  }
}

export function buildSceneCaptionStylePatch(style: CaptionStyle): { captionStyle: CaptionStyle } {
  return { captionStyle: { ...style, version: CAPTION_STYLE_VERSION } };
}

export const CAPTION_STYLE_OUTLINE_WIDTH_MIN = 0;
export const CAPTION_STYLE_OUTLINE_WIDTH_MAX = 12;
export const CAPTION_STYLE_SHADOW_BLUR_MIN = 0;
export const CAPTION_STYLE_SHADOW_BLUR_MAX = 48;
export const CAPTION_STYLE_SHADOW_OFFSET_MIN = -32;
export const CAPTION_STYLE_SHADOW_OFFSET_MAX = 32;
export const CAPTION_STYLE_GLOW_BLUR_MIN = 0;
export const CAPTION_STYLE_GLOW_BLUR_MAX = 48;

export function clampCaptionStyleOutlineWidth(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    CAPTION_STYLE_OUTLINE_WIDTH_MAX,
    Math.max(CAPTION_STYLE_OUTLINE_WIDTH_MIN, Math.round(value)),
  );
}

export function clampCaptionStyleShadowBlur(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    CAPTION_STYLE_SHADOW_BLUR_MAX,
    Math.max(CAPTION_STYLE_SHADOW_BLUR_MIN, Math.round(value)),
  );
}

export function clampCaptionStyleShadowOffset(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    CAPTION_STYLE_SHADOW_OFFSET_MAX,
    Math.max(CAPTION_STYLE_SHADOW_OFFSET_MIN, Math.round(value)),
  );
}

export function clampCaptionStyleGlowBlur(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    CAPTION_STYLE_GLOW_BLUR_MAX,
    Math.max(CAPTION_STYLE_GLOW_BLUR_MIN, Math.round(value)),
  );
}

export function normalizeCaptionStyleEffectColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (trimmed.startsWith("rgba(") || trimmed.startsWith("rgb(")) {
    return trimmed;
  }

  return fallback;
}
