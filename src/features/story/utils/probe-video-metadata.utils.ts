export interface ProbedVideoMetadata {
  durationMs: number;
  width: number;
  height: number;
  mimeType: string;
}

const METADATA_PROBE_TIMEOUT_MS = 15_000;

/**
 * Probes intrinsic video metadata via a temporary HTMLVideoElement.
 * Browser-only — rejects outside document context.
 */
export function probeVideoMetadata(fileOrUrl: File | string): Promise<ProbedVideoMetadata> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("probeVideoMetadata requires a browser environment"));
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    let objectUrl: string | null = null;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video metadata probe timed out"));
    }, METADATA_PROBE_TIMEOUT_MS);

    video.onloadedmetadata = () => {
      window.clearTimeout(timeoutId);

      const durationMs = Math.round(video.duration * 1000);
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        cleanup();
        reject(new Error("Video duration is unavailable"));
        return;
      }

      const mimeType =
        fileOrUrl instanceof File
          ? fileOrUrl.type.trim() || "video/mp4"
          : "video/mp4";

      resolve({
        durationMs,
        width: video.videoWidth,
        height: video.videoHeight,
        mimeType,
      });
      cleanup();
    };

    video.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("Unable to read video metadata"));
    };

    if (fileOrUrl instanceof File) {
      objectUrl = URL.createObjectURL(fileOrUrl);
      video.src = objectUrl;
      return;
    }

    video.src = fileOrUrl;
  });
}
