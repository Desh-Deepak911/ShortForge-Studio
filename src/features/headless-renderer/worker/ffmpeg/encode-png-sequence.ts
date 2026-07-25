/**
 * Legacy directory PNG-sequence encode — **test/reference fixtures only**.
 * Import via `worker/testing/reference-encode`. Not exported from the production
 * worker barrel. Production execution uses `encode-png-stream.ts` (image2pipe).
 * This path must never be a silent production fallback.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { assertExportDoesNotApplyVoiceSpeed } from "@/features/export/audio";

import type { HeadlessAudioPlan } from "../audio/audio-plan.types";
import { buildHeadlessAudioFilterComplex } from "../audio/build-headless-audio-filter";
import type { HeadlessOutputProfile } from "../runtime/output-profiles";
import { isOutputAtOrOverCeiling } from "./output-ceiling";
import { spawnFixedArgv } from "./spawn-process";

export async function encodePngSequence(input: {
  ffmpegExecutable: string;
  framesDir: string;
  /** printf pattern relative to framesDir, e.g. frame_%06d.png */
  framePattern: string;
  frameCount: number;
  fps: number;
  outputPath: string;
  outputProfile: HeadlessOutputProfile;
  timeoutMs: number;
  maxStderrBytes: number;
  signal?: AbortSignal;
  processGraceMs?: number;
  /** Hard output byte ceiling (ffmpeg -fs). Must be a positive safe integer. */
  maxOutputBytes: number;
  /** Validated plan — silent when combination === "silent". */
  audioPlan: HeadlessAudioPlan;
  /** Owned local voiceover path (required when plan has voiceover). */
  voiceoverPath?: string | null;
  /** Owned local music path (required when plan has music). */
  musicPath?: string | null;
}): Promise<
  | { readonly ok: true; readonly elapsedMs: number }
  | {
      readonly ok: false;
      readonly message: string;
      readonly cancelled: boolean;
      readonly timedOut: boolean;
      readonly quota?: boolean;
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
      quota: true,
    };
  }

  if (input.fps !== 30 || input.outputProfile.fps !== 30) {
    return {
      ok: false,
      message: "Exact 30fps required.",
      cancelled: false,
      timedOut: false,
    };
  }

  const plan = input.audioPlan;
  if (!plan || typeof plan.combination !== "string") {
    return {
      ok: false,
      message: "Validated audio plan is required.",
      cancelled: false,
      timedOut: false,
    };
  }
  const voicePath = input.voiceoverPath ?? null;
  const musicPath = input.musicPath ?? null;
  const profile = input.outputProfile;

  if (plan.combination === "silent") {
    if (voicePath || musicPath) {
      return {
        ok: false,
        message: "Silent encode must not receive audio paths.",
        cancelled: false,
        timedOut: false,
      };
    }
  } else {
    if (plan.voiceover && !voicePath) {
      return {
        ok: false,
        message: "Missing voiceover path for non-silent encode.",
        cancelled: false,
        timedOut: false,
      };
    }
    if (plan.music && !musicPath) {
      return {
        ok: false,
        message: "Missing music path for non-silent encode.",
        cancelled: false,
        timedOut: false,
      };
    }
    if (voicePath && (voicePath.includes("://") || voicePath.startsWith("http"))) {
      return {
        ok: false,
        message: "Remote voiceover path forbidden.",
        cancelled: false,
        timedOut: false,
      };
    }
    if (musicPath && (musicPath.includes("://") || musicPath.startsWith("http"))) {
      return {
        ok: false,
        message: "Remote music path forbidden.",
        cancelled: false,
        timedOut: false,
      };
    }
  }

  const pattern = join(input.framesDir, input.framePattern);
  const args: string[] = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    String(input.fps),
    "-start_number",
    "0",
    "-i",
    pattern,
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
    return {
      ok: false,
      message: filter.message,
      cancelled: false,
      timedOut: false,
    };
  }

  args.push("-frames:v", String(input.frameCount));
  args.push("-map", "0:v:0");

  if (plan.combination === "silent") {
    args.push("-an");
  } else {
    if (!filter.build.filterComplex || !filter.build.audioMapLabel) {
      return {
        ok: false,
        message: "Missing audio filter for non-silent encode.",
        cancelled: false,
        timedOut: false,
      };
    }
    args.push("-filter_complex", filter.build.filterComplex);
    args.push("-map", `[${filter.build.audioMapLabel}]`);
    args.push("-c:a", profile.audioEncoder);
    args.push("-b:a", profile.audioBitrate);
    args.push("-ac", String(plan.channels));
    args.push("-ar", String(plan.sampleRateHz));
    // Project end — never -shortest (matches browser export).
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
    return {
      ok: false,
      message: "Unsupported container.",
      cancelled: false,
      timedOut: false,
    };
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
    return {
      ok: false,
      message: "Voice-speed filters forbidden in encode argv.",
      cancelled: false,
      timedOut: false,
    };
  }

  const result = await spawnFixedArgv({
    executable: input.ffmpegExecutable,
    args,
    timeoutMs: input.timeoutMs,
    maxStderrBytes: input.maxStderrBytes,
    signal: input.signal,
    processGraceMs: input.processGraceMs,
  });

  if (result.exitClass === "cancelled") {
    return {
      ok: false,
      message: "FFmpeg cancelled.",
      cancelled: true,
      timedOut: false,
    };
  }
  if (result.exitClass === "timeout") {
    return {
      ok: false,
      message: "FFmpeg timed out.",
      cancelled: false,
      timedOut: true,
    };
  }
  if (result.exitClass !== "success") {
    return {
      ok: false,
      message: `FFmpeg encode failed (${result.exitClass}).`,
      cancelled: false,
      timedOut: false,
      quota: false,
    };
  }

  // MP4 +faststart can ignore -fs on some builds — enforce ceiling after write.
  const written =
    existsSync(input.outputPath) ? statSync(input.outputPath).size : 0;
  if (isOutputAtOrOverCeiling(written, input.maxOutputBytes)) {
    return {
      ok: false,
      message: "FFmpeg output exceeded authorized byte ceiling.",
      cancelled: false,
      timedOut: false,
      quota: true,
    };
  }

  return { ok: true, elapsedMs: result.elapsedMs };
}
