/**
 * Sprint 11E Phase 2E.2D.8K.1 — downloaded-artifact ffprobe verification for the
 * hosted 4K capacity matrix. Verifies native 2160x3840 dimensions, codec, and
 * container against the requested profile — and, for silent profiles, asserts
 * no audio stream is present (never "claims" audio that was not rendered).
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";

import type { Capacity4kProfileId } from "./capacity-4k-profile-audit";
import type { Capacity4kLiveAudioMode } from "./capacity-4k-live-fixtures";

export type Capacity4kArtifactVerifyFailClass =
  | "ffprobe_unavailable"
  | "ffprobe_invocation_failed"
  | "ffprobe_output_unparseable"
  | "wrong_dimensions"
  | "wrong_video_codec"
  | "wrong_container"
  | "unexpected_audio_stream"
  | "missing_required_audio_stream"
  | "wrong_audio_codec"
  | "duration_out_of_bounds";

export type Capacity4kArtifactVerifyResult =
  | {
      readonly ok: true;
      readonly width: number;
      readonly height: number;
      readonly videoCodec: string;
      readonly hasAudioStream: boolean;
      readonly audioCodec: string | null;
      readonly formatName: string;
    }
  | { readonly ok: false; readonly failClass: Capacity4kArtifactVerifyFailClass };

type FfprobeStream = {
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly width?: number;
  readonly height?: number;
};

type FfprobeOutput = {
  readonly streams?: readonly FfprobeStream[];
  readonly format?: { readonly format_name?: string; readonly duration?: string };
};

function isAcceptedContainer(
  formatName: string,
  profileContainer: "webm" | "mp4",
): boolean {
  const parts = formatName.toLowerCase().split(",").map((p) => p.trim());
  if (profileContainer === "webm") return parts.includes("webm") || parts.includes("matroska,webm");
  return parts.some((p) => p === "mp4" || p === "mov,mp4,m4a,3gp,3g2,mj2");
}

/**
 * Verify a downloaded 4K capacity artifact via `ffprobe -show_streams -show_format`.
 * Never trusts a container/codec claim from job metadata alone.
 */
export function verifyCapacity4kDownloadedArtifact(input: {
  readonly bytes: Uint8Array;
  readonly profileId: Capacity4kProfileId;
  readonly expectedContentMs: number;
  readonly expectedRenderMs: number;
  readonly audioMode: Capacity4kLiveAudioMode;
}): Capacity4kArtifactVerifyResult {
  const profile = HEADLESS_OUTPUT_PROFILES[input.profileId];
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!ffmpeg.ok) {
    return { ok: false, failClass: "ffprobe_unavailable" };
  }

  const dir = mkdtempSync(join(tmpdir(), "cap4k-artifact-"));
  const artifactPath = join(dir, `artifact${profile.extension}`);
  try {
    writeFileSync(artifactPath, input.bytes);
    const result = spawnSync(
      ffmpeg.ffprobeExecutable,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        artifactPath,
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    if (result.status !== 0 || typeof result.stdout !== "string") {
      return { ok: false, failClass: "ffprobe_invocation_failed" };
    }
    let parsed: FfprobeOutput;
    try {
      parsed = JSON.parse(result.stdout) as FfprobeOutput;
    } catch {
      return { ok: false, failClass: "ffprobe_output_unparseable" };
    }

    const streams = parsed.streams ?? [];
    const videoStream = streams.find((s) => s.codec_type === "video");
    const audioStream = streams.find((s) => s.codec_type === "audio");
    const formatName = parsed.format?.format_name ?? "";

    if (
      videoStream == null ||
      videoStream.width !== 2160 ||
      videoStream.height !== 3840
    ) {
      return { ok: false, failClass: "wrong_dimensions" };
    }
    if (videoStream.codec_name !== profile.videoCodec) {
      return { ok: false, failClass: "wrong_video_codec" };
    }
    if (!isAcceptedContainer(formatName, profile.container)) {
      return { ok: false, failClass: "wrong_container" };
    }

    const requiresAudio = input.audioMode === "with-voice-and-music";
    if (requiresAudio) {
      if (audioStream == null) {
        return { ok: false, failClass: "missing_required_audio_stream" };
      }
      if (audioStream.codec_name !== profile.audioCodec) {
        return { ok: false, failClass: "wrong_audio_codec" };
      }
    } else if (audioStream != null) {
      // Silent profile must never present a claimed audio stream.
      return { ok: false, failClass: "unexpected_audio_stream" };
    }

    const durationSec = Number(parsed.format?.duration ?? NaN);
    if (Number.isFinite(durationSec)) {
      const durationMs = durationSec * 1000;
      const lowerBoundMs = Math.max(0, input.expectedContentMs - 1_000);
      const upperBoundMs = input.expectedRenderMs + 3_000;
      if (durationMs < lowerBoundMs || durationMs > upperBoundMs) {
        return { ok: false, failClass: "duration_out_of_bounds" };
      }
    }

    return {
      ok: true,
      width: videoStream.width,
      height: videoStream.height,
      videoCodec: videoStream.codec_name ?? "",
      hasAudioStream: audioStream != null,
      audioCodec: audioStream?.codec_name ?? null,
      formatName,
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}
