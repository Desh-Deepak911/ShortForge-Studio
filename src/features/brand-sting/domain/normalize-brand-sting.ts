/**
 * Fail-closed normalization for VisualRetentionProjectExtensionsV1.shortForgeBrandSting.
 * Malformed sting is dropped without deleting engagement overlays or blocking open.
 */

import type {
  ShortForgeBrandStingV1,
  VisualRetentionProjectExtensionsV1,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import {
  BRAND_STING_DEFAULT_DURATION_MS,
  BRAND_STING_LOCKED_TITLE,
  BRAND_STING_PRESET_ID,
  isBrandStingDurationMs,
} from "./brand-sting.presets";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize a brand-sting payload. Returns undefined when absent/malformed.
 * Never invents an enabled sting from empty input.
 */
export function normalizeShortForgeBrandSting(
  value: unknown,
): ShortForgeBrandStingV1 | undefined {
  if (!isRecord(value) || value.version !== 1) return undefined;
  if (typeof value.enabled !== "boolean") return undefined;
  if (value.title !== BRAND_STING_LOCKED_TITLE) return undefined;
  if (!isBrandStingDurationMs(value.durationMs)) return undefined;
  if (value.narrationPolicy !== "none") return undefined;
  if (value.captionPolicy !== "none") return undefined;
  if (value.playbackSpeedPolicy !== "fixed") return undefined;
  const presetId =
    typeof value.presetId === "string" && value.presetId.trim()
      ? value.presetId.trim()
      : BRAND_STING_PRESET_ID;

  return {
    version: 1,
    enabled: value.enabled,
    title: BRAND_STING_LOCKED_TITLE,
    durationMs: value.durationMs,
    presetId,
    narrationPolicy: "none",
    captionPolicy: "none",
    playbackSpeedPolicy: "fixed",
  };
}

export function getShortForgeBrandSting(
  extensions:
    | Pick<VisualRetentionProjectExtensionsV1, "shortForgeBrandSting">
    | null
    | undefined,
): ShortForgeBrandStingV1 | undefined {
  return normalizeShortForgeBrandSting(extensions?.shortForgeBrandSting);
}

/** Authoritative added duration when capability + enabled valid sting. */
export function resolveAuthoritativeBrandStingDurationMs(input: {
  readonly shortForgeBrandStingEnabled?: boolean;
  readonly extensions?: VisualRetentionProjectExtensionsV1 | null;
}): number {
  if (input.shortForgeBrandStingEnabled !== true) return 0;
  const sting = getShortForgeBrandSting(input.extensions);
  if (!sting || sting.enabled !== true) return 0;
  return sting.durationMs;
}

export function createDefaultShortForgeBrandSting(
  durationMs: typeof BRAND_STING_DEFAULT_DURATION_MS = BRAND_STING_DEFAULT_DURATION_MS,
): ShortForgeBrandStingV1 {
  return {
    version: 1,
    enabled: true,
    title: BRAND_STING_LOCKED_TITLE,
    durationMs,
    presetId: BRAND_STING_PRESET_ID,
    narrationPolicy: "none",
    captionPolicy: "none",
    playbackSpeedPolicy: "fixed",
  };
}
