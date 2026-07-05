import type {
  CaptionStyleDiagnostics,
  CaptionStyleResolveInput,
  CaptionStyleSource,
} from "./caption-style.types";
import {
  resolveCaptionGlow,
  resolveCaptionGlowSource,
  resolveCaptionOutline,
  resolveCaptionOutlineSource,
  resolveCaptionShadow,
  resolveCaptionShadowSource,
} from "./caption-style.effects";
import { isDefaultCaptionStyleStorage, mergeCaptionStyleSettings } from "./caption-style.utils";

function resolveStyleSource(
  sceneStyle?: CaptionStyleResolveInput["sceneStyle"],
  projectStyle?: CaptionStyleResolveInput["projectStyle"],
): CaptionStyleSource {
  if (isDefaultCaptionStyleStorage(sceneStyle, projectStyle)) {
    return "legacy";
  }

  if (sceneStyle && Object.keys(sceneStyle).length > 0) {
    return "scene";
  }

  if (projectStyle && Object.keys(projectStyle).length > 0) {
    return "project";
  }

  return "engine";
}

/** Single source of truth for caption visual styling. */
export function resolveCaptionStyle(input: CaptionStyleResolveInput = {}) {
  const resolvedStyle = mergeCaptionStyleSettings(input.sceneStyle, input.projectStyle);
  const usesSceneOverride = Boolean(input.sceneStyle && Object.keys(input.sceneStyle).length > 0);
  const usesProjectDefault = Boolean(
    input.projectStyle && Object.keys(input.projectStyle).length > 0,
  );
  const usesLegacyFallback = isDefaultCaptionStyleStorage(input.sceneStyle, input.projectStyle);
  const styleSource = resolveStyleSource(input.sceneStyle, input.projectStyle);

  const diagnostics: CaptionStyleDiagnostics = {
    styleSource,
    usesSceneOverride,
    usesProjectDefault,
    usesLegacyFallback,
    outlineSource: resolveCaptionOutlineSource(
      input.sceneStyle,
      input.projectStyle,
      styleSource,
    ),
    shadowSource: resolveCaptionShadowSource(input.sceneStyle, input.projectStyle, styleSource),
    glowSource: resolveCaptionGlowSource(input.sceneStyle, input.projectStyle, styleSource),
    resolvedOutline: resolveCaptionOutline(resolvedStyle),
    resolvedShadow: resolveCaptionShadow(resolvedStyle),
    resolvedGlow: resolveCaptionGlow(resolvedStyle),
    resolvedStyle,
    sceneStyle: input.sceneStyle ?? null,
    projectStyle: input.projectStyle ?? null,
  };

  return {
    resolvedStyle,
    diagnostics,
  };
}

export function resolveCaptionStyleDiagnostics(
  input: CaptionStyleResolveInput = {},
): CaptionStyleDiagnostics {
  return resolveCaptionStyle(input).diagnostics;
}
