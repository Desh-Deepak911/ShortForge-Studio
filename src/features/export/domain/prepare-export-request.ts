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

import { probeExportMp4Runtime } from "@/features/export/formats/export-runtime-codec-probe";

import { buildExportManifest } from "./build-export-manifest";
import type { ExportCapabilityResult, PreparedExportRequest } from "./export-capability.types";
import { ExportPreflightError } from "./export-capability.types";
import type { ExportEnvironmentSnapshot } from "./export-manifest.types";
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
   * Domain builders never read process.env.
   */
  readonly multiImageScenesEnabled?: boolean;
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
  const voiceoverPrepared = prepareStoryVoiceoverForExport(input.story);
  const preparedStory = prepareStoryForExport(voiceoverPrepared);
  const exportSettings = resolveExportSettings(voiceoverPrepared, input.options);
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
    environment: {
      ...input.environment,
      mp4EncoderAvailable,
    },
  });

  const preflight = runExportCapabilityPreflight(manifest);
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
