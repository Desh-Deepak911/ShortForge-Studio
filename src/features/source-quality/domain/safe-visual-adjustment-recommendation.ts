/**
 * Pure deterministic safe-adjustment recommendations for source quality.
 * Framing-only: zoom reset and/or fit. Never invents appearance or color patches.
 */

import type { SceneMediaFraming } from "@/features/media-framing/media-framing.types";
import type { SceneMedia } from "@/features/story/types";

import { assessSourceQuality } from "./assess-source-quality";
import type { SourceQualityAssessment } from "./source-quality-assessment";
import {
  normalizeSourceQualityZoom,
} from "./source-quality-effective-geometry";
import type {
  SourceQualityAdjustmentRecommendationCode,
  SourceQualityNormalizedFramingSnapshot,
} from "./source-quality-adjustment-provenance";
import { toFramingSnapshot } from "./source-quality-adjustment-provenance";

export const SOURCE_QUALITY_RECOMMENDATION_VERSION = 1 as const;

export interface SourceQualityFramingPatchProposal {
  readonly fitMode?: "fit" | "fill";
  readonly zoom?: number;
}

export interface SourceQualityRecommendationReason {
  readonly code: SourceQualityAdjustmentRecommendationCode;
  readonly message: string;
}

export interface SourceQualitySafeAdjustmentRecommendation {
  readonly version: typeof SOURCE_QUALITY_RECOMMENDATION_VERSION;
  readonly recommendationFingerprint: string;
  readonly mediaFingerprint: string;
  readonly recommendationCodes: readonly SourceQualityAdjustmentRecommendationCode[];
  readonly currentAssessmentSummaryKey: SourceQualityAssessment["summaryKey"];
  readonly currentWarningCodes: readonly SourceQualityAssessment["warningCodes"][number][];
  readonly proposedFramingPatch: SourceQualityFramingPatchProposal;
  readonly currentFraming: SourceQualityNormalizedFramingSnapshot;
  readonly projectedFraming: SourceQualityNormalizedFramingSnapshot;
  readonly projectedAssessmentSummaryKey: SourceQualityAssessment["summaryKey"];
  readonly projectedWarningCodes: readonly SourceQualityAssessment["warningCodes"][number][];
  readonly reasons: readonly SourceQualityRecommendationReason[];
  readonly applicable: boolean;
  readonly mediaItemId: string | null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** Feature-local FNV-1a 32-bit → base36. Client-safe; no crypto/network. */
export function sourceQualityStableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Execution-relevant semantic equality for Apply validation.
 * Display-only reason copy is ignored; forged patches/codes/identity must not match.
 */
export function sourceQualityRecommendationsSemanticallyEqual(
  left: SourceQualitySafeAdjustmentRecommendation,
  right: SourceQualitySafeAdjustmentRecommendation,
): boolean {
  if (
    left.version !== right.version ||
    left.recommendationFingerprint !== right.recommendationFingerprint ||
    left.mediaFingerprint !== right.mediaFingerprint ||
    left.applicable !== right.applicable ||
    left.mediaItemId !== right.mediaItemId ||
    left.currentAssessmentSummaryKey !== right.currentAssessmentSummaryKey ||
    left.projectedAssessmentSummaryKey !== right.projectedAssessmentSummaryKey
  ) {
    return false;
  }
  if (
    stableStringify([...left.recommendationCodes].sort()) !==
    stableStringify([...right.recommendationCodes].sort())
  ) {
    return false;
  }
  if (
    stableStringify(left.proposedFramingPatch) !==
    stableStringify(right.proposedFramingPatch)
  ) {
    return false;
  }
  if (
    stableStringify(left.currentFraming) !== stableStringify(right.currentFraming) ||
    stableStringify(left.projectedFraming) !==
      stableStringify(right.projectedFraming)
  ) {
    return false;
  }
  if (
    stableStringify([...left.currentWarningCodes]) !==
      stableStringify([...right.currentWarningCodes]) ||
    stableStringify([...left.projectedWarningCodes]) !==
      stableStringify([...right.projectedWarningCodes])
  ) {
    return false;
  }
  return true;
}

export function fingerprintSourceQualityMedia(media: SceneMedia | null | undefined): string {
  if (!media) {
    return sourceQualityStableHash(stableStringify({ empty: true }));
  }
  return sourceQualityStableHash(
    stableStringify({
      type: media.type,
      url: typeof media.url === "string" ? media.url.trim() : null,
      mimeType:
        typeof media.mimeType === "string" && media.mimeType.trim()
          ? media.mimeType.trim().toLowerCase()
          : null,
      width:
        typeof media.width === "number" && Number.isFinite(media.width) && media.width > 0
          ? Math.round(media.width)
          : null,
      height:
        typeof media.height === "number" && Number.isFinite(media.height) && media.height > 0
          ? Math.round(media.height)
          : null,
      source: media.source ?? null,
    }),
  );
}

function warningSet(codes: readonly string[]): Set<string> {
  return new Set(codes);
}

function improvesWarnings(
  current: readonly string[],
  projected: readonly string[],
  improvable: readonly string[],
): boolean {
  const before = warningSet(current);
  const after = warningSet(projected);
  return improvable.some((code) => before.has(code) && !after.has(code));
}

function framingFromAssessmentInput(
  framing: Pick<
    SceneMediaFraming,
    | "fitMode"
    | "positionX"
    | "positionY"
    | "zoom"
    | "rotationDeg"
    | "backgroundTreatment"
  >,
): SceneMediaFraming {
  return {
    fitMode: framing.fitMode === "fit" ? "fit" : "fill",
    positionX: framing.positionX,
    positionY: framing.positionY,
    zoom: normalizeSourceQualityZoom(framing.zoom),
    rotationDeg: framing.rotationDeg,
    backgroundTreatment: framing.backgroundTreatment ?? "none",
  };
}

function assessWithFraming(
  media: SceneMedia | null | undefined,
  framing: SceneMediaFraming,
): SourceQualityAssessment {
  return assessSourceQuality({
    media,
    framing: {
      fitMode: framing.fitMode,
      zoom: framing.zoom,
      rotationDeg: framing.rotationDeg,
      backgroundTreatment: framing.backgroundTreatment ?? "none",
    },
  });
}

function buildFingerprint(input: {
  readonly mediaFingerprint: string;
  readonly mediaItemId: string | null;
  readonly currentFraming: SourceQualityNormalizedFramingSnapshot;
  readonly proposedFramingPatch: SourceQualityFramingPatchProposal;
  readonly recommendationCodes: readonly SourceQualityAdjustmentRecommendationCode[];
  readonly applicable: boolean;
}): string {
  return sourceQualityStableHash(
    stableStringify({
      version: SOURCE_QUALITY_RECOMMENDATION_VERSION,
      mediaFingerprint: input.mediaFingerprint,
      mediaItemId: input.mediaItemId,
      currentFraming: input.currentFraming,
      proposedFramingPatch: input.proposedFramingPatch,
      recommendationCodes: [...input.recommendationCodes].sort(),
      applicable: input.applicable,
    }),
  );
}

/**
 * Derive a deterministic framing-only recommendation for the winning media.
 * Low-resolution-only issues yield guidance without an applicable patch.
 */
export function recommendSafeVisualAdjustment(input: {
  readonly media: SceneMedia | null | undefined;
  readonly framing: Pick<
    SceneMediaFraming,
    "fitMode" | "positionX" | "positionY" | "zoom" | "rotationDeg"
  >;
  readonly mediaItemId?: string | null;
}): SourceQualitySafeAdjustmentRecommendation {
  const mediaItemId =
    typeof input.mediaItemId === "string" && input.mediaItemId.trim()
      ? input.mediaItemId.trim()
      : null;
  const currentFraming = framingFromAssessmentInput(input.framing);
  const currentSnapshot = toFramingSnapshot(currentFraming);
  const currentAssessment = assessWithFraming(input.media, currentFraming);
  const mediaFingerprint = fingerprintSourceQualityMedia(input.media);
  const warnings = currentAssessment.warningCodes;

  const empty = (overrides: {
    readonly recommendationCodes?: readonly SourceQualityAdjustmentRecommendationCode[];
    readonly reasons?: readonly SourceQualityRecommendationReason[];
    readonly proposedFramingPatch?: SourceQualityFramingPatchProposal;
    readonly applicable?: boolean;
    readonly projected?: SourceQualityAssessment;
  }): SourceQualitySafeAdjustmentRecommendation => {
    const proposed = overrides.proposedFramingPatch ?? {};
    const projectedFraming = framingFromAssessmentInput({
      ...currentFraming,
      ...proposed,
    });
    const projected =
      overrides.projected ?? assessWithFraming(input.media, projectedFraming);
    const codes = overrides.recommendationCodes ?? [];
    const applicable = overrides.applicable === true;
    return Object.freeze({
      version: SOURCE_QUALITY_RECOMMENDATION_VERSION,
      recommendationFingerprint: buildFingerprint({
        mediaFingerprint,
        mediaItemId,
        currentFraming: currentSnapshot,
        proposedFramingPatch: proposed,
        recommendationCodes: codes,
        applicable,
      }),
      mediaFingerprint,
      recommendationCodes: Object.freeze([...codes]),
      currentAssessmentSummaryKey: currentAssessment.summaryKey,
      currentWarningCodes: currentAssessment.warningCodes,
      proposedFramingPatch: Object.freeze({ ...proposed }),
      currentFraming: currentSnapshot,
      projectedFraming: toFramingSnapshot(projectedFraming),
      projectedAssessmentSummaryKey: projected.summaryKey,
      projectedWarningCodes: projected.warningCodes,
      reasons: Object.freeze([...(overrides.reasons ?? [])]),
      applicable,
      mediaItemId,
    });
  };

  if (!currentAssessment.hasMedia || currentAssessment.summaryKey === "no_media") {
    return empty({});
  }

  if (currentAssessment.summaryKey === "suitable_1080p") {
    return empty({});
  }

  if (currentAssessment.summaryKey === "unknown") {
    return empty({
      recommendationCodes: ["USE_HIGHER_RESOLUTION_SOURCE"],
      reasons: [
        {
          code: "USE_HIGHER_RESOLUTION_SOURCE",
          message:
            "Source dimensions are unavailable. Attach a higher-resolution source for quality guidance.",
        },
      ],
      applicable: false,
    });
  }

  const zoomContributes =
    currentFraming.zoom > 1 &&
    (warnings.includes("SOURCE_MAY_UPSCALE_AT_720P") ||
      warnings.includes("SOURCE_MAY_UPSCALE_AT_1080P") ||
      warnings.includes("SOURCE_MAY_UPSCALE_AT_4K") ||
      warnings.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP"));

  let zoomHelps = false;
  if (zoomContributes) {
    const zoomOnly = framingFromAssessmentInput({
      ...currentFraming,
      zoom: 1,
    });
    const zoomAssessment = assessWithFraming(input.media, zoomOnly);
    zoomHelps = improvesWarnings(warnings, zoomAssessment.warningCodes, [
      "SOURCE_MAY_UPSCALE_AT_720P",
      "SOURCE_MAY_UPSCALE_AT_1080P",
      "SOURCE_MAY_UPSCALE_AT_4K",
      "SOURCE_AGGRESSIVE_VERTICAL_CROP",
    ]);
  }

  let fitHelps = false;
  if (
    currentFraming.fitMode === "fill" &&
    warnings.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP")
  ) {
    const fitOnly = framingFromAssessmentInput({
      ...currentFraming,
      fitMode: "fit",
    });
    const fitAssessment = assessWithFraming(input.media, fitOnly);
    fitHelps =
      warnings.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP") &&
      !fitAssessment.warningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP");
  }

  if (zoomHelps && fitHelps) {
    const patch: SourceQualityFramingPatchProposal = {
      fitMode: "fit",
      zoom: 1,
    };
    const projectedFraming = framingFromAssessmentInput({
      ...currentFraming,
      ...patch,
    });
    const projected = assessWithFraming(input.media, projectedFraming);
    return empty({
      recommendationCodes: ["COMBINED_FIT_AND_RESET_ZOOM", "USE_FIT_FRAMING", "RESET_EXCESSIVE_ZOOM"],
      proposedFramingPatch: patch,
      applicable: true,
      projected,
      reasons: [
        {
          code: "USE_FIT_FRAMING",
          message:
            "Fit the full source inside the vertical frame. Letterboxing may appear.",
        },
        {
          code: "RESET_EXCESSIVE_ZOOM",
          message: "Return zoom to 1× to reduce upscale or crop risk.",
        },
        {
          code: "COMBINED_FIT_AND_RESET_ZOOM",
          message: "Apply fit framing and reset zoom together for the best improvement.",
        },
      ],
    });
  }

  if (fitHelps) {
    const patch: SourceQualityFramingPatchProposal = { fitMode: "fit" };
    const projectedFraming = framingFromAssessmentInput({
      ...currentFraming,
      ...patch,
    });
    const projected = assessWithFraming(input.media, projectedFraming);
    return empty({
      recommendationCodes: ["USE_FIT_FRAMING"],
      proposedFramingPatch: patch,
      applicable: true,
      projected,
      reasons: [
        {
          code: "USE_FIT_FRAMING",
          message:
            "Fit the full source inside the vertical frame. Letterboxing may appear.",
        },
      ],
    });
  }

  if (zoomHelps) {
    const patch: SourceQualityFramingPatchProposal = { zoom: 1 };
    const projectedFraming = framingFromAssessmentInput({
      ...currentFraming,
      ...patch,
    });
    const projected = assessWithFraming(input.media, projectedFraming);
    return empty({
      recommendationCodes: ["RESET_EXCESSIVE_ZOOM"],
      proposedFramingPatch: patch,
      applicable: true,
      projected,
      reasons: [
        {
          code: "RESET_EXCESSIVE_ZOOM",
          message: "Return zoom to 1× to reduce upscale or crop risk.",
        },
      ],
    });
  }

  // Low resolution (or other warnings) without an improvable framing patch.
  const hasUpscale =
    warnings.includes("SOURCE_MAY_UPSCALE_AT_720P") ||
    warnings.includes("SOURCE_MAY_UPSCALE_AT_1080P") ||
    warnings.includes("SOURCE_MAY_UPSCALE_AT_4K");
  if (hasUpscale) {
    return empty({
      recommendationCodes: ["USE_HIGHER_RESOLUTION_SOURCE"],
      reasons: [
        {
          code: "USE_HIGHER_RESOLUTION_SOURCE",
          message:
            "This source may look soft at the target size. Use a higher-resolution source.",
        },
      ],
      applicable: false,
    });
  }

  return empty({});
}
