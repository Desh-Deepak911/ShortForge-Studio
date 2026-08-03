/**
 * Authoring-only source-quality adjustment provenance.
 * Optional on SceneMedia; never required by Preview, Export, or Headless.
 * No timestamps, blobs, provider payloads, narration, or music.
 */

export const SOURCE_QUALITY_ADJUSTMENT_PROVENANCE_VERSION = 1 as const;

export type SourceQualityAdjustmentRecommendationCode =
  | "RESET_EXCESSIVE_ZOOM"
  | "USE_FIT_FRAMING"
  | "COMBINED_FIT_AND_RESET_ZOOM"
  | "USE_HIGHER_RESOLUTION_SOURCE";

export interface SourceQualityNormalizedFramingSnapshot {
  readonly fitMode: "fit" | "fill";
  readonly positionX: number;
  readonly positionY: number;
  readonly zoom: number;
  readonly rotationDeg: number;
}

/**
 * Versioned provenance stored on the media object that received Apply.
 * Binds recommendation fingerprints to a specific media item identity.
 */
export interface SourceQualityAdjustmentProvenanceV1 {
  readonly version: typeof SOURCE_QUALITY_ADJUSTMENT_PROVENANCE_VERSION;
  readonly recommendationFingerprint: string;
  readonly mediaFingerprint: string;
  readonly recommendationCodes: readonly SourceQualityAdjustmentRecommendationCode[];
  readonly previousFraming: SourceQualityNormalizedFramingSnapshot;
  readonly appliedFraming: SourceQualityNormalizedFramingSnapshot;
  /** Stable media-item id when mixed-media; null for single-media scenes. */
  readonly mediaItemId: string | null;
}

export type SourceQualityAdjustmentProvenance = SourceQualityAdjustmentProvenanceV1;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeFramingSnapshot(
  value: unknown,
): SourceQualityNormalizedFramingSnapshot | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const fitMode = record.fitMode === "fit" || record.fitMode === "fill" ? record.fitMode : undefined;
  const positionX = finiteNumber(record.positionX);
  const positionY = finiteNumber(record.positionY);
  const zoom = finiteNumber(record.zoom);
  const rotationDeg = finiteNumber(record.rotationDeg);
  if (
    fitMode == null ||
    positionX == null ||
    positionY == null ||
    zoom == null ||
    rotationDeg == null ||
    !(zoom > 0)
  ) {
    return undefined;
  }
  return Object.freeze({
    fitMode,
    positionX,
    positionY,
    zoom,
    rotationDeg,
  });
}

const ALLOWED_CODES = new Set<SourceQualityAdjustmentRecommendationCode>([
  "RESET_EXCESSIVE_ZOOM",
  "USE_FIT_FRAMING",
  "COMBINED_FIT_AND_RESET_ZOOM",
  "USE_HIGHER_RESOLUTION_SOURCE",
]);

function normalizeRecommendationCodes(
  value: unknown,
): readonly SourceQualityAdjustmentRecommendationCode[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const codes: SourceQualityAdjustmentRecommendationCode[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !ALLOWED_CODES.has(entry as SourceQualityAdjustmentRecommendationCode)) {
      return undefined;
    }
    if (!codes.includes(entry as SourceQualityAdjustmentRecommendationCode)) {
      codes.push(entry as SourceQualityAdjustmentRecommendationCode);
    }
  }
  return Object.freeze(codes);
}

/**
 * Fail-closed provenance normalizer. Malformed values parse as absent.
 * Does not throw; opening/preview/export remain unaffected.
 */
export function normalizeSourceQualityAdjustmentProvenance(
  value: unknown,
): SourceQualityAdjustmentProvenance | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== SOURCE_QUALITY_ADJUSTMENT_PROVENANCE_VERSION) {
    return undefined;
  }
  if (
    typeof record.recommendationFingerprint !== "string" ||
    !record.recommendationFingerprint.trim() ||
    typeof record.mediaFingerprint !== "string" ||
    !record.mediaFingerprint.trim()
  ) {
    return undefined;
  }
  const recommendationCodes = normalizeRecommendationCodes(record.recommendationCodes);
  const previousFraming = normalizeFramingSnapshot(record.previousFraming);
  const appliedFraming = normalizeFramingSnapshot(record.appliedFraming);
  if (!recommendationCodes || !previousFraming || !appliedFraming) {
    return undefined;
  }
  // v1 requires an explicit mediaItemId: null (single-media) or non-empty string.
  // Omission / undefined / empty / non-string must fail closed — never coerce to null.
  if (!Object.prototype.hasOwnProperty.call(record, "mediaItemId")) {
    return undefined;
  }
  let mediaItemId: string | null;
  if (record.mediaItemId === null) {
    mediaItemId = null;
  } else if (typeof record.mediaItemId === "string" && record.mediaItemId.trim()) {
    mediaItemId = record.mediaItemId.trim();
  } else {
    return undefined;
  }

  return Object.freeze({
    version: SOURCE_QUALITY_ADJUSTMENT_PROVENANCE_VERSION,
    recommendationFingerprint: record.recommendationFingerprint.trim(),
    mediaFingerprint: record.mediaFingerprint.trim(),
    recommendationCodes,
    previousFraming,
    appliedFraming,
    mediaItemId,
  });
}

export function framingSnapshotsEqual(
  left: SourceQualityNormalizedFramingSnapshot,
  right: SourceQualityNormalizedFramingSnapshot,
): boolean {
  return (
    left.fitMode === right.fitMode &&
    left.positionX === right.positionX &&
    left.positionY === right.positionY &&
    left.zoom === right.zoom &&
    left.rotationDeg === right.rotationDeg
  );
}

export function toFramingSnapshot(framing: {
  readonly fitMode: "fit" | "fill";
  readonly positionX: number;
  readonly positionY: number;
  readonly zoom: number;
  readonly rotationDeg: number;
}): SourceQualityNormalizedFramingSnapshot {
  return Object.freeze({
    fitMode: framing.fitMode === "fit" ? "fit" : "fill",
    positionX: framing.positionX,
    positionY: framing.positionY,
    zoom: framing.zoom,
    rotationDeg: framing.rotationDeg,
  });
}
