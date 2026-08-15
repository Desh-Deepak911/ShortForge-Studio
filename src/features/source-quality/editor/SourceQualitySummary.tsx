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
  useSubjectAwareReframingEnabled,
  useVisualRetentionCapabilitiesReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import { studioSubtleText } from "@/lib/utils/studioUi";

import { resolveSourceQualityMedia } from "../adapters/resolve-source-quality-media";
import { assessSourceQuality } from "../domain/assess-source-quality";
import type {
  SourceQualityAssessment,
  SourceQualityTargetId,
} from "../domain/source-quality-assessment";
import {
  presentSourceQualityGuidance,
  resolveSourceQualityTargetFromExportResolution,
} from "../domain/present-source-quality-guidance";
import {
  recommendSafeVisualAdjustment,
  type SourceQualitySafeAdjustmentRecommendation,
} from "../domain/safe-visual-adjustment-recommendation";
import SourceQualityAdjustmentControls from "./SourceQualityAdjustmentControls";
import SubjectAwareFramingControls from "./SubjectAwareFramingControls";

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
    | "fitMode"
    | "positionX"
    | "positionY"
    | "zoom"
    | "rotationDeg"
    | "backgroundTreatment"
  >;
  /**
   * Winning command media-item id paired with `media`. Must be the resolved
   * target id (live, nearest survivor, or first projected) — never a stale
   * selection id that does not match `media`.
   */
  readonly mediaItemId?: string | null;
  readonly mixedMediaScenesEnabled?: boolean;
  /**
   * Selected export target for creator-facing guidance.
   * Defaults from `script.exportSettings.resolution` (720p/1080p).
   * Pass `"4k"` explicitly when certifying Headless 4K guidance.
   */
  readonly exportTarget?: SourceQualityTargetId;
  /**
   * Optional readiness override for verification harnesses.
   * Production mounts omit this and read the shared capability snapshot.
   */
  readonly readiness?: {
    readonly ready: boolean;
    readonly enabled: boolean;
    /** Optional subject-aware override for verification harnesses. */
    readonly subjectAwareEnabled?: boolean;
  };
}

const FACT_KEY_BY_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "Source dimensions": "dimensions",
  Framing: "framing",
});

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

function resolveExportTarget(
  explicit: SourceQualityTargetId | undefined,
  script: FootieScript | undefined,
): SourceQualityTargetId {
  if (explicit === "720p" || explicit === "1080p" || explicit === "4k") {
    return explicit;
  }
  return resolveSourceQualityTargetFromExportResolution(
    script?.exportSettings?.resolution,
  );
}

/**
 * Compact source-quality summary for the Scene Inspector Media section.
 * Capability-gated and fail-closed. Adjustment actions live only in expanded Details.
 * Guidance is advisory only — never blocks export or mutates framing.
 */
export default function SourceQualitySummary({
  scene,
  script,
  onScriptChange,
  media,
  framing,
  mediaItemId,
  mixedMediaScenesEnabled = false,
  exportTarget: exportTargetProp,
  readiness,
}: SourceQualitySummaryProps) {
  const hookReady = useVisualRetentionCapabilitiesReady();
  const hookEnabled = useSourceQualityIntelligenceEnabled();
  const hookSubjectAware = useSubjectAwareReframingEnabled();
  const ready = readiness?.ready ?? hookReady;
  const enabled = readiness?.enabled ?? hookEnabled;
  const subjectAwareEnabled =
    readiness?.subjectAwareEnabled ?? hookSubjectAware;
  const detailsId = useId();
  const detailsToggleRef = useRef<HTMLButtonElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const exportTarget = resolveExportTarget(exportTargetProp, script);

  const { assessment, recommendation, resolvedMedia, resolvedFraming, guidance } =
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
      const nextGuidance = presentSourceQualityGuidance({
        assessment: nextAssessment,
        exportTarget,
      });
      return {
        assessment: nextAssessment,
        recommendation: nextRecommendation,
        resolvedMedia: nextMedia,
        resolvedFraming: nextFraming,
        guidance: nextGuidance,
      };
    }, [exportTarget, framing, media, mediaItemId, scene]);

  if (!ready || !enabled) {
    return null;
  }

  const suggestion =
    recommendation.recommendationCodes.length > 0
      ? recommendationPreviewCopy(recommendation)
      : null;
  const canMountControls =
    Boolean(script) &&
    typeof onScriptChange === "function" &&
    assessment.hasMedia;
  const canMountSubjectAware =
    canMountControls && ready && enabled && subjectAwareEnabled;

  // Prefer creator guidance suggestions; fall back to adjustment preview lines
  // without duplicating identical text in the collapsed summary.
  const summarySuggestions = guidance.suggestions;
  const detailSuggestionLines = dedupeLines([
    ...summarySuggestions,
    ...(suggestion?.lines ?? []),
  ]);

  return (
    <section
      className="mb-3 min-w-0 rounded-xl bg-background/20 px-3 py-2.5 ring-1 ring-border/30"
      data-source-quality-summary=""
      data-source-quality-status={assessment.status}
      data-source-quality-summary-key={assessment.summaryKey}
      data-source-quality-rating={guidance.rating}
      data-source-quality-export-target={guidance.exportTarget}
      data-source-quality-blocks-export={guidance.blocksExport ? "true" : "false"}
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
            data-source-quality-rating-label=""
          >
            <span className="truncate">{guidance.ratingLabel}</span>
          </p>
          <p
            className={`${studioSubtleText} mt-1.5 text-[11px] leading-snug`}
            data-source-quality-explanation=""
          >
            {guidance.explanation}
          </p>
          {summarySuggestions.length > 0 ? (
            <ul
              className="mt-1.5 space-y-1"
              data-source-quality-suggestions=""
            >
              {summarySuggestions.map((line) => (
                <li
                  key={line}
                  className="text-[11px] leading-snug text-foreground/85"
                  data-source-quality-suggestion-line=""
                >
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          <p className={`${studioSubtleText} mt-1.5 text-[11px] leading-snug`}>
            Export remains available. Framing is not changed automatically.
          </p>
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
            {guidance.details.map((fact) => (
              <FactRow
                key={fact.label}
                label={fact.label}
                value={fact.value}
                factKey={FACT_KEY_BY_LABEL[fact.label]}
              />
            ))}
            {assessment.metrics.mediaType ? (
              <FactRow
                label="Media type"
                value={assessment.metrics.mediaType}
                capitalize
                factKey="media-type"
              />
            ) : null}
            {assessment.metrics.mimeType ? (
              <FactRow
                label="MIME"
                value={assessment.metrics.mimeType}
                factKey="mime-type"
              />
            ) : null}
          </dl>
          {assessment.targets.length > 0 ? (
            <ul className="space-y-1" data-source-quality-targets="">
              {assessment.targets.map((target) => {
                const targetGuidance = presentSourceQualityGuidance({
                  assessment,
                  exportTarget: target.targetId,
                });
                return (
                  <li
                    key={target.targetId}
                    className="text-[11px] leading-snug text-muted"
                    data-source-quality-target={target.targetId}
                    data-source-quality-target-upscale={
                      target.mayUpscale ? "true" : "false"
                    }
                    data-source-quality-target-rating={targetGuidance.rating}
                  >
                    <span className="font-medium text-foreground/80">
                      {targetGuidance.ratingLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {detailSuggestionLines.length > 0 ? (
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
                {detailSuggestionLines.map((line) => (
                  <li
                    key={line}
                    className="text-[11px] leading-snug text-foreground/85"
                  >
                    {line}
                  </li>
                ))}
              </ul>
              {suggestion?.improvement ? (
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
          {canMountSubjectAware && script && onScriptChange ? (
            <SubjectAwareFramingControls
              script={script}
              scene={scene}
              media={resolvedMedia}
              framing={resolvedFraming}
              mediaItemId={mediaItemId}
              onScriptChange={onScriptChange}
              subjectAwareReframingEnabled={subjectAwareEnabled}
              mixedMediaScenesEnabled={mixedMediaScenesEnabled}
              detailsToggleRef={detailsToggleRef}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FactRow({
  label,
  value,
  capitalize = false,
  factKey,
}: {
  readonly label: string;
  readonly value: string;
  readonly capitalize?: boolean;
  readonly factKey?: string;
}) {
  const key =
    factKey ??
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd
        className={`min-w-0 truncate text-foreground/85${capitalize ? " capitalize" : ""}`}
        data-source-quality-fact={key}
      >
        {value}
      </dd>
    </>
  );
}

function dedupeLines(lines: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(line);
  }
  return out;
}

/** @internal test helper — assessment shape still exported for harnesses. */
export type { SourceQualityAssessment };
