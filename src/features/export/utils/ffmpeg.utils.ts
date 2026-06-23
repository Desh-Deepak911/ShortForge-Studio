const FFMPEG_CORE_VERSION = "0.12.6";
const FFMPEG_CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

import type { ExportBackgroundMusicMixSettings } from "./export-background-music.utils";
import { buildExportBackgroundMusicFilterChain, EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS } from "./export-background-music.utils";
import {
  buildFfmpegMusicInputFilename,
  buildFfmpegVoiceInputFilename,
  normalizeExportAudioInput,
  type ExportAudioInput,
  type ExportNormalizedAudioInput,
} from "./export-audio-input.utils";
import {
  createFfmpegLogCapture,
  describeFfmpegInputBlob,
  describeNormalizedFfmpegInput,
  formatFfmpegExecCommand,
  logFfmpegAudioMergeFailure,
} from "./ffmpeg-export-diagnostics.utils";

/** Browser-only FFmpeg.wasm helpers. Import dynamically from client export code. */
type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

let ffmpegInstance: FFmpegInstance | null = null;
let loadPromise: Promise<FFmpegInstance> | null = null;

export function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined";
}

export function isFFmpegLoaded(): boolean {
  return ffmpegInstance?.loaded ?? false;
}

/**
 * Returns a singleton FFmpeg.wasm instance loaded in the browser.
 * Safe to import from client components; throws if called during SSR.
 */
export async function getFFmpeg(): Promise<FFmpegInstance> {
  if (!isBrowserEnvironment()) {
    throw new Error("FFmpeg is only available in the browser");
  }

  if (ffmpegInstance?.loaded) {
    return ffmpegInstance;
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = loadFFmpegInternal();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    throw error;
  }
}

async function loadFFmpegInternal(): Promise<FFmpegInstance> {
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);

  const ffmpeg = new FFmpeg();

  await ffmpeg.load({
    coreURL: await toBlobURL(
      `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`,
      "text/javascript",
    ),
    wasmURL: await toBlobURL(
      `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
      "application/wasm",
    ),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

/**
 * Best-effort wipe of FFmpeg.wasm virtual FS files before terminating the worker.
 * Ignores errors when the worker is already unhealthy after a failed exec.
 */
async function clearFFmpegVirtualFilesystem(ffmpeg: FFmpegInstance): Promise<void> {
  try {
    const entries = await ffmpeg.listDir("/");
    await Promise.all(
      entries.map(async (entry) => {
        try {
          if (entry.isDir) {
            await ffmpeg.deleteDir(entry.name);
          } else {
            await ffmpeg.deleteFile(entry.name);
          }
        } catch {
          // Ignore stale or locked virtual files.
        }
      }),
    );
  } catch {
    // Worker may be unresponsive after a failed combined mux — terminate clears state.
  }
}

/**
 * Terminates the singleton FFmpeg.wasm worker and clears module-level state so the
 * next `getFFmpeg()` call loads a fresh instance with a clean virtual filesystem.
 * Use after a failed combined audio mux before running voice-only fallback.
 */
export async function resetFFmpeg(): Promise<void> {
  if (!isBrowserEnvironment()) {
    return;
  }

  loadPromise = null;

  const instance = ffmpegInstance;
  ffmpegInstance = null;

  if (!instance) {
    return;
  }

  if (instance.loaded) {
    await clearFFmpegVirtualFilesystem(instance);
  }

  try {
    instance.terminate();
  } catch {
    // Ignore — worker may already be terminated.
  }
}

const VIDEO_INPUT = "video.webm";
const MIXED_AUDIO_INPUT = "mixed-audio.webm";
const MUXED_OUTPUT_WEBM = "output.webm";
const MUXED_OUTPUT_MP4 = "output.mp4";

export type ExportAudioMuxOutputFormat = "webm" | "mp4";

interface MuxOutputProfile {
  outputFile: string;
  mimeType: string;
  codecArgs: string[];
}

function buildMuxOutputProfile(outputFormat: ExportAudioMuxOutputFormat): MuxOutputProfile {
  if (outputFormat === "mp4") {
    return {
      outputFile: MUXED_OUTPUT_MP4,
      mimeType: "video/mp4",
      codecArgs: [
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
      ],
    };
  }

  return {
    outputFile: MUXED_OUTPUT_WEBM,
    mimeType: "video/webm",
    codecArgs: ["-c:v", "copy", "-c:a", "libopus", "-b:a", "96k"],
  };
}

export function isMp4ExportBlob(blob: Blob): boolean {
  return blob.type.toLowerCase().includes("mp4");
}

async function cleanupFFmpegFiles(
  ffmpeg: FFmpegInstance,
  files: string[],
): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      try {
        await ffmpeg.deleteFile(file);
      } catch {
        // Ignore missing virtual files.
      }
    }),
  );
}

export interface MuxVideoWithAudioOptions {
  /** Target output duration in seconds (matches rendered video length). */
  videoDurationSec: number;
  /** FFmpeg mux progress from 0–100, when available. */
  onProgress?: (progress: number) => void;
  /** Defaults to webm (stream-copy video). */
  outputFormat?: ExportAudioMuxOutputFormat;
}

export interface MuxVideoWithExportAudioOptions extends MuxVideoWithAudioOptions {
  voiceoverInput?: ExportAudioInput;
  backgroundMusicInput?: ExportAudioInput;
  backgroundMusicMix?: ExportBackgroundMusicMixSettings;
  /**
   * WebM mux stream-copies canvas video (fast path).
   * MP4 mux encodes H.264 + AAC in the same pass — avoids a second transcode exec.
   */
  outputFormat?: ExportAudioMuxOutputFormat;
}

function formatFfmpegDuration(seconds: number): string {
  return Math.max(0.001, seconds).toFixed(3);
}

function buildVoiceFilterChain(inputIndex: number, durationSec: number, outputLabel: string): string {
  const duration = formatFfmpegDuration(durationSec);
  const filters = [
    ...EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS,
    `atrim=0:${duration}`,
    `apad=whole_dur=${duration}`,
    "volume=1",
  ];
  return `[${inputIndex}:a]${filters.join(",")}[${outputLabel}]`;
}

/**
 * Muxes a silent WebM video with optional narration and background music.
 * Combined export uses a simplified volume-only mix graph for FFmpeg.wasm stability.
 */
export async function muxVideoWithExportAudio(
  videoBlob: Blob,
  options: MuxVideoWithExportAudioOptions,
): Promise<Blob> {
  const [{ fetchFile }, ffmpeg] = await Promise.all([
    import("@ffmpeg/util"),
    getFFmpeg(),
  ]);

  const durationSec = options.videoDurationSec;
  const duration = formatFfmpegDuration(durationSec);
  const hasVoiceover = Boolean(options.voiceoverInput);
  const hasMusic = Boolean(options.backgroundMusicInput && options.backgroundMusicMix);

  if (!hasVoiceover && !hasMusic) {
    throw new Error("Export audio mux requires voiceover or background music");
  }

  const outputFormat = options.outputFormat ?? "webm";
  const outputProfile = buildMuxOutputProfile(outputFormat);

  const writtenFiles = [VIDEO_INPUT, outputProfile.outputFile];
  await ffmpeg.writeFile(VIDEO_INPUT, await fetchFile(videoBlob));

  const execArgs: string[] = ["-i", VIDEO_INPUT];
  let voiceInputIndex: number | null = null;
  let musicInputIndex: number | null = null;
  let nextInputIndex = 1;
  let voiceInputFilename: string | null = null;
  let normalizedVoiceover: ExportNormalizedAudioInput | null = null;

  if (hasVoiceover && options.voiceoverInput) {
    normalizedVoiceover = await normalizeExportAudioInput(options.voiceoverInput);
    voiceInputFilename = buildFfmpegVoiceInputFilename(normalizedVoiceover.extension);
    await ffmpeg.writeFile(voiceInputFilename, await fetchFile(normalizedVoiceover.blob));
    writtenFiles.push(voiceInputFilename);
    execArgs.push("-i", voiceInputFilename);
    voiceInputIndex = nextInputIndex;
    nextInputIndex += 1;
  }

  let musicInputFilename: string | null = null;
  let normalizedBackgroundMusic: ExportNormalizedAudioInput | null = null;
  if (hasMusic && options.backgroundMusicInput && options.backgroundMusicMix) {
    normalizedBackgroundMusic = await normalizeExportAudioInput(options.backgroundMusicInput);
    musicInputFilename = buildFfmpegMusicInputFilename(normalizedBackgroundMusic.extension);
    await ffmpeg.writeFile(musicInputFilename, await fetchFile(normalizedBackgroundMusic.blob));
    writtenFiles.push(musicInputFilename);
    execArgs.push("-i", musicInputFilename);
    musicInputIndex = nextInputIndex;
    nextInputIndex += 1;
  }

  let filterComplex = "";
  if (hasVoiceover && hasMusic && voiceInputIndex != null && musicInputIndex != null) {
    filterComplex = [
      buildExportBackgroundMusicFilterChain(
        musicInputIndex,
        durationSec,
        options.backgroundMusicMix!,
        "music",
      ),
      buildVoiceFilterChain(voiceInputIndex, durationSec, "voice"),
      "[voice][music]amix=inputs=2:duration=first:dropout_transition=0,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]",
    ].join(";");
  } else if (hasMusic && musicInputIndex != null && options.backgroundMusicMix) {
    filterComplex = buildExportBackgroundMusicFilterChain(
      musicInputIndex,
      durationSec,
      options.backgroundMusicMix,
      "aout",
    );
  } else if (hasVoiceover && voiceInputIndex != null) {
    filterComplex = `[${voiceInputIndex}:a]atrim=0:${duration},apad=whole_dur=${duration}[aout]`;
  }

  const handleProgress = ({ progress }: { progress: number; time?: number }) => {
    if (!options.onProgress) return;
    const normalized = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    options.onProgress(Math.round(normalized * 100));
  };

  const fullExecArgs = [
    ...execArgs,
    "-filter_complex",
    filterComplex,
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    ...outputProfile.codecArgs,
    "-t",
    duration,
    outputProfile.outputFile,
  ];

  const logCapture = createFfmpegLogCapture();
  let diagnosticsLogged = false;

  const emitAudioMergeFailureDiagnostics = (exitCode?: number) => {
    if (diagnosticsLogged) {
      return;
    }

    diagnosticsLogged = true;
    logFfmpegAudioMergeFailure({
      exitCode,
      command: formatFfmpegExecCommand(fullExecArgs),
      video: describeFfmpegInputBlob(VIDEO_INPUT, videoBlob),
      voiceover:
        normalizedVoiceover && voiceInputFilename
          ? describeNormalizedFfmpegInput(voiceInputFilename, normalizedVoiceover)
          : null,
      backgroundMusic:
        normalizedBackgroundMusic && musicInputFilename
          ? describeNormalizedFfmpegInput(musicInputFilename, normalizedBackgroundMusic)
          : null,
      stdout: logCapture.stdout,
      stderr: logCapture.stderr,
    });
  };

  ffmpeg.on("progress", handleProgress);
  ffmpeg.on("log", logCapture.handleLog);

  try {
    let exitCode: number | undefined;

    try {
      exitCode = await ffmpeg.exec(fullExecArgs);
    } catch (execError) {
      emitAudioMergeFailureDiagnostics(exitCode);
      throw execError;
    }

    if (exitCode !== 0) {
      emitAudioMergeFailureDiagnostics(exitCode);
      throw new Error("FFmpeg failed to combine video and audio");
    }

    const data = await ffmpeg.readFile(outputProfile.outputFile);
    if (typeof data === "string") {
      emitAudioMergeFailureDiagnostics(exitCode);
      throw new Error("Unexpected text output from FFmpeg");
    }

    options.onProgress?.(100);

    return new Blob([new Uint8Array(data)], { type: outputProfile.mimeType });
  } finally {
    ffmpeg.off("progress", handleProgress);
    ffmpeg.off("log", logCapture.handleLog);
    await cleanupFFmpegFiles(ffmpeg, writtenFiles);
  }
}

/**
 * Muxes a silent WebM video with a narration track in the browser.
 * Output length follows the video: shorter audio is padded with silence,
 * longer audio is trimmed to the video duration.
 */
export async function muxVideoWithAudio(
  videoBlob: Blob,
  voiceoverInput: ExportAudioInput,
  options: MuxVideoWithAudioOptions,
): Promise<Blob> {
  return muxVideoWithExportAudio(videoBlob, {
    ...options,
    voiceoverInput,
  });
}

/**
 * Muxes silent canvas WebM with pre-encoded Opus/WebM mixed audio.
 * Stream-copies both video and audio — no libopus re-encode in FFmpeg.wasm.
 */
export async function muxVideoWithStreamCopiedWebmAudio(
  videoBlob: Blob,
  preMixedAudioInput: ExportAudioInput,
  options: MuxVideoWithAudioOptions,
): Promise<Blob> {
  const [{ fetchFile }, ffmpeg] = await Promise.all([
    import("@ffmpeg/util"),
    getFFmpeg(),
  ]);

  const duration = formatFfmpegDuration(options.videoDurationSec);
  const normalizedAudio = await normalizeExportAudioInput(preMixedAudioInput);
  const audioInputFilename =
    normalizedAudio.extension === ".webm"
      ? MIXED_AUDIO_INPUT
      : `mixed-audio${normalizedAudio.extension}`;

  const writtenFiles = [VIDEO_INPUT, audioInputFilename, MUXED_OUTPUT_WEBM];
  await ffmpeg.writeFile(VIDEO_INPUT, await fetchFile(videoBlob));
  await ffmpeg.writeFile(audioInputFilename, await fetchFile(normalizedAudio.blob));

  const fullExecArgs = [
    "-i",
    VIDEO_INPUT,
    "-i",
    audioInputFilename,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-t",
    duration,
    MUXED_OUTPUT_WEBM,
  ];

  const handleProgress = ({ progress }: { progress: number; time?: number }) => {
    if (!options.onProgress) return;
    const normalized = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    options.onProgress(Math.round(normalized * 100));
  };

  const logCapture = createFfmpegLogCapture();
  let diagnosticsLogged = false;

  const emitAudioMergeFailureDiagnostics = (exitCode?: number) => {
    if (diagnosticsLogged) {
      return;
    }

    diagnosticsLogged = true;
    logFfmpegAudioMergeFailure({
      exitCode,
      command: formatFfmpegExecCommand(fullExecArgs),
      video: describeFfmpegInputBlob(VIDEO_INPUT, videoBlob),
      voiceover: describeNormalizedFfmpegInput(audioInputFilename, normalizedAudio),
      backgroundMusic: null,
      stdout: logCapture.stdout,
      stderr: logCapture.stderr,
    });
  };

  ffmpeg.on("progress", handleProgress);
  ffmpeg.on("log", logCapture.handleLog);

  try {
    let exitCode: number | undefined;

    try {
      exitCode = await ffmpeg.exec(fullExecArgs);
    } catch (execError) {
      emitAudioMergeFailureDiagnostics(exitCode);
      throw execError;
    }

    if (exitCode !== 0) {
      emitAudioMergeFailureDiagnostics(exitCode);
      throw new Error("FFmpeg failed to mux video with stream-copied audio");
    }

    const data = await ffmpeg.readFile(MUXED_OUTPUT_WEBM);
    if (typeof data === "string") {
      emitAudioMergeFailureDiagnostics(exitCode);
      throw new Error("Unexpected text output from FFmpeg");
    }

    options.onProgress?.(100);

    return new Blob([new Uint8Array(data)], { type: "video/webm" });
  } finally {
    ffmpeg.off("progress", handleProgress);
    ffmpeg.off("log", logCapture.handleLog);
    await cleanupFFmpegFiles(ffmpeg, writtenFiles);
  }
}

const TRANSCODE_INPUT = "transcode-input.webm";
const TRANSCODE_OUTPUT = "transcode-output.mp4";

export interface TranscodeWebmToMp4Options {
  /** Whether the input includes an audio track to preserve. */
  hasAudio?: boolean;
  onProgress?: (progress: number) => void;
}

/**
 * Converts a silent WebM export blob to MP4 (H.264, no audio).
 * Used for MP4 exports without narration — audio mux uses single-pass MP4 output instead.
 */
export async function transcodeWebmToMp4(
  videoBlob: Blob,
  options: TranscodeWebmToMp4Options = {},
): Promise<Blob> {
  const [{ fetchFile }, ffmpeg] = await Promise.all([
    import("@ffmpeg/util"),
    getFFmpeg(),
  ]);

  await ffmpeg.writeFile(TRANSCODE_INPUT, await fetchFile(videoBlob));

  const handleProgress = ({ progress }: { progress: number; time?: number }) => {
    if (!options.onProgress) return;
    const normalized = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    options.onProgress(Math.round(normalized * 100));
  };

  ffmpeg.on("progress", handleProgress);

  const args = options.hasAudio
    ? [
        "-i",
        TRANSCODE_INPUT,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        TRANSCODE_OUTPUT,
      ]
    : [
        "-i",
        TRANSCODE_INPUT,
        "-map",
        "0:v:0",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "23",
        "-an",
        "-movflags",
        "+faststart",
        TRANSCODE_OUTPUT,
      ];

  try {
    const exitCode = await ffmpeg.exec(args);

    if (exitCode !== 0) {
      throw new Error("FFmpeg failed to convert video to MP4");
    }

    const data = await ffmpeg.readFile(TRANSCODE_OUTPUT);
    if (typeof data === "string") {
      throw new Error("Unexpected text output from FFmpeg");
    }

    options.onProgress?.(100);

    return new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } finally {
    ffmpeg.off("progress", handleProgress);
    await cleanupFFmpegFiles(ffmpeg, [TRANSCODE_INPUT, TRANSCODE_OUTPUT]);
  }
}
