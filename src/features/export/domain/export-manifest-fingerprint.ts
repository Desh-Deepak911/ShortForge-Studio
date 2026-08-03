/**
 * Deterministic ExportManifest fingerprint (excludes createdAt / manifestId).
 * Version-aware: uses draft.rendererContractVersion (not a hard-coded latest).
 */

import type {
  ExportBrandStingManifest,
  ExportManifestDraft,
  ExportSceneManifest,
} from "./export-manifest.types";
import { isExportSceneManifestV3 } from "./export-manifest.types";

function sceneFingerprintPayload(scene: ExportSceneManifest) {
  const base = {
    id: scene.id,
    index: scene.index,
    startMs: scene.startMs,
    durationMs: scene.durationMs,
    endMs: scene.endMs,
    media: scene.media,
    mediaTimeline: {
      version: scene.mediaTimeline.version,
      items: scene.mediaTimeline.items.map((item) => ({
        id: item.id,
        index: item.index,
        startOffsetMs: item.startOffsetMs,
        endOffsetMs: item.endOffsetMs,
        durationMs: item.durationMs,
        media: item.media,
      })),
    },
    transitionOut: scene.transitionOut,
    captionMode: scene.captionMode,
  };

  if (isExportSceneManifestV3(scene)) {
    return {
      ...base,
      mediaTransitions: {
        version: scene.mediaTransitions.version,
        boundaries: scene.mediaTransitions.boundaries.map((boundary) => ({
          fromItemId: boundary.fromItemId,
          toItemId: boundary.toItemId,
          fromItemIndex: boundary.fromItemIndex,
          toItemIndex: boundary.toItemIndex,
          effect: boundary.effect,
          requestedDurationMs: boundary.requestedDurationMs,
          effectiveDurationMs: boundary.effectiveDurationMs,
          overlayStartOffsetMs: boundary.overlayStartOffsetMs,
          overlayEndOffsetMs: boundary.overlayEndOffsetMs,
        })),
      },
      ...(scene.engagementOverlays && scene.engagementOverlays.length > 0
        ? {
            engagementOverlays: scene.engagementOverlays.map((overlay) => ({
              version: overlay.version,
              id: overlay.id,
              kind: overlay.kind,
              startOffsetMs: overlay.startOffsetMs,
              durationMs: overlay.durationMs,
              position: overlay.position,
              presetId: overlay.presetId,
            })),
          }
        : {}),
    };
  }

  return base;
}

export function buildExportManifestFingerprint(
  draft: ExportManifestDraft,
): string {
  const payload = {
    version: draft.version,
    // Use draft contract — never hard-code latest (v2 fingerprints must stay stable).
    rendererContractVersion: draft.rendererContractVersion,
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
    scenes: draft.scenes.map((scene) => sceneFingerprintPayload(scene)),
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
      // supportedCapabilities is renderer negotiation metadata and must not
      // vary the canonical story/render fingerprint across Browser/Headless.
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
    ...("requiredCapabilities" in draft
      ? { requiredCapabilities: draft.requiredCapabilities }
      : {}),
    ...("brandSting" in draft && draft.brandSting
      ? (() => {
          const brandSting = draft.brandSting as ExportBrandStingManifest;
          return {
            brandSting: {
              version: brandSting.version,
              title: brandSting.title,
              durationMs: brandSting.durationMs,
              presetId: brandSting.presetId,
              narrationPolicy: brandSting.narrationPolicy,
              captionPolicy: brandSting.captionPolicy,
              playbackSpeedPolicy: brandSting.playbackSpeedPolicy,
              startMs: brandSting.startMs,
            },
          };
        })()
      : {}),
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

export interface ExportManifestFingerprintCoherenceIssue {
  readonly code: "INVALID_MANIFEST_FINGERPRINT" | "MANIFEST_FINGERPRINT_MISMATCH";
  readonly message: string;
}

/**
 * Total, version-aware fingerprint coherence check.
 * Never throws. Does not repair. Uses draft.rendererContractVersion via rebuild.
 */
export function verifyExportManifestFingerprintCoherence(
  manifest: unknown,
): ExportManifestFingerprintCoherenceIssue | null {
  try {
    if (manifest === null || typeof manifest !== "object") {
      return {
        code: "INVALID_MANIFEST_FINGERPRINT",
        message: "ExportManifest.fingerprint must be a non-empty string.",
      };
    }
    const record = manifest as Record<string, unknown>;
    const fingerprint = record.fingerprint;
    if (typeof fingerprint !== "string" || !fingerprint.trim()) {
      return {
        code: "INVALID_MANIFEST_FINGERPRINT",
        message: "ExportManifest.fingerprint must be a non-empty string.",
      };
    }

    const draft: Record<string, unknown> = { ...record };
    delete draft.fingerprint;
    const expected = buildExportManifestFingerprint(
      draft as unknown as ExportManifestDraft,
    );
    if (expected !== fingerprint) {
      return {
        code: "MANIFEST_FINGERPRINT_MISMATCH",
        message:
          "ExportManifest.fingerprint does not match the canonical fingerprint payload.",
      };
    }
    return null;
  } catch {
    return {
      code: "MANIFEST_FINGERPRINT_MISMATCH",
      message:
        "ExportManifest.fingerprint could not be verified against the canonical payload.",
    };
  }
}
