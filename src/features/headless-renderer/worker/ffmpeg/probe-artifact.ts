/**
 * ffprobe artifact facts — no invented codecs/channels; no paths in diagnostics.
 */

import { parseFfprobeFrameRate } from "./canonical-fps";
import { spawnFixedArgv } from "./spawn-process";

export interface HeadlessProbedArtifact {
  readonly width: number | null;
  readonly height: number | null;
  readonly fps: number | null;
  readonly durationMs: number | null;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly audioChannels: number | null;
  readonly audioSampleRateHz: number | null;
  readonly formatName: string | null;
  /** Present when ffprobe reports it; never invented. */
  readonly pixelFormat: string | null;
}

export async function probeArtifactWithFfprobe(input: {
  ffprobeExecutable: string;
  artifactPath: string;
  timeoutMs: number;
  maxStderrBytes: number;
  signal?: AbortSignal;
  processGraceMs?: number;
}): Promise<
  | { readonly ok: true; readonly probe: HeadlessProbedArtifact }
  | { readonly ok: false; readonly message: string }
> {
  const result = await spawnFixedArgv({
    executable: input.ffprobeExecutable,
    args: [
      "-v",
      "error",
      "-show_entries",
      "format=duration,format_name:stream=codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate,pix_fmt",
      "-of",
      "json",
      input.artifactPath,
    ],
    timeoutMs: input.timeoutMs,
    maxStderrBytes: input.maxStderrBytes,
    signal: input.signal,
    processGraceMs: input.processGraceMs,
  });

  if (result.exitClass !== "success") {
    return { ok: false, message: `ffprobe failed (${result.exitClass}).` };
  }

  let parsed: {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      channels?: number;
      sample_rate?: string | number;
      pix_fmt?: string;
    }>;
  };
  try {
    parsed = JSON.parse(result.stdout) as typeof parsed;
  } catch {
    return { ok: false, message: "ffprobe returned malformed JSON." };
  }

  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const durationSec = parsed.format?.duration
    ? Number(parsed.format.duration)
    : NaN;

  const fps = parseFfprobeFrameRate(video?.r_frame_rate);

  const sampleRateRaw = audio?.sample_rate;
  const sampleRateHz =
    sampleRateRaw == null
      ? null
      : Number(sampleRateRaw);

  return {
    ok: true,
    probe: {
      width: video?.width ?? null,
      height: video?.height ?? null,
      fps,
      durationMs: Number.isFinite(durationSec)
        ? Math.round(durationSec * 1000)
        : null,
      hasVideo: video != null,
      hasAudio: audio != null,
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio?.codec_name ?? null,
      audioChannels:
        audio?.channels != null && Number.isFinite(audio.channels)
          ? audio.channels
          : null,
      audioSampleRateHz:
        sampleRateHz != null && Number.isFinite(sampleRateHz)
          ? sampleRateHz
          : null,
      formatName: parsed.format?.format_name ?? null,
      pixelFormat:
        typeof video?.pix_fmt === "string" && video.pix_fmt.length > 0
          ? video.pix_fmt
          : null,
    },
  };
}
