/** Schema version for persisted caption style settings. */
export const CAPTION_STYLE_VERSION = 1;

export type CaptionTextTransform = "none" | "uppercase" | "lowercase" | "capitalize";

export type CaptionOverflowBehavior = "clip" | "ellipsis" | "wrap";

export type CaptionStyleSource = "scene" | "project" | "engine" | "legacy";

export interface CaptionResolvedOutline {
  enabled: boolean;
  color: string;
  width: number;
}

export interface CaptionResolvedShadow {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface CaptionResolvedGlow {
  enabled: boolean;
  color: string;
  blur: number;
}

/** Persisted caption style — scene override or project default. */
export interface CaptionStyle {
  version?: number;
  fontFamily?: string;
  fontWeight?: string;
  /** Reference-frame font size (1080×1920). Export scales; preview adapter maps to CSS px. */
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  /** 0–100 */
  backgroundOpacity?: number;
  outlineColor?: string;
  outlineWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  cornerRadius?: number;
  paddingX?: number;
  paddingY?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: CaptionTextTransform;
  maxLines?: number;
  overflowBehavior?: CaptionOverflowBehavior;
  backgroundEnabled?: boolean;
  outlineEnabled?: boolean;
  shadowEnabled?: boolean;
  glowEnabled?: boolean;
  glowColor?: string;
  glowBlur?: number;
  gradientEnabled?: boolean;
  gradientStartColor?: string;
  gradientEndColor?: string;
  gradientDirection?: number;
}

export interface CaptionStyleResolveInput {
  sceneStyle?: Partial<CaptionStyle> | null;
  projectStyle?: Partial<CaptionStyle> | null;
}

/** Fully merged caption style for preview and export renderers. */
export interface CaptionResolvedStyle {
  version: number;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  cornerRadius: number;
  paddingX: number;
  paddingY: number;
  lineHeight: number;
  letterSpacing: number;
  textTransform: CaptionTextTransform;
  maxLines: number;
  overflowBehavior: CaptionOverflowBehavior;
  backgroundEnabled: boolean;
  outlineEnabled: boolean;
  shadowEnabled: boolean;
  glowEnabled: boolean;
  glowColor: string;
  glowBlur: number;
  gradientEnabled: boolean;
  gradientStartColor: string;
  gradientEndColor: string;
  gradientDirection: number;
}

export interface CaptionStyleDiagnostics {
  styleSource: CaptionStyleSource;
  usesSceneOverride: boolean;
  usesProjectDefault: boolean;
  usesLegacyFallback: boolean;
  outlineSource: CaptionStyleSource;
  shadowSource: CaptionStyleSource;
  glowSource: CaptionStyleSource;
  resolvedOutline: CaptionResolvedOutline;
  resolvedShadow: CaptionResolvedShadow;
  resolvedGlow: CaptionResolvedGlow;
  resolvedStyle: CaptionResolvedStyle;
  sceneStyle: Partial<CaptionStyle> | null;
  projectStyle: Partial<CaptionStyle> | null;
}
