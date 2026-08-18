/**
 * Node-only certification timeline freeze (story + manifest fingerprints).
 * Browser harness must import bounds, not this file.
 */

import { createHash } from "node:crypto";

import { buildExportManifest, buildExportManifestFingerprint } from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";

import { buildPreviewRuntimeParityIntegratedCertificationStory } from "./build-preview-runtime-parity-integrated-certification-story";
import { applyPreviewRuntimeParityCertificationSceneTiming } from "./apply-preview-runtime-parity-certification-scene-timing";
import {
  resolvePreviewRuntimeParityCertificationBounds,
  type PreviewRuntimeParityCertificationBounds,
} from "./resolve-preview-runtime-parity-certification-bounds";

export {
  PREVIEW_RUNTIME_PARITY_CERT_FPS,
  PREVIEW_RUNTIME_PARITY_CERT_FRAME_DURATION_MS,
  collectCertificationSceneTiming,
  lastDecodableEncodedFrameMs,
  nearestCertificationFrameTimeMs,
  resolvePreviewRuntimeParityCertificationBounds,
  type LastDecodableFrameClassification,
  type PreviewRuntimeParityCertificationBounds,
  type PreviewRuntimeParityCertificationSceneTimingRow,
} from "./resolve-preview-runtime-parity-certification-bounds";

export interface PreviewRuntimeParityCertificationTimeline
  extends PreviewRuntimeParityCertificationBounds {
  readonly story: FootieScript;
  readonly frozenStoryFingerprint: string;
  readonly manifestFingerprint: string;
}

export function fingerprintFrozenCertificationStory(story: FootieScript): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: story.title,
        scenes: story.scenes.map((scene) => ({
          id: scene.id,
          start: scene.start,
          end: scene.end,
          duration: scene.duration,
          startMs: scene.startMs,
          endMs: scene.endMs,
          durationMs: scene.durationMs,
          subtitle: scene.subtitle,
          captionLayout: scene.captionLayout,
          captionAnimation: scene.captionAnimation,
          mediaTimeline: scene.mediaTimeline,
          mediaTransitions: scene.mediaTransitions,
        })),
        timelineItems: story.timelineItems,
        visualRetentionExtensions: story.visualRetentionExtensions,
        exportSettings: story.exportSettings,
      }),
    )
    .digest("hex");
}

export function resolvePreviewRuntimeParityCertificationTimeline(
  story = applyPreviewRuntimeParityCertificationSceneTiming(
    buildPreviewRuntimeParityIntegratedCertificationStory().story,
  ),
): PreviewRuntimeParityCertificationTimeline {
  const bounds = resolvePreviewRuntimeParityCertificationBounds(story);
  const manifest = buildExportManifest({
    story,
    exportSettings: {
      fileName: "preview-runtime-parity-integrated-certification",
      format: "webm",
      quality: "standard",
      resolution: "1080x1920",
    },
    audioMode: "silent",
    mixedMediaScenesEnabled: true,
    engagementOverlaysEnabled: true,
    shortForgeBrandStingEnabled: true,
    keyframedVisualEffectsEnabled: true,
  });

  return {
    story,
    ...bounds,
    frozenStoryFingerprint: fingerprintFrozenCertificationStory(story),
    manifestFingerprint: buildExportManifestFingerprint(manifest),
  };
}
