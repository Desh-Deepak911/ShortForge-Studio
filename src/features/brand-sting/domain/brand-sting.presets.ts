/**
 * Closed ShortForge Studio brand-sting presets and duration choices.
 * Deterministic local tokens only — no remote assets or free-form copy.
 */

export const BRAND_STING_LOCKED_TITLE = "ShortForge Studio" as const;

/** Fixed non-editable lead-in — never a contract/authoring field. */
export const BRAND_STING_LEAD_IN = "Made with" as const;

export const BRAND_STING_PRESET_ID = "shortforge-studio-outro-v1" as const;

export const BRAND_STING_COLORS = Object.freeze({
  backgroundTop: "#0b1220",
  backgroundBottom: "#121820",
  accentGlow: "rgba(232, 168, 96, 0.42)",
  accentLine: "rgba(242, 196, 140, 0.92)",
  leadIn: "rgba(226, 232, 240, 0.62)",
  title: "rgba(248, 250, 252, 0.96)",
  subtitle: "rgba(226, 232, 240, 0.78)",
  markStroke: "rgba(248, 250, 252, 0.92)",
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
