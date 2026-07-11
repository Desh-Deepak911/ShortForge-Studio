/**
 * Caption opacity normalization for export (0–1 Canvas alpha).
 * StoryDocument stores background opacity as 0–100 percent.
 */
export function normalizeCaptionOpacityPercent(value: unknown, fallbackPercent = 100): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(100, Math.max(0, value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.replace("%", "").trim());
    if (Number.isFinite(parsed)) {
      return Math.min(100, Math.max(0, parsed));
    }
  }
  return Math.min(100, Math.max(0, fallbackPercent));
}

/** Convert stored 0–100 percent to Canvas alpha 0–1. */
export function normalizeCaptionOpacity(value: unknown, fallbackPercent = 100): number {
  return normalizeCaptionOpacityPercent(value, fallbackPercent) / 100;
}

/** Clamp an already-normalized Canvas alpha (0–1). Prefer `??` over `||` so 0 survives. */
export function normalizeCaptionOpacityAlpha(value: unknown, fallback = 1): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  return Math.min(1, Math.max(0, fallback));
}

/**
 * Compose configured caption opacity with animation opacity.
 * finalAlpha = configured × animation (animation alone must not replace configured).
 */
export function composeCaptionAnimationOpacity(
  configuredOpacity01: number,
  animationOpacity01: number | undefined | null,
): number {
  const configured = normalizeCaptionOpacityAlpha(configuredOpacity01, 1);
  if (animationOpacity01 == null || !Number.isFinite(animationOpacity01)) {
    return configured;
  }
  return configured * normalizeCaptionOpacityAlpha(animationOpacity01, 1);
}
