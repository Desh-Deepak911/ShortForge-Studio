/**
 * Deterministic ExportManifest fingerprint (excludes createdAt / manifestId).
 */

import { EXPORT_RENDERER_CONTRACT_VERSION } from "./export-manifest.types";
import type { ExportManifestDraft } from "./export-manifest.types";

export function buildExportManifestFingerprint(
  draft: ExportManifestDraft,
): string {
  const payload = {
    version: draft.version,
    rendererContractVersion: EXPORT_RENDERER_CONTRACT_VERSION,
    project: {
      projectId: draft.project.projectId,
      contentDurationMs: draft.project.contentDurationMs,
      renderDurationMs: draft.project.renderDurationMs,
      endBufferMs: draft.project.endBufferMs,
      sceneCount: draft.project.sceneCount,
    },
    output: {
      format: draft.output.format,
      quality: draft.output.quality,
      resolution: draft.output.resolution,
      width: draft.output.width,
      height: draft.output.height,
      fps: draft.output.fps,
      filename: draft.output.filename,
      bitrate: draft.output.bitrate,
    },
    scenes: draft.scenes.map((scene) => ({
      id: scene.id,
      index: scene.index,
      startMs: scene.startMs,
      durationMs: scene.durationMs,
      endMs: scene.endMs,
      media: scene.media,
      transitionOut: scene.transitionOut,
      captionMode: scene.captionMode,
    })),
    captions: draft.captions.map((caption) => ({
      id: caption.id,
      sceneId: caption.sceneId,
      startMs: caption.startMs,
      endMs: caption.endMs,
      text: caption.text,
      style: caption.style,
      layout: caption.layout,
      animation: caption.animation,
    })),
    audio: draft.audio,
    branding: draft.branding,
    capabilities: {
      supportedFormats: draft.capabilities.supportedFormats,
      supportedResolutions: draft.capabilities.supportedResolutions,
      supportedFps: draft.capabilities.supportedFps,
      browserRendererAvailable: draft.capabilities.browserRendererAvailable,
      serverRendererAvailable: draft.capabilities.serverRendererAvailable,
      // Environment APIs affect capability but not visual fingerprint of content —
      // include support flags only (not heap limits / browser name).
      envFlags: {
        supportsCanvasCaptureStream:
          draft.capabilities.environment.supportsCanvasCaptureStream,
        supportsManualCanvasFrameRequest:
          draft.capabilities.environment.supportsManualCanvasFrameRequest,
        supportsMediaRecorder: draft.capabilities.environment.supportsMediaRecorder,
        supportsWebAssembly: draft.capabilities.environment.supportsWebAssembly,
        serverRendererAvailable:
          draft.capabilities.environment.serverRendererAvailable,
        ffmpegRuntimePoisoned:
          draft.capabilities.environment.ffmpegRuntimePoisoned,
      },
    },
  };

  return `em:${stableHash(stableStringify(payload))}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** FNV-1a 32-bit → base36 for compact deterministic fingerprints. */
function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
