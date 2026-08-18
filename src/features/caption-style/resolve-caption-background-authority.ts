/**
 * Single caption-background authority for Preview, Browser, and Headless.
 * Style fields are canonical. Legacy layout opacity is a read-only fallback.
 */

import {
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  mergeCaptionLayoutSettings,
  type CaptionLayout,
} from "@/features/caption-layout";

import { DEFAULT_CAPTION_RESOLVED_STYLE } from "./caption-style.defaults";
import type { CaptionStyle } from "./caption-style.types";
import { clampCaptionStyleBackgroundOpacity } from "./caption-style.utils";

export type CaptionBackgroundIntent =
  | "explicit-transparent"
  | "enabled"
  | "absent"
  | "suppressed";

export type CaptionBackgroundOpacitySource =
  | "scene-style"
  | "project-style"
  | "legacy-layout-scene"
  | "legacy-layout-project"
  | "engine-default";

export type CaptionBackgroundEnabledSource =
  | "scene-style"
  | "project-style"
  | "engine-default";

export interface ResolveCaptionBackgroundAuthorityInput {
  readonly sceneStyle?: Partial<CaptionStyle> | null;
  readonly projectStyle?: Partial<CaptionStyle> | null;
  readonly sceneLayout?: Partial<CaptionLayout> | null;
  readonly projectLayout?: Partial<CaptionLayout> | null;
  readonly captionPresent?: boolean;
  readonly captionSuppressed?: boolean;
}

export interface CaptionBackgroundAuthority {
  readonly backgroundEnabled: boolean;
  readonly storedOpacityPercent: number;
  readonly effectiveOpacityPercent: number;
  readonly effectiveAlpha: number;
  readonly backgroundColor: string;
  readonly drawsFill: boolean;
  readonly drawsBorder: false;
  readonly drawsBlur: false;
  readonly drawsScrim: false;
  readonly intent: CaptionBackgroundIntent;
  readonly opacitySource: CaptionBackgroundOpacitySource;
  readonly enabledSource: CaptionBackgroundEnabledSource;
}

function readExplicitEnabled(
  style: Partial<CaptionStyle> | null | undefined,
): boolean | undefined {
  return typeof style?.backgroundEnabled === "boolean" ? style.backgroundEnabled : undefined;
}

function readExplicitOpacity(
  style: Partial<CaptionStyle> | null | undefined,
): number | undefined {
  if (typeof style?.backgroundOpacity === "number" && Number.isFinite(style.backgroundOpacity)) {
    return clampCaptionStyleBackgroundOpacity(style.backgroundOpacity, style.backgroundOpacity);
  }
  return undefined;
}

function readLegacyLayoutOpacity(
  layout: Partial<CaptionLayout> | null | undefined,
): number | undefined {
  if (typeof layout?.backgroundOpacity === "number" && Number.isFinite(layout.backgroundOpacity)) {
    return clampCaptionStyleBackgroundOpacity(layout.backgroundOpacity, layout.backgroundOpacity);
  }
  return undefined;
}

function readBackgroundColor(
  sceneStyle?: Partial<CaptionStyle> | null,
  projectStyle?: Partial<CaptionStyle> | null,
): string {
  const sceneColor = sceneStyle?.backgroundColor?.trim();
  if (sceneColor) {
    return sceneColor;
  }
  const projectColor = projectStyle?.backgroundColor?.trim();
  if (projectColor) {
    return projectColor;
  }
  return DEFAULT_CAPTION_RESOLVED_STYLE.backgroundColor;
}

/** Resolves one effective caption-background contract for all render paths. */
export function resolveCaptionBackgroundAuthority(
  input: ResolveCaptionBackgroundAuthorityInput = {},
): CaptionBackgroundAuthority {
  if (input.captionSuppressed === true) {
    return {
      backgroundEnabled: false,
      storedOpacityPercent: 0,
      effectiveOpacityPercent: 0,
      effectiveAlpha: 0,
      backgroundColor: readBackgroundColor(input.sceneStyle, input.projectStyle),
      drawsFill: false,
      drawsBorder: false,
      drawsBlur: false,
      drawsScrim: false,
      intent: "suppressed",
      opacitySource: "engine-default",
      enabledSource: "engine-default",
    };
  }

  if (input.captionPresent === false) {
    return {
      backgroundEnabled: false,
      storedOpacityPercent: 0,
      effectiveOpacityPercent: 0,
      effectiveAlpha: 0,
      backgroundColor: readBackgroundColor(input.sceneStyle, input.projectStyle),
      drawsFill: false,
      drawsBorder: false,
      drawsBlur: false,
      drawsScrim: false,
      intent: "absent",
      opacitySource: "engine-default",
      enabledSource: "engine-default",
    };
  }

  const sceneEnabled = readExplicitEnabled(input.sceneStyle);
  const projectEnabled = readExplicitEnabled(input.projectStyle);
  const backgroundEnabled = sceneEnabled ?? projectEnabled ?? true;
  const enabledSource: CaptionBackgroundEnabledSource =
    sceneEnabled !== undefined
      ? "scene-style"
      : projectEnabled !== undefined
        ? "project-style"
        : "engine-default";

  const sceneOpacity = readExplicitOpacity(input.sceneStyle);
  const projectOpacity = readExplicitOpacity(input.projectStyle);
  const sceneLayoutOpacity = readLegacyLayoutOpacity(input.sceneLayout);
  const mergedLayout = mergeCaptionLayoutSettings(input.sceneLayout, input.projectLayout);
  const projectLayoutOpacity = readLegacyLayoutOpacity(input.projectLayout);
  const mergedLayoutOpacity = readLegacyLayoutOpacity(mergedLayout);

  let storedOpacityPercent = DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY;
  let opacitySource: CaptionBackgroundOpacitySource = "engine-default";
  if (sceneOpacity !== undefined) {
    storedOpacityPercent = sceneOpacity;
    opacitySource = "scene-style";
  } else if (projectOpacity !== undefined) {
    storedOpacityPercent = projectOpacity;
    opacitySource = "project-style";
  } else if (sceneLayoutOpacity !== undefined) {
    storedOpacityPercent = sceneLayoutOpacity;
    opacitySource = "legacy-layout-scene";
  } else if (projectLayoutOpacity !== undefined || mergedLayoutOpacity !== undefined) {
    storedOpacityPercent = projectLayoutOpacity ?? mergedLayoutOpacity ?? storedOpacityPercent;
    opacitySource = "legacy-layout-project";
  }

  const transparent = backgroundEnabled === false || storedOpacityPercent === 0;
  const effectiveOpacityPercent = transparent ? 0 : storedOpacityPercent;

  return {
    backgroundEnabled,
    storedOpacityPercent,
    effectiveOpacityPercent,
    effectiveAlpha: effectiveOpacityPercent / 100,
    backgroundColor: readBackgroundColor(input.sceneStyle, input.projectStyle),
    drawsFill: !transparent,
    drawsBorder: false,
    drawsBlur: false,
    drawsScrim: false,
    intent: transparent ? "explicit-transparent" : "enabled",
    opacitySource,
    enabledSource,
  };
}

export function applyCaptionBackgroundAuthorityToStyle<
  TStyle extends {
    backgroundEnabled: boolean;
    backgroundOpacity: number;
    backgroundColor: string;
  },
>(
  style: TStyle,
  input: ResolveCaptionBackgroundAuthorityInput,
): TStyle {
  const authority = resolveCaptionBackgroundAuthority(input);
  return {
    ...style,
    backgroundEnabled: authority.backgroundEnabled,
    backgroundOpacity: authority.effectiveOpacityPercent,
    backgroundColor: authority.backgroundColor,
  };
}
