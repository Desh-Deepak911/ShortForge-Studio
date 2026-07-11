/**
 * Canonical silent-visual segment encode args (Sprint 6D).
 * All chunks must share identical codec parameters for stream-copy concat.
 */

import { buildChunkFramePattern } from "./build-export-chunk-plan";

/** Shared libvpx segment settings — do not vary per chunk. */
export const EXPORT_SEGMENT_CODEC = "libvpx" as const;
export const EXPORT_SEGMENT_BITRATE = "2M" as const;
export const EXPORT_SEGMENT_PIXEL_FORMAT = "yuv420p" as const;
export const EXPORT_SEGMENT_DEADLINE = "realtime" as const;
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
}): string[] {
  const fps = options.fps > 0 && Number.isFinite(options.fps) ? options.fps : 30;
  const frames = Math.max(1, Math.floor(options.frameCount));
  const startNumber =
    typeof options.startNumber === "number" && options.startNumber >= 0
      ? Math.floor(options.startNumber)
      : 0;

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
    EXPORT_SEGMENT_CODEC,
    "-b:v",
    EXPORT_SEGMENT_BITRATE,
    "-pix_fmt",
    EXPORT_SEGMENT_PIXEL_FORMAT,
    "-deadline",
    EXPORT_SEGMENT_DEADLINE,
    "-cpu-used",
    EXPORT_SEGMENT_CPU_USED,
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
} {
  const framerateIdx = args.indexOf("-framerate");
  const iIdx = args.indexOf("-i");
  const framesIdx = args.indexOf("-frames:v");
  const gIdx = args.indexOf("-g");
  return {
    hasFramerateInput:
      framerateIdx >= 0 && iIdx > framerateIdx && Number(args[framerateIdx + 1]) > 0,
    hasFrameCountLimit: framesIdx >= 0 && Number(args[framesIdx + 1]) > 0,
    hasVideoOnly: args.includes("-an"),
    hasLibvpx: args.includes(EXPORT_SEGMENT_CODEC),
    hasKeyframePolicy: gIdx >= 0 && Number(args[gIdx + 1]) > 0,
    identicalCodecProfile:
      args.includes(EXPORT_SEGMENT_CODEC) &&
      args.includes(EXPORT_SEGMENT_BITRATE) &&
      args.includes(EXPORT_SEGMENT_PIXEL_FORMAT),
  };
}
