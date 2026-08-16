/**
 * Closed ShortForge Studio brand-sting presets and duration choices.
 * Deterministic local tokens only — no remote assets or free-form copy.
 */

import {
  SHORTFORGE_MOTION_PALETTE,
  shortforgeMotionHexToRgba,
} from "@/features/shortforge-motion-design";

export const BRAND_STING_LOCKED_TITLE = "ShortForge Studio" as const;

/** Fixed non-editable lead-in — never a contract/authoring field. */
export const BRAND_STING_LEAD_IN = "Made with" as const;

/** Display form of the locked lead-in. Persistence/token remains "Made with". */
export const BRAND_STING_LEAD_IN_DISPLAY = "MADE WITH" as const;

export const BRAND_STING_PRESET_ID = "shortforge-studio-outro-v1" as const;

/** Vertical lockup center in the output frame (40–43%). */
export const BRAND_STING_LOCKUP_CENTER_Y_RATIO = 0.415;

/** Mark size in the 1080×1920 reference frame. */
export const BRAND_STING_MARK_SIZE_REF = 128;

export const BRAND_STING_COLORS = Object.freeze({
  backgroundTop: SHORTFORGE_MOTION_PALETTE.backgroundPrimary,
  backgroundBottom: SHORTFORGE_MOTION_PALETTE.backgroundPrimary,
  accentGlow: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.accentActive,
    0.22,
  ),
  accentLine: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.accentActive,
    0.92,
  ),
  leadIn: shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.slateText, 0.92),
  title: shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.softWhite, 0.96),
  subtitle: shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.softWhite, 0.86),
  markStroke: shortforgeMotionHexToRgba(SHORTFORGE_MOTION_PALETTE.softWhite, 0.92),
});

export const BRAND_STING_DURATION_MS = Object.freeze([2000, 2500, 3000] as const);

export type BrandStingDurationMs = (typeof BRAND_STING_DURATION_MS)[number];

export const BRAND_STING_DEFAULT_DURATION_MS: BrandStingDurationMs = 2500;

export const BRAND_STING_DURATION_OPTIONS = Object.freeze([
  { id: 2000 as BrandStingDurationMs, label: "2s" },
  { id: 2500 as BrandStingDurationMs, label: "2.5s" },
  { id: 3000 as BrandStingDurationMs, label: "3s" },
]);

export function isBrandStingDurationMs(value: unknown): value is BrandStingDurationMs {
  return value === 2000 || value === 2500 || value === 3000;
}

/** Stable canvas/preview typeface stack — no remote fonts. */
export const BRAND_STING_FONT_FAMILY = "Arial, Helvetica, sans-serif";
