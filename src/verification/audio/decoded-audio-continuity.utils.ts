/**
 * Provider-free decoded audio continuity analysis (Sprint 11E 2G.24D).
 * Safe aggregate measurements only — no raw user audio in evidence output.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";

/** Opus/AAC encoder priming — do not classify as scene-transition gap. */
export const DECODED_AUDIO_CODEC_PREROLL_MS = 120;

/** RMS below this (linear) is treated as silence for gap detection. */
export const DECODED_AUDIO_SILENCE_RMS_LINEAR = 0.002;

/** Max adjacent-window delta treated as non-click continuity. */
export const DECODED_AUDIO_CLICK_SCORE_THRESHOLD = 0.35;

/** Duration parity tolerance after encode/decode round-trip. */
export const DECODED_AUDIO_DURATION_TOLERANCE_MS = 150;

export interface DecodedAudioMetrics {
  readonly durationSec: number;
  readonly sampleRateHz: number;
  readonly channelCount: number;
  readonly firstNonSilentSampleIndex: number | null;
  readonly lastNonSilentSampleIndex: number | null;
  readonly longestSilentRunSamples: number;
  readonly longestSilentRunMs: number;
  readonly peakAmplitude: number;
  readonly overallRms: number;
  readonly clickScore: number;
  readonly ptsMonotonic: boolean;
}

export interface WindowRmsSample {
  readonly startSec: number;
  readonly endSec: number;
  readonly rmsLinear: number;
}

export interface NativeFfmpegBins {
  readonly ffmpegExecutable: string;
  readonly ffprobeExecutable: string;
}

export function requireNativeFfmpeg(): NativeFfmpegBins | null {
  const bins = resolveNativeFfmpegBinaries();
  if (!bins.ok) return null;
  return {
    ffmpegExecutable: bins.ffmpegExecutable,
    ffprobeExecutable: bins.ffprobeExecutable,
  };
}

export function writeSineWav(
  bins: NativeFfmpegBins,
  path: string,
  frequency: number,
  durationSec: number,
): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const r = spawnSync(
    bins.ffmpegExecutable,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=${durationSec.toFixed(3)}`,
      "-ac",
      "2",
      "-ar",
      "48000",
      path,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr || "writeSineWav failed");
  }
}

export function writeSilentGapVoiceWav(
  bins: NativeFfmpegBins,
  path: string,
  toneSec: number,
  gapSec: number,
  frequency = 440,
): void {
  const dir = mkdtempSync(join(tmpdir(), "dac-gap-"));
  const partA = join(dir, "a.wav");
  const partB = join(dir, "b.wav");
  writeSineWav(bins, partA, frequency, toneSec);
  writeSineWav(bins, partB, frequency, toneSec);
  const silence = spawnSync(
    bins.ffmpegExecutable,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=48000:cl=stereo:d=${gapSec.toFixed(3)}`,
      join(dir, "gap.wav"),
    ],
    { encoding: "utf8" },
  );
  if (silence.status !== 0) throw new Error(silence.stderr || "gap synth failed");
  const cat = spawnSync(
    bins.ffmpegExecutable,
    [
      "-y",
      "-i",
      partA,
      "-i",
      join(dir, "gap.wav"),
      "-i",
      partB,
      "-filter_complex",
      "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
      "-map",
      "[a]",
      path,
    ],
    { encoding: "utf8" },
  );
  if (cat.status !== 0) throw new Error(cat.stderr || "concat failed");
}

export function decodeToMonoPcm(
  bins: NativeFfmpegBins,
  mediaPath: string,
): { pcm: Float32Array; sampleRateHz: number; channelCount: number } {
  const dir = mkdtempSync(join(tmpdir(), "dac-pcm-"));
  const rawPath = join(dir, "out.f32le");
  const r = spawnSync(
    bins.ffmpegExecutable,
    [
      "-y",
      "-i",
      mediaPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-f",
      "f32le",
      rawPath,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr || "decode failed");
  const buf = readFileSync(rawPath);
  const pcm = new Float32Array(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return { pcm, sampleRateHz: 48000, channelCount: 1 };
}

function rmsLinear(samples: Float32Array, start: number, end: number): number {
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(samples.length, Math.ceil(end));
  if (to <= from) return 0;
  let sum = 0;
  for (let i = from; i < to; i += 1) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / (to - from));
}

export function analyzeDecodedPcm(
  pcm: Float32Array,
  sampleRateHz: number,
): DecodedAudioMetrics {
  let peak = 0;
  let sumSq = 0;
  let firstNonSilent: number | null = null;
  let lastNonSilent: number | null = null;
  let longestSilent = 0;
  let currentSilent = 0;

  for (let i = 0; i < pcm.length; i += 1) {
    const v = pcm[i]!;
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    sumSq += v * v;
    if (abs >= DECODED_AUDIO_SILENCE_RMS_LINEAR) {
      if (firstNonSilent == null) firstNonSilent = i;
      lastNonSilent = i;
      if (currentSilent > longestSilent) longestSilent = currentSilent;
      currentSilent = 0;
    } else {
      currentSilent += 1;
    }
  }
  if (currentSilent > longestSilent) longestSilent = currentSilent;

  const windowSamples = Math.max(1, Math.round(sampleRateHz * 0.005));
  let clickScore = 0;
  for (let i = windowSamples; i < pcm.length; i += windowSamples) {
    const prev = pcm[i - windowSamples]!;
    const cur = pcm[i]!;
    clickScore = Math.max(clickScore, Math.abs(cur - prev));
  }

  return {
    durationSec: pcm.length / sampleRateHz,
    sampleRateHz,
    channelCount: 1,
    firstNonSilentSampleIndex: firstNonSilent,
    lastNonSilentSampleIndex: lastNonSilent,
    longestSilentRunSamples: longestSilent,
    longestSilentRunMs: (longestSilent / sampleRateHz) * 1000,
    peakAmplitude: peak,
    overallRms: pcm.length > 0 ? Math.sqrt(sumSq / pcm.length) : 0,
    clickScore,
    ptsMonotonic: true,
  };
}

export function windowRmsSeries(
  pcm: Float32Array,
  sampleRateHz: number,
  windowMs: number,
  startSec: number,
  endSec: number,
): WindowRmsSample[] {
  const windowSamples = Math.max(1, Math.round((sampleRateHz * windowMs) / 1000));
  const start = Math.max(0, Math.floor(startSec * sampleRateHz));
  const end = Math.min(pcm.length, Math.ceil(endSec * sampleRateHz));
  const out: WindowRmsSample[] = [];
  for (let i = start; i < end; i += windowSamples) {
    const wEnd = Math.min(end, i + windowSamples);
    out.push({
      startSec: i / sampleRateHz,
      endSec: wEnd / sampleRateHz,
      rmsLinear: rmsLinear(pcm, i, wEnd),
    });
  }
  return out;
}

export function renderFilterComplexToFile(input: {
  bins: NativeFfmpegBins;
  filterComplex: string;
  voicePath?: string;
  musicPath?: string;
  outputPath: string;
  outputDurationSec: number;
  codec: "opus" | "aac";
}): void {
  const args = ["-y"];
  let nextIndex = 0;
  if (input.voicePath) {
    args.push("-i", input.voicePath);
    nextIndex += 1;
  }
  if (input.musicPath) {
    args.push("-i", input.musicPath);
  }
  args.push(
    "-filter_complex",
    input.filterComplex,
    "-map",
    "[aout]",
    "-t",
    input.outputDurationSec.toFixed(3),
  );
  if (input.codec === "opus") {
    args.push("-c:a", "libopus", "-b:a", "96k", input.outputPath);
  } else {
    args.push("-c:a", "aac", "-b:a", "128k", input.outputPath);
  }
  const r = spawnSync(input.bins.ffmpegExecutable, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || "renderFilterComplex failed");
}

export function probeMediaDurationMs(
  bins: NativeFfmpegBins,
  path: string,
): number | null {
  const r = spawnSync(
    bins.ffprobeExecutable,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return null;
  const sec = Number(r.stdout.trim());
  return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
}

export function probeAudioPtsMonotonic(
  bins: NativeFfmpegBins,
  path: string,
): boolean {
  const r = spawnSync(
    bins.ffprobeExecutable,
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "packet=pts_time",
      "-of",
      "csv=p=0",
      path,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return false;
  const pts = r.stdout
    .trim()
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((v) => Number.isFinite(v));
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i]! + 1e-6 < pts[i - 1]!) return false;
  }
  return pts.length > 0;
}

export function writeImpulseWav(
  bins: NativeFfmpegBins,
  path: string,
  impulseTimesSec: readonly number[],
  totalDurationSec: number,
): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const expr = impulseTimesSec
    .map((t) => `between(t\\,${t.toFixed(4)}\\,${(t + 0.002).toFixed(4)})`)
    .join("+");
  const lavfi = `aevalsrc=exprs=${expr}|${expr}:sample_rate=48000:duration=${totalDurationSec.toFixed(3)}`;
  const r = spawnSync(
    bins.ffmpegExecutable,
    ["-y", "-f", "lavfi", "-i", lavfi, "-ac", "2", path],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(r.stderr || "impulse wav failed");
}

export function tempWavPath(prefix: string): string {
  return join(mkdtempSync(join(tmpdir(), prefix)), "tone.wav");
}

export function safeUnlink(path: string | undefined): void {
  if (!path) return;
  try {
    unlinkSync(path);
  } catch {
    // ignore
  }
}

export function writeMetricsReport(metrics: DecodedAudioMetrics): string {
  return [
    `durationSec=${metrics.durationSec.toFixed(3)}`,
    `sampleRateHz=${metrics.sampleRateHz}`,
    `channels=${metrics.channelCount}`,
    `peak=${metrics.peakAmplitude.toFixed(4)}`,
    `rms=${metrics.overallRms.toFixed(4)}`,
    `longestSilentMs=${metrics.longestSilentRunMs.toFixed(1)}`,
    `clickScore=${metrics.clickScore.toFixed(4)}`,
    `ptsMonotonic=${metrics.ptsMonotonic}`,
  ].join(" ");
}
