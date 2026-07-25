/**
 * Worker-owned metrics sampler — never part of job/artifact identity.
 * No paths, URLs, source names, or credentials.
 *
 * nodeCoordinatorPeakRssBytes measures the Node coordinator process only
 * (process.memoryUsage().rss). It excludes Chrome/FFmpeg children and must
 * not be treated as total worker/container memory authority.
 */

import type { WorkspaceByteBudget } from "../assets/workspace-quota";
import type { HeadlessStreamFrameMetrics } from "../stream/frame-stream.types";
import type { HeadlessWorkerRunMetrics } from "./worker-types";

export class HeadlessRssSampler {
  private peak: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  start(intervalMs = 250): void {
    if (this.timer || this.stopped) return;
    this.sampleOnce();
    this.timer = setInterval(() => this.sampleOnce(), intervalMs);
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  private sampleOnce(): void {
    if (typeof process.memoryUsage !== "function") return;
    try {
      const rss = process.memoryUsage().rss;
      if (!Number.isSafeInteger(rss) || rss < 0) return;
      if (this.peak == null || rss > this.peak) this.peak = rss;
    } catch {
      /* ignore */
    }
  }

  stop(): number | null {
    if (this.stopped) return this.peak;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.sampleOnce();
    return this.peak;
  }
}

export function buildHeadlessRunMetrics(input: {
  renderStageMs: number | null;
  encodeStageMs: number | null;
  probeStageMs: number | null;
  uploadStageMs: number | null;
  totalElapsedMs: number | null;
  budget: WorkspaceByteBudget | null;
  artifactBytes: number | null;
  nodeCoordinatorPeakRssBytes: number | null;
  frameCount: number | null;
  stream?: HeadlessStreamFrameMetrics | null;
  overlappedRenderEncodeElapsedMs?: number | null;
  artifactBytesStreamed?: number | null;
  artifactUploadChunkCount?: number | null;
  peakArtifactUploadChunkBytes?: number | null;
  artifactHashElapsedMs?: number | null;
  artifactUploadElapsedMs?: number | null;
}): HeadlessWorkerRunMetrics {
  const unavailableReasons: Record<string, string> = {};
  const measured = <T>(
    key: string,
    value: T | null | undefined,
    reason: string,
  ): T | null => {
    if (value == null) {
      unavailableReasons[key] = reason;
      return null;
    }
    return value;
  };

  const streamed = input.stream?.totalFrameBytesStreamed ?? null;
  const diskAggregate = input.budget?.aggregateFrameBytesCommitted() ?? null;
  const aggregateFrameBytes =
    streamed != null && streamed > 0 ? streamed : diskAggregate;

  const peakFrameFromStream = input.stream?.peakSingleFrameBytes ?? null;
  const peakFrameFromBudget = input.budget?.peakSingleFrameBytes() ?? null;
  const peakFrameBytes =
    peakFrameFromStream != null && peakFrameFromStream > 0
      ? peakFrameFromStream
      : peakFrameFromBudget;

  return {
    renderStageMs: measured(
      "renderStageMs",
      input.renderStageMs,
      "stage_not_completed",
    ),
    encodeStageMs: measured(
      "encodeStageMs",
      input.encodeStageMs,
      "stage_not_completed",
    ),
    probeStageMs: measured(
      "probeStageMs",
      input.probeStageMs,
      "stage_not_completed",
    ),
    uploadStageMs: measured(
      "uploadStageMs",
      input.uploadStageMs,
      "upload_not_in_local_worker_path",
    ),
    totalElapsedMs: measured(
      "totalElapsedMs",
      input.totalElapsedMs,
      "not_measured",
    ),
    peakWorkspaceCommittedBytes: measured(
      "peakWorkspaceCommittedBytes",
      input.budget?.peakWorkspaceCommittedBytes() ?? null,
      "budget_unavailable",
    ),
    peakFrameBytes: measured(
      "peakFrameBytes",
      peakFrameBytes,
      "budget_unavailable",
    ),
    aggregateFrameBytes: measured(
      "aggregateFrameBytes",
      aggregateFrameBytes,
      "budget_unavailable",
    ),
    artifactBytes: measured(
      "artifactBytes",
      input.artifactBytes,
      "artifact_unavailable",
    ),
    nodeCoordinatorPeakRssBytes: measured(
      "nodeCoordinatorPeakRssBytes",
      input.nodeCoordinatorPeakRssBytes,
      "rss_unavailable",
    ),
    frameCount: measured("frameCount", input.frameCount, "frames_unavailable"),
    totalFramesProduced: measured(
      "totalFramesProduced",
      input.stream?.totalFramesProduced ?? null,
      "stream_unavailable",
    ),
    totalFramesAccepted: measured(
      "totalFramesAccepted",
      input.stream?.totalFramesAccepted ?? null,
      "stream_unavailable",
    ),
    totalFrameBytesStreamed: measured(
      "totalFrameBytesStreamed",
      input.stream?.totalFrameBytesStreamed ?? null,
      "stream_unavailable",
    ),
    peakWritableBufferedBytes: measured(
      "peakWritableBufferedBytes",
      input.stream?.peakWritableBufferedBytes ?? null,
      "stream_unavailable",
    ),
    chromiumRenderElapsedMs: measured(
      "chromiumRenderElapsedMs",
      input.stream?.chromiumRenderElapsedMs ?? input.renderStageMs,
      "stream_unavailable",
    ),
    ffmpegEncodeElapsedMs: measured(
      "ffmpegEncodeElapsedMs",
      input.stream?.ffmpegEncodeElapsedMs ?? input.encodeStageMs,
      "stream_unavailable",
    ),
    overlappedRenderEncodeElapsedMs: measured(
      "overlappedRenderEncodeElapsedMs",
      input.overlappedRenderEncodeElapsedMs ??
        input.stream?.overlappedRenderEncodeElapsedMs ??
        null,
      "stream_unavailable",
    ),
    artifactBytesStreamed: measured(
      "artifactBytesStreamed",
      input.artifactBytesStreamed ?? null,
      "upload_not_completed",
    ),
    artifactUploadChunkCount: measured(
      "artifactUploadChunkCount",
      input.artifactUploadChunkCount ?? null,
      "upload_not_completed",
    ),
    peakArtifactUploadChunkBytes: measured(
      "peakArtifactUploadChunkBytes",
      input.peakArtifactUploadChunkBytes ?? null,
      "upload_not_completed",
    ),
    artifactHashElapsedMs: measured(
      "artifactHashElapsedMs",
      input.artifactHashElapsedMs ?? null,
      "hash_not_completed",
    ),
    artifactUploadElapsedMs: measured(
      "artifactUploadElapsedMs",
      input.artifactUploadElapsedMs ?? null,
      "upload_not_completed",
    ),
    unavailableReasons: Object.freeze({ ...unavailableReasons }),
  };
}
