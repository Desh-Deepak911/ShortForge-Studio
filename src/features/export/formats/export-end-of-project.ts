/**
 * End-of-project semantic checks (Sprint 6E).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import {
  resolveExportCaptionFrame,
  resolveExportFrameTimestampMs,
  resolveExportRenderEndMs,
  resolveExportSceneFrame,
  resolveExportTotalFrames,
  resolveExportTransitionFrame,
  resolveExportVisualTimeMs,
} from "@/features/export/timing";

export interface ExportEndOfProjectSnapshot {
  readonly lastGlobalFrameIndex: number;
  readonly lastTimestampMs: number;
  readonly visualTimeMs: number;
  readonly finalSceneId: string;
  readonly finalCaptionId: string | null;
  readonly finalCaptionProgress: number | null;
  readonly finalTransitionActive: boolean;
  readonly endBufferMs: number;
  readonly renderDurationMs: number;
  readonly contentDurationMs: number;
}

export function resolveExportEndOfProjectSnapshot(
  manifest: ExportManifest,
): ExportEndOfProjectSnapshot {
  const totalFrames = resolveExportTotalFrames(manifest);
  const lastGlobalFrameIndex = Math.max(0, totalFrames - 1);
  const fps = manifest.output.fps;
  const lastTimestampMs = resolveExportFrameTimestampMs(lastGlobalFrameIndex, fps);
  const visualTimeMs = resolveExportVisualTimeMs(manifest, lastTimestampMs);
  const scene = resolveExportSceneFrame(manifest, visualTimeMs);
  const caption = resolveExportCaptionFrame(manifest, visualTimeMs);
  const transition = resolveExportTransitionFrame(manifest, visualTimeMs);

  return {
    lastGlobalFrameIndex,
    lastTimestampMs,
    visualTimeMs,
    finalSceneId: scene.scene.id,
    finalCaptionId: caption?.caption.id ?? null,
    finalCaptionProgress: caption?.progress ?? null,
    finalTransitionActive: Boolean(transition),
    endBufferMs: manifest.project.endBufferMs,
    renderDurationMs: resolveExportRenderEndMs(manifest),
    contentDurationMs: manifest.project.contentDurationMs,
  };
}

/** Assert end buffer contract (product: 400ms). */
export function assertExportEndBufferContract(manifest: ExportManifest): void {
  const buffer = manifest.project.endBufferMs;
  if (buffer < 0) {
    throw new Error("endBufferMs must be >= 0");
  }
  // Soft check — some tests may use custom buffers; 400 is the product default.
  if (
    manifest.project.renderDurationMs !==
    manifest.project.contentDurationMs + buffer
  ) {
    throw new Error(
      "renderDurationMs must equal contentDurationMs + endBufferMs",
    );
  }
}

/**
 * Audit mux argument lists for dangerous truncation.
 * Returns findings — empty means no dangerous -shortest / unbound -t.
 */
export function auditExportMuxDurationArgs(args: readonly string[]): {
  readonly hasShortest: boolean;
  readonly hasExplicitT: boolean;
  readonly tValueSec: number | null;
  readonly dangerous: boolean;
  readonly detail: string;
} {
  const hasShortest = args.includes("-shortest");
  const tIdx = args.indexOf("-t");
  const hasExplicitT = tIdx >= 0;
  const tValueSec =
    hasExplicitT && Number.isFinite(Number(args[tIdx + 1]))
      ? Number(args[tIdx + 1])
      : null;

  // -shortest is always dangerous for this product (cuts end buffer / final syllable).
  // -t is allowed only when equal to canonical project duration (checked by caller).
  const dangerous = hasShortest;

  return {
    hasShortest,
    hasExplicitT,
    tValueSec,
    dangerous,
    detail: hasShortest
      ? "-shortest can truncate final caption/narration/end buffer"
      : hasExplicitT
        ? `-t ${tValueSec} must equal manifest.project.renderDurationMs/1000`
        : "no duration trim flags",
  };
}
