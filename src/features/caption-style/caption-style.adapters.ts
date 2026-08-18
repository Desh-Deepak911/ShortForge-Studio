import type { CSSProperties } from "react";

import type {
  CaptionEmphasisBehavior,
  CaptionEntranceEffect,
  CaptionPresetId,
  CaptionPresetScene,
  CaptionShadowStyle,
  CaptionTextWeight,
} from "@/features/caption-engine/caption-engine.types";
import { getCaptionPreset } from "@/features/caption-engine/caption-preset.registry";
import {
  FADE_SAFE_CAPTION_PRESET_IDS,
  FADE_SAFE_CAPTION_STYLE_TOKENS,
  resolveFadeSafeCaptionStyle,
  type FadeSafeCaptionPresetId,
  type FadeSafeCaptionStyleTokens,
} from "@/features/caption-engine/fade-safe-caption-style.utils";
import {
  resolveTikTokMotionOverlay,
  TIKTOK_MOTION_STYLE_TOKENS,
  type TikTokMotionOverlayResolution,
} from "@/features/caption-engine/tiktok-motion-caption-style.utils";
import type { FootieScene, FootieScript } from "@/features/story/types";

import { resolveCaptionStyle } from "./caption-style.engine";
import {
  resolveCaptionGlow,
  resolveCaptionOutline,
  resolveCaptionShadow,
} from "./caption-style.effects";
import {
  LEGACY_EXPORT_CAPTION_BOX_BORDER,
  LEGACY_EXPORT_CAPTION_FONT_SIZE,
  LEGACY_PREVIEW_CAPTION_FONT_SIZE_PX,
} from "./caption-style.defaults";
import type { CaptionResolvedStyle } from "./caption-style.types";
import { applyCaptionTextTransform, isDefaultCaptionStyleStorage } from "./caption-style.utils";

/** Preview UI scale — maps reference-frame spacing to CSS px at default legacy appearance. */
export const PREVIEW_CAPTION_STYLE_UI_SCALE =
  LEGACY_PREVIEW_CAPTION_FONT_SIZE_PX / LEGACY_EXPORT_CAPTION_FONT_SIZE;

/** @deprecated Use FADE_SAFE_CAPTION_PRESET_IDS */
export const PREVIEW_FADE_SAFE_CAPTION_PRESET_IDS = FADE_SAFE_CAPTION_PRESET_IDS;

export type PreviewFadeSafeCaptionPresetId = FadeSafeCaptionPresetId;

const PREVIEW_PRESET_STYLE_CLASSES: Record<
  PreviewFadeSafeCaptionPresetId,
  { container: string; line: string }
> = {
  minimal: {
    container: "caption-preset-minimal !font-medium tracking-normal",
    line: "",
  },
  documentary: {
    container: "caption-preset-documentary !font-bold tracking-wide",
    line: "leading-snug",
  },
  cinematic: {
    container:
      "caption-preset-cinematic !font-light tracking-[0.06em] [text-shadow:0_2px_16px_rgba(0,0,0,0.65)]",
    line: "leading-relaxed",
  },
};

/** Visual style metadata for preview caption rendering (timing unchanged). */
export interface PreviewCaptionStyleMetadata {
  presetId: CaptionPresetId;
  usesFadeSafeStyleOverlay: boolean;
  containerClassName: string;
  lineClassName: string;
  entranceEffect: CaptionEntranceEffect;
  emphasisBehavior: CaptionEmphasisBehavior;
  textWeight: CaptionTextWeight;
  shadowStyle: CaptionShadowStyle;
  resolvedStyle: CaptionResolvedStyle;
}

/** Default export subtitle styling when no fade-safe preset overlay applies. */
export const LEGACY_EXPORT_CAPTION_STYLE_TOKENS: FadeSafeCaptionStyleTokens = {
  fontWeight: "700",
  letterSpacingEm: 0,
  lineHeightRatio: 1.3,
  textShadow: null,
};

/** Canvas text styling metadata for export subtitle rendering. */
export interface ExportCaptionStyleMetadata {
  presetId: CaptionPresetId;
  usesFadeSafeStyleOverlay: boolean;
  fontWeight: string;
  letterSpacingEm: number;
  lineHeightRatio: number;
  textShadow: FadeSafeCaptionStyleTokens["textShadow"];
  resolvedStyle: CaptionResolvedStyle;
}

export interface ExportCaptionStyleMetrics {
  fontSize: number;
  lineHeight: number;
  padX: number;
  padY: number;
  cornerRadius: number;
  boxBorderColor: string;
  backgroundAlpha: number;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  backgroundEnabled: boolean;
}

export interface CaptionStyleSceneInput extends CaptionPresetScene {
  captionStyle?: FootieScene["captionStyle"];
}

export interface CaptionStyleScriptInput {
  defaultCaptionStyle?: FootieScript["defaultCaptionStyle"];
}

function withStoredCaptionTypography(
  metadata: ExportCaptionStyleMetadata,
  scene?: CaptionStyleSceneInput,
  script?: CaptionStyleScriptInput,
): ExportCaptionStyleMetadata {
  if (isDefaultCaptionStyleStorage(scene?.captionStyle, script?.defaultCaptionStyle)) {
    return metadata;
  }

  const resolved = metadata.resolvedStyle;
  return {
    ...metadata,
    fontWeight: resolved.fontWeight,
    letterSpacingEm: resolved.letterSpacing,
    lineHeightRatio: resolved.lineHeight,
  };
}

function resolveBaseStyle(
  scene: CaptionStyleSceneInput,
  script?: CaptionStyleScriptInput,
): CaptionResolvedStyle {
  return resolveCaptionStyle({
    sceneStyle: scene.captionStyle,
    projectStyle: script?.defaultCaptionStyle,
  }).resolvedStyle;
}

function resolvePresetTypographyTokens(
  scene: CaptionPresetScene,
): FadeSafeCaptionStyleTokens {
  const resolution = resolveFadeSafeCaptionStyle(scene);
  return resolution.tokens ?? LEGACY_EXPORT_CAPTION_STYLE_TOKENS;
}

/** Resolves scene caption preset into preview-only style metadata. */
export function resolvePreviewCaptionStyle(
  scene: CaptionStyleSceneInput,
  script?: CaptionStyleScriptInput,
): PreviewCaptionStyleMetadata {
  const resolvedStyle = resolveBaseStyle(scene, script);
  const resolution = resolveFadeSafeCaptionStyle(scene);
  const preset = getCaptionPreset(resolution.presetId)!;
  const styleClasses =
    PREVIEW_PRESET_STYLE_CLASSES[resolution.presetId as PreviewFadeSafeCaptionPresetId] ??
    PREVIEW_PRESET_STYLE_CLASSES.minimal;

  return {
    presetId: resolution.presetId,
    usesFadeSafeStyleOverlay: resolution.usesFadeSafeStyleOverlay,
    containerClassName: resolution.usesFadeSafeStyleOverlay ? styleClasses.container : "",
    lineClassName: resolution.usesFadeSafeStyleOverlay ? styleClasses.line : "",
    entranceEffect: preset.entranceEffect,
    emphasisBehavior: preset.emphasisBehavior,
    textWeight: preset.textWeight,
    shadowStyle: preset.shadowStyle,
    resolvedStyle,
  };
}

/** Resolves export caption style from scene preset + effective subtitle effect. */
export function resolveExportCaptionStyle(
  scene: CaptionStyleSceneInput,
  script?: CaptionStyleScriptInput,
): ExportCaptionStyleMetadata {
  const resolvedStyle = resolveBaseStyle(scene, script);
  const resolution = resolveFadeSafeCaptionStyle(scene);
  const tokens = resolvePresetTypographyTokens(scene);

  return withStoredCaptionTypography(
    {
      presetId: resolution.presetId,
      usesFadeSafeStyleOverlay: resolution.usesFadeSafeStyleOverlay,
      fontWeight: tokens.fontWeight,
      letterSpacingEm: tokens.letterSpacingEm,
      lineHeightRatio: tokens.lineHeightRatio,
      textShadow: tokens.textShadow,
      resolvedStyle,
    },
    scene,
    script,
  );
}

/** Resolves export style for a scene plus optional display frame metadata. */
export function resolveExportCaptionStyleFromSceneDisplay(
  scene: CaptionStyleSceneInput,
  script: CaptionStyleScriptInput | undefined,
  display?: {
    captionPreset?: string | null;
    effect?: string | null;
    captionTooShortForEffect?: boolean;
  },
): ExportCaptionStyleMetadata {
  if (!display) {
    return resolveExportCaptionStyle(scene, script);
  }

  const tiktokOverlay = resolveTikTokMotionOverlay({
    captionPreset: display.captionPreset,
    subtitleEffect: display.effect,
    captionTooShortForEffect: display.captionTooShortForEffect,
  });
  const baseStyle = resolveBaseStyle(scene, script);
  const tiktokStyle = resolveTikTokExportCaptionStyle(tiktokOverlay, baseStyle);
  if (tiktokStyle) {
    return withStoredCaptionTypography(tiktokStyle, scene, script);
  }

  return resolveExportCaptionStyle(
    {
      ...scene,
      captionPreset: display.captionPreset as CaptionStyleSceneInput["captionPreset"],
      subtitleEffect: display.effect as CaptionStyleSceneInput["subtitleEffect"],
    },
    script,
  );
}

/** Resolves export style for a subtitle display frame without scene context. */
export function resolveExportCaptionStyleForDisplay(
  display?: {
    captionPreset?: string | null;
    effect?: string | null;
    captionTooShortForEffect?: boolean;
  },
  script?: CaptionStyleScriptInput,
): ExportCaptionStyleMetadata {
  if (!display) {
    const resolvedStyle = resolveCaptionStyle({
      projectStyle: script?.defaultCaptionStyle,
    }).resolvedStyle;

    return {
      presetId: "minimal",
      usesFadeSafeStyleOverlay: false,
      fontWeight: LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight,
      letterSpacingEm: LEGACY_EXPORT_CAPTION_STYLE_TOKENS.letterSpacingEm,
      lineHeightRatio: LEGACY_EXPORT_CAPTION_STYLE_TOKENS.lineHeightRatio,
      textShadow: LEGACY_EXPORT_CAPTION_STYLE_TOKENS.textShadow,
      resolvedStyle,
    };
  }

  return resolveExportCaptionStyleFromSceneDisplay({}, script, display);
}

function resolveTikTokExportCaptionStyle(
  overlay: TikTokMotionOverlayResolution,
  resolvedStyle: CaptionResolvedStyle,
): ExportCaptionStyleMetadata | null {
  if (!overlay.usesTikTokMotionOverlay) {
    return null;
  }

  return {
    presetId: overlay.presetId,
    usesFadeSafeStyleOverlay: false,
    fontWeight: TIKTOK_MOTION_STYLE_TOKENS.fontWeight,
    letterSpacingEm: TIKTOK_MOTION_STYLE_TOKENS.letterSpacingEm,
    lineHeightRatio: TIKTOK_MOTION_STYLE_TOKENS.lineHeightRatio,
    textShadow: null,
    resolvedStyle,
  };
}

/** Preview text effect styling from resolved caption style. */
export function resolvePreviewCaptionTextEffectStyle(
  resolved: CaptionResolvedStyle,
  scale = PREVIEW_CAPTION_STYLE_UI_SCALE,
): CSSProperties {
  const outline = resolveCaptionOutline(resolved);
  const shadow = resolveCaptionShadow(resolved);
  const glow = resolveCaptionGlow(resolved);
  const style: CSSProperties = {};

  if (outline.enabled) {
    style.WebkitTextStroke = `${outline.width * scale}px ${outline.color}`;
    style.WebkitTextFillColor = resolved.textColor;
    style.paintOrder = "stroke fill";
  }

  if (shadow.enabled) {
    style.textShadow = `${shadow.offsetX * scale}px ${shadow.offsetY * scale}px ${shadow.blur * scale}px ${shadow.color}`;
  }

  if (glow.enabled) {
    style.filter = `drop-shadow(0 0 ${glow.blur * scale}px ${glow.color})`;
  }

  return style;
}

/** Preview inline typography from resolved caption style. */
export function resolvePreviewCaptionTypographyStyle(
  style: PreviewCaptionStyleMetadata,
  scale = PREVIEW_CAPTION_STYLE_UI_SCALE,
): CSSProperties {
  const resolved = style.resolvedStyle;

  return {
    color: resolved.textColor,
    fontFamily: resolved.fontFamily,
    fontWeight: resolved.fontWeight,
    lineHeight: resolved.lineHeight,
    letterSpacing: resolved.letterSpacing !== 0 ? `${resolved.letterSpacing}em` : undefined,
    textTransform: resolved.textTransform === "none" ? undefined : resolved.textTransform,
    fontSize: `${resolved.fontSize * scale}px`,
    ...resolvePreviewCaptionTextEffectStyle(resolved, scale),
  };
}

/** Preview typography overrides when scene or project caption style is stored. */
export function resolvePreviewCaptionTypographyStyleForScene(
  scene: CaptionStyleSceneInput,
  script?: CaptionStyleScriptInput,
  scale = PREVIEW_CAPTION_STYLE_UI_SCALE,
): CSSProperties | null {
  if (isDefaultCaptionStyleStorage(scene.captionStyle, script?.defaultCaptionStyle)) {
    return null;
  }

  return resolvePreviewCaptionTypographyStyle(resolvePreviewCaptionStyle(scene, script), scale);
}

/** Formats export caption line text using resolved text transform. */
export function formatExportCaptionLineText(
  text: string,
  style: ExportCaptionStyleMetadata,
): string {
  return applyCaptionTextTransform(text, style.resolvedStyle.textTransform);
}

/** Resolved max lines for caption wrapping from the style engine. */
export function resolveCaptionStyleMaxLines(
  scene: CaptionStyleSceneInput,
  script?: CaptionStyleScriptInput,
): number {
  return resolveCaptionStyle({
    sceneStyle: scene.captionStyle,
    projectStyle: script?.defaultCaptionStyle,
  }).resolvedStyle.maxLines;
}

/** Preview container styling from the caption style engine. */
export function resolvePreviewCaptionContainerStyle(
  scene: CaptionStyleSceneInput,
  script?: CaptionStyleScriptInput,
  scale = PREVIEW_CAPTION_STYLE_UI_SCALE,
): CSSProperties {
  const previewStyle = resolvePreviewCaptionStyle(scene, script);
  const resolved = previewStyle.resolvedStyle;
  const containerStyle: CSSProperties = {
    padding: `${resolved.paddingY * scale}px ${resolved.paddingX * scale}px`,
    borderRadius: `${resolved.cornerRadius * scale}px`,
  };

  if (!resolved.backgroundEnabled) {
    return {
      ...containerStyle,
      backgroundColor: "transparent",
      border: "none",
      boxShadow: "none",
    };
  }

  const alpha = resolved.backgroundOpacity / 100;
  const rgb = colorToRgb(resolved.backgroundColor);

  return {
    ...containerStyle,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`,
    border: `${Math.max(1, scale)}px solid ${LEGACY_EXPORT_CAPTION_BOX_BORDER}`,
  };
}

/** Merges layout pill styling with caption style engine container values. */
export function resolvePreviewCaptionPillCombinedStyle(
  scene: CaptionStyleSceneInput,
  script: CaptionStyleScriptInput | undefined,
  layoutPillStyle: CSSProperties,
  scale = PREVIEW_CAPTION_STYLE_UI_SCALE,
): CSSProperties {
  const styleContainer = resolvePreviewCaptionContainerStyle(scene, script, scale);
  const usesStoredStyle = !isDefaultCaptionStyleStorage(
    scene.captionStyle,
    script?.defaultCaptionStyle,
  );

  if (!usesStoredStyle) {
    return layoutPillStyle;
  }

  return {
    ...layoutPillStyle,
    ...styleContainer,
  };
}

function colorToRgb(color: string): { r: number; g: number; b: number } {
  if (color.startsWith("#")) {
    return hexToRgb(color);
  }

  return { r: 0, g: 0, b: 0 };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

/** Export layout metrics derived from resolved caption style. */
export function resolveExportCaptionStyleMetrics(
  style: ExportCaptionStyleMetadata,
  scale: number,
  fontScale = 1,
): ExportCaptionStyleMetrics {
  const resolved = style.resolvedStyle;
  const fontSize = resolved.fontSize * scale * fontScale;

  return {
    fontSize,
    lineHeight: fontSize * style.lineHeightRatio,
    padX: resolved.paddingX * scale,
    padY: resolved.paddingY * scale,
    cornerRadius: resolved.cornerRadius * scale,
    boxBorderColor: LEGACY_EXPORT_CAPTION_BOX_BORDER,
    backgroundAlpha: resolved.backgroundEnabled ? resolved.backgroundOpacity / 100 : 0,
    backgroundColor: resolved.backgroundColor,
    textColor: resolved.textColor,
    fontFamily: resolved.fontFamily,
    backgroundEnabled: resolved.backgroundEnabled,
  };
}

/** Canvas fill color for caption container background. */
export function resolveExportCaptionBackgroundFill(
  metrics: ExportCaptionStyleMetrics,
  alphaOverride?: number,
): string {
  const alpha = alphaOverride ?? metrics.backgroundAlpha;
  const rgb = colorToRgb(metrics.backgroundColor);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** Prepares canvas stroke state for caption text outline. */
export function applyExportCaptionOutline(
  ctx: CanvasRenderingContext2D,
  resolved: CaptionResolvedStyle,
  scale: number,
): boolean {
  const outline = resolveCaptionOutline(resolved);
  if (!outline.enabled) {
    return false;
  }

  ctx.lineWidth = outline.width * scale;
  ctx.strokeStyle = outline.color;
  ctx.lineJoin = "round";
  return true;
}

/** Prepares canvas shadow state for caption text shadow. */
export function applyExportCaptionShadow(
  ctx: CanvasRenderingContext2D,
  resolved: CaptionResolvedStyle,
  scale: number,
): boolean {
  const shadow = resolveCaptionShadow(resolved);
  if (!shadow.enabled) {
    return false;
  }

  ctx.shadowColor = shadow.color;
  ctx.shadowBlur = shadow.blur * scale;
  ctx.shadowOffsetX = shadow.offsetX * scale;
  ctx.shadowOffsetY = shadow.offsetY * scale;
  return true;
}

/** Prepares canvas shadow state for caption text glow. */
export function applyExportCaptionGlow(
  ctx: CanvasRenderingContext2D,
  resolved: CaptionResolvedStyle,
  scale: number,
): boolean {
  const glow = resolveCaptionGlow(resolved);
  if (!glow.enabled) {
    return false;
  }

  ctx.shadowColor = glow.color;
  ctx.shadowBlur = glow.blur * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  return true;
}

function clearExportCaptionEffectState(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = 0;
}

/** Draws one caption line with outline → shadow → glow → fill ordering. */
export function drawExportCaptionStyledLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  style: ExportCaptionStyleMetadata,
  fontSize: number,
  scale: number,
  textAlign: CanvasTextAlign,
  usesStoredCaptionStyle: boolean,
): void {
  ctx.textAlign = textAlign;
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.resolvedStyle.fontFamily}`;
  ctx.letterSpacing =
    style.letterSpacingEm !== 0 ? `${fontSize * style.letterSpacingEm}px` : "0px";

  if (!usesStoredCaptionStyle) {
    applyExportCaptionTextDrawState(ctx, fontSize, style, scale);
    ctx.fillStyle = style.resolvedStyle.textColor;
    ctx.fillText(line, x, y);
    resetExportCaptionTextDrawState(ctx);
    return;
  }

  const resolved = style.resolvedStyle;
  const outline = resolveCaptionOutline(resolved);
  const shadow = resolveCaptionShadow(resolved);
  const glow = resolveCaptionGlow(resolved);

  clearExportCaptionEffectState(ctx);

  if (outline.enabled) {
    applyExportCaptionOutline(ctx, resolved, scale);
    ctx.strokeText(line, x, y);
    clearExportCaptionEffectState(ctx);
  }

  if (shadow.enabled) {
    applyExportCaptionShadow(ctx, resolved, scale);
    ctx.fillStyle = resolved.textColor;
    ctx.fillText(line, x, y);
    clearExportCaptionEffectState(ctx);
  }

  if (glow.enabled) {
    applyExportCaptionGlow(ctx, resolved, scale);
    ctx.fillStyle = resolved.textColor;
    ctx.fillText(line, x, y);
    clearExportCaptionEffectState(ctx);
  }

  ctx.fillStyle = resolved.textColor;
  ctx.fillText(line, x, y);

  resetExportCaptionTextDrawState(ctx);
  clearExportCaptionEffectState(ctx);
}

/** Applies export caption font, tracking, and shadow before drawing text. */
export function applyExportCaptionTextDrawState(
  ctx: CanvasRenderingContext2D,
  fontSize: number,
  style: ExportCaptionStyleMetadata,
  scale: number,
): void {
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.resolvedStyle.fontFamily}`;
  ctx.fillStyle = style.resolvedStyle.textColor;
  ctx.letterSpacing =
    style.letterSpacingEm !== 0 ? `${fontSize * style.letterSpacingEm}px` : "0px";

  const shadow = style.textShadow ?? (style.resolvedStyle.shadowEnabled
    ? {
        blur: style.resolvedStyle.shadowBlur,
        color: style.resolvedStyle.shadowColor,
        offsetY: style.resolvedStyle.shadowOffsetY,
      }
    : null);

  if (shadow) {
    ctx.shadowBlur = shadow.blur * scale;
    ctx.shadowColor = shadow.color;
    ctx.shadowOffsetX = style.resolvedStyle.shadowOffsetX * scale;
    ctx.shadowOffsetY = shadow.offsetY * scale;
  }
}

/** Resets letter-spacing and shadow after export caption text is drawn. */
export function resetExportCaptionTextDrawState(ctx: CanvasRenderingContext2D): void {
  ctx.letterSpacing = "0px";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Merges preset container classes onto the preview caption root class list. */
export function applyPreviewCaptionStyleClassName(
  baseClassName: string,
  style: PreviewCaptionStyleMetadata,
): string {
  if (!style.usesFadeSafeStyleOverlay || !style.containerClassName.trim()) {
    return baseClassName;
  }

  return `${baseClassName} ${style.containerClassName}`.replace(/\s+/g, " ").trim();
}

/** Merges preset line classes when fade-safe styling is active. */
export function applyPreviewCaptionLineClassName(
  baseClassName: string | undefined,
  style: PreviewCaptionStyleMetadata,
): string | undefined {
  if (!style.usesFadeSafeStyleOverlay || !style.lineClassName.trim()) {
    return baseClassName;
  }

  return baseClassName
    ? `${baseClassName} ${style.lineClassName}`.trim()
    : style.lineClassName;
}

/** Maps preset id to shared fade-safe tokens for preview/export parity checks. */
export function getFadeSafeCaptionStyleTokensForPreset(
  presetId: FadeSafeCaptionPresetId,
): FadeSafeCaptionStyleTokens {
  return FADE_SAFE_CAPTION_STYLE_TOKENS[presetId];
}

/** Converts reference-frame font size to preview CSS px — legacy preview uses fixed 13px base. */
export function resolvePreviewCaptionFontSizePx(): number {
  return LEGACY_PREVIEW_CAPTION_FONT_SIZE_PX;
}
