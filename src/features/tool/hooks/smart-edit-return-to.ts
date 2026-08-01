/**
 * Deterministic Smart Edit returnTo helpers.
 * Initial render must never read browser-only location state (hydration-safe).
 */

/** SSR + first client paint: pathname only (same on server and client). */
export function resolveInitialSmartEditReturnTo(pathname: string | null | undefined): string {
  if (typeof pathname !== "string") {
    return "";
  }
  return pathname;
}

/** Post-hydration / click-time: full current browser location when available. */
export function resolveClientSmartEditReturnTo(
  fallback: string = "",
): string {
  if (typeof window === "undefined") {
    return fallback;
  }
  const href = window.location.href;
  return typeof href === "string" && href.length > 0 ? href : fallback;
}
