/**
 * Shared encode-quality measurement helpers (ideal-ref vs encoded).
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function runCmd(
  command: string,
  args: readonly string[],
): { readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}\n${
        result.stderr || result.stdout
      }`,
    );
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function probeMedia(
  ffprobe: string,
  path: string,
): {
  readonly width: number;
  readonly height: number;
  readonly fps: number | null;
  readonly frameCount: number | null;
  readonly durationSec: number | null;
  readonly codec: string | null;
  readonly profile: string | null;
  readonly level: string | null;
  readonly pixelFormat: string | null;
  readonly bitRate: number | null;
  readonly colorSpace: string | null;
  readonly colorPrimaries: string | null;
  readonly colorTransfer: string | null;
} {
  const { stdout } = runCmd(ffprobe, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,avg_frame_rate,nb_frames,duration,codec_name,profile,level,pix_fmt,bit_rate,color_space,color_primaries,color_transfer:format=duration,bit_rate",
    "-of",
    "json",
    path,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<Record<string, string>>;
    format?: Record<string, string>;
  };
  const stream = parsed.streams?.[0] ?? {};
  const format = parsed.format ?? {};
  const fpsRaw = stream.avg_frame_rate ?? "";
  let fps: number | null = null;
  if (fpsRaw.includes("/")) {
    const [a, b] = fpsRaw.split("/").map(Number);
    if (a && b) fps = a / b;
  }
  return {
    width: Number(stream.width ?? 0),
    height: Number(stream.height ?? 0),
    fps,
    frameCount: stream.nb_frames ? Number(stream.nb_frames) : null,
    durationSec: Number(stream.duration ?? format.duration ?? NaN) || null,
    codec: stream.codec_name ?? null,
    profile: stream.profile ?? null,
    level: stream.level ?? null,
    pixelFormat: stream.pix_fmt ?? null,
    bitRate: Number(stream.bit_rate ?? format.bit_rate ?? NaN) || null,
    colorSpace: stream.color_space ?? null,
    colorPrimaries: stream.color_primaries ?? null,
    colorTransfer: stream.color_transfer ?? null,
  };
}

export function measureSsimPsnr(input: {
  readonly ffmpeg: string;
  readonly actualPath: string;
  readonly referencePath: string;
  /** Crop to exclude title/caption bands when comparing encoder fidelity. */
  readonly maskCrop?: string;
  readonly structuralEdges: boolean;
}): { readonly ssim: number; readonly psnr: number | null } {
  const crop = input.maskCrop ? `${input.maskCrop},` : "";
  const lavfi = input.structuralEdges
    ? `[0:v]${crop}edgedetect=low=0.05:high=0.2[a];[1:v]${crop}edgedetect=low=0.05:high=0.2[b];[a][b]ssim;[0:v]${crop}null[c];[1:v]${crop}null[d];[c][d]psnr`
    : `[0:v]${crop}null[a];[1:v]${crop}null[b];[a][b]ssim;[0:v]${crop}null[c];[1:v]${crop}null[d];[c][d]psnr`;
  const { stderr, stdout } = runCmd(input.ffmpeg, [
    "-i",
    input.actualPath,
    "-i",
    input.referencePath,
    "-lavfi",
    lavfi,
    "-f",
    "null",
    "-",
  ]);
  const text = `${stdout}\n${stderr}`;
  const ssimMatch = text.match(/All:([0-9.]+)/g)?.at(-1)?.match(/All:([0-9.]+)/);
  const psnrMatch = text.match(/average:([0-9.]+)/i);
  if (!ssimMatch) {
    throw new Error(`Unable to parse SSIM:\n${text}`);
  }
  return {
    ssim: Number(ssimMatch[1]),
    psnr: psnrMatch ? Number(psnrMatch[1]) : null,
  };
}

export function tryMeasureVmaf(input: {
  readonly ffmpeg: string;
  readonly actualPath: string;
  readonly referencePath: string;
}): number | null {
  const result = spawnSync(
    input.ffmpeg,
    [
      "-i",
      input.actualPath,
      "-i",
      input.referencePath,
      "-lavfi",
      "libvmaf",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) return null;
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = text.match(/VMAF score:\s*([0-9.]+)/i);
  return match ? Number(match[1]) : null;
}

/** Exclude top title band + bottom caption band from encoder comparisons. */
export function textSafeCrop(
  width: number,
  height: number,
): string {
  const top = Math.round(height * 0.14);
  const bottom = Math.round(height * 0.22);
  const cropH = Math.max(64, height - top - bottom);
  return `crop=${width}:${cropH}:0:${top}`;
}

export function detectFrozenOrDuplicateFrames(input: {
  readonly ffmpeg: string;
  readonly ffprobe: string;
  readonly videoPath: string;
  readonly workDir: string;
  readonly expectedFrameCount?: number;
}): {
  readonly sampledFrames: number;
  readonly uniqueHashes: number;
  readonly maxDuplicateRun: number;
  readonly freezeDetectEvents: number;
  readonly packetCount: number;
  readonly duplicatePtsCount: number;
  readonly monotonicPts: boolean;
} {
  mkdirSync(input.workDir, { recursive: true });
  const pattern = join(input.workDir, "frame-%03d.png");
  runCmd(input.ffmpeg, [
    "-y",
    "-i",
    input.videoPath,
    "-vsync",
    "0",
    "-frames:v",
    "24",
    pattern,
  ]);
  const hashes: string[] = [];
  for (let i = 1; i <= 24; i += 1) {
    const framePath = join(
      input.workDir,
      `frame-${String(i).padStart(3, "0")}.png`,
    );
    try {
      const bytes = readFileSync(framePath);
      const sample = bytes.subarray(0, Math.min(4096, bytes.length));
      hashes.push(
        `${bytes.length}:${Buffer.from(sample).toString("base64url").slice(0, 48)}`,
      );
    } catch {
      break;
    }
  }
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < hashes.length; i += 1) {
    if (hashes[i] === hashes[i - 1]) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 1;
    }
  }

  const freeze = spawnSync(
    input.ffmpeg,
    [
      "-i",
      input.videoPath,
      "-vf",
      "freezedetect=n=0.001:d=0.5",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  const freezeText = `${freeze.stdout ?? ""}\n${freeze.stderr ?? ""}`;
  const freezeDetectEvents = (
    freezeText.match(/lavfi\.freezedetect\.freeze_start/g) ?? []
  ).length;

  const packets = runCmd(input.ffprobe, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "packet=pts_time",
    "-of",
    "csv=p=0",
    input.videoPath,
  ]).stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));

  const ptsSet = new Set(packets.map((p) => p.toFixed(6)));
  const duplicatePtsCount = packets.length - ptsSet.size;
  let monotonicPts = true;
  for (let i = 1; i < packets.length; i += 1) {
    if (packets[i]! < packets[i - 1]!) {
      monotonicPts = false;
      break;
    }
  }

  return {
    sampledFrames: hashes.length,
    uniqueHashes: new Set(hashes).size,
    maxDuplicateRun: maxRun,
    freezeDetectEvents,
    packetCount: packets.length,
    duplicatePtsCount,
    monotonicPts,
  };
}

/**
 * Encode a still PNG sequence with Headless production H.264 args (bitrate mode).
 * Separates encoder loss from Chromium/page draw cost.
 */
export function encodePngStillWithHeadlessMp4Args(input: {
  readonly ffmpeg: string;
  readonly pngPath: string;
  readonly outputPath: string;
  readonly fps: number;
  readonly frameCount: number;
  readonly videoBitrate: string;
}): { readonly elapsedMs: number; readonly bytes: number } {
  const started = Date.now();
  // Repeat one PNG as a short CFR sequence.
  runCmd(input.ffmpeg, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-framerate",
    String(input.fps),
    "-i",
    input.pngPath,
    "-frames:v",
    String(input.frameCount),
    "-c:v",
    "libx264",
    "-b:v",
    input.videoBitrate,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-g",
    String(Math.max(1, input.fps)),
    "-an",
    input.outputPath,
  ]);
  const bytes = readFileSync(input.outputPath).byteLength;
  return { elapsedMs: Date.now() - started, bytes };
}

/**
 * Browser-like intermediate: PNG → JPEG(q) → short libvpx WebM → optional H.264.
 * Isolates JPEG intermediate loss from geometry.
 */
export function encodeWithBrowserJpegIntermediate(input: {
  readonly ffmpeg: string;
  readonly pngPath: string;
  readonly workDir: string;
  readonly outputMp4Path: string;
  readonly jpegQuality: number;
  readonly libvpxBitrate: string;
  readonly libvpxDeadline: "realtime" | "good";
  readonly libvpxCpuUsed: number;
  readonly h264Crf: number;
  readonly frameCount: number;
  readonly fps: number;
}): {
  readonly elapsedMs: number;
  readonly bytes: number;
  readonly jpegBytes: number;
} {
  mkdirSync(input.workDir, { recursive: true });
  const jpegPath = join(input.workDir, "frame.jpg");
  const webmPath = join(input.workDir, "segment.webm");
  const started = Date.now();
  // FFmpeg JPEG qscale: 2 best … 31 worst. Map canvas 0–1 quality → qscale.
  const qscale = Math.max(
    2,
    Math.min(8, Math.round(2 + (1 - input.jpegQuality) * 18)),
  );
  runCmd(input.ffmpeg, [
    "-y",
    "-i",
    input.pngPath,
    "-q:v",
    String(qscale),
    jpegPath,
  ]);
  const jpegBytes = readFileSync(jpegPath).byteLength;
  runCmd(input.ffmpeg, [
    "-y",
    "-loop",
    "1",
    "-framerate",
    String(input.fps),
    "-i",
    jpegPath,
    "-frames:v",
    String(input.frameCount),
    "-c:v",
    "libvpx",
    "-b:v",
    input.libvpxBitrate,
    "-pix_fmt",
    "yuv420p",
    "-deadline",
    input.libvpxDeadline,
    "-cpu-used",
    String(input.libvpxCpuUsed),
    "-auto-alt-ref",
    "0",
    "-g",
    String(input.frameCount),
    "-an",
    webmPath,
  ]);
  runCmd(input.ffmpeg, [
    "-y",
    "-i",
    webmPath,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    String(input.h264Crf),
    "-movflags",
    "+faststart",
    "-an",
    input.outputMp4Path,
  ]);
  return {
    elapsedMs: Date.now() - started,
    bytes: readFileSync(input.outputMp4Path).byteLength,
    jpegBytes,
  };
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
