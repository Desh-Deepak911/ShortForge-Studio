export const LEGACY_RESEARCH_FALLBACK_WARNING = "Legacy research fallback used.";

/** Dev-only log when deprecated legacy research adapters run. */
export function logLegacyResearchFallback(scope: string, cause?: unknown): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const detail =
    cause instanceof Error
      ? cause.message
      : cause != null
        ? String(cause)
        : undefined;

  if (detail) {
    console.warn(LEGACY_RESEARCH_FALLBACK_WARNING, `[${scope}]`, detail);
    return;
  }

  console.warn(LEGACY_RESEARCH_FALLBACK_WARNING, `[${scope}]`);
}
