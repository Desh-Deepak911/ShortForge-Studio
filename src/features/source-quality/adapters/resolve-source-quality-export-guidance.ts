/**
 * Recoverable source-quality export guidance.
 * Authoring assessment only — never a render authority or frozen-manifest field.
 */

import { resolveSceneMediaFraming } from "@/features/media-framing";
import { projectSceneVisualPlan } from "@/features/mixed-media-scenes/adapters/project-visual-sequence";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";

import { assessSourceQuality } from "../domain/assess-source-quality";
import type { SourceQualityTargetId } from "../domain/source-quality-assessment";
import { resolveSourceQualityMedia } from "./resolve-source-quality-media";

interface RenderedMediaAssessmentTarget {
  readonly scene: FootieScene;
  readonly media: SceneMedia;
  /** Sequence windows use item media framing; legacy uses scene dual-write. */
  readonly useItemMediaFraming: boolean;
}

export const SOURCE_QUALITY_EXPORT_GUIDANCE_CODES = {
  SOURCE_QUALITY_DIMENSIONS_UNKNOWN: "SOURCE_QUALITY_DIMENSIONS_UNKNOWN",
  SOURCE_QUALITY_MAY_UPSCALE: "SOURCE_QUALITY_MAY_UPSCALE",
  SOURCE_QUALITY_AGGRESSIVE_CROP: "SOURCE_QUALITY_AGGRESSIVE_CROP",
} as const;

export type SourceQualityExportGuidanceCode =
  (typeof SOURCE_QUALITY_EXPORT_GUIDANCE_CODES)[keyof typeof SOURCE_QUALITY_EXPORT_GUIDANCE_CODES];

export type SourceQualityExportTarget = SourceQualityTargetId;

export interface SourceQualityExportGuidanceItem {
  readonly code: SourceQualityExportGuidanceCode;
  readonly message: string;
}

export interface ResolveSourceQualityExportGuidanceInput {
  /**
   * Explicit authoring capability. Default ignored/fail-closed when not true.
   * Never read from environment here.
   */
  readonly sourceQualityIntelligenceEnabled?: boolean;
  /**
   * Explicit mixed-media capability for rendered-window projection.
   * Default ignored/fail-closed when not true.
   */
  readonly mixedMediaScenesEnabled?: boolean;
  /**
   * Actual requested output target. Headless 4K must pass "4k" even when the
   * frozen render contract remains 1080p.
   */
  readonly exportTarget?: SourceQualityExportTarget;
}

const UPSCALE_WARNING_BY_TARGET: Record<
  SourceQualityExportTarget,
  "SOURCE_MAY_UPSCALE_AT_720P" | "SOURCE_MAY_UPSCALE_AT_1080P" | "SOURCE_MAY_UPSCALE_AT_4K"
> = {
  "720p": "SOURCE_MAY_UPSCALE_AT_720P",
  "1080p": "SOURCE_MAY_UPSCALE_AT_1080P",
  "4k": "SOURCE_MAY_UPSCALE_AT_4K",
};

function targetLabel(target: SourceQualityExportTarget): string {
  return target === "4k" ? "4K" : target;
}

function messageForCode(
  code: SourceQualityExportGuidanceCode,
  exportTarget: SourceQualityExportTarget,
): string {
  if (code === SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_DIMENSIONS_UNKNOWN) {
    return "Some media dimensions are unavailable. Export will continue using the current framing.";
  }
  if (code === SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE) {
    return `Some media may be enlarged for this ${targetLabel(exportTarget)} export and could look soft.`;
  }
  return "Some media may be heavily cropped by the current vertical framing.";
}

function normalizeExportTarget(
  value: unknown,
): SourceQualityExportTarget {
  if (value === "720p" || value === "1080p" || value === "4k") {
    return value;
  }
  return "1080p";
}

function collectRenderedMedia(
  story: FootieScript,
  mixedMediaScenesEnabled: boolean,
): readonly RenderedMediaAssessmentTarget[] {
  const targets: RenderedMediaAssessmentTarget[] = [];
  for (const scene of story.scenes) {
    if (mixedMediaScenesEnabled) {
      const plan = projectSceneVisualPlan(scene, {
        mixedMediaScenesEnabled: true,
      });
      if (plan.windows.length > 0) {
        // Canonical reconciled windows win; ignore divergent stale scene.media.
        for (const window of plan.windows) {
          if (window.media) {
            targets.push({
              scene,
              media: window.media,
              useItemMediaFraming: true,
            });
          }
        }
        continue;
      }
    }

    const legacy = resolveSourceQualityMedia({ scene });
    if (legacy) {
      targets.push({
        scene,
        media: legacy,
        useItemMediaFraming: false,
      });
    }
  }
  return targets;
}

/**
 * Derive recoverable export guidance from a final export-prepared story.
 * Call only after timeline sync, voiceover refit, mixed-media reconciliation,
 * and media validation. Never blocks export; never mutates the story.
 */
export function resolveSourceQualityExportGuidance(
  preparedStory: FootieScript,
  input: ResolveSourceQualityExportGuidanceInput = {},
): readonly SourceQualityExportGuidanceItem[] {
  if (input.sourceQualityIntelligenceEnabled !== true) {
    return Object.freeze([]);
  }

  const mixedMediaScenesEnabled = input.mixedMediaScenesEnabled === true;
  const exportTarget = normalizeExportTarget(input.exportTarget);
  const upscaleAssessmentCode = UPSCALE_WARNING_BY_TARGET[exportTarget];
  const seen = new Set<SourceQualityExportGuidanceCode>();
  const items: SourceQualityExportGuidanceItem[] = [];

  const pushCode = (code: SourceQualityExportGuidanceCode) => {
    if (seen.has(code)) {
      return;
    }
    seen.add(code);
    items.push({
      code,
      message: messageForCode(code, exportTarget),
    });
  };

  for (const target of collectRenderedMedia(
    preparedStory,
    mixedMediaScenesEnabled,
  )) {
    const { media, scene, useItemMediaFraming } = target;
    const framing = useItemMediaFraming
      ? resolveSceneMediaFraming({ media }, { media })
      : resolveSceneMediaFraming(scene, { media });
    const assessment = assessSourceQuality({ media, framing });

    if (assessment.warningCodes.includes("SOURCE_DIMENSIONS_UNKNOWN")) {
      pushCode(
        SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_DIMENSIONS_UNKNOWN,
      );
    }
    if (assessment.warningCodes.includes(upscaleAssessmentCode)) {
      pushCode(SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_MAY_UPSCALE);
    }
    if (assessment.warningCodes.includes("SOURCE_AGGRESSIVE_VERTICAL_CROP")) {
      pushCode(
        SOURCE_QUALITY_EXPORT_GUIDANCE_CODES.SOURCE_QUALITY_AGGRESSIVE_CROP,
      );
    }
    // Aspect mismatch alone never becomes export guidance.
  }

  return Object.freeze(items);
}
