import type { ExportManifestV3 } from "@/features/export/domain";
import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";

export type HeadlessOutputSelection = Readonly<{
  resolution: HeadlessRendererProfile["resolution"];
  format: HeadlessRendererProfile["format"];
}>;

/**
 * Bind the requested worker profile to the already-frozen manifest output.
 *
 * Resolution is the only intentional exception: a 4K worker profile elevates
 * a valid frozen 1080p manifest. Format, fps, and quality always come from the
 * manifest so the browser cannot upload a snapshot that canonical promotion
 * will later reject.
 */
export function rendererProfileFromFrozenManifest(
  selection: HeadlessOutputSelection,
  output: ExportManifestV3["output"],
): HeadlessRendererProfile | null {
  if (output.format !== selection.format || output.fps !== 30) {
    return null;
  }

  const resolutionCoherent =
    selection.resolution === "4k"
      ? output.resolution === "1080p" &&
        output.width === 1080 &&
        output.height === 1920
      : output.resolution === selection.resolution;
  if (!resolutionCoherent) {
    return null;
  }

  return Object.freeze({
    resolution: selection.resolution,
    format: output.format,
    fps: 30,
    quality: output.quality,
  });
}
