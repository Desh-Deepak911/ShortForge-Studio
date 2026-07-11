/**
 * Deterministic manual canvas capture for silent export (4.2C-8B).
 *
 * Uses captureStream(0) so frames are emitted only via requestFrame(),
 * never by wall-clock automatic capture during video seek waits.
 */
export type CanvasCaptureTrack = MediaStreamTrack & {
  requestFrame: () => void;
};

export interface ManualCanvasFrameCaptureOptions {
  /** Reject duplicate/out-of-order requests when true (dev/tests). */
  strict?: boolean;
}

export interface ManualCanvasFrameCapture {
  readonly stream: MediaStream;
  readonly track: CanvasCaptureTrack;
  requestFrame(frameIndex: number): Promise<void>;
  capturedFrameCount(): number;
  requestedFrameIndexes(): readonly number[];
  cancel(): void;
  isCancelled(): boolean;
}

export class ManualCanvasCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualCanvasCaptureError";
  }
}

/**
 * Creates a manual-only canvas capture stream.
 * Throws if requestFrame is unavailable — never falls back to captureStream(fps).
 */
export function createManualCanvasCaptureStream(
  canvas: HTMLCanvasElement,
): { stream: MediaStream; track: CanvasCaptureTrack } {
  if (typeof canvas.captureStream !== "function") {
    throw new ManualCanvasCaptureError(
      "Canvas captureStream is not supported in this browser.",
    );
  }

  const stream = canvas.captureStream(0);
  const rawTrack = stream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };

  if (!rawTrack || typeof rawTrack.requestFrame !== "function") {
    stream.getTracks().forEach((track) => track.stop());
    throw new ManualCanvasCaptureError(
      "Manual canvas frame capture (requestFrame) is required for export and is not supported in this browser.",
    );
  }

  return {
    stream,
    track: rawTrack as CanvasCaptureTrack,
  };
}

/**
 * Frame-accounted manual capture: exactly one requestFrame per semantic frame index.
 */
export function createManualCanvasFrameCapture(
  canvas: HTMLCanvasElement,
  options: ManualCanvasFrameCaptureOptions = {},
): ManualCanvasFrameCapture {
  const strict = options.strict ?? process.env.NODE_ENV !== "production";
  const { stream, track } = createManualCanvasCaptureStream(canvas);
  const requested: number[] = [];
  let cancelled = false;
  let lastFrameIndex = -1;

  return {
    stream,
    track,
    capturedFrameCount: () => requested.length,
    requestedFrameIndexes: () => requested,
    isCancelled: () => cancelled,
    cancel: () => {
      cancelled = true;
    },
    async requestFrame(frameIndex: number): Promise<void> {
      if (cancelled) {
        throw new ManualCanvasCaptureError("Capture requested after cancellation.");
      }

      if (!Number.isInteger(frameIndex) || frameIndex < 0) {
        throw new ManualCanvasCaptureError(`Invalid frame index: ${frameIndex}`);
      }

      if (strict && requested.includes(frameIndex)) {
        throw new ManualCanvasCaptureError(
          `Duplicate capture request for frame index ${frameIndex}.`,
        );
      }

      if (strict && frameIndex !== lastFrameIndex + 1 && lastFrameIndex !== -1) {
        throw new ManualCanvasCaptureError(
          `Non-monotonic capture: expected ${lastFrameIndex + 1}, got ${frameIndex}.`,
        );
      }

      if (track.readyState === "ended") {
        throw new ManualCanvasCaptureError("Capture track has ended.");
      }

      track.requestFrame();
      requested.push(frameIndex);
      lastFrameIndex = frameIndex;

      // Minimal yield so MediaRecorder can ingest the frame without realtime pacing.
      await waitForRecorderFrameIngestion();
    },
  };
}

/** Smallest non-timing yield for recorder ingestion after requestFrame. */
export async function waitForRecorderFrameIngestion(): Promise<void> {
  await Promise.resolve();
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

/**
 * Starts MediaRecorder and waits until it is recording.
 * Prefer start() without timeslice — frames come from manual requestFrame only.
 */
export async function startExportMediaRecorder(
  recorder: MediaRecorder,
): Promise<void> {
  if (recorder.state === "recording") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onStart = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("MediaRecorder failed to start"));
    };
    const cleanup = () => {
      recorder.removeEventListener("start", onStart);
      recorder.removeEventListener("error", onError);
    };

    recorder.addEventListener("start", onStart);
    recorder.addEventListener("error", onError);

    try {
      recorder.start();
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("MediaRecorder failed to start"));
      return;
    }

    // Some browsers set state synchronously without firing start.
    if (recorder.state === "recording") {
      cleanup();
      resolve();
    }
  });
}

/**
 * Flushes the final frame and stops the recorder safely.
 */
export async function flushAndStopExportMediaRecorder(
  recorder: MediaRecorder,
): Promise<void> {
  if (recorder.state === "inactive") {
    return;
  }

  await waitForRecorderFrameIngestion();

  if (typeof recorder.requestData === "function" && recorder.state === "recording") {
    try {
      recorder.requestData();
    } catch {
      // Some browsers throw if no data yet — safe to ignore before stop.
    }
    await Promise.resolve();
  }

  await new Promise<void>((resolve, reject) => {
    const onStop = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Recording failed"));
    };
    const cleanup = () => {
      recorder.removeEventListener("stop", onStop);
      recorder.removeEventListener("error", onError);
    };

    recorder.addEventListener("stop", onStop);
    recorder.addEventListener("error", onError);

    try {
      recorder.stop();
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error("Recording failed"));
    }
  });
}

/** Expected silent visual duration from semantic frame count. */
export function resolveExpectedSilentVisualDurationSec(
  totalFrames: number,
  fps: number,
): number {
  const safeFps = fps > 0 && Number.isFinite(fps) ? fps : 30;
  const safeFrames = Math.max(0, Math.floor(totalFrames));
  return safeFrames / safeFps;
}

export interface SilentVisualDurationValidation {
  expectedDurationSec: number;
  actualDurationSec: number | null;
  differenceSec: number | null;
  totalFrames: number;
  fps: number;
  wallClockExportMs: number;
  ok: boolean;
}

/**
 * Validates silent blob duration against semantic totalFrames/fps.
 * actualDurationSec may be null when the blob cannot be probed in-browser.
 */
export function validateSilentVisualDuration(input: {
  totalFrames: number;
  fps: number;
  wallClockExportMs: number;
  actualDurationSec?: number | null;
  /** Absolute tolerance in seconds (container/timebase slack). */
  toleranceSec?: number;
}): SilentVisualDurationValidation {
  const expectedDurationSec = resolveExpectedSilentVisualDurationSec(
    input.totalFrames,
    input.fps,
  );
  const actualDurationSec =
    typeof input.actualDurationSec === "number" && Number.isFinite(input.actualDurationSec)
      ? input.actualDurationSec
      : null;
  const toleranceSec = input.toleranceSec ?? Math.max(0.25, 2 / input.fps);
  const differenceSec =
    actualDurationSec == null ? null : actualDurationSec - expectedDurationSec;
  const ok =
    actualDurationSec == null
      ? true
      : Math.abs(differenceSec!) <= toleranceSec;

  return {
    expectedDurationSec,
    actualDurationSec,
    differenceSec,
    totalFrames: input.totalFrames,
    fps: input.fps,
    wallClockExportMs: input.wallClockExportMs,
    ok,
  };
}

export interface EffectivePlaybackFpsValidation {
  capturedFrameCount: number;
  encodedDurationSec: number;
  targetFps: number;
  effectivePlaybackFps: number;
  expectedDurationSec: number;
  ok: boolean;
}

/**
 * Detects slow-motion / stretched MediaRecorder output.
 * effectivePlaybackFps = capturedFrameCount / encodedDurationSec
 */
export function validateEffectivePlaybackFps(input: {
  capturedFrameCount: number;
  encodedDurationSec: number;
  targetFps: number;
  /** Relative tolerance on effective FPS (default 15%). */
  relativeTolerance?: number;
}): EffectivePlaybackFpsValidation {
  const targetFps = input.targetFps > 0 ? input.targetFps : 30;
  const frames = Math.max(0, Math.floor(input.capturedFrameCount));
  const encodedDurationSec = Math.max(0.001, input.encodedDurationSec);
  const expectedDurationSec = frames / targetFps;
  const effectivePlaybackFps = frames / encodedDurationSec;
  const relativeTolerance = input.relativeTolerance ?? 0.15;
  const ok =
    Math.abs(effectivePlaybackFps - targetFps) / targetFps <= relativeTolerance;

  return {
    capturedFrameCount: frames,
    encodedDurationSec,
    targetFps,
    effectivePlaybackFps,
    expectedDurationSec,
    ok,
  };
}

/**
 * Whether silent WebM timing should be CFR-normalized via FFmpeg.
 * MediaRecorder often stamps manual requestFrame() captures with wall-clock
 * intervals (too fast or too slow vs requested FPS).
 *
 * Production always normalizes; this helper remains for diagnostics / tests.
 */
export function shouldNormalizeSilentVisualTiming(input: {
  totalFrames: number;
  fps: number;
  wallClockExportMs: number;
  actualDurationSec: number | null;
}): boolean {
  const expectedSec = resolveExpectedSilentVisualDurationSec(input.totalFrames, input.fps);
  if (expectedSec <= 0) {
    return false;
  }

  if (input.actualDurationSec != null) {
    const fpsCheck = validateEffectivePlaybackFps({
      capturedFrameCount: input.totalFrames,
      encodedDurationSec: input.actualDurationSec,
      targetFps: input.fps,
    });
    if (!fpsCheck.ok) {
      return true;
    }
    const durationCheck = validateSilentVisualDuration({
      totalFrames: input.totalFrames,
      fps: input.fps,
      wallClockExportMs: input.wallClockExportMs,
      actualDurationSec: input.actualDurationSec,
    });
    return !durationCheck.ok;
  }

  // No probe — normalize when wall clock clearly exceeds semantic duration.
  const wallSec = input.wallClockExportMs / 1000;
  return wallSec > expectedSec * 1.35;
}

/**
 * Best-effort probe of encoded media duration via HTMLMediaElement.
 * Returns null when probing is unavailable or fails.
 */
export async function probeBlobDurationSec(blob: Blob): Promise<number | null> {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return null;
  }

  const url = URL.createObjectURL(blob);
  try {
    const duration = await new Promise<number | null>((resolve) => {
      const media = document.createElement("video");
      let settled = false;
      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        media.removeAttribute("src");
        media.load();
        resolve(value);
      };

      media.preload = "metadata";
      media.onloadedmetadata = () => {
        const d = media.duration;
        finish(Number.isFinite(d) && d > 0 ? d : null);
      };
      media.onerror = () => finish(null);
      setTimeout(() => finish(null), 2_000);
      media.src = url;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}
