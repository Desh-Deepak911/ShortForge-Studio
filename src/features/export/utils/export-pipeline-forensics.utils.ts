/**
 * Export pipeline forensics (4.2C-8D).
 *
 * Stage-tagged errors + diagnostics. Does not change Preview or timeline semantics.
 * Enable with SHORTFORGE_EXPORT_DEBUG=1 (or SHORTFORGE_EXPORT_FRAME_DEBUG=1).
 */

export const EXPORT_STAGES = [
  "prepare-story",
  "preload-media",
  "render-semantic-frames",
  "record-raw-webm",
  "probe-raw-webm",
  "extract-frame-sequence",
  "validate-extracted-frames",
  "encode-normalized-visual",
  "probe-normalized-visual",
  "validate-normalized-visual",
  "prepare-audio",
  "mux-audio",
  "probe-final-output",
  "download",
  "cleanup",
] as const;

export type ExportStage = (typeof EXPORT_STAGES)[number];

export type ExportPipelineErrorCode =
  | "EXPORT_GENERIC"
  | "EXPORT_PREPARE_FAILED"
  | "EXPORT_PRELOAD_FAILED"
  | "EXPORT_RENDER_FAILED"
  | "EXPORT_RECORD_FAILED"
  | "EXPORT_RAW_PROBE_FAILED"
  | "EXPORT_RAW_EMPTY"
  | "EXPORT_EXTRACT_FAILED"
  | "EXPORT_EXTRACT_FRAME_MISSING"
  | "EXPORT_EXTRACT_COUNT_MISMATCH"
  | "EXPORT_ENCODE_FAILED"
  | "EXPORT_NORMALIZE_PROBE_FAILED"
  | "EXPORT_NORMALIZE_TIMING_INVALID"
  | "EXPORT_MUX_FAILED"
  | "EXPORT_MEMORY"
  | "EXPORT_WORKER"
  | "EXPORT_RETRY_UNSAFE"
  | "EXPORT_CLEANUP_FAILED";

export interface ExportPipelineErrorInit {
  stage: ExportStage;
  code: ExportPipelineErrorCode;
  message: string;
  /** Internal / technical message — never shown raw in production UI. */
  detail?: string;
  cause?: unknown;
  context?: Record<string, unknown>;
}

export class ExportPipelineError extends Error {
  readonly stage: ExportStage;
  readonly code: ExportPipelineErrorCode;
  readonly detail?: string;
  readonly context?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(init: ExportPipelineErrorInit) {
    super(init.message);
    this.name = "ExportPipelineError";
    this.stage = init.stage;
    this.code = init.code;
    this.detail = init.detail;
    this.context = init.context;
    this.cause = init.cause;
  }
}

export function isExportPipelineError(value: unknown): value is ExportPipelineError {
  return value instanceof ExportPipelineError;
}

export function isExportDebugEnabled(): boolean {
  if (typeof process === "undefined") return false;
  return (
    process.env.SHORTFORGE_EXPORT_DEBUG === "1" ||
    process.env.SHORTFORGE_EXPORT_FRAME_DEBUG === "1"
  );
}

export interface ExportJsHeapSnapshot {
  usedJSHeapSize: number | null;
  totalJSHeapSize: number | null;
  jsHeapSizeLimit: number | null;
}

export function captureExportJsHeapSnapshot(): ExportJsHeapSnapshot {
  const memory = (
    typeof performance !== "undefined"
      ? (performance as Performance & {
          memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
          };
        }).memory
      : undefined
  );
  if (!memory) {
    return {
      usedJSHeapSize: null,
      totalJSHeapSize: null,
      jsHeapSizeLimit: null,
    };
  }
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  };
}

export interface ExportStageEvent {
  stage: ExportStage;
  status: "start" | "success" | "failure";
  startedAtMs: number;
  endedAtMs?: number;
  durationMs?: number;
  context?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
}

const stageEvents: ExportStageEvent[] = [];

export function resetExportStageEvents(): void {
  stageEvents.length = 0;
}

export function getExportStageEvents(): readonly ExportStageEvent[] {
  return stageEvents;
}

export function emitExportStageEvent(event: ExportStageEvent): void {
  stageEvents.push(event);
  if (!isExportDebugEnabled()) return;
  console.info("[ExportStage]", event);
}

export async function runExportStage<T>(
  stage: ExportStage,
  fn: () => Promise<T> | T,
  context?: Record<string, unknown>,
): Promise<T> {
  const startedAtMs =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  emitExportStageEvent({
    stage,
    status: "start",
    startedAtMs,
    context: {
      ...context,
      heap: captureExportJsHeapSnapshot(),
    },
  });
  try {
    const result = await fn();
    const endedAtMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    emitExportStageEvent({
      stage,
      status: "success",
      startedAtMs,
      endedAtMs,
      durationMs: endedAtMs - startedAtMs,
      context,
    });
    return result;
  } catch (cause) {
    const endedAtMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const pipelineError = toExportPipelineError(cause, stage);
    emitExportStageEvent({
      stage,
      status: "failure",
      startedAtMs,
      endedAtMs,
      durationMs: endedAtMs - startedAtMs,
      context: {
        ...context,
        heap: captureExportJsHeapSnapshot(),
      },
      error: {
        code: pipelineError.code,
        message: pipelineError.message,
        detail: pipelineError.detail,
      },
    });
    throw pipelineError;
  }
}

export function toExportPipelineError(
  cause: unknown,
  fallbackStage: ExportStage,
): ExportPipelineError {
  if (isExportPipelineError(cause)) {
    return cause;
  }

  const inferred = inferExportFailureFromUnknown(cause, fallbackStage);
  return inferred;
}

function describeUnknownCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message || cause.name;
  }
  if (typeof cause === "string") {
    return cause;
  }
  if (cause && typeof cause === "object") {
    const maybeMessage = (cause as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    try {
      return JSON.stringify(cause);
    } catch {
      return Object.prototype.toString.call(cause);
    }
  }
  return String(cause);
}

function inferExportFailureFromUnknown(
  cause: unknown,
  stage: ExportStage,
): ExportPipelineError {
  const detail = describeUnknownCause(cause);
  const lower = detail.toLowerCase();

  const looksLikeMemory =
    lower.includes("out of memory") ||
    lower.includes("oom") ||
    lower.includes("array buffer allocation failed") ||
    lower.includes("memory access out of bounds") ||
    lower.includes("cannot allocate") ||
    lower.includes("enomem");

  const looksLikeWorker =
    lower.includes("worker") ||
    lower.includes("aborted") ||
    lower.includes("terminated") ||
    cause instanceof Event;

  if (looksLikeMemory) {
    return new ExportPipelineError({
      stage,
      code: "EXPORT_MEMORY",
      message:
        "This export exceeded the browser's available memory. Try 720p, or export a shorter project.",
      detail,
      cause,
    });
  }

  if (looksLikeWorker || !(cause instanceof Error)) {
    return new ExportPipelineError({
      stage,
      code: "EXPORT_WORKER",
      message:
        "The export engine stopped unexpectedly. The export engine must be reset before retrying.",
      detail,
      cause,
      context: { nonErrorThrow: !(cause instanceof Error) },
    });
  }

  // Preserve known user-facing normalize message.
  if (detail.includes("could not be normalized")) {
    return new ExportPipelineError({
      stage: "validate-normalized-visual",
      code: "EXPORT_NORMALIZE_TIMING_INVALID",
      message: detail,
      detail,
      cause,
    });
  }

  return new ExportPipelineError({
    stage,
    code: "EXPORT_GENERIC",
    message: resolveStageDefaultUserMessage(stage),
    detail,
    cause,
  });
}

export function resolveStageDefaultUserMessage(stage: ExportStage): string {
  switch (stage) {
    case "extract-frame-sequence":
    case "validate-extracted-frames":
      return "The visual frames could not be prepared for encoding. No file was downloaded.";
    case "encode-normalized-visual":
      return "The video encoder could not finish this export. Try again or choose a lower resolution.";
    case "mux-audio":
    case "prepare-audio":
      return "The video was rendered, but narration and music could not be combined.";
    case "probe-raw-webm":
    case "record-raw-webm":
      return "The visual recording could not be completed. No file was downloaded.";
    case "probe-normalized-visual":
    case "validate-normalized-visual":
      return "Export timing could not be normalized. The video frames were generated, but the output container reported an invalid playback speed. Please retry or use a different export format.";
    default:
      return "We couldn't finish the export. Try again.";
  }
}

/**
 * UI-safe message. Prefer typed pipeline errors; never expose stacks.
 */
export function resolveExportUserFacingErrorMessage(error: unknown): string {
  // Sprint 6B — typed preflight failures (never use generic renderer messaging).
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "EXPORT_PREFLIGHT_BLOCKED"
  ) {
    const preflight = error as {
      message?: string;
      result?: { blockers?: Array<{ message?: string }> };
    };
    const firstBlocker = preflight.result?.blockers?.[0]?.message;
    if (firstBlocker?.trim()) return firstBlocker;
    if (preflight.message?.trim()) return preflight.message;
  }
  if (isExportPipelineError(error)) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) {
    // Known safe messages already intended for UI.
    return error.message;
  }
  return "We couldn't finish the export. Try again.";
}

export function logExportPipelineFailure(error: unknown): void {
  const pipelineError = toExportPipelineError(error, "cleanup");
  const payload = {
    stage: pipelineError.stage,
    code: pipelineError.code,
    message: pipelineError.message,
    detail: pipelineError.detail,
    context: pipelineError.context,
    cause:
      pipelineError.cause instanceof Error
        ? {
            name: pipelineError.cause.name,
            message: pipelineError.cause.message,
          }
        : describeUnknownCause(pipelineError.cause),
    stages: getExportStageEvents(),
    heap: captureExportJsHeapSnapshot(),
  };
  console.error("[ExportPipelineFailure]", payload);
}

export interface FfmpegMemfsEntry {
  path: string;
  size: number | null;
  isDir: boolean;
}

export async function listFfmpegMemfsEntries(
  ffmpeg: {
    listDir: (path: string) => Promise<Array<{ name: string; isDir: boolean }>>;
    readFile?: (path: string) => Promise<Uint8Array | string>;
  },
  root = "/",
  options?: { readSizes?: boolean; sizeSampleLimit?: number },
): Promise<FfmpegMemfsEntry[]> {
  const entries = await ffmpeg.listDir(root);
  const readSizes = options?.readSizes ?? false;
  const sizeSampleLimit = options?.sizeSampleLimit ?? 8;
  const result: FfmpegMemfsEntry[] = [];
  let sized = 0;
  for (const entry of entries) {
    if (entry.name === "." || entry.name === "..") continue;
    const path = root === "/" ? entry.name : `${root.replace(/\/$/, "")}/${entry.name}`;
    let size: number | null = null;
    if (
      readSizes &&
      !entry.isDir &&
      typeof ffmpeg.readFile === "function" &&
      sized < sizeSampleLimit
    ) {
      try {
        const data = await ffmpeg.readFile(path);
        size = typeof data === "string" ? data.length : data.byteLength;
        sized += 1;
      } catch {
        size = null;
      }
    }
    result.push({ path, size, isDir: entry.isDir });
  }
  return result;
}

export function summarizeExtractedJpegFiles(
  fileNames: string[],
  sizesByName?: Record<string, number>,
): {
  count: number;
  first: string | null;
  last: string | null;
  totalBytes: number | null;
  averageBytes: number | null;
  largestBytes: number | null;
} {
  const sorted = [...fileNames].filter((n) => n.startsWith("norm-frame-")).sort();
  let totalBytes: number | null = null;
  let largestBytes: number | null = null;
  if (sizesByName) {
    totalBytes = 0;
    for (const name of sorted) {
      const size = sizesByName[name];
      if (typeof size === "number") {
        totalBytes += size;
        largestBytes = largestBytes == null ? size : Math.max(largestBytes, size);
      }
    }
  }
  return {
    count: sorted.length,
    first: sorted[0] ?? null,
    last: sorted[sorted.length - 1] ?? null,
    totalBytes,
    averageBytes:
      totalBytes != null && sorted.length > 0
        ? Math.round(totalBytes / sorted.length)
        : null,
    largestBytes,
  };
}

export function assertExtractedFrameSet(input: {
  expectedFrameCount: number;
  fileNames: string[];
}): void {
  const expected = Math.max(1, Math.floor(input.expectedFrameCount));
  const summary = summarizeExtractedJpegFiles(input.fileNames);
  if (!summary.first) {
    throw new ExportPipelineError({
      stage: "validate-extracted-frames",
      code: "EXPORT_EXTRACT_FRAME_MISSING",
      message: resolveStageDefaultUserMessage("validate-extracted-frames"),
      detail: "Missing first extracted JPEG frame.",
      context: { expectedFrameCount: expected, actualCount: summary.count },
    });
  }
  const expectedFirst = `norm-frame-${String(1).padStart(6, "0")}.jpg`;
  const expectedLast = `norm-frame-${String(expected).padStart(6, "0")}.jpg`;
  if (summary.first !== expectedFirst) {
    throw new ExportPipelineError({
      stage: "validate-extracted-frames",
      code: "EXPORT_EXTRACT_FRAME_MISSING",
      message: resolveStageDefaultUserMessage("validate-extracted-frames"),
      detail: `Expected ${expectedFirst}, found ${summary.first}`,
      context: { expectedFirst, actualFirst: summary.first },
    });
  }
  if (summary.last !== expectedLast) {
    throw new ExportPipelineError({
      stage: "validate-extracted-frames",
      code: "EXPORT_EXTRACT_FRAME_MISSING",
      message: resolveStageDefaultUserMessage("validate-extracted-frames"),
      detail: `Expected final frame ${expectedLast}, found ${summary.last}`,
      context: {
        expectedLast,
        actualLast: summary.last,
        expectedFrameCount: expected,
        actualCount: summary.count,
      },
    });
  }
  if (summary.count < expected) {
    throw new ExportPipelineError({
      stage: "validate-extracted-frames",
      code: "EXPORT_EXTRACT_COUNT_MISMATCH",
      message: resolveStageDefaultUserMessage("validate-extracted-frames"),
      detail: `Extracted ${summary.count} JPEGs, expected ${expected}`,
      context: { expectedFrameCount: expected, actualCount: summary.count },
    });
  }
}

/** Rough JPEG size model for architecture viability (bytes). */
export function estimateJpegFrameBytes(width: number, height: number): number {
  // Empirical mid-range for ffmpeg -q:v 3 photographic vertical frames.
  const pixels = Math.max(1, width) * Math.max(1, height);
  return Math.round(pixels * 0.18);
}

export type ImageSequenceViability =
  | "Viable"
  | "Viable only with bounded chunking"
  | "Not viable for production 1080p browser export";

export interface ImageSequenceViabilityAssessment {
  width: number;
  height: number;
  frameCount: number;
  estimatedJpegBytesPerFrame: number;
  estimatedSequenceBytes: number;
  estimatedPeakBytes: number;
  viability: ImageSequenceViability;
  rationale: string;
}

/**
 * Evidence-based viability for keeping the entire JPEG sequence in FFmpeg MEMFS.
 */
export function assessImageSequenceViability(input: {
  width: number;
  height: number;
  frameCount: number;
  rawWebmBytes?: number;
}): ImageSequenceViabilityAssessment {
  const frameCount = Math.max(0, Math.floor(input.frameCount));
  const perFrame = estimateJpegFrameBytes(input.width, input.height);
  const sequenceBytes = perFrame * frameCount;
  const rawWebmBytes = input.rawWebmBytes ?? Math.round(sequenceBytes * 0.35);
  const normalizedWebmBytes = Math.round(sequenceBytes * 0.25);
  // Encode buffers + wasm heap + canvas/media: conservative multiplier.
  const estimatedPeakBytes =
    rawWebmBytes + sequenceBytes + normalizedWebmBytes + 180 * 1024 * 1024;

  let viability: ImageSequenceViability;
  let rationale: string;

  if (sequenceBytes <= 80 * 1024 * 1024 && estimatedPeakBytes <= 350 * 1024 * 1024) {
    viability = "Viable";
    rationale =
      "Estimated JPEG sequence and peak footprint stay within typical browser WASM budgets.";
  } else if (sequenceBytes <= 220 * 1024 * 1024) {
    viability = "Viable only with bounded chunking";
    rationale =
      "Full-sequence MEMFS residency is marginal; chunked extract/encode would bound peak JPEG residency.";
  } else {
    viability = "Not viable for production 1080p browser export";
    rationale =
      "Holding ~N full-resolution JPEGs plus raw/normalized WebM in FFmpeg MEMFS routinely exceeds browser WASM memory for ~30s 1080p exports.";
  }

  return {
    width: input.width,
    height: input.height,
    frameCount,
    estimatedJpegBytesPerFrame: perFrame,
    estimatedSequenceBytes: sequenceBytes,
    estimatedPeakBytes,
    viability,
    rationale,
  };
}

export function createFailureMatrixCases(): Array<{
  id: string;
  label: string;
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  media: "image" | "images" | "video" | "mixed";
  narration: boolean;
}> {
  return [
    {
      id: "A",
      label: "One image 5s 720p silent",
      width: 720,
      height: 1280,
      durationSec: 5,
      fps: 30,
      media: "image",
      narration: false,
    },
    {
      id: "B",
      label: "Multi-image 6 scenes 720p captions",
      width: 720,
      height: 1280,
      durationSec: 18,
      fps: 30,
      media: "images",
      narration: false,
    },
    {
      id: "C",
      label: "One short video 5s 720p",
      width: 720,
      height: 1280,
      durationSec: 5,
      fps: 30,
      media: "video",
      narration: false,
    },
    {
      id: "D",
      label: "Image→Video→Image 15s 720p",
      width: 720,
      height: 1280,
      durationSec: 15,
      fps: 30,
      media: "mixed",
      narration: false,
    },
    {
      id: "E",
      label: "Six-scene mixed ~32s 720p narration",
      width: 720,
      height: 1280,
      durationSec: 32,
      fps: 30,
      media: "mixed",
      narration: true,
    },
    {
      id: "F",
      label: "Six-scene mixed ~32s 1080p narration",
      width: 1080,
      height: 1920,
      durationSec: 32,
      fps: 30,
      media: "mixed",
      narration: true,
    },
  ];
}
