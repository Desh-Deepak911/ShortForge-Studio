"use client";

import { useId, useMemo, useRef, useState } from "react";

import {
  resolveSceneMediaFraming,
  type SceneMediaFraming,
} from "@/features/media-framing";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import type { StoryScriptChangeOptions } from "@/lib/utils/voiceover";
import {
  useSourceQualityIntelligenceEnabled,
  useVisualRetentionCapabilitiesReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import { studioSubtleText } from "@/lib/utils/studioUi";

import { resolveSourceQualityMedia } from "../adapters/resolve-source-quality-media";
import { assessSourceQuality } from "../domain/assess-source-quality";
import type {
  SourceQualityAssessment,
  SourceQualityWarningCode,
} from "../domain/source-quality-assessment";
import {
  recommendSafeVisualAdjustment,
  type SourceQualitySafeAdjustmentRecommendation,
} from "../domain/safe-visual-adjustment-recommendation";
import SourceQualityAdjustmentControls from "./SourceQualityAdjustmentControls";

export interface SourceQualitySummaryProps {
  readonly scene: FootieScene;
  readonly script?: FootieScript;
  readonly onScriptChange?: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
  /**
   * Winning projected media for the current inspector selection.
   * When omitted, falls back via assessment-only resolveSourceQualityMedia.
   */
  readonly media?: SceneMedia | null;
  readonly framing?: Pick<
    SceneMediaFraming,
    "fitMode" | "positionX" | "positionY" | "zoom" | "rotationDeg"
  >;
  /**
   * Winning command media-item id paired with `media`. Must be the resolved
   * target id (live, nearest survivor, or first projected) — never a stale
   * selection id that does not match `media`.
   */
  readonly mediaItemId?: string | null;
  readonly mixedMediaScenesEnabled?: boolean;
  /**
   * Optional readiness override for verification harnesses.
   * Production mounts omit this and read the shared capability snapshot.
   */
  readonly readiness?: {
    readonly ready: boolean;
    readonly enabled: boolean;
  };
}

const WARNING_COPY: Record<SourceQualityWarningCode, string> = {
  SOURCE_DIMENSIONS_UNKNOWN:
    "Source dimensions are unavailable for quality guidance.",
  SOURCE_MAY_UPSCALE_AT_720P: "This source may look soft at 720p.",
  SOURCE_MAY_UPSCALE_AT_1080P: "This source may look soft at 1080p.",
  SOURCE_MAY_UPSCALE_AT_4K: "4K export may upscale this source.",
  SOURCE_ASPECT_RATIO_MISMATCH:
    "This source’s shape differs from the vertical frame.",
  SOURCE_AGGRESSIVE_VERTICAL_CROP:
    "Vertical fill may crop a large part of this source.",
};

function badgeLabel(assessment: SourceQualityAssessment): string {
  if (!assessment.hasMedia) {
    return "No media";
  }
  if (assessment.summaryKey === "unknown") {
    return "Source details unavailable";
  }
  if (assessment.summaryKey === "suitable_1080p") {
    return "Suitable for 1080p";
  }
  return "Quality guidance";
}

function supportingCopy(assessment: SourceQualityAssessment): string | null {
  if (!assessment.hasMedia) {
    return "Quality guidance will appear after media is attached.";
  }
  if (assessment.summaryKey === "unknown") {
    return "Preview and export can still continue. Quality guidance will improve when dimensions are available.";
  }
  if (assessment.summaryKey === "suitable_1080p") {
    return assessment.suitableFor4k
      ? "This source can render at 1080p and 4K without upscaling under the current framing."
      : "This source can render at 1080p without upscaling under the current framing. 4K may still upscale.";
  }
  const firstWarning = assessment.warningCodes.find(
    (code) => code !== "SOURCE_DIMENSIONS_UNKNOWN",
  );
  if (firstWarning) {
    return WARNING_COPY[firstWarning];
  }
  return "Review target readiness below. Editing and export stay available.";
}

function recommendationPreviewCopy(
  recommendation: SourceQualitySafeAdjustmentRecommendation,
): {
  readonly lines: readonly string[];
  readonly improvement: string | null;
} {
  const lines: string[] = [];
  if (recommendation.recommendationCodes.includes("USE_FIT_FRAMING")) {
    lines.push("Fit the full source inside the vertical frame.");
  }
  if (recommendation.recommendationCodes.includes("RESET_EXCESSIVE_ZOOM")) {
    lines.push("Return zoom to 1×.");
  }
  if (
    recommendation.recommendationCodes.includes("USE_HIGHER_RESOLUTION_SOURCE") &&
    !recommendation.applicable
  ) {
    lines.push(
      "Use a higher-resolution source. No safe framing adjustment applies.",
    );
  }
  for (const reason of recommendation.reasons) {
    if (
      reason.code === "USE_FIT_FRAMING" ||
      reason.code === "RESET_EXCESSIVE_ZOOM" ||
      reason.code === "USE_HIGHER_RESOLUTION_SOURCE"
    ) {
      continue;
    }
    if (reason.message && !lines.includes(reason.message)) {
      lines.push(reason.message);
    }
  }

  const removed = recommendation.currentWarningCodes.filter(
    (code) => !recommendation.projectedWarningCodes.includes(code),
  );
  let improvement: string | null = null;
  if (recommendation.applicable && removed.length > 0) {
    improvement =
      removed.length === 1
        ? "Projected improvement: one quality warning may clear under this framing."
        : `Projected improvement: ${removed.length} quality warnings may clear under this framing.`;
  }

  return { lines, improvement };
}

/**
 * Compact source-quality summary for the Scene Inspector Media section.
 * Capability-gated and fail-closed. Adjustment actions live only in expanded Details.
 */
export default function SourceQualitySummary({
  scene,
  script,
  onScriptChange,
  media,
  framing,
  mediaItemId,
  mixedMediaScenesEnabled = false,
  readiness,
}: SourceQualitySummaryProps) {
  const hookReady = useVisualRetentionCapabilitiesReady();
  const hookEnabled = useSourceQualityIntelligenceEnabled();
  const ready = readiness?.ready ?? hookReady;
  const enabled = readiness?.enabled ?? hookEnabled;
  const detailsId = useId();
  const detailsToggleRef = useRef<HTMLButtonElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { assessment, recommendation, resolvedMedia, resolvedFraming } =
    useMemo(() => {
      const nextMedia = resolveSourceQualityMedia({ scene, media });
      const nextFraming =
        framing ??
        resolveSceneMediaFraming(scene, {
          media: nextMedia,
        });
      const nextAssessment = assessSourceQuality({
        media: nextMedia,
        framing: nextFraming,
      });
      const nextRecommendation = recommendSafeVisualAdjustment({
        media: nextMedia,
        framing: nextFraming,
        mediaItemId,
      });
      return {
        assessment: nextAssessment,
        recommendation: nextRecommendation,
        resolvedMedia: nextMedia,
        resolvedFraming: nextFraming,
      };
    }, [framing, media, mediaItemId, scene]);

  if (!ready || !enabled) {
    return null;
  }

  const label = badgeLabel(assessment);
  const support = supportingCopy(assessment);
  const demotingWarnings = assessment.warningCodes.filter(
    (code) =>
      code !== "SOURCE_MAY_UPSCALE_AT_4K" || assessment.status === "warning",
  );
  const suggestion =
    recommendation.recommendationCodes.length > 0
      ? recommendationPreviewCopy(recommendation)
      : null;
  const canMountControls =
    Boolean(script) &&
    typeof onScriptChange === "function" &&
    assessment.hasMedia;

  return (
    <section
      className="mb-3 min-w-0 rounded-xl bg-background/20 px-3 py-2.5 ring-1 ring-border/30"
      data-source-quality-summary=""
      data-source-quality-status={assessment.status}
      data-source-quality-summary-key={assessment.summaryKey}
      aria-labelledby={`${detailsId}-heading`}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3
            id={`${detailsId}-heading`}
            className="text-[11px] font-semibold tracking-wide text-foreground/90"
          >
            Source quality
          </h3>
          <p
            className="mt-1 inline-flex max-w-full items-center rounded-md bg-surface-elevated/50 px-2 py-0.5 text-[11px] font-medium text-foreground/90 ring-1 ring-border/35"
            data-source-quality-badge=""
          >
            <span className="truncate">{label}</span>
          </p>
          {support ? (
            <p className={`${studioSubtleText} mt-1.5 text-[11px] leading-snug`}>
              {support}
            </p>
          ) : null}
        </div>
        {assessment.hasMedia ? (
          <button
            ref={detailsToggleRef}
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-muted underline-offset-2 transition hover:text-foreground/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            data-source-quality-details-toggle=""
            onClick={() => setDetailsOpen((open) => !open)}
          >
            {detailsOpen ? "Hide details" : "Details"}
          </button>
        ) : null}
      </div>

      {detailsOpen && assessment.hasMedia ? (
        <div
          id={detailsId}
          className="mt-2 space-y-2 border-t border-border/25 pt-2"
          data-source-quality-details=""
        >
          <dl
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px] leading-snug"
            data-source-quality-facts=""
          >
            <dt className="text-muted">Dimensions</dt>
            <dd
              className="min-w-0 truncate text-foreground/85"
              data-source-quality-fact="dimensions"
            >
              {assessment.metrics.width != null &&
              assessment.metrics.height != null
                ? `${assessment.metrics.width} × ${assessment.metrics.height}`
                : "Unavailable"}
            </dd>
            <dt className="text-muted">Media type</dt>
            <dd
              className="min-w-0 truncate text-foreground/85 capitalize"
              data-source-quality-fact="media-type"
            >
              {assessment.metrics.mediaType ?? "Unavailable"}
            </dd>
            {assessment.metrics.mimeType ? (
              <>
                <dt className="text-muted">MIME</dt>
                <dd
                  className="min-w-0 truncate text-foreground/85"
                  data-source-quality-fact="mime-type"
                >
                  {assessment.metrics.mimeType}
                </dd>
              </>
            ) : null}
            <dt className="text-muted">Framing</dt>
            <dd
              className="min-w-0 truncate text-foreground/85"
              data-source-quality-fact="framing"
            >
              {assessment.framingFitMode === "fill"
                ? "Fill frame"
                : "Fit inside frame"}
            </dd>
          </dl>
          {demotingWarnings.length > 0 ? (
            <ul className="space-y-1" data-source-quality-warnings="">
              {demotingWarnings.map((code) => (
                <li
                  key={code}
                  className="flex gap-2 text-[11px] leading-snug text-foreground/85"
                  data-source-quality-warning={code}
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/55"
                  />
                  <span>{WARNING_COPY[code]}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {assessment.targets.length > 0 ? (
            <ul className="space-y-1" data-source-quality-targets="">
              {assessment.targets.map((target) => (
                <li
                  key={target.targetId}
                  className="text-[11px] leading-snug text-muted"
                  data-source-quality-target={target.targetId}
                  data-source-quality-target-upscale={
                    target.mayUpscale ? "true" : "false"
                  }
                >
                  <span className="font-medium text-foreground/80">
                    {target.targetId === "4k"
                      ? "4K"
                      : target.targetId.toUpperCase()}
                  </span>
                  {": "}
                  {assessment.metrics.width == null
                    ? "dimensions unknown"
                    : target.mayUpscale
                      ? "may upscale"
                      : "ready without upscale"}
                </li>
              ))}
            </ul>
          ) : null}
          {suggestion && suggestion.lines.length > 0 ? (
            <div
              className="space-y-1.5"
              data-source-quality-suggestion=""
              data-source-quality-suggestion-applicable={
                recommendation.applicable ? "true" : "false"
              }
              data-source-quality-recommendation-fingerprint={
                recommendation.recommendationFingerprint
              }
            >
              <p className="text-[11px] font-medium text-foreground/85">
                Suggested adjustment
              </p>
              <ul className="space-y-1">
                {suggestion.lines.map((line) => (
                  <li
                    key={line}
                    className="text-[11px] leading-snug text-foreground/85"
                  >
                    {line}
                  </li>
                ))}
              </ul>
              {suggestion.improvement ? (
                <p
                  className="text-[11px] leading-snug text-muted"
                  data-source-quality-suggestion-improvement=""
                >
                  {suggestion.improvement}
                </p>
              ) : null}
              <p className={`${studioSubtleText} text-[11px] leading-snug`}>
                No changes are applied automatically.
              </p>
            </div>
          ) : null}
          {canMountControls && script && onScriptChange ? (
            <SourceQualityAdjustmentControls
              script={script}
              scene={scene}
              media={resolvedMedia}
              framing={resolvedFraming}
              mediaItemId={mediaItemId}
              onScriptChange={onScriptChange}
              sourceQualityIntelligenceEnabled={enabled}
              mixedMediaScenesEnabled={mixedMediaScenesEnabled}
              detailsToggleRef={detailsToggleRef}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
