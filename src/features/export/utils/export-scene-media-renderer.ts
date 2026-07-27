/**
 * Export canvas media renderer (4.2A-5B-2 / 4.2C-5).
 *
 * Single background draw path for image + video scene media.
 * Motion: shared media-motion engine via exportMotionAdapter.
 * Timing authority: Media Playback Engine (resolveSceneMediaPlayback).
 * Does not touch captions, audio, FFmpeg, or MediaRecorder.
 */
import {
  resolveExportMediaMotionTransform,
  toExportDrawTransformOverride,
} from "@/features/editor/export/motion/exportMotionAdapter";
import {
  resolveSceneMediaFraming,
  resolveSceneMediaFramingAsImage,
} from "@/features/media-framing/resolve-scene-media-framing";
import { buildMediaVisualFilter } from "@/features/media-visual-adjustments/build-media-visual-filter";
import { resolveSceneMediaPlayback } from "@/features/media-playback/media-playback.engine";
import type { MediaPlaybackState } from "@/features/media-playback/media-playback.types";
import type { FootieScene, SceneImage, SceneMedia, SceneType } from "@/features/story/types";
import {
  drawSceneImageInFrame,
  getSceneMedia,
  normalizeSceneImageFitMode,
  resolveSceneImageTransformForFrame,
} from "@/features/story/utils/scene.utils";
import type { SceneImageFitMode } from "@/features/story/types";
import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";

import {
  buildExportMediaCacheKey,
  getExportSceneMediaAsset,
  type ExportImageAsset,
  type ExportMediaCache,
  type ExportVideoAsset,
} from "./export-media-cache.utils";

/**
 * Export-only canvas resampling quality.
 * Preview uses CSS/GPU compositing and must not depend on this.
 * Never throws — null/unsupported contexts leave browser defaults.
 */
export function applyExportCanvasMediaQuality(
  ctx: CanvasRenderingContext2D | null | undefined,
): void {
  if (!ctx || typeof ctx !== "object") return;
  try {
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) {
      ctx.imageSmoothingQuality = "high";
    }
  } catch {
    // Unsupported canvas host — keep defaults.
  }
}

/** Absolute ceiling retained only as documentation — tolerance is always FPS-aware. */
const SEEK_TIMEOUT_MS = 2_000;
const DECODE_READY_TIMEOUT_MS = 500;
/** HAVE_CURRENT_DATA — numeric for Node test environments. */
const HAVE_CURRENT_DATA = 2;

/**
 * FPS-aware seek skip tolerance (half a frame).
 * Never use a fixed 40ms epsilon — at 60 FPS that spans multiple frames.
 */
export function resolveExportSeekEpsilonSec(fps: number): number {
  const safeFps = fps > 0 && Number.isFinite(fps) ? fps : 30;
  return 0.5 / safeFps;
}

export interface ExportVideoSeekOptions {
  timeoutMs?: number;
  epsilonSec?: number;
  /** Monotonic request token — stale callbacks are ignored. */
  seekRequestId?: number;
  /** Invoked when a seek is actually issued (not epsilon-skipped). */
  onSeekIssued?: () => void;
  /** Invoked when epsilon skip reuses the current decoded frame. */
  onSeekSkipped?: () => void;
  /** Invoked when RVFC / decode wait path runs. */
  onDecodeWait?: (reason: "rvfc" | "readyState" | "timeout") => void;
}

export interface ExportVideoSamplingState {
  sceneId: string | null;
  lastRequestedSourceSec: number | null;
  lastDecodedSourceSec: number | null;
  seekRequestId: number;
  seekCount: number;
  seekSkipCount: number;
  rvfcWaitCount: number;
  fallbackCount: number;
  /** Consecutive frames where requested time advanced but decoded time did not. */
  consecutiveIdenticalDecoded: number;
  repeatedDecodedFrameWarnings: number;
  samplingDirection: "forward" | "backward" | "reset" | null;
}

function createExportVideoSamplingState(): ExportVideoSamplingState {
  return {
    sceneId: null,
    lastRequestedSourceSec: null,
    lastDecodedSourceSec: null,
    seekRequestId: 0,
    seekCount: 0,
    seekSkipCount: 0,
    rvfcWaitCount: 0,
    fallbackCount: 0,
    consecutiveIdenticalDecoded: 0,
    repeatedDecodedFrameWarnings: 0,
    samplingDirection: null,
  };
}

let videoSamplingState: ExportVideoSamplingState = createExportVideoSamplingState();

export function getExportVideoSamplingState(): Readonly<ExportVideoSamplingState> {
  return { ...videoSamplingState };
}

export function resetExportVideoSamplingState(): void {
  videoSamplingState = createExportVideoSamplingState();
}

export function beginExportVideoSeekRequest(sceneId: string): number {
  if (videoSamplingState.sceneId !== sceneId) {
    videoSamplingState.sceneId = sceneId;
    videoSamplingState.lastRequestedSourceSec = null;
    videoSamplingState.lastDecodedSourceSec = null;
  }
  videoSamplingState.seekRequestId += 1;
  return videoSamplingState.seekRequestId;
}

/** Switches sampling identity at scene boundaries without issuing a seek. */
export function noteExportPreparedScene(sceneId: string, mediaType: "image" | "video"): void {
  if (videoSamplingState.sceneId === sceneId) {
    return;
  }
  videoSamplingState.sceneId = sceneId;
  videoSamplingState.lastRequestedSourceSec = null;
  videoSamplingState.lastDecodedSourceSec = null;
  if (mediaType === "image") {
    videoSamplingState.seekRequestId += 1;
  }
}

export function isExportVideoSeekRequestCurrent(seekRequestId: number): boolean {
  return seekRequestId === videoSamplingState.seekRequestId;
}

/**
 * Records decoded media time vs requested time for freeze detection.
 * Legitimate low-FPS source reuse is allowed up to a small consecutive budget.
 */
export function noteExportDecodedVideoSample(input: {
  requestedSourceSec: number;
  decodedSourceSec: number;
  exportFps: number;
}): void {
  const prevRequested = videoSamplingState.lastRequestedSourceSec;
  const prevDecoded = videoSamplingState.lastDecodedSourceSec;

  if (prevRequested != null) {
    const deltaReq = input.requestedSourceSec - prevRequested;
    videoSamplingState.samplingDirection =
      deltaReq > 1e-6 ? "forward" : deltaReq < -1e-6 ? "backward" : videoSamplingState.samplingDirection;
  }

  const frameStep = 1 / (input.exportFps > 0 ? input.exportFps : 30);
  const requestedAdvanced =
    prevRequested != null && input.requestedSourceSec - prevRequested >= frameStep * 0.75;
  const decodedUnchanged =
    prevDecoded != null && Math.abs(input.decodedSourceSec - prevDecoded) < frameStep * 0.25;

  if (requestedAdvanced && decodedUnchanged) {
    videoSamplingState.consecutiveIdenticalDecoded += 1;
    // Allow a few repeats (e.g. 24fps source → 60fps export), warn beyond that.
    if (videoSamplingState.consecutiveIdenticalDecoded > 4) {
      videoSamplingState.repeatedDecodedFrameWarnings += 1;
      if (
        process.env.NODE_ENV !== "production" &&
        process.env.SHORTFORGE_EXPORT_FRAME_DEBUG === "1"
      ) {
        console.debug("[ExportVideoSampling] repeated decoded frame", {
          requestedSourceSec: input.requestedSourceSec,
          decodedSourceSec: input.decodedSourceSec,
          consecutive: videoSamplingState.consecutiveIdenticalDecoded,
        });
      }
    }
  } else {
    videoSamplingState.consecutiveIdenticalDecoded = 0;
  }

  videoSamplingState.lastRequestedSourceSec = input.requestedSourceSec;
  videoSamplingState.lastDecodedSourceSec = input.decodedSourceSec;
}

export type ExportMediaDrawPath = "image" | "video" | "placeholder";

export interface ExportSceneMediaDrawResult {
  path: ExportMediaDrawPath;
  mediaType: ExportMediaDrawPath;
  clipTimeMs: number;
  seekTimeSec: number | null;
  holdLastFrame: boolean;
  drew: boolean;
  drawDurationMs: number;
}

export interface ExportSceneMediaRendererDiagnostics {
  mediaType: ExportMediaDrawPath;
  clipTimeMs: number;
  seekTimeSec: number | null;
  seekFailures: number;
  holdLastFrame: boolean;
  path: ExportMediaDrawPath;
  drawDurationMs: number;
  lastSceneId: string | null;
}

const rendererDiagnostics: ExportSceneMediaRendererDiagnostics = {
  mediaType: "placeholder",
  clipTimeMs: 0,
  seekTimeSec: null,
  seekFailures: 0,
  holdLastFrame: false,
  path: "placeholder",
  drawDurationMs: 0,
  lastSceneId: null,
};

export function getExportSceneMediaRendererDiagnostics(): Readonly<ExportSceneMediaRendererDiagnostics> {
  return { ...rendererDiagnostics };
}

export function resetExportSceneMediaRendererDiagnostics(): void {
  rendererDiagnostics.mediaType = "placeholder";
  rendererDiagnostics.clipTimeMs = 0;
  rendererDiagnostics.seekTimeSec = null;
  rendererDiagnostics.seekFailures = 0;
  rendererDiagnostics.holdLastFrame = false;
  rendererDiagnostics.path = "placeholder";
  rendererDiagnostics.drawDurationMs = 0;
  rendererDiagnostics.lastSceneId = null;
}

function recordDrawDiagnostics(
  sceneId: string,
  result: ExportSceneMediaDrawResult,
): void {
  rendererDiagnostics.lastSceneId = sceneId;
  rendererDiagnostics.mediaType = result.mediaType;
  rendererDiagnostics.clipTimeMs = result.clipTimeMs;
  rendererDiagnostics.seekTimeSec = result.seekTimeSec;
  rendererDiagnostics.holdLastFrame = result.holdLastFrame;
  rendererDiagnostics.path = result.path;
  rendererDiagnostics.drawDurationMs = result.drawDurationMs;
}

/** Dev-only diagnostics — no production logging. */
export function logExportSceneMediaRendererDiagnostics(label = "export-media-renderer"): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(label, getExportSceneMediaRendererDiagnostics());
}

// Per-scene-type top colour for the placeholder gradient (moved from video-render).
const SCENE_TYPE_TOP_COLOR: Record<SceneType, string> = {
  intro: "#0c1a2e",
  context: "#1a1400",
  match: "#0a0f18",
  transition: "#120c1e",
  ending: "#0f0f0f",
};

const DEFAULT_TOP_COLOR = "#0a0f18";

export function drawExportMediaPlaceholderBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneType: SceneType | undefined,
): void {
  const topColor = sceneType ? SCENE_TYPE_TOP_COLOR[sceneType] : DEFAULT_TOP_COLOR;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(0.5, "#18181b");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Resolves fit/fill for export to match Preview semantics via shared framing resolver.
 * Image: scene.image.fitMode authority. Video: media.fitMode with cover/fill default.
 */
export function resolveExportMediaFitMode(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  media: SceneMedia,
): SceneImageFitMode {
  return resolveSceneMediaFraming(scene, { media }).fitMode;
}

/**
 * Maps resolved SceneMedia framing onto SceneImage for drawSceneImageInFrame.
 * URL from media; framing from shared resolver (Preview parity).
 */
export function mapSceneMediaToExportDrawImage(
  media: SceneMedia,
  fitMode?: SceneImageFitMode,
): SceneImage | undefined {
  if (media.type === "placeholder") {
    return undefined;
  }

  const url = typeof media.url === "string" ? media.url.trim() : "";
  if (!url) {
    return undefined;
  }

  const framing = resolveSceneMediaFraming(
    { media },
    { media },
  );
  const resolvedFit =
    fitMode != null ? normalizeSceneImageFitMode(fitMode) : framing.fitMode;

  return {
    url,
    scale: framing.zoom,
    x: framing.positionX,
    y: framing.positionY,
    rotation: framing.rotationDeg,
    fitMode: resolvedFit,
    imageMotion: media.imageMotion,
  };
}

/**
 * Resolves export draw framing from SceneMedia + Preview-parity fit mode.
 */
export function resolveExportSceneMediaDrawImage(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): SceneImage | undefined {
  const media = getSceneMedia(scene);
  if (!media || media.type === "placeholder") {
    return undefined;
  }

  return (
    resolveSceneMediaFramingAsImage(scene, { media }) ??
    mapSceneMediaToExportDrawImage(media, resolveExportMediaFitMode(scene, media))
  );
}

/** Resolved SceneMedia used by cache + draw — single export media authority. */
export function resolveExportSceneMedia(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): SceneMedia | undefined {
  return getSceneMedia(scene);
}

function resolveSourceDimensions(
  source: CanvasImageSource,
  fallbackWidth?: number,
  fallbackHeight?: number,
): { width: number; height: number } {
  const record = source as {
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    width?: number;
    height?: number;
  };

  if (typeof record.videoWidth === "number" && record.videoWidth > 0) {
    return {
      width: record.videoWidth,
      height: record.videoHeight && record.videoHeight > 0 ? record.videoHeight : fallbackHeight || 0,
    };
  }

  if (typeof record.naturalWidth === "number" && record.naturalWidth > 0) {
    return {
      width: record.naturalWidth,
      height:
        record.naturalHeight && record.naturalHeight > 0
          ? record.naturalHeight
          : fallbackHeight || 0,
    };
  }

  if (typeof record.width === "number" && record.width > 0) {
    return {
      width: record.width,
      height: typeof record.height === "number" && record.height > 0 ? record.height : fallbackHeight || 0,
    };
  }

  return {
    width: fallbackWidth ?? 0,
    height: fallbackHeight ?? 0,
  };
}

/**
 * Shared canvas draw for any CanvasImageSource (image or video frame).
 * Geometry matches drawSceneImageInFrame.
 * Motion override is the composed export transform (scale + translate + rotation).
 */
export function drawCanvasImageSource(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  sceneImage: SceneImage,
  sourceWidth: number,
  sourceHeight: number,
  motionState: {
    scale: number;
    translateX: number;
    translateY: number;
    rotation?: number;
    opacity?: number;
  } | null,
  visualAdjustments?: SceneMedia["visualAdjustments"],
): void {
  const resolvedTransform = resolveSceneImageTransformForFrame(sceneImage, width, height);
  const opacity =
    motionState && typeof motionState.opacity === "number" && Number.isFinite(motionState.opacity)
      ? Math.min(1, Math.max(0, motionState.opacity))
      : 1;

  ctx.save();
  if (opacity < 1) {
    ctx.globalAlpha = opacity;
  }

  applyExportCanvasMediaQuality(ctx);
  ctx.filter = buildMediaVisualFilter(visualAdjustments, width);

  drawSceneImageInFrame(
    ctx,
    source,
    width,
    height,
    sceneImage,
    sourceWidth,
    sourceHeight,
    1,
    motionState
      ? {
          scale: motionState.scale,
          translateX: motionState.translateX,
          translateY: motionState.translateY,
          rotation: motionState.rotation ?? resolvedTransform.rotation ?? 0,
        }
      : undefined,
  );

  ctx.restore();
}

/**
 * Resolve composed media motion for one export frame via the shared engine.
 * Uses scene-local elapsed/duration — never timeline image-motion events.
 */
function resolveExportFrameMotionState(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  sceneElapsedMs: number,
  sceneDurationMs: number,
  width: number,
  height: number,
) {
  const motion = resolveExportMediaMotionTransform({
    scene,
    sceneElapsedMs,
    sceneDurationMs,
    frameWidth: width,
    frameHeight: height,
  });
  return toExportDrawTransformOverride(motion);
}

/**
 * Image background path — framing + shared media motion.
 */
export function drawSceneImageFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  image: HTMLImageElement,
  sceneElapsedMs: number,
  sceneDurationMs: number,
): boolean {
  const sceneImage = resolveExportSceneMediaDrawImage(scene);
  if (!sceneImage) {
    applyExportCanvasMediaQuality(ctx);
    ctx.drawImage(image, 0, 0, width, height);
    return true;
  }

  const motionState = resolveExportFrameMotionState(
    scene,
    sceneElapsedMs,
    sceneDurationMs,
    width,
    height,
  );
  const { width: sourceWidth, height: sourceHeight } = resolveSourceDimensions(image);

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    applyExportCanvasMediaQuality(ctx);
    ctx.drawImage(image, 0, 0, width, height);
    return true;
  }

  drawCanvasImageSource(
    ctx,
    image,
    width,
    height,
    sceneImage,
    sourceWidth,
    sourceHeight,
    motionState,
    scene.media?.visualAdjustments,
  );
  return true;
}

/**
 * Waits until the video has decoded data for the currentTime.
 * Prefer requestVideoFrameCallback; fall back to readyState + rAF.
 * When already ready within tolerance after seeked, resolves immediately.
 */
function extractRequestVideoFrameMediaTimeSec(metadata: unknown): number | null {
  if (metadata != null && typeof metadata === "object" && "mediaTime" in metadata) {
    const mediaTime = (metadata as { mediaTime?: unknown }).mediaTime;
    if (typeof mediaTime === "number" && Number.isFinite(mediaTime)) {
      return mediaTime;
    }
  }
  return null;
}

function decodedMediaTimeMatchesRequest(input: {
  video: HTMLVideoElement;
  expectedMediaTimeSec: number;
  toleranceSec: number;
  rvfcMetadata?: unknown;
}): boolean {
  const fromRvfc = extractRequestVideoFrameMediaTimeSec(input.rvfcMetadata);
  if (fromRvfc != null) {
    return Math.abs(fromRvfc - input.expectedMediaTimeSec) <= input.toleranceSec;
  }
  const observed = input.video.currentTime;
  return (
    Number.isFinite(observed) &&
    Math.abs(observed - input.expectedMediaTimeSec) <= input.toleranceSec
  );
}

export async function waitForDecodedVideoFrame(
  video: HTMLVideoElement,
  options: {
    timeoutMs?: number;
    seekRequestId?: number;
    onDecodeWait?: (reason: "rvfc" | "readyState" | "timeout") => void;
    /** When set, stale HAVE_CURRENT_DATA from a prior position must not satisfy decode. */
    expectedMediaTimeSec?: number;
    mediaTimeToleranceSec?: number;
  } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DECODE_READY_TIMEOUT_MS;
  const seekRequestId = options.seekRequestId;
  const expectedMediaTimeSec = options.expectedMediaTimeSec;
  const mediaTimeToleranceSec =
    options.mediaTimeToleranceSec ??
    (expectedMediaTimeSec != null ? resolveExportSeekEpsilonSec(30) : undefined);
  const requireFreshMediaTime = expectedMediaTimeSec != null;

  const isCurrent = () =>
    seekRequestId == null || isExportVideoSeekRequestCurrent(seekRequestId);

  const matchesExpectedMediaTime = (rvfcMetadata?: unknown): boolean => {
    if (!requireFreshMediaTime || expectedMediaTimeSec == null) {
      return video.readyState >= HAVE_CURRENT_DATA;
    }
    if (video.readyState < HAVE_CURRENT_DATA) {
      return false;
    }
    if (rvfcMetadata === undefined) {
      return false;
    }
    return decodedMediaTimeMatchesRequest({
      video,
      expectedMediaTimeSec,
      toleranceSec: mediaTimeToleranceSec ?? resolveExportSeekEpsilonSec(30),
      rvfcMetadata,
    });
  };

  // Fast path: decoded data already available — skip only when media time is verified.
  if (!requireFreshMediaTime && video.readyState >= HAVE_CURRENT_DATA) {
    options.onDecodeWait?.("readyState");
    if (!isCurrent()) {
      return false;
    }
    return true;
  }

  const anyVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (
      callback: (now: number, metadata: unknown) => void,
    ) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
  };

  if (typeof anyVideo.requestVideoFrameCallback === "function") {
    options.onDecodeWait?.("rvfc");
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      let activeHandle: number | undefined;
      const startedAt = Date.now();

      const finish = (ok: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        if (
          typeof anyVideo.cancelVideoFrameCallback === "function" &&
          activeHandle != null
        ) {
          anyVideo.cancelVideoFrameCallback(activeHandle);
        }
        resolve(ok && isCurrent());
      };

      const scheduleRvfc = () => {
        if (settled) {
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          options.onDecodeWait?.("timeout");
          if (requireFreshMediaTime && expectedMediaTimeSec != null) {
            const ok =
              !video.seeking &&
              video.readyState >= HAVE_CURRENT_DATA &&
              decodedMediaTimeMatchesRequest({
                video,
                expectedMediaTimeSec,
                toleranceSec:
                  mediaTimeToleranceSec ?? resolveExportSeekEpsilonSec(30),
              });
            finish(ok);
            return;
          }
          finish(!requireFreshMediaTime && matchesExpectedMediaTime());
          return;
        }
        if (
          typeof anyVideo.cancelVideoFrameCallback === "function" &&
          activeHandle != null
        ) {
          anyVideo.cancelVideoFrameCallback(activeHandle);
        }
        activeHandle = anyVideo.requestVideoFrameCallback!((_now, metadata) => {
          if (!requireFreshMediaTime) {
            finish(true);
            return;
          }
          if (matchesExpectedMediaTime(metadata)) {
            finish(true);
            return;
          }
          queueMicrotask(() => scheduleRvfc());
        });
      };

      const timeoutId = setTimeout(() => {
        options.onDecodeWait?.("timeout");
        if (requireFreshMediaTime && expectedMediaTimeSec != null) {
          const ok =
            !video.seeking &&
            video.readyState >= HAVE_CURRENT_DATA &&
            decodedMediaTimeMatchesRequest({
              video,
              expectedMediaTimeSec,
              toleranceSec:
                mediaTimeToleranceSec ?? resolveExportSeekEpsilonSec(30),
            });
          finish(ok);
          return;
        }
        finish(!requireFreshMediaTime && matchesExpectedMediaTime());
      }, timeoutMs);

      scheduleRvfc();
    });
  }

  options.onDecodeWait?.("readyState");
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      clearTimeout(timeoutId);
      resolve(ok && isCurrent());
    };
    const onReady = () => finish(matchesExpectedMediaTime());
    const timeoutId = setTimeout(() => {
      options.onDecodeWait?.("timeout");
      finish(matchesExpectedMediaTime());
    }, timeoutMs);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
  });
}

/**
 * Seeks a muted export video element to the target media time.
 * Never throws — returns false on failure/timeout.
 * After a real seek, waits for a decoded frame before returning.
 * Skips seek+decode wait when the current decoded frame is within FPS tolerance.
 */
export async function seekVideoFrame(
  video: HTMLVideoElement,
  timeSec: number,
  options: ExportVideoSeekOptions & { exportFps?: number } = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? SEEK_TIMEOUT_MS;
  const exportFps =
    options.exportFps ??
    (options.epsilonSec != null && options.epsilonSec > 0
      ? 0.5 / options.epsilonSec
      : 30);
  const epsilonSec = options.epsilonSec ?? resolveExportSeekEpsilonSec(exportFps);
  const seekRequestId = options.seekRequestId ?? videoSamplingState.seekRequestId;

  if (!Number.isFinite(timeSec) || timeSec < 0) {
    rendererDiagnostics.seekFailures += 1;
    return false;
  }

  const finishOk = (decodedSec: number): true => {
    noteExportDecodedVideoSample({
      requestedSourceSec: timeSec,
      decodedSourceSec: decodedSec,
      exportFps,
    });
    return true;
  };

  try {
    video.muted = true;
    video.volume = 0;
    if (!video.paused) {
      video.pause();
    }

    if (Math.abs(video.currentTime - timeSec) <= epsilonSec) {
      if (options.seekRequestId != null && !isExportVideoSeekRequestCurrent(seekRequestId)) {
        return false;
      }
      const decoded = await waitForDecodedVideoFrame(video, {
        seekRequestId,
        expectedMediaTimeSec: timeSec,
        mediaTimeToleranceSec: epsilonSec,
        timeoutMs: DECODE_READY_TIMEOUT_MS,
        onDecodeWait: options.onDecodeWait,
      });
      if (decoded) {
        options.onSeekSkipped?.();
        videoSamplingState.seekSkipCount += 1;
        return finishOk(video.currentTime);
      }
      return decoded;
    }

    options.onSeekIssued?.();
    videoSamplingState.seekCount += 1;

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        clearTimeout(timeoutId);
      };

      const onSeeked = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      const onError = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error("Video seek failed"));
      };

      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error("Video seek timed out"));
      }, timeoutMs);

      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);

      try {
        video.currentTime = timeSec;
      } catch (error) {
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error("Video seek failed"));
      }
    });

    if (!isExportVideoSeekRequestCurrent(seekRequestId) && options.seekRequestId != null) {
      return false;
    }

    // After seeked: require a fresh decoded frame at the requested media time.
    const decoded = await waitForDecodedVideoFrame(video, {
      seekRequestId,
      expectedMediaTimeSec: timeSec,
      mediaTimeToleranceSec: epsilonSec,
      timeoutMs: DECODE_READY_TIMEOUT_MS,
      onDecodeWait: (reason) => {
        if (reason === "rvfc") {
          videoSamplingState.rvfcWaitCount += 1;
        }
        if (reason === "timeout") {
          videoSamplingState.fallbackCount += 1;
        }
        options.onDecodeWait?.(reason);
      },
    });
    if (!decoded) {
      rendererDiagnostics.seekFailures += 1;
      return false;
    }

    return finishOk(video.currentTime);
  } catch {
    rendererDiagnostics.seekFailures += 1;
    return false;
  }
}

export function resolveExportSceneMediaPlaybackState(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  sceneElapsedMs: number,
  sceneDurationMs: number,
): MediaPlaybackState {
  return resolveSceneMediaPlayback({
    sceneMedia: resolveExportSceneMedia(scene),
    sceneElapsedMs,
    sceneDurationMs,
    playing: false,
    loopMode: "none",
  });
}

/**
 * Video background path — seeks via Media Playback Engine clipTime, then draws.
 * Caller should prefer prepareExportSceneVideoFrame + draw for the render loop;
 * this combined helper is for tests / one-shot draws.
 */
export async function drawSceneVideoFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: FootieScene,
  asset: ExportVideoAsset,
  sceneElapsedMs: number,
  sceneDurationMs: number,
): Promise<boolean> {
  const playback = resolveExportSceneMediaPlaybackState(scene, sceneElapsedMs, sceneDurationMs);
  const seekTimeSec = playback.clipTimeMs / 1000;
  const seeked = await seekVideoFrame(asset.element, seekTimeSec, {
    epsilonSec: resolveExportSeekEpsilonSec(30),
  });
  if (!seeked) {
    return false;
  }

  return drawPreparedSceneVideoFrame(
    ctx,
    width,
    height,
    scene,
    asset,
    sceneElapsedMs,
    sceneDurationMs,
    playback,
  );
}

function drawPreparedSceneVideoFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  asset: ExportVideoAsset,
  sceneElapsedMs: number,
  sceneDurationMs: number,
  playback: MediaPlaybackState,
): boolean {
  void playback;
  const media = resolveExportSceneMedia(scene);
  const sceneImage = resolveExportSceneMediaDrawImage(scene);
  const { width: sourceWidth, height: sourceHeight } = resolveSourceDimensions(
    asset.element,
    media?.width,
    media?.height,
  );

  if (!sceneImage || sourceWidth <= 0 || sourceHeight <= 0) {
    try {
      applyExportCanvasMediaQuality(ctx);
      ctx.drawImage(asset.element, 0, 0, width, height);
      return true;
    } catch {
      return false;
    }
  }

  const motionState = resolveExportFrameMotionState(
    scene,
    sceneElapsedMs,
    sceneDurationMs,
    width,
    height,
  );

  try {
    drawCanvasImageSource(
      ctx,
      asset.element,
      width,
      height,
      sceneImage,
      sourceWidth,
      sourceHeight,
      motionState,
      scene.media?.visualAdjustments,
    );
    return true;
  } catch {
    return false;
  }
}

export interface PrepareExportSceneMediaResult {
  sceneId: string;
  mediaItemId: string;
  ok: boolean;
  path: ExportMediaDrawPath;
  playback: MediaPlaybackState | null;
  seekTimeSec: number | null;
}

export interface PrepareExportSceneMediaFrameOptions {
  exportFps?: number;
  /** Stable timeline item id for cache lookup. */
  mediaItemId?: string;
  /** Item-local elapsed — drives video clip + motion when set. */
  itemElapsedMs?: number;
  /** Item window duration — motion/clip denominator when set. */
  itemDurationMs?: number;
}

/**
 * Seeks video assets to the correct clip time before drawing.
 * Image assets are always ready. Never throws.
 * Sprint 8D: uses per-item cache keys and item-local elapsed when provided.
 */
export async function prepareExportSceneMediaFrame(
  cache: ExportMediaCache,
  scene: Pick<FootieScene, "id" | "image" | "uploadedImage" | "media" | "startMs" | "start" | "durationMs" | "duration">,
  sceneElapsedMs: number,
  sceneDurationMs: number,
  options: PrepareExportSceneMediaFrameOptions = {},
): Promise<PrepareExportSceneMediaResult> {
  const mediaItemId = options.mediaItemId?.trim() || "__scene__";
  const itemElapsedMs =
    typeof options.itemElapsedMs === "number" && Number.isFinite(options.itemElapsedMs)
      ? options.itemElapsedMs
      : sceneElapsedMs;
  const itemDurationMs =
    typeof options.itemDurationMs === "number" && Number.isFinite(options.itemDurationMs)
      ? options.itemDurationMs
      : sceneDurationMs;

  const asset = getExportSceneMediaAsset(cache, scene, mediaItemId);
  if (!asset) {
    return {
      sceneId: scene.id,
      mediaItemId,
      ok: false,
      path: "placeholder",
      playback: null,
      seekTimeSec: null,
    };
  }

  const seekIdentity = buildExportMediaCacheKey(scene.id, mediaItemId);

  if (asset.kind === "image") {
    noteExportPreparedScene(seekIdentity, "image");
    return {
      sceneId: scene.id,
      mediaItemId,
      ok: true,
      path: "image",
      playback: resolveExportSceneMediaPlaybackState(scene, itemElapsedMs, itemDurationMs),
      seekTimeSec: null,
    };
  }

  const playback = resolveExportSceneMediaPlaybackState(scene, itemElapsedMs, itemDurationMs);
  const seekTimeSec = playback.clipTimeMs / 1000;
  const seekRequestId = beginExportVideoSeekRequest(seekIdentity);
  const seeked = await seekVideoFrame(asset.element, seekTimeSec, {
    epsilonSec: resolveExportSeekEpsilonSec(options.exportFps ?? 30),
    seekRequestId,
    exportFps: options.exportFps ?? 30,
  });

  return {
    sceneId: scene.id,
    mediaItemId,
    ok: seeked,
    path: "video",
    playback,
    seekTimeSec,
  };
}

function resolveSceneElapsedAtTimelineTime(
  scene: FootieScene,
  timelineTimeMs: number,
): { sceneElapsedMs: number; sceneDurationMs: number } {
  const startMs = scene.startMs ?? Math.round((scene.start ?? 0) * 1000);
  const durationMs =
    scene.durationMs ??
    Math.max(1, Math.round((scene.duration ?? 1) * 1000));
  const sceneElapsedMs = Math.max(0, Math.min(timelineTimeMs - startMs, durationMs));
  return { sceneElapsedMs, sceneDurationMs: durationMs };
}

/**
 * Prepares the active scene (and transition peers) for the next canvas frame.
 */
export async function prepareExportMediaForTimelineFrame(options: {
  cache: ExportMediaCache;
  scene: FootieScene;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  visualTimeMs: number;
  transitionFromScene?: FootieScene | null;
  transitionToScene?: FootieScene | null;
  /** Export FPS — drives seek epsilon so frames do not reuse stale bitmaps. */
  exportFps?: number;
}): Promise<Map<string, PrepareExportSceneMediaResult>> {
  const results = new Map<string, PrepareExportSceneMediaResult>();
  const seekOptions = { exportFps: options.exportFps };

  const primary = await prepareExportSceneMediaFrame(
    options.cache,
    options.scene,
    options.sceneElapsedMs,
    options.sceneDurationMs,
    seekOptions,
  );
  results.set(options.scene.id, primary);

  const peers = [options.transitionFromScene, options.transitionToScene].filter(
    (peer): peer is FootieScene => Boolean(peer),
  );

  for (const peer of peers) {
    if (results.has(peer.id)) {
      continue;
    }
    const timing = resolveSceneElapsedAtTimelineTime(peer, options.visualTimeMs);
    const prepared = await prepareExportSceneMediaFrame(
      options.cache,
      peer,
      timing.sceneElapsedMs,
      timing.sceneDurationMs,
      seekOptions,
    );
    results.set(peer.id, prepared);
  }

  return results;
}

export interface DrawSceneMediaFrameOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scene: Pick<
    FootieScene,
    "id" | "image" | "uploadedImage" | "media" | "sceneType"
  >;
  cache: ExportMediaCache;
  /** Retained for call-site compatibility — motion no longer reads timeline events. */
  masterTimeline?: MasterTimeline | null;
  /** Absolute timeline time — unused for motion; sceneElapsedMs is authoritative. */
  currentTimeMs?: number;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  /** When false, force placeholder (e.g. seek failure). */
  mediaReady?: boolean;
  /** Stable timeline item id for cache lookup (Sprint 8D). */
  mediaItemId?: string;
  /** Item-local elapsed override for motion/clip (Sprint 8D). */
  itemElapsedMs?: number;
  /** Item duration override for motion/clip (Sprint 8D). */
  itemDurationMs?: number;
}

/**
 * Unified export background renderer.
 * Image and video share framing + shared media motion; captions/transitions stay outside.
 */
export function drawSceneMediaFrame(options: DrawSceneMediaFrameOptions): ExportSceneMediaDrawResult {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const {
    ctx,
    width,
    height,
    scene,
    cache,
    sceneElapsedMs,
    sceneDurationMs,
    mediaReady = true,
    mediaItemId,
    itemElapsedMs,
    itemDurationMs,
  } = options;

  const elapsed =
    typeof itemElapsedMs === "number" && Number.isFinite(itemElapsedMs)
      ? itemElapsedMs
      : sceneElapsedMs;
  const duration =
    typeof itemDurationMs === "number" && Number.isFinite(itemDurationMs)
      ? itemDurationMs
      : sceneDurationMs;

  const playback = resolveExportSceneMediaPlaybackState(scene, elapsed, duration);
  const asset = getExportSceneMediaAsset(cache, scene, mediaItemId);

  const finish = (
    path: ExportMediaDrawPath,
    drew: boolean,
    seekTimeSec: number | null = null,
  ): ExportSceneMediaDrawResult => {
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    const result: ExportSceneMediaDrawResult = {
      path,
      mediaType: path,
      clipTimeMs: playback.clipTimeMs,
      seekTimeSec,
      holdLastFrame: playback.holdLastFrame,
      drew,
      drawDurationMs: Math.max(0, ended - started),
    };
    recordDrawDiagnostics(scene.id, result);
    return result;
  };

  if (!mediaReady || !asset) {
    drawExportMediaPlaceholderBackground(ctx, width, height, scene.sceneType);
    return finish("placeholder", false);
  }

  if (asset.kind === "image") {
    const drew = drawSceneImageFrame(
      ctx,
      width,
      height,
      scene,
      asset.element,
      elapsed,
      duration,
    );
    return finish("image", drew);
  }

  const seekTimeSec = playback.clipTimeMs / 1000;
  const drew = drawPreparedSceneVideoFrame(
    ctx,
    width,
    height,
    scene,
    asset as ExportVideoAsset,
    elapsed,
    duration,
    playback,
  );

  if (!drew) {
    drawExportMediaPlaceholderBackground(ctx, width, height, scene.sceneType);
    return finish("placeholder", false, seekTimeSec);
  }

  return finish("video", true, seekTimeSec);
}

/**
 * True when the cache has a drawable asset for the scene media item.
 * Omit mediaItemId (or pass undefined) for legacy `__scene__` lookup.
 */
export function exportSceneHasDrawableMedia(
  cache: ExportMediaCache,
  scene: Pick<FootieScene, "id">,
  mediaItemId?: string,
): boolean {
  return getExportSceneMediaAsset(cache, scene, mediaItemId) != null;
}

export type { ExportImageAsset, ExportVideoAsset };
