/**
 * Project authoring ShortForgeBrandStingV1 into a frozen ExportManifest payload.
 */

import type { ShortForgeBrandStingV1 } from "@/features/visual-retention/domain/visual-retention-extension-contracts";

import { normalizeShortForgeBrandSting } from "./normalize-brand-sting";

export interface ExportBrandStingManifestPayload {
  readonly version: 1;
  readonly title: "ShortForge Studio";
  readonly durationMs: 2000 | 2500 | 3000;
  readonly presetId: string;
  readonly narrationPolicy: "none";
  readonly captionPolicy: "none";
  readonly playbackSpeedPolicy: "fixed";
  /** Absolute start on the project timeline (= narration story end). */
  readonly startMs: number;
}

export interface ProjectBrandStingToManifestResult {
  readonly brandSting: ExportBrandStingManifestPayload | undefined;
  readonly warnings: readonly string[];
}

export function projectBrandStingToManifest(
  sting: unknown,
  narrationEndMs: number,
  shortForgeBrandStingEnabled: boolean,
): ProjectBrandStingToManifestResult {
  if (shortForgeBrandStingEnabled !== true) {
    return { brandSting: undefined, warnings: [] };
  }
  const normalized = normalizeShortForgeBrandSting(sting);
  if (!normalized || normalized.enabled !== true) {
    return { brandSting: undefined, warnings: [] };
  }
  if (!Number.isFinite(narrationEndMs) || narrationEndMs < 0) {
    return {
      brandSting: undefined,
      warnings: ["BRAND_STING_OMITTED: narration end is invalid."],
    };
  }

  const payload: ExportBrandStingManifestPayload = {
    version: 1,
    title: normalized.title,
    durationMs: normalized.durationMs,
    presetId: normalized.presetId,
    narrationPolicy: "none",
    captionPolicy: "none",
    playbackSpeedPolicy: "fixed",
    startMs: Math.round(narrationEndMs),
  };
  return { brandSting: payload, warnings: [] };
}

export function authoringBrandStingFromManifest(
  payload: ExportBrandStingManifestPayload | null | undefined,
): ShortForgeBrandStingV1 | undefined {
  if (!payload) return undefined;
  return normalizeShortForgeBrandSting({
    version: 1,
    enabled: true,
    title: payload.title,
    durationMs: payload.durationMs,
    presetId: payload.presetId,
    narrationPolicy: payload.narrationPolicy,
    captionPolicy: payload.captionPolicy,
    playbackSpeedPolicy: payload.playbackSpeedPolicy,
  });
}
