/**
 * Developer-only 1080p browser export override (client-visible flag).
 *
 * Next.js only embeds NEXT_PUBLIC_* into the browser bundle. A non-public
 * SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER value is invisible to client preflight.
 *
 * Non-secret feature flag — development/testing only. Requires server restart.
 */

export const EXPORT_1080P_BROWSER_OVERRIDE_ENV =
  "NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER" as const;

export const EXPORT_1080P_OVERRIDE_WARNING_MESSAGE = [
  "1080p browser export is enabled in experimental developer mode.",
  "",
  "This export may take longer and use significantly more browser memory.",
].join("\n");

/**
 * Sole authority for reading the 1080p browser override flag.
 * Do not read process.env for this flag elsewhere.
 */
export function is1080pBrowserOverrideEnabled(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env.NEXT_PUBLIC_SHORTFORGE_EXPORT_ALLOW_1080P_BROWSER === "1"
  );
}
