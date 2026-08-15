const FFMPEG_CORE_VERSION = "0.12.6";
const FFMPEG_CORE_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

import type { ExportBackgroundMusicMixSettings } from "./export-background-music.utils";
import {
  PEAK_PROTECTION_GAIN_THRESHOLD,
} from "@/features/audio-mixer/audio-mixer.peak-protection.utils";
import {
  buildExportBackgroundMusicFilterChain,
  EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS,
  resolveExportBackgroundMusicDurationSec,
} from "./export-background-music.utils";
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
import {
  buildVoiceMasteringFfmpegFilters,
  resolveVoiceMasteringPlan,
} from "@/features/voice-quality";

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

function buildMuxOutputProfile(
  outputFormat: ExportAudioMuxOutputFormat,
  options?: { readonly h264Crf?: number },
): MuxOutputProfile {
  if (outputFormat === "mp4") {
    const crf =
      typeof options?.h264Crf === "number" && Number.isFinite(options.h264Crf)
        ? Math.min(28, Math.max(15, Math.round(options.h264Crf)))
        : 23;
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
        String(crf),
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
    codecArgs: ["-c:v", "copy", "-c:a", "libopus", "-b:a", "128k"],
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
  /** Voice stem gain when muxing narration — defaults to 1. */
  voiceGain?: number;
  /** Frozen peak-protection decision from ExportManifest. */
  applyPeakProtection?: boolean;
  voiceMasteringProfile?: "generated_speech_v1";
}

export interface MuxVideoWithExportAudioOptions extends MuxVideoWithAudioOptions {
  voiceoverInput?: ExportAudioInput;
  backgroundMusicInput?: ExportAudioInput;
  backgroundMusicMix?: ExportBackgroundMusicMixSettings;
  /** Voice stem gain when muxing narration — defaults to mix settings or 1. */
  voiceGain?: number;
  /** Frozen peak-protection decision from ExportManifest (voice-only and mixed). */
  applyPeakProtection?: boolean;
  /** Sprint 6H — H.264 CRF for MP4 mux (from ExportVisualQualityProfile). */
  h264Crf?: number;
  /**
   * WebM mux stream-copies canvas video (fast path).
   * MP4 mux encodes H.264 + AAC in the same pass — avoids a second transcode exec.
   */
  outputFormat?: ExportAudioMuxOutputFormat;
}

function formatFfmpegDuration(seconds: number): string {
  return Math.max(0.001, seconds).toFixed(3);
}

function buildVoiceFilterChain(
  inputIndex: number,
  durationSec: number,
  outputLabel: string,
  voiceGain = 1,
  masteringProfile?: "generated_speech_v1",
): string {
  const duration = formatFfmpegDuration(durationSec);
  const filters = [
    ...EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS,
    `atrim=0:${duration}`,
    `apad=whole_dur=${duration}`,
    ...(() => {
      const plan = resolveVoiceMasteringPlan(masteringProfile);
      return plan ? buildVoiceMasteringFfmpegFilters(plan) : [];
    })(),
    `volume=${voiceGain.toFixed(4)}`,
  ];
  return `[${inputIndex}:a]${filters.join(",")}[${outputLabel}]`;
}

function resolveExportPeakProtectionActive(
  mixSettings: ExportBackgroundMusicMixSettings | null | undefined,
  voiceGain: number,
  explicit?: boolean,
): boolean {
  if (typeof explicit === "boolean") return explicit;
  return mixSettings?.applyPeakProtection ?? voiceGain > PEAK_PROTECTION_GAIN_THRESHOLD;
}

/**
 * Clamp export mux gains to finite non-negative values.
 * Stem gain may exceed 1 (Preview/export allow bus×master up to 4).
 */
export function normalizeExportMuxGain(gain: unknown, fallback = 1): number {
  if (typeof gain !== "number" || !Number.isFinite(gain) || gain < 0) {
    return fallback;
  }
  return gain;
}

/**
 * FFmpeg.wasm audio mux filter graph.
 *
 * Stem gain is applied with `volume=`. Post-mix `alimiter` is intentionally NOT
 * used here: the browser @ffmpeg core aborts mux when alimiter is linked after
 * Sprint 6G re-enabled peak protection (visual encode succeeds; audio mux fails).
 * Browser offline mix still applies DynamicsCompressor when applyPeakProtection.
 */
export function buildMuxVideoExportAudioFilterComplex(input: {
  readonly hasVoiceover: boolean;
  readonly hasMusic: boolean;
  readonly voiceInputIndex: number | null;
  readonly musicInputIndex: number | null;
  readonly durationSec: number;
  readonly voiceGain: number;
  readonly backgroundMusicMix?: ExportBackgroundMusicMixSettings | null;
  readonly voiceMasteringProfile?: "generated_speech_v1";
}): string {
  const voiceGain = normalizeExportMuxGain(input.voiceGain, 1);
  const { hasVoiceover, hasMusic, voiceInputIndex, musicInputIndex, durationSec } = input;

  if (hasVoiceover && hasMusic && voiceInputIndex != null && musicInputIndex != null) {
    const mixBase =
      "[voice][music]amix=inputs=2:duration=first:dropout_transition=0,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
    return [
      buildExportBackgroundMusicFilterChain(
        musicInputIndex,
        input.backgroundMusicMix!,
        "music",
      ),
      buildVoiceFilterChain(
        voiceInputIndex,
        durationSec,
        "voice",
        voiceGain,
        input.voiceMasteringProfile,
      ),
      `${mixBase}[aout]`,
    ].join(";");
  }

  if (hasMusic && musicInputIndex != null && input.backgroundMusicMix) {
    return buildExportBackgroundMusicFilterChain(
      musicInputIndex,
      input.backgroundMusicMix,
      "aout",
    );
  }

  if (hasVoiceover && voiceInputIndex != null) {
    return buildVoiceOnlyFilterChain(
      voiceInputIndex,
      durationSec,
      voiceGain,
      input.voiceMasteringProfile,
    );
  }

  return "";
}

function buildVoiceOnlyFilterChain(
  inputIndex: number,
  durationSec: number,
  voiceGain = 1,
  masteringProfile?: "generated_speech_v1",
): string {
  const duration = formatFfmpegDuration(durationSec);
  const filters = [`atrim=0:${duration}`, `apad=whole_dur=${duration}`];
  const mastering = resolveVoiceMasteringPlan(masteringProfile);
  if (mastering) {
    filters.push(...buildVoiceMasteringFfmpegFilters(mastering));
  }
  if (voiceGain !== 1) {
    filters.push(`volume=${voiceGain.toFixed(4)}`);
  }
  return `[${inputIndex}:a]${filters.join(",")}[aout]`;
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

  const musicExportDurationSec = options.backgroundMusicMix
    ? resolveExportBackgroundMusicDurationSec(options.backgroundMusicMix.exportDurationMs)
    : null;
  const durationSec = musicExportDurationSec ?? options.videoDurationSec;
  const duration = formatFfmpegDuration(durationSec);
  const hasVoiceover = Boolean(options.voiceoverInput);
  const hasMusic = Boolean(options.backgroundMusicInput && options.backgroundMusicMix);

  if (!hasVoiceover && !hasMusic) {
    throw new Error("Export audio mux requires voiceover or background music");
  }

  const outputFormat = options.outputFormat ?? "webm";
  const outputProfile = buildMuxOutputProfile(outputFormat, {
    h264Crf: options.h264Crf,
  });

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

  const voiceGain = normalizeExportMuxGain(
    options.voiceGain ?? options.backgroundMusicMix?.voiceGain ?? 1,
    1,
  );
  // Peak-protection boolean is retained for diagnostics / browser mix parity.
  // FFmpeg.wasm must not inject alimiter (see buildMuxVideoExportAudioFilterComplex).
  void resolveExportPeakProtectionActive(
    options.backgroundMusicMix,
    voiceGain,
    options.applyPeakProtection,
  );

  const filterComplex = buildMuxVideoExportAudioFilterComplex({
    hasVoiceover,
    hasMusic,
    voiceInputIndex,
    musicInputIndex,
    durationSec,
    voiceGain,
    backgroundMusicMix: options.backgroundMusicMix,
    voiceMasteringProfile: options.voiceMasteringProfile,
  });

  if (!filterComplex) {
    throw new Error("Export audio mux requires a valid filter graph");
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
  /** Sprint 6H — H.264 CRF from ExportVisualQualityProfile (default 23). */
  h264Crf?: number;
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

  const crf =
    typeof options.h264Crf === "number" && Number.isFinite(options.h264Crf)
      ? Math.min(28, Math.max(15, Math.round(options.h264Crf)))
      : 23;

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
        String(crf),
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
        String(crf),
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

const SILENT_TIMING_INPUT = "silent-timing-in.webm";
const SILENT_TIMING_OUTPUT = "silent-timing-out.webm";

/**
 * Rebuilds a manually captured silent WebM to constant frame rate.
 *
 * Strategy (4.2C-8B.2): MediaRecorder timestamps are unusable. Extract every
 * decoded frame (vsync 0), then encode an image sequence with `-framerate` as
 * the sole timing authority so PTS = frameIndex / fps.
 *
 * Video-only libvpx re-encode. Final audio mux should `-c:v copy` this result.
 */
export async function normalizeSilentVisualFrameTiming(
  videoBlob: Blob,
  options: {
    fps: number;
    /** @deprecated Prefer frameCount; retained for call-site compatibility. */
    durationSec?: number;
    /** Canonical frame count from manual capture (required for CFR rebuild). */
    frameCount: number;
    onProgress?: (progress: number) => void;
  },
): Promise<Blob> {
  const [{ fetchFile }, ffmpeg] = await Promise.all([
    import("@ffmpeg/util"),
    getFFmpeg(),
  ]);

  const {
    buildSilentVisualFrameExtractArgs,
    buildSilentVisualFrameSequenceEncodeArgs,
    listNormalizedFrameFilenames,
    SILENT_VISUAL_NORMALIZE_STRATEGY,
  } = await import("@/features/export/utils/export-timestamp-normalization.utils");

  const {
    ExportPipelineError,
    assertExtractedFrameSet,
    emitExportStageEvent,
    isExportDebugEnabled,
    listFfmpegMemfsEntries,
    captureExportJsHeapSnapshot,
    summarizeExtractedJpegFiles,
  } = await import("@/features/export/utils/export-pipeline-forensics.utils");

  const fps = options.fps > 0 && Number.isFinite(options.fps) ? options.fps : 30;
  const frameCount = Math.max(1, Math.floor(options.frameCount));
  const cleanupFrameFiles = listNormalizedFrameFilenames(frameCount + 4);
  const writtenFiles = [SILENT_TIMING_INPUT, SILENT_TIMING_OUTPUT, ...cleanupFrameFiles];

  const extractStartedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  emitExportStageEvent({
    stage: "extract-frame-sequence",
    status: "start",
    startedAtMs: extractStartedAt,
    context: {
      strategy: SILENT_VISUAL_NORMALIZE_STRATEGY,
      fps,
      frameCount,
      rawWebmBytes: videoBlob.size,
      heap: captureExportJsHeapSnapshot(),
    },
  });

  await ffmpeg.writeFile(SILENT_TIMING_INPUT, await fetchFile(videoBlob));

  const handleProgress = ({ progress }: { progress: number; time?: number }) => {
    if (!options.onProgress) return;
    const normalized = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    options.onProgress(Math.round(normalized * 55));
  };

  const logNormalizeCommand = (phase: string, args: string[]) => {
    if (!isExportDebugEnabled()) return;
    console.info("[ExportNormalize]", {
      strategy: SILENT_VISUAL_NORMALIZE_STRATEGY,
      phase,
      fps,
      frameCount,
      command: formatFfmpegExecCommand(args),
      args,
    });
  };

  const logCapture = createFfmpegLogCapture();
  ffmpeg.on("progress", handleProgress);
  ffmpeg.on("log", logCapture.handleLog);

  try {
    const extractArgs = buildSilentVisualFrameExtractArgs({
      inputFile: SILENT_TIMING_INPUT,
    });
    logNormalizeCommand("extract", extractArgs);

    let extractCode: number;
    try {
      extractCode = await ffmpeg.exec(extractArgs);
    } catch (cause) {
      throw new ExportPipelineError({
        stage: "extract-frame-sequence",
        code: "EXPORT_EXTRACT_FAILED",
        message:
          "The visual frames could not be prepared for encoding. No file was downloaded.",
        detail: `FFmpeg extract threw: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
        context: {
          exitCode: null,
          stderrTail: logCapture.stderr.slice(-4000),
          command: formatFfmpegExecCommand(extractArgs),
          heap: captureExportJsHeapSnapshot(),
        },
      });
    }

    if (extractCode !== 0) {
      throw new ExportPipelineError({
        stage: "extract-frame-sequence",
        code: "EXPORT_EXTRACT_FAILED",
        message:
          "The visual frames could not be prepared for encoding. No file was downloaded.",
        detail: `FFmpeg extract exit ${extractCode}`,
        context: {
          exitCode: extractCode,
          stderrTail: logCapture.stderr.slice(-4000),
          command: formatFfmpegExecCommand(extractArgs),
        },
      });
    }

    options.onProgress?.(55);

    const memfs = await listFfmpegMemfsEntries(ffmpeg, "/", {
      readSizes: isExportDebugEnabled(),
      sizeSampleLimit: 4,
    }).catch(() => []);
    const jpegNames = memfs
      .filter((entry) => !entry.isDir && entry.path.startsWith("norm-frame-"))
      .map((entry) => entry.path);
    const sizesByName: Record<string, number> = {};
    for (const entry of memfs) {
      if (!entry.isDir && entry.path.startsWith("norm-frame-") && entry.size != null) {
        sizesByName[entry.path] = entry.size;
      }
    }
    const jpegSummary = summarizeExtractedJpegFiles(jpegNames, sizesByName);

    if (isExportDebugEnabled()) {
      console.info("[ExportNormalize]", {
        phase: "extract-complete",
        jpegSummary,
        memfsFileCount: memfs.length,
        heap: captureExportJsHeapSnapshot(),
      });
    }

    emitExportStageEvent({
      stage: "extract-frame-sequence",
      status: "success",
      startedAtMs: extractStartedAt,
      endedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
      context: { jpegSummary, frameCount },
    });

    const validateStartedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    emitExportStageEvent({
      stage: "validate-extracted-frames",
      status: "start",
      startedAtMs: validateStartedAt,
      context: { expectedFrameCount: frameCount, jpegSummary },
    });

    try {
      if (jpegNames.length === 0) {
        throw new ExportPipelineError({
          stage: "validate-extracted-frames",
          code: "EXPORT_EXTRACT_FRAME_MISSING",
          message:
            "The visual frames could not be prepared for encoding. No file was downloaded.",
          detail:
            "FFmpeg extract reported success but no norm-frame-*.jpg files were found in MEMFS.",
          context: { expectedFrameCount: frameCount, memfsFileCount: memfs.length },
        });
      }
      assertExtractedFrameSet({
        expectedFrameCount: frameCount,
        fileNames: jpegNames,
      });
    } catch (error) {
      emitExportStageEvent({
        stage: "validate-extracted-frames",
        status: "failure",
        startedAtMs: validateStartedAt,
        endedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
        error: {
          code: error instanceof ExportPipelineError ? error.code : "EXPORT_EXTRACT_FRAME_MISSING",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    emitExportStageEvent({
      stage: "validate-extracted-frames",
      status: "success",
      startedAtMs: validateStartedAt,
      endedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
    });

    const encodeStartedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    emitExportStageEvent({
      stage: "encode-normalized-visual",
      status: "start",
      startedAtMs: encodeStartedAt,
      context: { fps, frameCount, heap: captureExportJsHeapSnapshot() },
    });

    const encodeArgs = buildSilentVisualFrameSequenceEncodeArgs({
      outputFile: SILENT_TIMING_OUTPUT,
      fps,
      frameCount,
    });
    logNormalizeCommand("encode", encodeArgs);

    const encodeHandleProgress = ({ progress }: { progress: number; time?: number }) => {
      if (!options.onProgress) return;
      const normalized = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
      options.onProgress(55 + Math.round(normalized * 45));
    };
    ffmpeg.off("progress", handleProgress);
    ffmpeg.on("progress", encodeHandleProgress);

    try {
      let encodeCode: number;
      try {
        encodeCode = await ffmpeg.exec(encodeArgs);
      } catch (cause) {
        throw new ExportPipelineError({
          stage: "encode-normalized-visual",
          code: "EXPORT_ENCODE_FAILED",
          message:
            "The video encoder could not finish this export. Try again or choose a lower resolution.",
          detail: `FFmpeg encode threw: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
          context: {
            stderrTail: logCapture.stderr.slice(-4000),
            command: formatFfmpegExecCommand(encodeArgs),
            heap: captureExportJsHeapSnapshot(),
          },
        });
      }

      if (encodeCode !== 0) {
        throw new ExportPipelineError({
          stage: "encode-normalized-visual",
          code: "EXPORT_ENCODE_FAILED",
          message:
            "The video encoder could not finish this export. Try again or choose a lower resolution.",
          detail: `FFmpeg encode exit ${encodeCode}`,
          context: {
            exitCode: encodeCode,
            stderrTail: logCapture.stderr.slice(-4000),
            command: formatFfmpegExecCommand(encodeArgs),
          },
        });
      }
    } finally {
      ffmpeg.off("progress", encodeHandleProgress);
    }

    const data = await ffmpeg.readFile(SILENT_TIMING_OUTPUT);
    if (typeof data === "string") {
      throw new ExportPipelineError({
        stage: "encode-normalized-visual",
        code: "EXPORT_ENCODE_FAILED",
        message:
          "The video encoder could not finish this export. Try again or choose a lower resolution.",
        detail: "Unexpected text output from FFmpeg timing normalize",
      });
    }

    emitExportStageEvent({
      stage: "encode-normalized-visual",
      status: "success",
      startedAtMs: encodeStartedAt,
      endedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
      context: { outputBytes: data.byteLength },
    });

    options.onProgress?.(100);
    return new Blob([new Uint8Array(data)], { type: "video/webm" });
  } finally {
    ffmpeg.off("progress", handleProgress);
    ffmpeg.off("log", logCapture.handleLog);
    await cleanupFFmpegFiles(ffmpeg, writtenFiles);
  }
}

