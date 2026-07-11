/**
 * Deterministic silent-visual timestamp normalization (4.2C-8B.2).
 *
 * MediaRecorder WebM is treated only as an ordered frame container.
 * Timestamps / duration / avg_frame_rate from the raw file are never semantic.
 *
 * Production strategy: extract every decoded frame → re-encode as an image
 * sequence with `-framerate` as the sole timing authority.
 *
 * Canonical duration: capturedFrameCount / requestedFps.
 */

export const EXPORT_TIMING_NORMALIZE_USER_ERROR =
  "Export timing could not be normalized. The video frames were generated, but the output container reported an invalid playback speed. Please retry or use a different export format.";

/** Sole production strategy — image-sequence encode (not in-place setpts). */
export const SILENT_VISUAL_NORMALIZE_STRATEGY =
  "extract-vsync0+image2-framerate-encode";

/** Minimum probed duration treated as usable metadata (below → unavailable). */
export const RAW_DURATION_METADATA_MIN_SEC = 0.05;

export const NORMALIZED_FRAME_PATTERN = "norm-frame-%06d.jpg";
export const NORMALIZED_FRAME_PREFIX = "norm-frame-";

export function resolveNormalizedVisualDurationSec(
  capturedFrameCount: number,
  requestedFps: number,
): number {
  const fps = requestedFps > 0 && Number.isFinite(requestedFps) ? requestedFps : 30;
  const frames = Math.max(0, Math.floor(capturedFrameCount));
  return frames / fps;
}

export function resolveRawEffectiveFps(
  capturedFrameCount: number,
  rawDurationSec: number,
): number {
  const frames = Math.max(0, Math.floor(capturedFrameCount));
  const duration = Math.max(0.001, rawDurationSec);
  return frames / duration;
}

/**
 * Raw MediaRecorder duration of 0 / near-zero must not produce absurd FPS.
 */
export function describeRawSilentTiming(input: {
  capturedFrameCount: number;
  rawDurationSec: number | null | undefined;
}): {
  rawDurationSec: number | null;
  rawEffectiveFps: number | null;
  rawTimingAvailable: boolean;
  rawTimingLabel: string;
} {
  const frames = Math.max(0, Math.floor(input.capturedFrameCount));
  const raw =
    typeof input.rawDurationSec === "number" && Number.isFinite(input.rawDurationSec)
      ? input.rawDurationSec
      : null;

  if (raw == null || raw < RAW_DURATION_METADATA_MIN_SEC) {
    return {
      rawDurationSec: null,
      rawEffectiveFps: null,
      rawTimingAvailable: false,
      rawTimingLabel: `Raw MediaRecorder timing metadata was unavailable. Captured frame count: ${frames}.`,
    };
  }

  return {
    rawDurationSec: raw,
    rawEffectiveFps: resolveRawEffectiveFps(frames, raw),
    rawTimingAvailable: true,
    rawTimingLabel: `raw ${raw.toFixed(2)}s / ${resolveRawEffectiveFps(frames, raw).toFixed(1)}fps`,
  };
}

export function resolveNormalizedDurationToleranceSec(
  expectedDurationSec: number,
  requestedFps: number,
): number {
  const fps = requestedFps > 0 && Number.isFinite(requestedFps) ? requestedFps : 30;
  return Math.max(2 / fps, expectedDurationSec * 0.005, 0.05);
}

export function buildNormalizedFrameFilename(oneBasedIndex: number): string {
  const n = Math.max(1, Math.floor(oneBasedIndex));
  return `${NORMALIZED_FRAME_PREFIX}${String(n).padStart(6, "0")}.jpg`;
}

export function listNormalizedFrameFilenames(frameCount: number): string[] {
  const count = Math.max(0, Math.floor(frameCount));
  const files: string[] = [];
  for (let i = 1; i <= count; i++) {
    files.push(buildNormalizedFrameFilename(i));
  }
  return files;
}

/**
 * Pass 1: demux every decoded frame, ignoring wall-clock timestamps.
 * No -r / fps filter — those conflict with passthrough demux.
 */
export function buildSilentVisualFrameExtractArgs(options: {
  inputFile: string;
  framePattern?: string;
}): string[] {
  return [
    "-i",
    options.inputFile,
    "-an",
    "-vsync",
    "0",
    "-q:v",
    "3",
    options.framePattern ?? NORMALIZED_FRAME_PATTERN,
  ];
}

/**
 * Pass 2: encode ordered JPEGs with `-framerate` as the only timing authority.
 */
export function buildSilentVisualFrameSequenceEncodeArgs(options: {
  outputFile: string;
  fps: number;
  frameCount: number;
  framePattern?: string;
}): string[] {
  const fps = options.fps > 0 && Number.isFinite(options.fps) ? options.fps : 30;
  const frames = Math.max(1, Math.floor(options.frameCount));
  return [
    "-framerate",
    String(fps),
    "-i",
    options.framePattern ?? NORMALIZED_FRAME_PATTERN,
    "-frames:v",
    String(frames),
    "-an",
    "-c:v",
    "libvpx",
    "-b:v",
    "2M",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-auto-alt-ref",
    "0",
    options.outputFile,
  ];
}

/**
 * @deprecated Prefer extract + sequence encode. Kept for structural tests that
 * assert the encode half remains the timestamp authority.
 */
export function buildSilentVisualNormalizeArgs(options: {
  inputFile: string;
  outputFile: string;
  fps: number;
  frameCount: number;
}): string[] {
  // Encode-half only — callers must extract first. Documented in strategy.
  return buildSilentVisualFrameSequenceEncodeArgs({
    outputFile: options.outputFile,
    fps: options.fps,
    frameCount: options.frameCount,
  });
}

/** Expected packet timestamp for frame index at requested FPS. */
export function resolveSemanticFrameTimestampSec(
  frameIndex: number,
  requestedFps: number,
): number {
  const fps = requestedFps > 0 && Number.isFinite(requestedFps) ? requestedFps : 30;
  return Math.max(0, Math.floor(frameIndex)) / fps;
}

export interface NormalizedSilentTimingModel {
  capturedFrameCount: number;
  requestedFps: number;
  rawDurationSec: number | null;
  rawEffectiveFps: number | null;
  rawTimingAvailable: boolean;
  expectedNormalizedDurationSec: number;
  expectedEffectiveFps: number;
}

/**
 * Pure timing model: normalized duration ignores raw container duration.
 */
export function modelNormalizedSilentTiming(input: {
  capturedFrameCount: number;
  requestedFps: number;
  rawDurationSec: number | null;
}): NormalizedSilentTimingModel {
  const requestedFps =
    input.requestedFps > 0 && Number.isFinite(input.requestedFps)
      ? input.requestedFps
      : 30;
  const capturedFrameCount = Math.max(0, Math.floor(input.capturedFrameCount));
  const rawInfo = describeRawSilentTiming({
    capturedFrameCount,
    rawDurationSec: input.rawDurationSec,
  });
  return {
    capturedFrameCount,
    requestedFps,
    rawDurationSec: rawInfo.rawDurationSec,
    rawEffectiveFps: rawInfo.rawEffectiveFps,
    rawTimingAvailable: rawInfo.rawTimingAvailable,
    expectedNormalizedDurationSec: resolveNormalizedVisualDurationSec(
      capturedFrameCount,
      requestedFps,
    ),
    expectedEffectiveFps: requestedFps,
  };
}

export function assertFrameSequenceEncodeArgs(args: string[]): {
  hasFramerateInput: boolean;
  hasFrameCountLimit: boolean;
  hasVideoOnly: boolean;
  hasConflictingOutputRate: boolean;
  hasFpsFilter: boolean;
  hasSetpts: boolean;
  timingAuthority: "framerate-input" | "unknown";
} {
  const framerateIdx = args.indexOf("-framerate");
  const iIdx = args.indexOf("-i");
  const hasFramerateInput =
    framerateIdx >= 0 && iIdx > framerateIdx && Number(args[framerateIdx + 1]) > 0;
  const framesIdx = args.indexOf("-frames:v");
  const rIdx = args.indexOf("-r");
  const vfIdx = args.indexOf("-vf");
  const vf = vfIdx >= 0 ? String(args[vfIdx + 1] ?? "") : "";
  return {
    hasFramerateInput,
    hasFrameCountLimit: framesIdx >= 0 && Number(args[framesIdx + 1]) > 0,
    hasVideoOnly: args.includes("-an"),
    hasConflictingOutputRate: rIdx >= 0,
    hasFpsFilter: /fps=\d+/.test(vf),
    hasSetpts: /setpts=/.test(vf),
    timingAuthority: hasFramerateInput ? "framerate-input" : "unknown",
  };
}

export function assertFrameExtractArgs(args: string[]): {
  hasVsyncPassthrough: boolean;
  hasInputRateOverride: boolean;
  hasFpsFilter: boolean;
  hasVideoOnly: boolean;
} {
  const iIdx = args.indexOf("-i");
  const rBeforeInput = iIdx > 0 && args.slice(0, iIdx).includes("-r");
  const vsyncIdx = args.indexOf("-vsync");
  const vfIdx = args.indexOf("-vf");
  const vf = vfIdx >= 0 ? String(args[vfIdx + 1] ?? "") : "";
  return {
    hasVsyncPassthrough: vsyncIdx >= 0 && String(args[vsyncIdx + 1]) === "0",
    hasInputRateOverride: rBeforeInput,
    hasFpsFilter: /fps=\d+/.test(vf),
    hasVideoOnly: args.includes("-an"),
  };
}

/** @deprecated Use assertFrameSequenceEncodeArgs / assertFrameExtractArgs. */
export function assertNormalizeArgsRebuildTimestamps(args: string[]): {
  hasInputRateOverride: boolean;
  hasSetptsFrameIndex: boolean;
  hasFpsFilter: boolean;
  hasFrameCountLimit: boolean;
  hasVideoOnly: boolean;
  usesDurationTrimOnly: boolean;
  hasFramerateInput: boolean;
  timingAuthority: string;
} {
  const encode = assertFrameSequenceEncodeArgs(args);
  return {
    hasInputRateOverride: false,
    hasSetptsFrameIndex: false,
    hasFpsFilter: encode.hasFpsFilter,
    hasFrameCountLimit: encode.hasFrameCountLimit,
    hasVideoOnly: encode.hasVideoOnly,
    usesDurationTrimOnly: args.includes("-t") && !encode.hasFramerateInput,
    hasFramerateInput: encode.hasFramerateInput,
    timingAuthority: encode.timingAuthority,
  };
}
