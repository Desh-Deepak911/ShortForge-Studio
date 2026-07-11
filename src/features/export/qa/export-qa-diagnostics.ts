/**
 * Export QA diagnostics helpers (Sprint 6F).
 */

import type { ExportManifest } from "@/features/export/domain";
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
  const points = new Map<number, string>();

  for (const ratio of RATIO_CHECKPOINTS) {
    const ts = Math.min(durationMs, Math.round(durationMs * ratio));
    points.set(ts, `${Math.round(ratio * 100)}%`);
  }

  for (const scene of manifest.scenes) {
    points.set(scene.startMs, `scene-start:${scene.id}`);
    points.set(Math.max(0, scene.endMs - 1), `scene-end:${scene.id}`);
    if (scene.media.type === "video") {
      points.set(scene.startMs, `video-start:${scene.id}`);
      points.set(Math.max(0, scene.endMs - 1), `video-end:${scene.id}`);
    }
    const transition = scene.transitionOut;
    if (transition && transition.durationMs > 0) {
      const startMs = Math.max(scene.startMs, scene.endMs - transition.durationMs);
      const mid = Math.round((startMs + scene.endMs) / 2);
      points.set(mid, `transition-mid:${scene.id}`);
    }
  }

  const lastCaption = [...manifest.captions].sort((a, b) => b.endMs - a.endMs)[0];
  if (lastCaption) {
    points.set(lastCaption.startMs, `final-caption-start:${lastCaption.id}`);
    points.set(
      Math.max(0, lastCaption.endMs - 1),
      `final-caption-end:${lastCaption.id}`,
    );
  }

  points.set(Math.max(0, durationMs - 1), "final-project-frame");

  return [...points.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestampMs, label]) =>
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
  const videoSource =
    sceneFrame.scene.media.type === "video"
      ? resolveExportVideoSourceTimeMs(sceneFrame.scene, sceneFrame.sceneElapsedMs)
      : null;

  return {
    label,
    progressRatio: durationMs > 0 ? clamped / durationMs : 0,
    timestampMs: clamped,
    sceneId: sceneFrame.scene.id,
    sceneElapsedMs: sceneFrame.sceneElapsedMs,
    mediaType: sceneFrame.scene.media.type,
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
