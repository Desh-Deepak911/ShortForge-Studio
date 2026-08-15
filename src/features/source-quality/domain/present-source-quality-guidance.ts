/**
 * Creator-facing presentation for Source Quality assessments.
 * Mapping/copy only — no geometry math, no export blockers, no framing mutation.
 */

import type {
  SourceQualityAssessment,
  SourceQualityDetailClass,
  SourceQualitySoftnessCause,
  SourceQualityTargetId,
  SourceQualityTargetReadiness,
} from "./source-quality-assessment";

export type SourceQualityCreatorRating =
  | "excellent"
  | "good"
  | "may_look_soft"
  | "significant_enlargement"
  | "cannot_estimate";

export type SourceQualityCreatorSuggestionCode =
  | "reduce_zoom"
  | "reposition_instead_of_zoom"
  | "switch_to_fit"
  | "use_fit_with_background"
  | "choose_1080p_instead_of_4k";

export interface SourceQualityCreatorGuidanceDetail {
  readonly label: string;
  readonly value: string;
}

export interface SourceQualityCreatorGuidance {
  readonly exportTarget: SourceQualityTargetId;
  readonly rating: SourceQualityCreatorRating;
  /** e.g. "Excellent for 1080p" — always includes the target. */
  readonly ratingLabel: string;
  /** Plain-language primary explanation (cause-aware). */
  readonly explanation: string;
  /** Deduplicated reversible suggestions; never auto-applied. */
  readonly suggestions: readonly string[];
  readonly suggestionCodes: readonly SourceQualityCreatorSuggestionCode[];
  /** Optional numeric / technical facts for expandable details. */
  readonly details: readonly SourceQualityCreatorGuidanceDetail[];
  /** Always false — quality guidance never blocks export. */
  readonly blocksExport: false;
}

const RATING_WORD: Record<SourceQualityCreatorRating, string> = {
  excellent: "Excellent",
  good: "Good",
  may_look_soft: "May look soft",
  significant_enlargement: "Significant enlargement",
  cannot_estimate: "Quality cannot be estimated",
};

const SUGGESTION_COPY: Record<SourceQualityCreatorSuggestionCode, string> = {
  reduce_zoom: "Reduce zoom.",
  reposition_instead_of_zoom: "Reposition the video instead of zooming further.",
  switch_to_fit: "Switch to Fit.",
  use_fit_with_background: "Use Fit with background.",
  choose_1080p_instead_of_4k: "Choose 1080p instead of 4K.",
};

function targetDisplayLabel(target: SourceQualityTargetId): string {
  return target === "4k" ? "4K" : target;
}

function prepositionForTarget(target: SourceQualityTargetId): string {
  // "Excellent for 1080p" / "May look soft at 4K" / "Quality cannot be estimated for 1080p"
  if (target === "4k") {
    return "at";
  }
  return "for";
}

function ratingLabelFor(
  rating: SourceQualityCreatorRating,
  target: SourceQualityTargetId,
): string {
  const word = RATING_WORD[rating];
  const label = targetDisplayLabel(target);
  if (rating === "cannot_estimate") {
    return `${word} for ${label}`;
  }
  if (rating === "may_look_soft" || rating === "significant_enlargement") {
    return `${word} at ${label}`;
  }
  return `${word} ${prepositionForTarget(target)} ${label}`;
}

function ratingFromDetailClass(
  detailClass: SourceQualityDetailClass | null | undefined,
): SourceQualityCreatorRating {
  if (detailClass == null) {
    return "cannot_estimate";
  }
  switch (detailClass) {
    case "native_or_downsampled":
      return "excellent";
    case "mild_upscale":
      return "good";
    case "material_upscale":
      return "may_look_soft";
    case "severe_upscale":
      return "significant_enlargement";
    default:
      return "cannot_estimate";
  }
}

function percentLabel(fraction: number): string {
  const pct = Math.round(fraction * 100);
  return `${pct}%`;
}

function formatScale(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function pickTargetReadiness(
  assessment: SourceQualityAssessment,
  exportTarget: SourceQualityTargetId,
): SourceQualityTargetReadiness | null {
  return (
    assessment.targets.find((entry) => entry.targetId === exportTarget) ?? null
  );
}

function buildExplanation(input: {
  readonly assessment: SourceQualityAssessment;
  readonly target: SourceQualityTargetId;
  readonly readiness: SourceQualityTargetReadiness | null;
}): string {
  const { assessment, target, readiness } = input;
  const label = targetDisplayLabel(target);

  if (!assessment.hasMedia) {
    return "Quality guidance will appear after media is attached. Export remains available.";
  }

  if (
    assessment.summaryKey === "unknown" ||
    assessment.warningCodes.includes("SOURCE_DIMENSIONS_UNKNOWN") ||
    readiness?.detailClass == null
  ) {
    return `Source dimensions are unavailable, so quality cannot be estimated for ${label}. Export is still available.`;
  }

  const softness = readiness.softnessCause ?? "none";
  const retained = readiness.retainedSourceAreaFraction;
  const coverage = readiness.frameCoverageFraction;
  const sentences: string[] = [];

  const pushUnique = (sentence: string) => {
    if (!sentences.includes(sentence)) {
      sentences.push(sentence);
    }
  };

  if (softness === "none") {
    pushUnique(`This source should remain sharp at ${label}.`);
  } else if (softness === "aspect_conversion") {
    pushUnique(
      `Converting this source to a vertical ${label} frame requires enlargement.`,
    );
  } else if (softness === "authored_zoom") {
    pushUnique(
      `This framing enlarges each source pixel enough that ${label} may look soft.`,
    );
  } else if (softness === "combined") {
    if (assessment.suitableFor1080p && target === "4k") {
      pushUnique(
        `The source supports 1080p, but this zoom may look soft at ${label}.`,
      );
    } else {
      pushUnique(
        `Aspect conversion and zoom together may look soft at ${label}.`,
      );
    }
  } else {
    // source_dimensions
    pushUnique(
      `This source’s resolution may look soft at ${label} under the current framing.`,
    );
  }

  if (
    assessment.framingFitMode === "fill" &&
    retained != null &&
    retained < 0.5
  ) {
    pushUnique(
      `Current framing retains approximately ${percentLabel(retained)} of the source.`,
    );
  }

  if (
    assessment.framingFitMode === "fit" &&
    coverage != null &&
    coverage < 0.95
  ) {
    if (assessment.backgroundTreatment === "blurred_fill") {
      pushUnique(
        "Fit with background keeps the full sharp foreground visible and fills the rest of the canvas with a blurred copy of the same source.",
      );
    } else {
      pushUnique(
        "Fit preserves the complete video but leaves part of the vertical canvas uncovered.",
      );
    }
  }

  return sentences.join(" ");
}

function buildSuggestions(input: {
  readonly assessment: SourceQualityAssessment;
  readonly target: SourceQualityTargetId;
  readonly readiness: SourceQualityTargetReadiness | null;
}): {
  readonly codes: readonly SourceQualityCreatorSuggestionCode[];
  readonly messages: readonly string[];
} {
  const { assessment, target, readiness } = input;
  if (!assessment.hasMedia || readiness?.detailClass == null) {
    return { codes: Object.freeze([]), messages: Object.freeze([]) };
  }

  const codes: SourceQualityCreatorSuggestionCode[] = [];
  const push = (code: SourceQualityCreatorSuggestionCode) => {
    if (!codes.includes(code)) {
      codes.push(code);
    }
  };

  const zoom = assessment.authoredZoom ?? 1;
  const softness = readiness.softnessCause ?? "none";
  const rating = ratingFromDetailClass(readiness.detailClass);
  const soft =
    rating === "may_look_soft" || rating === "significant_enlargement";

  if (zoom > 1 && soft) {
    push("reduce_zoom");
  }
  if (
    zoom > 1 &&
    (softness === "authored_zoom" || softness === "combined")
  ) {
    push("reposition_instead_of_zoom");
  }
  if (
    assessment.framingFitMode === "fill" &&
    (assessment.warningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP") ||
      softness === "aspect_conversion" ||
      softness === "combined")
  ) {
    push("switch_to_fit");
  }
  if (
    target === "4k" &&
    !assessment.suitableFor4k &&
    (assessment.suitableFor1080p || soft)
  ) {
    push("choose_1080p_instead_of_4k");
  }
  if (
    assessment.framingFitMode === "fit" &&
    readiness.frameCoverageFraction != null &&
    readiness.frameCoverageFraction < 0.95 &&
    assessment.backgroundTreatment !== "blurred_fill"
  ) {
    push("use_fit_with_background");
  }

  return {
    codes: Object.freeze(codes),
    messages: Object.freeze(codes.map((code) => SUGGESTION_COPY[code])),
  };
}

function buildDetails(
  readiness: SourceQualityTargetReadiness | null,
  assessment: SourceQualityAssessment,
): readonly SourceQualityCreatorGuidanceDetail[] {
  if (!assessment.hasMedia) {
    return Object.freeze([]);
  }

  const details: SourceQualityCreatorGuidanceDetail[] = [];

  if (
    assessment.metrics.width != null &&
    assessment.metrics.height != null
  ) {
    details.push({
      label: "Source dimensions",
      value: `${assessment.metrics.width} × ${assessment.metrics.height}`,
    });
  } else {
    details.push({ label: "Source dimensions", value: "Unavailable" });
  }

  details.push({
    label: "Framing",
    value:
      assessment.backgroundTreatment === "blurred_fill" &&
      assessment.framingFitMode === "fit"
        ? "Fit with background"
        : assessment.framingFitMode === "fill"
          ? "Fill frame"
          : "Fit inside frame",
  });

  if (assessment.authoredZoom != null) {
    details.push({
      label: "Authored zoom",
      value: `${formatScale(assessment.authoredZoom)}×`,
    });
  }

  if (readiness?.baseScale != null) {
    details.push({
      label: "Base scale",
      value: formatScale(readiness.baseScale),
    });
  }
  if (readiness?.activeScale != null) {
    details.push({
      label: "Active scale",
      value: formatScale(readiness.activeScale),
    });
  }
  if (readiness?.sourcePixelsPerOutputPixel != null) {
    details.push({
      label: "Source pixels per output pixel",
      value: formatScale(readiness.sourcePixelsPerOutputPixel),
    });
  }
  if (readiness?.retainedSourceAreaFraction != null) {
    details.push({
      label: "Source area retained",
      value: percentLabel(readiness.retainedSourceAreaFraction),
    });
  }
  if (readiness?.frameCoverageFraction != null) {
    details.push({
      label: "Output frame coverage",
      value: percentLabel(readiness.frameCoverageFraction),
    });
  }
  if (readiness?.retainedSourceRegion) {
    details.push({
      label: "Retained source region",
      value: `${formatScale(readiness.retainedSourceRegion.width)} × ${formatScale(readiness.retainedSourceRegion.height)}`,
    });
  }

  return Object.freeze(details);
}

/**
 * Map an existing assessment + selected export target to creator-facing copy.
 * Deterministic, provider-free, and never blocks export.
 */
export function presentSourceQualityGuidance(input: {
  readonly assessment: SourceQualityAssessment;
  readonly exportTarget: SourceQualityTargetId;
}): SourceQualityCreatorGuidance {
  const exportTarget =
    input.exportTarget === "720p" ||
    input.exportTarget === "1080p" ||
    input.exportTarget === "4k"
      ? input.exportTarget
      : "1080p";

  const readiness = pickTargetReadiness(input.assessment, exportTarget);

  let rating: SourceQualityCreatorRating;
  if (!input.assessment.hasMedia) {
    rating = "cannot_estimate";
  } else if (
    input.assessment.summaryKey === "unknown" ||
    input.assessment.warningCodes.includes("SOURCE_DIMENSIONS_UNKNOWN") ||
    readiness?.detailClass == null
  ) {
    rating = "cannot_estimate";
  } else {
    rating = ratingFromDetailClass(readiness.detailClass);
  }

  const suggestions = buildSuggestions({
    assessment: input.assessment,
    target: exportTarget,
    readiness,
  });

  return Object.freeze({
    exportTarget,
    rating,
    ratingLabel: ratingLabelFor(rating, exportTarget),
    explanation: buildExplanation({
      assessment: input.assessment,
      target: exportTarget,
      readiness,
    }),
    suggestions: suggestions.messages,
    suggestionCodes: suggestions.codes,
    details: buildDetails(readiness, input.assessment),
    blocksExport: false,
  });
}

/**
 * Map persisted browser export resolution to a Source Quality target id.
 * Headless 4K must pass `exportTarget: "4k"` explicitly.
 */
export function resolveSourceQualityTargetFromExportResolution(
  resolution: string | null | undefined,
): SourceQualityTargetId {
  if (resolution === "720x1280") {
    return "720p";
  }
  return "1080p";
}

/** Softness cause labels for optional technical details (not primary copy). */
export function describeSourceQualitySoftnessCause(
  cause: SourceQualitySoftnessCause | null | undefined,
): string | null {
  if (cause == null || cause === "none") {
    return null;
  }
  switch (cause) {
    case "source_dimensions":
      return "Source resolution";
    case "aspect_conversion":
      return "Aspect-ratio conversion";
    case "authored_zoom":
      return "Authored zoom";
    case "combined":
      return "Aspect conversion and zoom";
    default:
      return null;
  }
}
