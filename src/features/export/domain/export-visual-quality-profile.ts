/**
 * Sprint 6H — centralized export visual quality profiles.
 *
 * Single source of truth for canvas→JPEG→libvpx/H.264 fidelity settings.
 * Derived deterministically from ExportManifest.output (resolution × quality × bitrate).
 */

import type {
  ExportManifestQuality,
  ExportManifestResolutionLabel,
  ExportOutputManifest,
} from "@/features/export/domain/export-manifest.types";

export type ExportFrameIntermediateFormat = "jpeg";

export interface ExportVisualQualityProfile {
  readonly id: string;
  readonly resolution: ExportManifestResolutionLabel;
  readonly quality: ExportManifestQuality;
  readonly width: number;
  readonly height: number;
  /** Target video bitrate in bits/sec (matches manifest.output.bitrate). */
  readonly videoBitrate: number;
  /** FFmpeg `-b:v` token, e.g. "6M". */
  readonly videoBitrateArg: string;
  readonly frameIntermediateFormat: ExportFrameIntermediateFormat;
  /** canvas.toBlob JPEG quality 0–1. */
  readonly frameIntermediateQuality: number;
  readonly videoCodec: "libvpx";
  readonly pixelFormat: "yuv420p";
  readonly imageSmoothingQuality: "high";
  /** libvpx `-deadline`. */
  readonly libvpxDeadline: "realtime" | "good";
  /** libvpx `-cpu-used` (lower = slower/sharper). */
  readonly libvpxCpuUsed: number;
  /** H.264 CRF for MP4 mux/transcode (lower = sharper). */
  readonly h264Crf: number;
  readonly h264Preset: "fast";
}

export type ExportVisualQualityProfileInput = Pick<
  ExportOutputManifest,
  "resolution" | "quality" | "bitrate" | "width" | "height"
>;

/** Format bits/sec as FFmpeg bitrate arg (Mbps, rounded). */
export function formatExportVideoBitrateArg(bitrate: number): string {
  const safe = Number.isFinite(bitrate) && bitrate > 0 ? bitrate : 4_000_000;
  const mbps = Math.max(1, Math.round(safe / 1_000_000));
  return `${mbps}M`;
}

/**
 * Evidence-backed JPEG intermediate quality.
 * 0.92 was a speed default and visibly soft at 1080p after a second video encode.
 * Higher tiers reduce blocking on text/faces/pitch lines without PNG MEMFS cost.
 */
export function resolveExportFrameIntermediateQuality(
  resolution: ExportManifestResolutionLabel,
  quality: ExportManifestQuality,
): number {
  if (resolution === "1080p") {
    return quality === "high" ? 0.97 : 0.95;
  }
  return quality === "high" ? 0.95 : 0.93;
}

function resolveLibvpxDeadline(
  resolution: ExportManifestResolutionLabel,
  quality: ExportManifestQuality,
): "realtime" | "good" {
  // Only 1080p high uses "good" — still practical in FFmpeg.wasm for short clips.
  if (resolution === "1080p" && quality === "high") {
    return "good";
  }
  return "realtime";
}

function resolveLibvpxCpuUsed(
  resolution: ExportManifestResolutionLabel,
  quality: ExportManifestQuality,
): number {
  if (resolution === "1080p" && quality === "high") return 4;
  if (quality === "high" || resolution === "1080p") return 5;
  return 8;
}

function resolveH264Crf(
  resolution: ExportManifestResolutionLabel,
  quality: ExportManifestQuality,
): number {
  if (resolution === "1080p" && quality === "high") return 19;
  if (quality === "high") return 20;
  if (resolution === "1080p") return 21;
  return 23;
}

/**
 * Resolve the visual encode profile for a frozen ExportManifest output block.
 * Chunks within one export must share this profile for stream-copy concat.
 */
export function resolveExportVisualQualityProfile(
  output: ExportVisualQualityProfileInput,
): ExportVisualQualityProfile {
  const resolution = output.resolution === "720p" ? "720p" : "1080p";
  const quality = output.quality === "standard" ? "standard" : "high";
  const width =
    typeof output.width === "number" && output.width > 0
      ? Math.round(output.width)
      : resolution === "720p"
        ? 720
        : 1080;
  const height =
    typeof output.height === "number" && output.height > 0
      ? Math.round(output.height)
      : resolution === "720p"
        ? 1280
        : 1920;
  const videoBitrate =
    typeof output.bitrate === "number" && Number.isFinite(output.bitrate) && output.bitrate > 0
      ? Math.round(output.bitrate)
      : resolution === "720p"
        ? quality === "high"
          ? 6_000_000
          : 4_000_000
        : quality === "high"
          ? 8_000_000
          : 6_000_000;

  return {
    id: `${resolution}-${quality}`,
    resolution,
    quality,
    width,
    height,
    videoBitrate,
    videoBitrateArg: formatExportVideoBitrateArg(videoBitrate),
    frameIntermediateFormat: "jpeg",
    frameIntermediateQuality: resolveExportFrameIntermediateQuality(resolution, quality),
    videoCodec: "libvpx",
    pixelFormat: "yuv420p",
    imageSmoothingQuality: "high",
    libvpxDeadline: resolveLibvpxDeadline(resolution, quality),
    libvpxCpuUsed: resolveLibvpxCpuUsed(resolution, quality),
    h264Crf: resolveH264Crf(resolution, quality),
    h264Preset: "fast",
  };
}

/** Compact debug payload for SHORTFORGE_EXPORT_DEBUG (no per-frame data). */
export function summarizeExportVisualQualityProfile(
  profile: ExportVisualQualityProfile,
): Record<string, string | number> {
  return {
    id: profile.id,
    width: profile.width,
    height: profile.height,
    videoBitrate: profile.videoBitrate,
    videoBitrateArg: profile.videoBitrateArg,
    frameIntermediateFormat: profile.frameIntermediateFormat,
    frameIntermediateQuality: profile.frameIntermediateQuality,
    libvpxDeadline: profile.libvpxDeadline,
    libvpxCpuUsed: profile.libvpxCpuUsed,
    h264Crf: profile.h264Crf,
    pixelFormat: profile.pixelFormat,
  };
}

export function isExportVisualQualityDebugEnabled(): boolean {
  return (
    process.env.SHORTFORGE_EXPORT_DEBUG === "1" ||
    process.env.NEXT_PUBLIC_SHORTFORGE_EXPORT_DEBUG === "1"
  );
}

export function logExportVisualQualityProfile(profile: ExportVisualQualityProfile): void {
  if (!isExportVisualQualityDebugEnabled()) return;
  console.info("[ExportVisualQuality]", summarizeExportVisualQualityProfile(profile));
}
