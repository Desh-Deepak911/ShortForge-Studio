/**
 * Canonical silent-visual segment encode args (Sprint 6D / 6H).
 * All chunks must share identical codec parameters for stream-copy concat.
 * Bitrate / deadline / cpu-used come from ExportVisualQualityProfile (not hardcoded 2M).
 */

import type { ExportVisualQualityProfile } from "@/features/export/domain/export-visual-quality-profile";
import { resolveExportVisualQualityProfile } from "@/features/export/domain/export-visual-quality-profile";

import { buildChunkFramePattern } from "./build-export-chunk-plan";

/** Shared libvpx segment codec — do not vary per chunk. */
export const EXPORT_SEGMENT_CODEC = "libvpx" as const;
/** @deprecated Use profile.videoBitrateArg — retained as 720p-standard fallback. */
export const EXPORT_SEGMENT_BITRATE = "4M" as const;
export const EXPORT_SEGMENT_PIXEL_FORMAT = "yuv420p" as const;
/** @deprecated Use profile.libvpxDeadline */
export const EXPORT_SEGMENT_DEADLINE = "realtime" as const;
/** @deprecated Use profile.libvpxCpuUsed */
export const EXPORT_SEGMENT_CPU_USED = "8" as const;

/**
 * Keyframe strategy: each chunk encode starts a fresh stream, so frame 0 is a
 * keyframe. GOP length equals chunk frame count so mid-chunk keyframes are rare
 * but the segment remains independently decodable at the start.
 */
export function buildExportSegmentEncodeArgs(options: {
  readonly outputFile: string;
  readonly fps: number;
  readonly frameCount: number;
  readonly framePattern?: string;
  readonly startNumber?: number;
  /** Sprint 6H — resolution/quality-aware encode settings. */
  readonly qualityProfile?: Pick<
    ExportVisualQualityProfile,
    "videoBitrateArg" | "pixelFormat" | "libvpxDeadline" | "libvpxCpuUsed" | "videoCodec"
  >;
}): string[] {
  const fps = options.fps > 0 && Number.isFinite(options.fps) ? options.fps : 30;
  const frames = Math.max(1, Math.floor(options.frameCount));
  const startNumber =
    typeof options.startNumber === "number" && options.startNumber >= 0
      ? Math.floor(options.startNumber)
      : 0;

  const profile =
    options.qualityProfile ??
    resolveExportVisualQualityProfile({
      resolution: "720p",
      quality: "standard",
      bitrate: 4_000_000,
      width: 720,
      height: 1280,
    });

  return [
    "-framerate",
    String(fps),
    "-start_number",
    String(startNumber),
    "-i",
    options.framePattern ?? buildChunkFramePattern(),
    "-frames:v",
    String(frames),
    "-an",
    "-c:v",
    profile.videoCodec ?? EXPORT_SEGMENT_CODEC,
    "-b:v",
    profile.videoBitrateArg,
    "-pix_fmt",
    profile.pixelFormat ?? EXPORT_SEGMENT_PIXEL_FORMAT,
    "-deadline",
    profile.libvpxDeadline,
    "-cpu-used",
    String(profile.libvpxCpuUsed),
    "-auto-alt-ref",
    "0",
    // Independently decodable segment start (GOP = chunk length).
    "-g",
    String(frames),
    "-keyint_min",
    String(frames),
    options.outputFile,
  ];
}

export function assertExportSegmentEncodeArgs(args: string[]): {
  hasFramerateInput: boolean;
  hasFrameCountLimit: boolean;
  hasVideoOnly: boolean;
  hasLibvpx: boolean;
  hasKeyframePolicy: boolean;
  identicalCodecProfile: boolean;
  bitrateArg: string | null;
} {
  const framerateIdx = args.indexOf("-framerate");
  const iIdx = args.indexOf("-i");
  const framesIdx = args.indexOf("-frames:v");
  const gIdx = args.indexOf("-g");
  const bvIdx = args.indexOf("-b:v");
  return {
    hasFramerateInput:
      framerateIdx >= 0 && iIdx > framerateIdx && Number(args[framerateIdx + 1]) > 0,
    hasFrameCountLimit: framesIdx >= 0 && Number(args[framesIdx + 1]) > 0,
    hasVideoOnly: args.includes("-an"),
    hasLibvpx: args.includes(EXPORT_SEGMENT_CODEC),
    hasKeyframePolicy: gIdx >= 0 && Number(args[gIdx + 1]) > 0,
    identicalCodecProfile:
      args.includes(EXPORT_SEGMENT_CODEC) &&
      bvIdx >= 0 &&
      args.includes(EXPORT_SEGMENT_PIXEL_FORMAT),
    bitrateArg: bvIdx >= 0 ? String(args[bvIdx + 1] ?? null) : null,
  };
}
