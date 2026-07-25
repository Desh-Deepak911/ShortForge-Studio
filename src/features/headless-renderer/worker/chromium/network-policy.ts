/**
 * Exact loopback origin network authority for the Chromium page.
 */

export function isAllowedHeadlessPageRequest(input: {
  requestUrl: string;
  allowedOrigin: string;
}): boolean {
  if (input.requestUrl === "about:blank") return true;

  let parsed: URL;
  try {
    parsed = new URL(input.requestUrl);
  } catch {
    return false;
  }

  // Reject userinfo, non-http(s), and any origin that is not exact equality.
  if (parsed.username || parsed.password) return false;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.origin !== input.allowedOrigin) return false;

  return true;
}
