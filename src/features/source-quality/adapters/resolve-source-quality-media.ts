/**
 * Assessment-only media resolution for source-quality guidance.
 *
 * Explicit selected/projected SceneMedia always wins unchanged.
 * Otherwise starts from canonical getSceneMedia(scene) and may enrich a
 * frozen copy with valid width/height from a matching legacy image record.
 *
 * Never mutates the scene or the canonical getSceneMedia output.
 * Must not be imported by export, preview, headless, or sync consumers.
 */

import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";

function positiveDimension(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

function readLegacyImageIntrinsicDimensions(
  image: unknown,
  expectedUrl: string,
): { readonly width: number; readonly height: number } | null {
  if (!image || typeof image !== "object") {
    return null;
  }
  const record = image as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!url || url !== expectedUrl) {
    return null;
  }
  const width = positiveDimension(record.width);
  const height = positiveDimension(record.height);
  if (width == null || height == null) {
    return null;
  }
  return { width, height };
}

/**
 * Enrich a canonical media copy with legacy image dims when both axes are
 * known and the legacy URL matches. Returns the same reference when no
 * enrichment applies (including when dims already exist).
 */
function enrichCanonicalMediaForAssessment(
  canonical: SceneMedia,
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): SceneMedia {
  if (canonical.type !== "image") {
    return canonical;
  }
  const existingWidth = positiveDimension(canonical.width);
  const existingHeight = positiveDimension(canonical.height);
  if (existingWidth != null && existingHeight != null) {
    return canonical;
  }
  const url = typeof canonical.url === "string" ? canonical.url.trim() : "";
  if (!url) {
    return canonical;
  }
  const dims = readLegacyImageIntrinsicDimensions(scene.image, url);
  if (!dims) {
    return canonical;
  }
  return Object.freeze({
    ...canonical,
    width: dims.width,
    height: dims.height,
  });
}

/**
 * Resolve media for source-quality assessment.
 *
 * - `media` provided (including `null`) → wins; no legacy enrichment.
 * - `media` omitted → canonical getSceneMedia, then assessment-only enrich.
 */
export function resolveSourceQualityMedia(options: {
  readonly scene: Pick<FootieScene, "image" | "uploadedImage" | "media">;
  readonly media?: SceneMedia | null;
}): SceneMedia | null {
  if (options.media !== undefined) {
    return options.media;
  }
  const canonical = getSceneMedia(options.scene) ?? null;
  if (!canonical) {
    return null;
  }
  return enrichCanonicalMediaForAssessment(canonical, options.scene);
}
