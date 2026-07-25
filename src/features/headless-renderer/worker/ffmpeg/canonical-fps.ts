/**
 * Phase 1A.2 exact FPS authority — canonical 30 only (parsing epsilon).
 * Never accept a materially different rate and store 30.
 */

/** Absolute epsilon for float/rational parsing noise around exact 30.0 */
export const HEADLESS_CANONICAL_FPS_EPSILON = 1e-6;

export function isCanonicalHeadlessFps30(fps: number | null | undefined): boolean {
  if (fps == null || !Number.isFinite(fps) || Number.isNaN(fps)) return false;
  return Math.abs(fps - 30) <= HEADLESS_CANONICAL_FPS_EPSILON;
}

/**
 * Parse ffprobe r_frame_rate (e.g. "30/1", "30000/1001") into a number or null.
 */
export function parseFfprobeFrameRate(
  rate: string | null | undefined,
): number | null {
  if (rate == null || typeof rate !== "string") return null;
  const trimmed = rate.trim();
  if (!trimmed || trimmed === "0/0" || trimmed === "N/A") return null;
  if (trimmed.includes("/")) {
    const [aRaw, bRaw] = trimmed.split("/");
    const a = Number(aRaw);
    const b = Number(bRaw);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    const value = a / b;
    return Number.isFinite(value) ? value : null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
