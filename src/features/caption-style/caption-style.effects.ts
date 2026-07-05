import type {
  CaptionResolvedGlow,
  CaptionResolvedOutline,
  CaptionResolvedShadow,
  CaptionResolvedStyle,
  CaptionStyle,
  CaptionStyleSource,
} from "./caption-style.types";

/** Renderer-agnostic resolved text outline. */
export function resolveCaptionOutline(resolved: CaptionResolvedStyle): CaptionResolvedOutline {
  return {
    enabled: resolved.outlineEnabled && resolved.outlineWidth > 0,
    color: resolved.outlineColor,
    width: resolved.outlineWidth,
  };
}

/** Renderer-agnostic resolved text shadow. */
export function resolveCaptionShadow(resolved: CaptionResolvedStyle): CaptionResolvedShadow {
  return {
    enabled:
      resolved.shadowEnabled &&
      resolved.shadowBlur > 0 &&
      resolved.shadowColor !== "transparent",
    color: resolved.shadowColor,
    blur: resolved.shadowBlur,
    offsetX: resolved.shadowOffsetX,
    offsetY: resolved.shadowOffsetY,
  };
}

/** Renderer-agnostic resolved text glow. */
export function resolveCaptionGlow(resolved: CaptionResolvedStyle): CaptionResolvedGlow {
  return {
    enabled: resolved.glowEnabled && resolved.glowBlur > 0,
    color: resolved.glowColor,
    blur: resolved.glowBlur,
  };
}

const OUTLINE_FIELDS: (keyof CaptionStyle)[] = [
  "outlineEnabled",
  "outlineColor",
  "outlineWidth",
];
const SHADOW_FIELDS: (keyof CaptionStyle)[] = [
  "shadowEnabled",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
];
const GLOW_FIELDS: (keyof CaptionStyle)[] = ["glowEnabled", "glowColor", "glowBlur"];

function hasAnyField(
  style: Partial<CaptionStyle> | null | undefined,
  fields: (keyof CaptionStyle)[],
): boolean {
  if (!style) {
    return false;
  }

  return fields.some((field) => style[field] != null);
}

function resolveEffectSource(
  fields: (keyof CaptionStyle)[],
  sceneStyle: Partial<CaptionStyle> | null | undefined,
  projectStyle: Partial<CaptionStyle> | null | undefined,
  styleSource: CaptionStyleSource,
): CaptionStyleSource {
  if (hasAnyField(sceneStyle, fields)) {
    return "scene";
  }

  if (hasAnyField(projectStyle, fields)) {
    return "project";
  }

  return styleSource === "legacy" ? "legacy" : "engine";
}

export function resolveCaptionOutlineSource(
  sceneStyle: Partial<CaptionStyle> | null | undefined,
  projectStyle: Partial<CaptionStyle> | null | undefined,
  styleSource: CaptionStyleSource,
): CaptionStyleSource {
  return resolveEffectSource(OUTLINE_FIELDS, sceneStyle, projectStyle, styleSource);
}

export function resolveCaptionShadowSource(
  sceneStyle: Partial<CaptionStyle> | null | undefined,
  projectStyle: Partial<CaptionStyle> | null | undefined,
  styleSource: CaptionStyleSource,
): CaptionStyleSource {
  return resolveEffectSource(SHADOW_FIELDS, sceneStyle, projectStyle, styleSource);
}

export function resolveCaptionGlowSource(
  sceneStyle: Partial<CaptionStyle> | null | undefined,
  projectStyle: Partial<CaptionStyle> | null | undefined,
  styleSource: CaptionStyleSource,
): CaptionStyleSource {
  return resolveEffectSource(GLOW_FIELDS, sceneStyle, projectStyle, styleSource);
}
