/**
 * Production export preparation gateway (Sprint 6B).
 * Sole supported route into browser rendering.
 */

import type { FootieScript } from "@/features/story/types";
import type { FootieExportOptions } from "@/features/export/utils/export-quality.utils";
import { prepareStoryVoiceoverForExport } from "@/features/drafts";
import { prepareStoryForExport } from "@/features/export/utils/export-preflight.utils";
import { resolveExportSettings } from "@/features/export/utils/export-settings.utils";
import { isExportBackgroundMusicActiveFromMix } from "@/features/export/utils/export-background-music.utils";
import { buildAudioMixFromStory } from "@/features/audio";
import {
  resolveVisualPacingExportGuidance,
  type VisualPacingExportGuidanceCode,
} from "@/features/visual-beat-density/adapters/resolve-visual-pacing-export-guidance";
import {
  resolveSourceQualityExportGuidance,
  type SourceQualityExportGuidanceCode,
  type SourceQualityExportTarget,
} from "@/features/source-quality/adapters/resolve-source-quality-export-guidance";

import { probeExportMp4Runtime } from "@/features/export/formats/export-runtime-codec-probe";

import { getSceneEngagementOverlay } from "@/features/engagement-overlays/domain/normalize-engagement-overlays";
import { projectEngagementOverlayToManifest } from "@/features/engagement-overlays/domain/project-engagement-overlay-to-manifest";

import { buildExportManifest } from "./build-export-manifest";
import type {
  ExportCapabilityResult,
  ExportWarning,
  ExportWarningCode,
  PreparedExportRequest,
} from "./export-capability.types";
import { ExportPreflightError } from "./export-capability.types";
import type { ExportEnvironmentSnapshot } from "./export-manifest.types";
import { EXPORT_WARNING_MESSAGES } from "./export-preflight.constants";
import { runExportCapabilityPreflight } from "./run-export-capability-preflight";

export interface PrepareExportRequestInput {
  readonly story: FootieScript;
  readonly options?: FootieExportOptions;
  readonly includeBackgroundMusic?: boolean;
  readonly environment?: Partial<ExportEnvironmentSnapshot>;
  /**
   * When true, throw ExportPreflightError if renderer is not "browser".
   * Production export entry uses this.
   */
  readonly throwIfBlocked?: boolean;
  /**
   * When false, first-item-only manifest (regression tests only).
   * Default true — production multi-image ExportManifest v2.
   * Domain builders never read environment variables for this flag.
   */
  readonly multiImageScenesEnabled?: boolean;
  /**
   * Explicit `mixed-media-scenes-v1` decision.
   * Default false (fail-closed). Resolved by UI context or server gate —
   * never derived from environment variables inside this module.
   */
  readonly mixedMediaScenesEnabled?: boolean;
  /** Explicit keyframed visual-effects capability; defaults false. */
  readonly keyframedVisualEffectsEnabled?: boolean;
  /** Explicit engagement-overlays capability; defaults false. */
  readonly engagementOverlaysEnabled?: boolean;
  /**
   * Explicit Visual pacing authoring capability.
   * Default ignored/fail-closed. Guidance only — never a renderer requirement.
   */
  readonly visualBeatDensityEnabled?: boolean;
  /**
   * Explicit source-quality authoring capability.
   * Default ignored/fail-closed. Guidance only — never a renderer requirement.
   */
  readonly sourceQualityIntelligenceEnabled?: boolean;
  /**
   * Actual requested output target for source-quality guidance.
   * Headless 4K must pass "4k" even when ExportManifest stays 1080p.
   * When omitted, derived from export settings (720p/1080p only).
   */
  readonly sourceQualityExportTarget?: SourceQualityExportTarget;
}

function resolveSourceQualityExportTargetFromSettings(
  input: PrepareExportRequestInput,
  exportSettingsResolution: string | undefined,
): SourceQualityExportTarget {
  const explicit =
    input.sourceQualityExportTarget ??
    input.options?.sourceQualityExportTarget;
  if (explicit === "720p" || explicit === "1080p" || explicit === "4k") {
    return explicit;
  }
  return exportSettingsResolution === "720x1280" ? "720p" : "1080p";
}

export interface PrepareExportRequestResult extends PreparedExportRequest {
  /** Story copy used for manifest + temporary renderer adapter. */
  readonly exportStory: FootieScript;
  readonly preparedStory: ReturnType<typeof prepareStoryForExport>;
}

/**
 * Build manifest → preflight → renderer selection.
 * Does not preload media, create canvas, load FFmpeg, or start MediaRecorder.
 */
export async function prepareExportRequest(
  input: PrepareExportRequestInput,
): Promise<PrepareExportRequestResult> {
  const mixedMediaScenesEnabled = input.mixedMediaScenesEnabled === true;
  const visualBeatDensityEnabled = input.visualBeatDensityEnabled === true;
  const sourceQualityIntelligenceEnabled =
    input.sourceQualityIntelligenceEnabled === true ||
    input.options?.sourceQualityIntelligenceEnabled === true;
  const keyframedVisualEffectsEnabled =
    input.keyframedVisualEffectsEnabled === true ||
    input.options?.keyframedVisualEffectsEnabled === true;
  const engagementOverlaysEnabled =
    input.engagementOverlaysEnabled === true ||
    input.options?.engagementOverlaysEnabled === true;
  const voiceoverPrepared = prepareStoryVoiceoverForExport(input.story);
  // Timing authority only — authoring guidance is appended once below.
  const preparedStory = prepareStoryForExport(voiceoverPrepared, {
    mixedMediaScenesEnabled,
  });
  const exportSettings = resolveExportSettings(voiceoverPrepared, input.options);
  const sourceQualityExportTarget = resolveSourceQualityExportTargetFromSettings(
    input,
    exportSettings.resolution,
  );
  const audioMix = buildAudioMixFromStory(preparedStory.story);
  const includeBackgroundMusic =
    input.includeBackgroundMusic ?? isExportBackgroundMusicActiveFromMix(audioMix);

  // Sprint 6F — real runtime MP4 probe before capability snapshot / preflight.
  const mp4Probe =
    input.environment?.mp4EncoderAvailable !== undefined
      ? null
      : await probeExportMp4Runtime();
  const mp4EncoderAvailable =
    input.environment?.mp4EncoderAvailable ?? mp4Probe?.mp4Available ?? false;

  const multiImageScenesEnabled = input.multiImageScenesEnabled !== false;

  const manifest = buildExportManifest({
    story: preparedStory.story,
    prepared: preparedStory,
    exportSettings,
    audioMode: input.options?.audioMode ?? "silent",
    includeBackgroundMusic,
    multiImageScenesEnabled,
    mixedMediaScenesEnabled,
    keyframedVisualEffectsEnabled,
    engagementOverlaysEnabled,
    environment: {
      ...input.environment,
      mp4EncoderAvailable,
    },
  });

  const basePreflight = runExportCapabilityPreflight(manifest);
  // Single authority for Visual pacing + source-quality export guidance: final
  // prepared story after voiceover refit + visual-sequence reconciliation
  // (not prepareStoryForExport string warnings, not manifest build).
  const pacingGuidance = resolveVisualPacingExportGuidance(preparedStory.story, {
    visualBeatDensityEnabled,
  });
  const pacingWarnings: ExportWarning[] = pacingGuidance.map((item) => {
    const code = item.code as ExportWarningCode & VisualPacingExportGuidanceCode;
    return {
      code,
      message: EXPORT_WARNING_MESSAGES[code] ?? item.message,
    };
  });
  const sourceQualityGuidance = resolveSourceQualityExportGuidance(
    preparedStory.story,
    {
      sourceQualityIntelligenceEnabled,
      mixedMediaScenesEnabled,
      exportTarget: sourceQualityExportTarget,
    },
  );
  const sourceQualityWarnings: ExportWarning[] = sourceQualityGuidance.map(
    (item) => {
      const code = item.code as ExportWarningCode & SourceQualityExportGuidanceCode;
      return {
        code,
        // Prefer adapter copy so MAY_UPSCALE keeps the requested target label.
        message: item.message || EXPORT_WARNING_MESSAGES[code],
      };
    },
  );
  const engagementWarnings: ExportWarning[] = [];
  if (engagementOverlaysEnabled) {
    for (const scene of preparedStory.story.scenes) {
      const authored = getSceneEngagementOverlay(preparedStory.story, scene.id);
      if (!authored) continue;
      const durationMs = Math.max(
        1,
        Math.round(scene.durationMs ?? (scene.duration ?? 0) * 1000),
      );
      const projected = projectEngagementOverlayToManifest(
        authored,
        durationMs,
        true,
      );
      if (!projected.overlay && projected.warnings.length > 0) {
        engagementWarnings.push({
          code: "ENGAGEMENT_OVERLAY_OMITTED",
          message:
            projected.warnings[0] ??
            EXPORT_WARNING_MESSAGES.ENGAGEMENT_OVERLAY_OMITTED,
        });
      }
    }
  }
  const preflight: ExportCapabilityResult = {
    ...basePreflight,
    warnings: Object.freeze([
      ...basePreflight.warnings,
      ...pacingWarnings,
      ...sourceQualityWarnings,
      ...engagementWarnings,
    ]),
  };
  const renderer = preflight.renderer;

  logExportPreflightDiagnostics(manifest.fingerprint, preflight, renderer, manifest);

  if (input.throwIfBlocked !== false && renderer !== "browser") {
    throw new ExportPreflightError(preflight, manifest.fingerprint);
  }

  return {
    manifest,
    preflight,
    renderer,
    exportStory: preparedStory.story,
    preparedStory,
  };
}

export function isExportPreflightError(value: unknown): value is ExportPreflightError {
  return value instanceof ExportPreflightError;
}

function logExportPreflightDiagnostics(
  fingerprint: string,
  preflight: ExportCapabilityResult,
  renderer: PrepareExportRequestResult["renderer"],
  manifest: { output: { format: string; resolution: string }; project: { renderDurationMs: number }; scenes: readonly unknown[] },
): void {
  if (
    process.env.SHORTFORGE_EXPORT_DEBUG !== "1" &&
    process.env.NEXT_PUBLIC_SHORTFORGE_EXPORT_DEBUG !== "1"
  ) {
    return;
  }

  const videoSceneCount = (
    manifest.scenes as Array<{
      media?: { type?: string };
      mediaTimeline?: { items?: Array<{ media?: { type?: string } }> };
    }>
  ).reduce((count, scene) => {
    const items = scene.mediaTimeline?.items;
    if (items && items.length > 0) {
      return count + items.filter((item) => item.media?.type === "video").length;
    }
    return count + (scene.media?.type === "video" ? 1 : 0);
  }, 0);

  console.info("[ExportPreflight]", {
    fingerprint,
    renderer,
    supported: preflight.supported,
    format: manifest.output.format,
    resolution: manifest.output.resolution,
    durationMs: manifest.project.renderDurationMs,
    frameCount: preflight.estimatedCost.estimatedFrames,
    videoSceneCount,
    estimatedPeakMemoryBytes: preflight.estimatedCost.estimatedPeakMemoryBytes,
    durationClass: preflight.estimatedCost.durationClass,
    risk: preflight.estimatedCost.risk,
    warnings: preflight.warnings.map((w) => w.code),
    blockers: preflight.blockers.map((b) => b.code),
  });
}
