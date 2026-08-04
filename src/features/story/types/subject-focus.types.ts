/**
 * Story-owned subject-focus and subject-aware framing provenance.
 * Authoring-only — Preview/Export/Headless ignore these fields until Apply
 * writes ordinary framing. This leaf must not import the source quality feature.
 */

export const SCENE_MEDIA_SUBJECT_FOCUS_VERSION = 1 as const;
export const SCENE_MEDIA_SUBJECT_AWARE_FRAMING_PROVENANCE_VERSION = 1 as const;

export type SceneMediaSubjectFocusSource = "manual" | "metadata";

/** Normalized source-relative focus point/box in [0,1] space. */
export interface SceneMediaSubjectFocusV1 {
  readonly version: typeof SCENE_MEDIA_SUBJECT_FOCUS_VERSION;
  /** Horizontal center in source space, 0 = left, 1 = right. */
  readonly centerX: number;
  /** Vertical center in source space, 0 = top, 1 = bottom. */
  readonly centerY: number;
  /** Optional box width in (0, 1]. */
  readonly width?: number;
  /** Optional box height in (0, 1]. */
  readonly height?: number;
  readonly source: SceneMediaSubjectFocusSource;
}

export type SceneMediaSubjectFocus = SceneMediaSubjectFocusV1;

/** Ordinary framing snapshot for exact Apply/Undo (reference-frame units). */
export interface SceneMediaFramingSnapshot {
  readonly fitMode: "fit" | "fill";
  readonly positionX: number;
  readonly positionY: number;
  readonly zoom: number;
  readonly rotationDeg: number;
}

/**
 * Provenance binding an applied subject-aware suggestion to media/focus/framing.
 * Stored on the media that received Apply; never required by renderers.
 */
export interface SceneMediaSubjectAwareFramingProvenanceV1 {
  readonly version: typeof SCENE_MEDIA_SUBJECT_AWARE_FRAMING_PROVENANCE_VERSION;
  readonly mediaFingerprint: string;
  readonly mediaItemId: string | null;
  readonly focusFingerprint: string;
  readonly recommendationFingerprint: string;
  readonly generatorVersion: number;
  readonly previousFraming: SceneMediaFramingSnapshot;
  readonly appliedFraming: SceneMediaFramingSnapshot;
  readonly subjectFocus: SceneMediaSubjectFocusV1;
}

export type SceneMediaSubjectAwareFramingProvenance =
  SceneMediaSubjectAwareFramingProvenanceV1;

function finiteUnitInterval(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 1) return undefined;
  return value;
}

function finitePositiveUnit(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (!(value > 0) || value > 1) return undefined;
  return value;
}

function normalizeFramingSnapshot(
  value: unknown,
): SceneMediaFramingSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const fitMode =
    record.fitMode === "fit" || record.fitMode === "fill"
      ? record.fitMode
      : undefined;
  const positionX =
    typeof record.positionX === "number" && Number.isFinite(record.positionX)
      ? record.positionX
      : undefined;
  const positionY =
    typeof record.positionY === "number" && Number.isFinite(record.positionY)
      ? record.positionY
      : undefined;
  const zoom =
    typeof record.zoom === "number" && Number.isFinite(record.zoom)
      ? record.zoom
      : undefined;
  const rotationDeg =
    typeof record.rotationDeg === "number" && Number.isFinite(record.rotationDeg)
      ? record.rotationDeg
      : undefined;
  if (
    fitMode == null ||
    positionX == null ||
    positionY == null ||
    zoom == null ||
    !(zoom > 0) ||
    rotationDeg == null
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

/** Fail-closed focus normalize — malformed → undefined. */
export function normalizeSceneMediaSubjectFocus(
  value: unknown,
): SceneMediaSubjectFocus | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== SCENE_MEDIA_SUBJECT_FOCUS_VERSION) return undefined;
  const centerX = finiteUnitInterval(record.centerX);
  const centerY = finiteUnitInterval(record.centerY);
  if (centerX == null || centerY == null) return undefined;
  const source =
    record.source === "manual" || record.source === "metadata"
      ? record.source
      : undefined;
  if (!source) return undefined;

  const normalized: {
    version: 1;
    centerX: number;
    centerY: number;
    source: SceneMediaSubjectFocusSource;
    width?: number;
    height?: number;
  } = {
    version: SCENE_MEDIA_SUBJECT_FOCUS_VERSION,
    centerX,
    centerY,
    source,
  };

  const width = finitePositiveUnit(record.width);
  const height = finitePositiveUnit(record.height);
  if (width != null) normalized.width = width;
  if (height != null) normalized.height = height;

  return Object.freeze(normalized);
}

/** Fail-closed provenance normalize — malformed → undefined. */
export function normalizeSceneMediaSubjectAwareFramingProvenance(
  value: unknown,
): SceneMediaSubjectAwareFramingProvenance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== SCENE_MEDIA_SUBJECT_AWARE_FRAMING_PROVENANCE_VERSION) {
    return undefined;
  }
  if (
    typeof record.mediaFingerprint !== "string" ||
    !record.mediaFingerprint.trim()
  ) {
    return undefined;
  }
  if (
    typeof record.focusFingerprint !== "string" ||
    !record.focusFingerprint.trim()
  ) {
    return undefined;
  }
  if (
    typeof record.recommendationFingerprint !== "string" ||
    !record.recommendationFingerprint.trim()
  ) {
    return undefined;
  }
  if (
    typeof record.generatorVersion !== "number" ||
    !Number.isFinite(record.generatorVersion) ||
    !Number.isInteger(record.generatorVersion) ||
    record.generatorVersion < 1
  ) {
    return undefined;
  }
  // Explicit identity only: null (single-media) or non-empty string (item).
  // Missing / undefined / "" / numeric / object → invalid.
  if (!("mediaItemId" in record)) {
    return undefined;
  }
  const mediaItemId =
    record.mediaItemId === null
      ? null
      : typeof record.mediaItemId === "string" && record.mediaItemId.trim()
        ? record.mediaItemId.trim()
        : undefined;
  if (mediaItemId === undefined) return undefined;

  const previousFraming = normalizeFramingSnapshot(record.previousFraming);
  const appliedFraming = normalizeFramingSnapshot(record.appliedFraming);
  const subjectFocus = normalizeSceneMediaSubjectFocus(record.subjectFocus);
  if (!previousFraming || !appliedFraming || !subjectFocus) return undefined;

  return Object.freeze({
    version: SCENE_MEDIA_SUBJECT_AWARE_FRAMING_PROVENANCE_VERSION,
    mediaFingerprint: record.mediaFingerprint.trim(),
    mediaItemId,
    focusFingerprint: record.focusFingerprint.trim(),
    recommendationFingerprint: record.recommendationFingerprint.trim(),
    generatorVersion: Math.floor(record.generatorVersion),
    previousFraming,
    appliedFraming,
    subjectFocus,
  });
}

export function sceneMediaFramingSnapshotsEqual(
  left: SceneMediaFramingSnapshot,
  right: SceneMediaFramingSnapshot,
): boolean {
  return (
    left.fitMode === right.fitMode &&
    left.positionX === right.positionX &&
    left.positionY === right.positionY &&
    left.zoom === right.zoom &&
    left.rotationDeg === right.rotationDeg
  );
}
