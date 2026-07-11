/**
 * Browser/runtime snapshot for export capability preflight.
 */

import type { ExportEnvironmentSnapshot } from "./export-manifest.types";

let ffmpegRuntimePoisoned = false;

export function markExportFfmpegRuntimePoisoned(poisoned = true): void {
  ffmpegRuntimePoisoned = poisoned;
}

export function isExportFfmpegRuntimePoisoned(): boolean {
  return ffmpegRuntimePoisoned;
}

export function buildExportEnvironmentSnapshot(
  overrides: Partial<ExportEnvironmentSnapshot> = {},
): ExportEnvironmentSnapshot {
  const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

  let supportsCanvasCaptureStream = false;
  let supportsManualCanvasFrameRequest = false;
  let supportsMediaRecorder = false;
  let supportsRequestVideoFrameCallback = false;
  const supportsWebAssembly = typeof WebAssembly !== "undefined";
  let estimatedHeapLimitBytes: number | null = null;
  let browserName = "unknown";

  if (isBrowser) {
    browserName = detectBrowserName();
    const canvas = document.createElement("canvas");
    supportsCanvasCaptureStream = typeof canvas.captureStream === "function";
    if (supportsCanvasCaptureStream) {
      try {
        const stream = canvas.captureStream(0);
        const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
          requestFrame?: () => void;
        };
        supportsManualCanvasFrameRequest = typeof track?.requestFrame === "function";
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        supportsManualCanvasFrameRequest = false;
      }
    }
    supportsMediaRecorder = typeof MediaRecorder !== "undefined";
    supportsRequestVideoFrameCallback =
      typeof HTMLVideoElement !== "undefined" &&
      "requestVideoFrameCallback" in HTMLVideoElement.prototype;

    const memory = (
      performance as Performance & {
        memory?: { jsHeapSizeLimit?: number };
      }
    ).memory;
    if (memory?.jsHeapSizeLimit && Number.isFinite(memory.jsHeapSizeLimit)) {
      estimatedHeapLimitBytes = memory.jsHeapSizeLimit;
    }
  }

  return {
    browserName,
    supportsCanvasCaptureStream:
      overrides.supportsCanvasCaptureStream ?? supportsCanvasCaptureStream,
    supportsManualCanvasFrameRequest:
      overrides.supportsManualCanvasFrameRequest ?? supportsManualCanvasFrameRequest,
    supportsMediaRecorder: overrides.supportsMediaRecorder ?? supportsMediaRecorder,
    supportsRequestVideoFrameCallback:
      overrides.supportsRequestVideoFrameCallback ?? supportsRequestVideoFrameCallback,
    supportsWebAssembly: overrides.supportsWebAssembly ?? supportsWebAssembly,
    estimatedHeapLimitBytes:
      overrides.estimatedHeapLimitBytes !== undefined
        ? overrides.estimatedHeapLimitBytes
        : estimatedHeapLimitBytes,
    // Server renderer not shipped in 6B.
    serverRendererAvailable: overrides.serverRendererAvailable ?? false,
    ffmpegRuntimePoisoned:
      overrides.ffmpegRuntimePoisoned ?? ffmpegRuntimePoisoned,
    ...(overrides.mp4EncoderAvailable !== undefined
      ? { mp4EncoderAvailable: overrides.mp4EncoderAvailable }
      : {}),
  };
}

function detectBrowserName(): string {
  if (typeof navigator === "undefined") return "node";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "chrome";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "safari";
  return "other";
}
