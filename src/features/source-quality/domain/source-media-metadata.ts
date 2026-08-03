/**
 * Pure source-media metadata contract.
 *
 * Types, normalization, and extraction of already-known asset facts.
 * No browser globals, client directive, React, providers, preview, export,
 * or headless dependencies.
 */

export interface SourceMediaMetadataFacts {
  readonly width?: number;
  readonly height?: number;
  readonly mimeType?: string;
  readonly durationMs?: number;
}

export function normalizeSourceMediaDimension(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

export function normalizeSourceMediaMimeType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeSourceMediaDurationMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

/** Normalize optional SceneMedia metadata facts; invalid values are omitted. */
export function normalizeSourceMediaMetadataFacts(input: {
  readonly width?: unknown;
  readonly height?: unknown;
  readonly mimeType?: unknown;
  readonly durationMs?: unknown;
}): SourceMediaMetadataFacts {
  const width = normalizeSourceMediaDimension(input.width);
  const height = normalizeSourceMediaDimension(input.height);
  const mimeType = normalizeSourceMediaMimeType(input.mimeType);
  const durationMs = normalizeSourceMediaDurationMs(input.durationMs);

  return {
    ...(width != null ? { width } : {}),
    ...(height != null ? { height } : {}),
    ...(mimeType != null ? { mimeType } : {}),
    ...(durationMs != null ? { durationMs } : {}),
  };
}

/**
 * Copy only supported known facts from an asset-search result.
 * Does not call providers, probe remote URLs, or depend on CORS.
 */
export function sourceMediaMetadataFactsFromAssetResult(asset: {
  readonly width?: unknown;
  readonly height?: unknown;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}): SourceMediaMetadataFacts {
  const mimeCandidate = asset.metadata?.mimeType ?? asset.metadata?.mime_type;
  return normalizeSourceMediaMetadataFacts({
    width: asset.width,
    height: asset.height,
    mimeType: typeof mimeCandidate === "string" ? mimeCandidate : undefined,
  });
}
