/**
 * Shared ShortForge motion-design palette and typeface stack.
 * Consumed by engagement overlays and brand sting only.
 * Feature-specific geometry and clocks stay in those features.
 */

export const SHORTFORGE_MOTION_PALETTE = Object.freeze({
  backgroundPrimary: "#07111F",
  backgroundSecondary: "#0B1728",
  softWhite: "#F8FAFC",
  slateText: "#94A3B8",
  borderSubtle: "#334155",
  accentActive: "#C8FF3D",
} as const);

/** Deterministic local/system geometric sans stack — no remote fonts. */
export const SHORTFORGE_MOTION_FONT_STACK = "Arial, Helvetica, sans-serif";

const HEX = /^#([0-9A-Fa-f]{6})$/;

/**
 * Convert a locked hex token to an rgba() string.
 * Invalid input fails closed to transparent black.
 */
export function shortforgeMotionHexToRgba(hex: string, alpha: number): string {
  const match = HEX.exec(hex);
  const a =
    typeof alpha === "number" && Number.isFinite(alpha)
      ? Math.min(1, Math.max(0, alpha))
      : 0;
  if (!match) return `rgba(0, 0, 0, ${a})`;
  const value = Number.parseInt(match[1]!, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
