/**
 * Export QA diagnostics helpers (Sprint 6F / 8D.1).
 * Parity sampling is active-item-aware via resolveExportActiveSceneMediaFrame.
 */

import type { ExportManifest } from "@/features/export/domain";
import { resolveExportActiveSceneMediaFrame } from "@/features/export/domain";
import type { ExportParityCheckpoint } from "./export-device-qa.types";
import {
  resolveExportCaptionFrame,
  resolveExportSceneFrame,
  resolveExportTransitionFrame,
  resolveExportVideoSourceTimeMs,
} from "@/features/export/timing";

const RATIO_CHECKPOINTS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] as const;

export function collectExportParityCheckpoints(
  manifest: ExportManifest,
): readonly ExportParityCheckpoint[] {
  const durationMs = manifest.project.renderDurationMs;
  const points: { timestampMs: number; label: string }[] = [];

  const add = (timestampMs: number, label: string) => {
    const clamped = Math.max(0, Math.min(durationMs, timestampMs));
    points.push({ timestampMs: clamped, label });
  };

  for (const ratio of RATIO_CHECKPOINTS) {
    add(Math.round(durationMs * ratio), `${Math.round(ratio * 100)}%`);
  }

  for (const scene of manifest.scenes) {
    add(scene.startMs, `scene-start:${scene.id}`);
    add(Math.max(0, scene.endMs - 1), `scene-end:${scene.id}`);

    const items = scene.mediaTimeline?.items ?? [];
    for (const item of items) {
      const itemStartAbs = scene.startMs + item.startOffsetMs;
      const itemEndMinusOne = scene.startMs + Math.max(0, item.endOffsetMs - 1);
      add(itemStartAbs, `media-item-start:${scene.id}:${item.id}`);
      add(itemEndMinusOne, `media-item-end:${scene.id}:${item.id}`);
      // Exact boundary into the following item (when one exists).
      if (item.endOffsetMs < scene.durationMs) {
        add(
          scene.startMs + item.endOffsetMs,
          `media-item-boundary:${scene.id}:${item.id}`,
        );
      }
      if (item.media.type === "video") {
        add(itemStartAbs, `video-start:${scene.id}:${item.id}`);
        add(itemEndMinusOne, `video-end:${scene.id}:${item.id}`);
      }
    }

    const transition = scene.transitionOut;
    if (transition && transition.durationMs > 0) {
      const startMs = Math.max(scene.startMs, scene.endMs - transition.durationMs);
      const mid = Math.round((startMs + scene.endMs) / 2);
      add(mid, `transition-mid:${scene.id}`);
    }
  }

  const lastCaption = [...manifest.captions].sort((a, b) => b.endMs - a.endMs)[0];
  if (lastCaption) {
    add(lastCaption.startMs, `final-caption-start:${lastCaption.id}`);
    add(Math.max(0, lastCaption.endMs - 1), `final-caption-end:${lastCaption.id}`);
  }

  add(Math.max(0, durationMs - 1), "final-project-frame");

  return points
    .sort((a, b) => a.timestampMs - b.timestampMs || a.label.localeCompare(b.label))
    .map(({ timestampMs, label }) =>
      sampleParityCheckpoint(manifest, timestampMs, label),
    );
}

export function sampleParityCheckpoint(
  manifest: ExportManifest,
  timestampMs: number,
  label: string,
): ExportParityCheckpoint {
  const durationMs = manifest.project.renderDurationMs;
  const clamped = Math.max(0, Math.min(durationMs, timestampMs));
  const sceneFrame = resolveExportSceneFrame(manifest, clamped);
  const caption = resolveExportCaptionFrame(manifest, clamped);
  const transition = resolveExportTransitionFrame(manifest, clamped);
  const active = resolveExportActiveSceneMediaFrame(
    sceneFrame.scene,
    sceneFrame.sceneElapsedMs,
  );
  const mediaType = active?.item.media.type ?? sceneFrame.scene.media.type;
  const mediaItemId = active?.item.id ?? null;
  const mediaItemElapsedMs = active?.itemElapsedMs ?? null;
  const videoSource =
    mediaType === "video"
      ? resolveExportVideoSourceTimeMs(sceneFrame.scene, sceneFrame.sceneElapsedMs)
      : null;

  return {
    label,
    progressRatio: durationMs > 0 ? clamped / durationMs : 0,
    timestampMs: clamped,
    sceneId: sceneFrame.scene.id,
    sceneElapsedMs: sceneFrame.sceneElapsedMs,
    mediaItemId,
    mediaItemElapsedMs,
    mediaType,
    videoSourceTimeMs: videoSource?.sourceTimeMs ?? null,
    captionId: caption?.caption.id ?? null,
    captionProgress: caption?.progress ?? null,
    transitionActive: Boolean(transition),
  };
}

export function compareParityCheckpoints(
  preview: ExportParityCheckpoint,
  exportCp: ExportParityCheckpoint,
): readonly string[] {
  const diffs: string[] = [];
  if (preview.sceneId !== exportCp.sceneId) {
    diffs.push(`sceneId: ${preview.sceneId} vs ${exportCp.sceneId}`);
  }
  if (Math.abs(preview.sceneElapsedMs - exportCp.sceneElapsedMs) > 1) {
    diffs.push(
      `sceneElapsedMs: ${preview.sceneElapsedMs} vs ${exportCp.sceneElapsedMs}`,
    );
  }
  if (preview.mediaItemId !== exportCp.mediaItemId) {
    diffs.push(`mediaItemId: ${preview.mediaItemId} vs ${exportCp.mediaItemId}`);
  }
  if (
    preview.mediaItemElapsedMs != null &&
    exportCp.mediaItemElapsedMs != null &&
    Math.abs(preview.mediaItemElapsedMs - exportCp.mediaItemElapsedMs) > 1
  ) {
    diffs.push(
      `mediaItemElapsedMs: ${preview.mediaItemElapsedMs} vs ${exportCp.mediaItemElapsedMs}`,
    );
  }
  if (preview.mediaType !== exportCp.mediaType) {
    diffs.push(`mediaType: ${preview.mediaType} vs ${exportCp.mediaType}`);
  }
  if (preview.captionId !== exportCp.captionId) {
    diffs.push(`captionId: ${preview.captionId} vs ${exportCp.captionId}`);
  }
  if (preview.transitionActive !== exportCp.transitionActive) {
    diffs.push(
      `transitionActive: ${preview.transitionActive} vs ${exportCp.transitionActive}`,
    );
  }
  if (
    preview.videoSourceTimeMs != null &&
    exportCp.videoSourceTimeMs != null &&
    Math.abs(preview.videoSourceTimeMs - exportCp.videoSourceTimeMs) > 2
  ) {
    diffs.push(
      `videoSourceTimeMs: ${preview.videoSourceTimeMs} vs ${exportCp.videoSourceTimeMs}`,
    );
  }
  return diffs;
}
