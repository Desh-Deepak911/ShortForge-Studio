import { MEDIA_VISUAL_REFERENCE_WIDTH } from "./media-visual-adjustments.defaults";
import { normalizeMediaVisualAdjustments } from "./normalize-media-visual-adjustments";

function format(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function hexToRgb(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

/**
 * Builds a deterministic CSS/Canvas filter from validated primitives only.
 * Shadow dimensions are stored in 1080-wide reference pixels and scaled once
 * for the owning preview/export target.
 */
export function buildMediaVisualFilter(
  value: unknown,
  targetWidth = MEDIA_VISUAL_REFERENCE_WIDTH,
): string {
  const resolved = normalizeMediaVisualAdjustments(value);
  const filters = [
    `brightness(${format(resolved.brightness / 100)})`,
    `contrast(${format(resolved.contrast / 100)})`,
    `saturate(${format(resolved.saturation / 100)})`,
  ];
  if (resolved.shadowEnabled && resolved.shadowOpacity > 0) {
    const scale = Math.max(0, targetWidth) / MEDIA_VISUAL_REFERENCE_WIDTH;
    const [r, g, b] = hexToRgb(resolved.shadowColor);
    filters.push(
      `drop-shadow(${format(resolved.shadowOffsetX * scale)}px ${format(
        resolved.shadowOffsetY * scale,
      )}px ${format(resolved.shadowBlur * scale)}px rgba(${r}, ${g}, ${b}, ${format(
        resolved.shadowOpacity,
      )}))`,
    );
  }
  return filters.join(" ");
}
