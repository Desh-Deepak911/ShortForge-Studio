import { resolveCaptionStyleDiagnostics } from "./caption-style.engine";
import type { CaptionStyleResolveInput } from "./caption-style.types";

export interface CaptionStyleDebugSummary {
  styleSource: string;
  usesSceneOverride: boolean;
  usesProjectDefault: boolean;
  usesLegacyFallback: boolean;
  outlineSource: string;
  shadowSource: string;
  glowSource: string;
  resolvedFontFamily: string;
  resolvedFontWeight: string;
  resolvedFontSize: number;
  resolvedTextColor: string;
  resolvedBackgroundOpacity: number;
  resolvedOutline: string;
  resolvedShadow: string;
  resolvedGlow: string;
  sceneOverrideKeys: string[];
  projectDefaultKeys: string[];
}

/** Dev-only caption style diagnostics — no production logging. */
export function buildCaptionStyleDebugSummary(
  input: CaptionStyleResolveInput = {},
): CaptionStyleDebugSummary {
  const diagnostics = resolveCaptionStyleDiagnostics(input);

  return {
    styleSource: diagnostics.styleSource,
    usesSceneOverride: diagnostics.usesSceneOverride,
    usesProjectDefault: diagnostics.usesProjectDefault,
    usesLegacyFallback: diagnostics.usesLegacyFallback,
    outlineSource: diagnostics.outlineSource,
    shadowSource: diagnostics.shadowSource,
    glowSource: diagnostics.glowSource,
    resolvedFontFamily: diagnostics.resolvedStyle.fontFamily,
    resolvedFontWeight: diagnostics.resolvedStyle.fontWeight,
    resolvedFontSize: diagnostics.resolvedStyle.fontSize,
    resolvedTextColor: diagnostics.resolvedStyle.textColor,
    resolvedBackgroundOpacity: diagnostics.resolvedStyle.backgroundOpacity,
    resolvedOutline: JSON.stringify(diagnostics.resolvedOutline),
    resolvedShadow: JSON.stringify(diagnostics.resolvedShadow),
    resolvedGlow: JSON.stringify(diagnostics.resolvedGlow),
    sceneOverrideKeys: diagnostics.sceneStyle ? Object.keys(diagnostics.sceneStyle) : [],
    projectDefaultKeys: diagnostics.projectStyle ? Object.keys(diagnostics.projectStyle) : [],
  };
}

export function logCaptionStyleDebugSummary(
  input: CaptionStyleResolveInput = {},
  label = "caption-style-debug",
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info(`[FootieBitz ${label}]`, buildCaptionStyleDebugSummary(input));
}
