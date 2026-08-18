/**
 * Client-safe certification bounds.
 * No node:crypto, no export-manifest fingerprinting.
 */

import {
  resolveBrandStingFrame,
  resolveBrandStingTimelineBounds,
} from "@/features/brand-sting/domain/resolve-brand-sting-frame";
import { getShortForgeBrandSting } from "@/features/brand-sting/domain/normalize-brand-sting";
import type { FootieScript } from "@/features/story/types";

import { buildCertificationExportMasterTimeline } from "./apply-preview-runtime-parity-certification-scene-timing";

export const PREVIEW_RUNTIME_PARITY_CERT_FPS = 30;
export const PREVIEW_RUNTIME_PARITY_CERT_FRAME_DURATION_MS =
  1000 / PREVIEW_RUNTIME_PARITY_CERT_FPS;

export type LastDecodableFrameClassification =
  | "brand-sting-last-visible"
  | "terminal-hidden";

export interface PreviewRuntimeParityCertificationSceneTimingRow {
  readonly id: string;
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

export interface PreviewRuntimeParityCertificationBounds {
  readonly sceneTiming: readonly PreviewRuntimeParityCertificationSceneTimingRow[];
  readonly contentEndMs: number;
  readonly lastNarrationSceneEndMs: number;
  readonly brandStingStartMs: number;
  readonly brandStingMidMs: number;
  readonly brandStingLateVisibleMs: number;
  readonly brandStingEndMs: number;
  readonly renderEndMs: number;
  readonly endBufferMs: number;
  readonly lastDecodableFrameMs: number;
  readonly lastDecodableFrameClassification: LastDecodableFrameClassification;
}

export function nearestCertificationFrameTimeMs(timelineMs: number): number {
  const index = Math.round(timelineMs / PREVIEW_RUNTIME_PARITY_CERT_FRAME_DURATION_MS);
  return index * PREVIEW_RUNTIME_PARITY_CERT_FRAME_DURATION_MS;
}

export function lastDecodableEncodedFrameMs(renderEndMs: number): number {
  const frameCount = Math.max(
    1,
    Math.round((renderEndMs / 1000) * PREVIEW_RUNTIME_PARITY_CERT_FPS),
  );
  return Math.round(((frameCount - 1) / PREVIEW_RUNTIME_PARITY_CERT_FPS) * 1000);
}

export function collectCertificationSceneTiming(
  story: FootieScript,
): PreviewRuntimeParityCertificationSceneTimingRow[] {
  return story.scenes.map((scene, index) => {
    const startMs = scene.startMs ?? 0;
    const endMs = scene.endMs ?? startMs;
    const durationMs = scene.durationMs ?? endMs - startMs;
    return {
      id: scene.id,
      index,
      start: scene.start ?? startMs / 1000,
      end: scene.end ?? endMs / 1000,
      duration: scene.duration ?? durationMs / 1000,
      startMs,
      endMs,
      durationMs,
    };
  });
}

export function resolvePreviewRuntimeParityCertificationBounds(
  story: FootieScript,
): PreviewRuntimeParityCertificationBounds {
  const exportTimeline = buildCertificationExportMasterTimeline(story);
  const sting = getShortForgeBrandSting(story.visualRetentionExtensions);
  const brandStingDurationMs = sting?.enabled === true ? sting.durationMs : 0;
  const endBufferMs = Math.max(
    0,
    exportTimeline.renderDurationMs - exportTimeline.contentEndMs,
  );
  const bounds = resolveBrandStingTimelineBounds({
    narrationEndMs: exportTimeline.contentEndMs,
    endBufferMs,
    brandStingDurationMs,
  });
  const lateVisibleMs = Math.max(
    bounds.brandStingStartMs,
    bounds.brandStingEndMs - Math.round(brandStingDurationMs * 0.12),
  );
  const lastDecodableFrameMs = lastDecodableEncodedFrameMs(bounds.renderDurationMs);
  const lastFrameSting = resolveBrandStingFrame({
    sting,
    elapsedMs: lastDecodableFrameMs - bounds.brandStingStartMs,
  });
  const lastDecodableFrameClassification: LastDecodableFrameClassification =
    lastDecodableFrameMs < bounds.brandStingEndMs && lastFrameSting.visible
      ? "brand-sting-last-visible"
      : "terminal-hidden";

  return {
    sceneTiming: collectCertificationSceneTiming(story),
    contentEndMs: exportTimeline.contentEndMs,
    lastNarrationSceneEndMs: story.scenes[story.scenes.length - 1]?.endMs ?? 0,
    brandStingStartMs: bounds.brandStingStartMs,
    brandStingMidMs: bounds.brandStingStartMs + Math.round(brandStingDurationMs / 2),
    brandStingLateVisibleMs: lateVisibleMs,
    brandStingEndMs: bounds.brandStingEndMs,
    renderEndMs: bounds.renderDurationMs,
    endBufferMs: bounds.endBufferMs,
    lastDecodableFrameMs,
    lastDecodableFrameClassification,
  };
}
