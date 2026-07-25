/**
 * Product-facing output compatibility (mirrors Sprint 11D profile ceilings).
 * Does not import worker runtime modules into client leaves.
 */

/** Mirrors Sprint 11D Phase 3.2 operational content ceilings (60s). */
export const HEADLESS_PRODUCT_CONTENT_MAX_MS = {
  "720p": 60_000,
  "1080p": 60_000,
  "4k": 60_000,
} as const;

export const HEADLESS_PRODUCT_RENDER_MAX_MS = {
  "720p": 60_400,
  "1080p": 60_400,
  "4k": 60_400,
} as const;

export type HeadlessProductResolution = "720p" | "1080p" | "4k";
export type HeadlessProductFormat = "webm" | "mp4";

export interface HeadlessOutputCompatibilityInput {
  readonly resolution: HeadlessProductResolution;
  readonly format: HeadlessProductFormat;
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
}

export interface HeadlessOutputCompatibilityResult {
  readonly allowed: boolean;
  readonly reason: string | null;
}

export function evaluateHeadlessOutputCompatibility(
  input: HeadlessOutputCompatibilityInput,
): HeadlessOutputCompatibilityResult {
  if (input.format !== "webm" && input.format !== "mp4") {
    return { allowed: false, reason: "Only WebM and MP4 are supported for server export." };
  }
  if (
    input.resolution !== "720p" &&
    input.resolution !== "1080p" &&
    input.resolution !== "4k"
  ) {
    return { allowed: false, reason: "Choose 720p, 1080p, or 4K for server export." };
  }

  const contentMax = HEADLESS_PRODUCT_CONTENT_MAX_MS[input.resolution];
  const renderMax = HEADLESS_PRODUCT_RENDER_MAX_MS[input.resolution];

  if (
    !Number.isFinite(input.contentDurationMs) ||
    input.contentDurationMs < 1 ||
    input.contentDurationMs > contentMax
  ) {
    return {
      allowed: false,
      reason:
        "Server export currently supports videos up to 60 seconds at this resolution.",
    };
  }

  if (
    !Number.isFinite(input.renderDurationMs) ||
    input.renderDurationMs < 1 ||
    input.renderDurationMs > renderMax
  ) {
    return {
      allowed: false,
      reason: "This video is too long for server export at the selected resolution.",
    };
  }

  return { allowed: true, reason: null };
}

export function headlessProfileId(
  resolution: HeadlessProductResolution,
  format: HeadlessProductFormat,
): string {
  return `${resolution}-${format}-30`;
}
