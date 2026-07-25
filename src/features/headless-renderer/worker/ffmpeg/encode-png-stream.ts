/**
 * PNG image2pipe encode — long-lived FFmpeg, frames via stdin.
 * MP4/WebM write to a seekable artifact file (never stdout).
 * Audio remains owned local file inputs (stdin is video-only).
 *
 * Legacy directory PNG sequence lives in encode-png-sequence.ts for
 * test/reference fixtures only — not a silent production fallback.
 */

import { existsSync, statSync } from "node:fs";

import { assertExportDoesNotApplyVoiceSpeed } from "@/features/export/audio";

import type { HeadlessAudioPlan } from "../audio/audio-plan.types";
import { buildHeadlessAudioFilterComplex } from "../audio/build-headless-audio-filter";
import type { HeadlessOutputProfile } from "../runtime/output-profiles";
import { assertValidStreamPngFrame } from "../stream/png-frame-validator";
import type {
  HeadlessFrameStreamLimits,
  HeadlessFrameStreamRejectReason,
  HeadlessStreamFrameMetrics,
} from "../stream/frame-stream.types";
import { isOutputAtOrOverCeiling } from "./output-ceiling";
import { spawnFixedArgvWithStdin, type StdinSpawnHandle } from "./spawn-process-stdin";

export interface StreamedPngEncodeSession {
  acceptFrame(input: {
    readonly frameIndex: number;
    readonly timestampMs: number;
    readonly pngBytes: Uint8Array;
    readonly signal?: AbortSignal;
  }): Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: HeadlessFrameStreamRejectReason }
  >;
  setChromiumElapsedMs(ms: number): void;
  setOverlappedElapsedMs(ms: number): void;
  closeAndWait(): Promise<
    | {
        readonly ok: true;
        readonly elapsedMs: number;
        readonly metrics: HeadlessStreamFrameMetrics;
      }
    | {
        readonly ok: false;
        readonly message: string;
        readonly cancelled: boolean;
        readonly timedOut: boolean;
        readonly quota?: boolean;
        readonly reason?: HeadlessFrameStreamRejectReason;
        readonly metrics: HeadlessStreamFrameMetrics;
      }
  >;
  abort(): void;
  snapshotMetrics(): HeadlessStreamFrameMetrics;
}

function buildVideoPipeArgs(input: {
  fps: number;
  frameCount: number;
  outputPath: string;
  outputProfile: HeadlessOutputProfile;
  maxOutputBytes: number;
  audioPlan: HeadlessAudioPlan;
  voiceoverPath?: string | null;
  musicPath?: string | null;
}):
  | { readonly ok: true; readonly args: string[] }
  | { readonly ok: false; readonly message: string } {
  const plan = input.audioPlan;
  const profile = input.outputProfile;
  const voicePath = input.voiceoverPath ?? null;
  const musicPath = input.musicPath ?? null;

  if (input.fps !== 30 || profile.fps !== 30) {
    return { ok: false, message: "Exact 30fps required." };
  }
  if (!plan || typeof plan.combination !== "string") {
    return { ok: false, message: "Validated audio plan is required." };
  }
  if (plan.combination === "silent") {
    if (voicePath || musicPath) {
      return { ok: false, message: "Silent encode must not receive audio paths." };
    }
  } else {
    if (plan.voiceover && !voicePath) {
      return { ok: false, message: "Missing voiceover path for non-silent encode." };
    }
    if (plan.music && !musicPath) {
      return { ok: false, message: "Missing music path for non-silent encode." };
    }
    if (voicePath && (voicePath.includes("://") || voicePath.startsWith("http"))) {
      return { ok: false, message: "Remote voiceover path forbidden." };
    }
    if (musicPath && (musicPath.includes("://") || musicPath.startsWith("http"))) {
      return { ok: false, message: "Remote music path forbidden." };
    }
  }

  const args: string[] = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-vcodec",
    "png",
    "-framerate",
    String(input.fps),
    "-i",
    "pipe:0",
  ];

  let voiceInputIndex: number | null = null;
  let musicInputIndex: number | null = null;
  let nextIndex = 1;
  if (voicePath) {
    args.push("-i", voicePath);
    voiceInputIndex = nextIndex;
    nextIndex += 1;
  }
  if (musicPath) {
    args.push("-i", musicPath);
    musicInputIndex = nextIndex;
    nextIndex += 1;
  }

  const filter = buildHeadlessAudioFilterComplex({
    plan,
    voiceInputIndex,
    musicInputIndex,
  });
  if (!filter.ok) {
    return { ok: false, message: filter.message };
  }

  args.push("-frames:v", String(input.frameCount));
  args.push("-map", "0:v:0");

  if (plan.combination === "silent") {
    args.push("-an");
  } else {
    if (!filter.build.filterComplex || !filter.build.audioMapLabel) {
      return { ok: false, message: "Missing audio filter for non-silent encode." };
    }
    args.push("-filter_complex", filter.build.filterComplex);
    args.push("-map", `[${filter.build.audioMapLabel}]`);
    args.push("-c:a", profile.audioEncoder);
    args.push("-b:a", profile.audioBitrate);
    args.push("-ac", String(plan.channels));
    args.push("-ar", String(plan.sampleRateHz));
    args.push("-t", plan.outputDurationSec.toFixed(3));
  }

  if (profile.format === "webm") {
    args.push(
      "-c:v",
      profile.videoEncoder,
      "-b:v",
      profile.videoBitrate,
      "-pix_fmt",
      profile.pixelFormat,
      "-deadline",
      "good",
      "-cpu-used",
      "4",
      "-auto-alt-ref",
      "0",
      "-g",
      String(Math.max(1, input.fps)),
    );
  } else if (profile.format === "mp4") {
    args.push(
      "-c:v",
      profile.videoEncoder,
      "-b:v",
      profile.videoBitrate,
      "-pix_fmt",
      profile.pixelFormat,
      "-movflags",
      "+faststart",
      "-g",
      String(Math.max(1, input.fps)),
    );
  } else {
    return { ok: false, message: "Unsupported container." };
  }

  args.push(
    "-fs",
    String(input.maxOutputBytes),
    "-f",
    profile.container,
    input.outputPath,
  );

  try {
    assertExportDoesNotApplyVoiceSpeed(args);
  } catch {
    return { ok: false, message: "Voice-speed filters forbidden in encode argv." };
  }

  return { ok: true, args };
}

export async function startStreamedPngEncode(input: {
  ffmpegExecutable: string;
  frameCount: number;
  fps: number;
  outputPath: string;
  outputProfile: HeadlessOutputProfile;
  timeoutMs: number;
  maxStderrBytes: number;
  signal?: AbortSignal;
  processGraceMs?: number;
  maxOutputBytes: number;
  audioPlan: HeadlessAudioPlan;
  voiceoverPath?: string | null;
  musicPath?: string | null;
  streamLimits: HeadlessFrameStreamLimits;
}): Promise<
  | { readonly ok: true; readonly session: StreamedPngEncodeSession }
  | {
      readonly ok: false;
      readonly message: string;
      readonly cancelled: boolean;
      readonly timedOut: boolean;
    }
> {
  if (
    !Number.isSafeInteger(input.maxOutputBytes) ||
    input.maxOutputBytes < 1
  ) {
    return {
      ok: false,
      message: "Invalid output byte ceiling.",
      cancelled: false,
      timedOut: false,
    };
  }
  if (input.streamLimits.expectedFrameCount !== input.frameCount) {
    return {
      ok: false,
      message: "Stream frame count mismatch.",
      cancelled: false,
      timedOut: false,
    };
  }

  const built = buildVideoPipeArgs(input);
  if (!built.ok) {
    return {
      ok: false,
      message: built.message,
      cancelled: false,
      timedOut: false,
    };
  }

  const spawned = spawnFixedArgvWithStdin({
    executable: input.ffmpegExecutable,
    args: built.args,
    timeoutMs: input.timeoutMs,
    maxStderrBytes: input.maxStderrBytes,
    signal: input.signal,
    processGraceMs: input.processGraceMs,
  });
  if (!spawned.ok) {
    return {
      ok: false,
      message: spawned.message,
      cancelled: input.signal?.aborted === true,
      timedOut: false,
    };
  }

  const handle: StdinSpawnHandle = spawned.handle;
  const encodeStarted = Date.now();
  let nextExpectedIndex = 0;
  let totalFramesProduced = 0;
  let totalFramesAccepted = 0;
  let totalFrameBytesStreamed = 0;
  let peakSingleFrameBytes = 0;
  let peakWritableBufferedBytes = 0;
  let chromiumRenderElapsedMs: number | null = null;
  let overlappedRenderEncodeElapsedMs: number | null = null;
  let closed = false;
  let fatalReason: HeadlessFrameStreamRejectReason | null = null;

  const metrics = (): HeadlessStreamFrameMetrics =>
    Object.freeze({
      totalFramesProduced,
      totalFramesAccepted,
      totalFrameBytesStreamed,
      peakSingleFrameBytes,
      peakWritableBufferedBytes,
      chromiumRenderElapsedMs,
      ffmpegEncodeElapsedMs: closed ? Date.now() - encodeStarted : null,
      overlappedRenderEncodeElapsedMs,
    });

  const session: StreamedPngEncodeSession = {
    snapshotMetrics: metrics,

    setChromiumElapsedMs(ms: number) {
      if (Number.isFinite(ms) && ms >= 0) {
        chromiumRenderElapsedMs = Math.floor(ms);
      }
    },

    setOverlappedElapsedMs(ms: number) {
      if (Number.isFinite(ms) && ms >= 0) {
        overlappedRenderEncodeElapsedMs = Math.floor(ms);
      }
    },

    abort() {
      fatalReason = "aborted";
      handle.kill("SIGKILL");
    },

    async acceptFrame(frame) {
      if (closed || fatalReason) {
        return { ok: false, reason: fatalReason ?? "stdin_closed" };
      }
      if (frame.signal?.aborted || input.signal?.aborted) {
        fatalReason = "aborted";
        return { ok: false, reason: "aborted" };
      }
      totalFramesProduced += 1;

      if (frame.frameIndex !== nextExpectedIndex) {
        fatalReason =
          frame.frameIndex < nextExpectedIndex
            ? "duplicate_frame"
            : "missing_frame";
        handle.kill("SIGKILL");
        return { ok: false, reason: fatalReason };
      }
      if (frame.frameIndex >= input.frameCount) {
        fatalReason = "extra_frame";
        handle.kill("SIGKILL");
        return { ok: false, reason: "extra_frame" };
      }

      const validated = assertValidStreamPngFrame({
        bytes: frame.pngBytes,
        expectedWidth: input.streamLimits.expectedWidth,
        expectedHeight: input.streamLimits.expectedHeight,
        maxSingleFrameBytes: input.streamLimits.maxSingleFrameBytes,
      });
      if (!validated.ok) {
        fatalReason =
          validated.reason === "too_large"
            ? "frame_too_large"
            : validated.reason === "dimensions"
              ? "wrong_dimensions"
              : "malformed_png";
        handle.kill("SIGKILL");
        return { ok: false, reason: fatalReason };
      }

      const nextTotal = totalFrameBytesStreamed + frame.pngBytes.byteLength;
      if (
        !Number.isSafeInteger(nextTotal) ||
        nextTotal > input.streamLimits.maxTotalStreamedFrameBytes
      ) {
        fatalReason = "frame_too_large";
        handle.kill("SIGKILL");
        return { ok: false, reason: "frame_too_large" };
      }

      const written = await handle.write(frame.pngBytes, {
        signal: frame.signal ?? input.signal,
        drainTimeoutMs: input.streamLimits.writeDrainTimeoutMs,
        maxWritableBufferedBytes: input.streamLimits.maxWritableBufferedBytes,
      });
      if (!written.ok) {
        const peak = written.bufferedBytes ?? handle.getPeakBufferedBytes();
        if (peak > peakWritableBufferedBytes) {
          peakWritableBufferedBytes = peak;
        }
        fatalReason =
          written.reason === "drain_timeout" ||
          written.reason === "buffer_overflow"
            ? "write_timeout"
            : written.reason === "aborted"
              ? "aborted"
              : written.reason === "epipe"
                ? "epipe"
                : "stdin_closed";
        if (written.reason !== "aborted") handle.kill("SIGKILL");
        return { ok: false, reason: fatalReason };
      }

      // Peak from write() is captured before drain clears writableLength.
      if (written.bufferedBytes > peakWritableBufferedBytes) {
        peakWritableBufferedBytes = written.bufferedBytes;
      }
      const handlePeak = handle.getPeakBufferedBytes();
      if (handlePeak > peakWritableBufferedBytes) {
        peakWritableBufferedBytes = handlePeak;
      }
      if (frame.pngBytes.byteLength > peakSingleFrameBytes) {
        peakSingleFrameBytes = frame.pngBytes.byteLength;
      }
      totalFrameBytesStreamed = nextTotal;
      totalFramesAccepted += 1;
      nextExpectedIndex += 1;
      return { ok: true };
    },

    async closeAndWait() {
      closed = true;
      if (fatalReason) {
        handle.endStdin();
        const result = await handle.wait();
        return {
          ok: false,
          message: `Stream encode failed (${fatalReason}).`,
          cancelled: fatalReason === "aborted" || result.exitClass === "cancelled",
          timedOut: result.exitClass === "timeout",
          reason: fatalReason,
          metrics: metrics(),
        };
      }
      if (totalFramesAccepted !== input.frameCount) {
        handle.kill("SIGKILL");
        const result = await handle.wait();
        return {
          ok: false,
          message: "Incomplete frame stream.",
          cancelled: result.exitClass === "cancelled",
          timedOut: result.exitClass === "timeout",
          reason: "missing_frame",
          metrics: metrics(),
        };
      }

      handle.endStdin();
      const result = await handle.wait();
      const m = Object.freeze({
        ...metrics(),
        ffmpegEncodeElapsedMs: result.elapsedMs,
      });

      if (result.exitClass === "cancelled") {
        return {
          ok: false,
          message: "FFmpeg cancelled.",
          cancelled: true,
          timedOut: false,
          metrics: m,
        };
      }
      if (result.exitClass === "timeout") {
        return {
          ok: false,
          message: "FFmpeg timed out.",
          cancelled: false,
          timedOut: true,
          metrics: m,
        };
      }
      if (result.exitClass !== "success") {
        return {
          ok: false,
          message: `FFmpeg encode failed (${result.exitClass}).`,
          cancelled: false,
          timedOut: false,
          reason: "ffmpeg_early_exit",
          metrics: m,
        };
      }

      const written =
        existsSync(input.outputPath) ? statSync(input.outputPath).size : 0;
      if (isOutputAtOrOverCeiling(written, input.maxOutputBytes)) {
        return {
          ok: false,
          message: "FFmpeg output exceeded authorized byte ceiling.",
          cancelled: false,
          timedOut: false,
          quota: true,
          metrics: m,
        };
      }

      return { ok: true, elapsedMs: result.elapsedMs, metrics: m };
    },
  };

  return { ok: true, session };
}

/** Build image2pipe argv for fixture assertions (no spawn). */
export function buildImage2PipeEncodeArgvForTest(
  input: Parameters<typeof buildVideoPipeArgs>[0],
):
  | { readonly ok: true; readonly args: string[] }
  | { readonly ok: false; readonly message: string } {
  return buildVideoPipeArgs(input);
}
