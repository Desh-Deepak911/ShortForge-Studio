/**
 * Capability preflight for ExportManifest (Sprint 6B / 8D.1A).
 * Must run before media preload, canvas, MediaRecorder, FFmpeg, or frame render.
 *
 * Fail-closed: version-dispatching integrity (`validateExportManifest`) runs before
 * cost estimation, environment dereferences, format/timeline/media checks,
 * resolution approval, and renderer selection. Malformed manifests never reach
 * those stages.
 */

import type {
  ExportBlocker,
  ExportCapabilityResult,
  ExportCostEstimate,
  ExportWarning,
} from "./export-capability.types";
import { estimateExportCost } from "./export-cost-estimate.utils";
import type { ExportManifest } from "./export-manifest.types";
import { validateExportManifest } from "./validate-export-manifest";
import { approveExportResolutionForManifest } from "@/features/export/capabilities";
import {
  EXPORT_BLOCKER_MESSAGES,
  EXPORT_PARTIAL_CAPTION_PRESETS,
  EXPORT_SAFE_PEAK_MEMORY_BYTES,
  EXPORT_SUPPORTED_CAPTION_PRESETS,
  EXPORT_SUPPORTED_TRANSITIONS,
  EXPORT_UNSAFE_PEAK_MEMORY_BYTES,
  EXPORT_WARNING_MESSAGES,
} from "./export-preflight.constants";
import {
  exportRequiresServerRenderer,
  selectExportRenderer,
} from "./select-export-renderer";

/**
 * Sentinel cost when integrity fails before estimation runs.
 * Must not be mistaken for a real export cost estimate.
 */
export const EXPORT_INVALID_MANIFEST_COST_SENTINEL: ExportCostEstimate = {
  estimatedFrames: 0,
  estimatedRawFrameBytes: 0,
  estimatedIntermediateBytes: 0,
  estimatedPeakMemoryBytes: 0,
  durationClass: "short",
  risk: "unsafe",
  rendererVersion: "invalid-manifest-sentinel",
  chunkSizeFrames: 0,
  estimatedChunkFrameBytes: 0,
  estimatedRetainedSegmentBytes: 0,
};

function safeManifestFingerprint(manifest: unknown): string {
  if (
    typeof manifest === "object" &&
    manifest !== null &&
    typeof (manifest as { fingerprint?: unknown }).fingerprint === "string"
  ) {
    const fingerprint = (manifest as { fingerprint: string }).fingerprint.trim();
    if (fingerprint) {
      return fingerprint;
    }
  }
  return "invalid-manifest";
}

function blockedInvalidManifestResult(
  manifest: unknown,
  message: string,
): ExportCapabilityResult {
  return {
    supported: false,
    renderer: "blocked",
    warnings: [],
    blockers: [blocker("INVALID_MANIFEST", message)],
    estimatedCost: EXPORT_INVALID_MANIFEST_COST_SENTINEL,
    manifestFingerprint: safeManifestFingerprint(manifest),
  };
}

export function runExportCapabilityPreflight(
  manifest: ExportManifest,
): ExportCapabilityResult {
  // 1) Total integrity first — never estimate cost or dereference env on garbage.
  const integrity = validateExportManifest(manifest);
  if (!integrity.ok) {
    const first = integrity.issues[0]!;
    return blockedInvalidManifestResult(
      manifest,
      `${first.message} (${first.code})`,
    );
  }

  try {
    return runPostIntegrityPreflight(manifest);
  } catch (error) {
    return blockedInvalidManifestResult(
      manifest,
      error instanceof Error
        ? `Export preflight aborted on malformed manifest: ${error.message}`
        : "Export preflight aborted on malformed manifest.",
    );
  }
}

function runPostIntegrityPreflight(
  manifest: ExportManifest,
): ExportCapabilityResult {
  const blockers: ExportBlocker[] = [];
  const warnings: ExportWarning[] = [];
  const estimatedCost = estimateExportCost(manifest);
  const env = manifest.capabilities.environment;

  pushRequiredCapabilityChecks(manifest, blockers);
  pushFormatChecks(manifest, blockers);
  pushTimelineChecks(manifest, blockers, warnings);
  pushMediaChecks(manifest, blockers);
  pushVideoTrimChecks(manifest, blockers);
  pushCaptionChecks(manifest, blockers, warnings);
  pushAudioChecks(manifest, blockers);
  pushTransitionChecks(manifest, blockers);
  pushBrowserApiChecks(manifest, blockers, warnings);

  if (env.ffmpegRuntimePoisoned) {
    blockers.push(blocker("POISONED_EXPORT_RUNTIME"));
  }

  pushMemoryWarnings(estimatedCost, warnings);

  // Sprint 6F.1 — capability-based resolution approval (not blanket 1080p block).
  const resolutionApproval = approveExportResolutionForManifest(
    manifest,
    estimatedCost,
  );
  if (resolutionApproval.overrideApplied) {
    warnings.push(
      warning("DEV_1080P_OVERRIDE", resolutionApproval.message),
    );
  } else if (resolutionApproval.classification === "approved-with-warning") {
    warnings.push(
      warning("RESOLUTION_PERFORMANCE_WARNING", resolutionApproval.message),
    );
  }

  const needsServer = exportRequiresServerRenderer(manifest, { estimatedCost });
  if (needsServer) {
    if (manifest.capabilities.serverRendererAvailable) {
      warnings.push(warning("SERVER_RENDERER_RECOMMENDED"));
    } else if (resolutionApproval.classification === "blocked") {
      if (manifest.output.resolution === "1080p") {
        blockers.push(
          blocker("SERVER_RENDERER_REQUIRED", resolutionApproval.message),
        );
      } else {
        blockers.push(
          blocker("UNSAFE_MEMORY_ESTIMATE", resolutionApproval.message),
        );
      }
    } else if (estimatedCost.risk === "unsafe") {
      blockers.push(blocker("UNSAFE_MEMORY_ESTIMATE"));
    }
  }

  const draft = {
    warnings,
    blockers,
    estimatedCost,
    manifestFingerprint: safeManifestFingerprint(manifest),
  };

  const renderer = selectExportRenderer(manifest, draft);

  return {
    // "supported" means a browser render may proceed.
    supported: blockers.length === 0 && renderer === "browser",
    renderer,
    warnings,
    blockers,
    estimatedCost,
    manifestFingerprint: safeManifestFingerprint(manifest),
  };
}

function pushRequiredCapabilityChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
): void {
  if (!("requiredCapabilities" in manifest)) return;
  const supported = manifest.capabilities.supportedCapabilities ?? [];
  for (const capability of manifest.requiredCapabilities) {
    if (!supported.includes(capability)) {
      blockers.push(
        blocker(
          "UNSUPPORTED_RENDERER_CAPABILITY",
          `Required renderer capability "${capability}" is unavailable.`,
          capability,
        ),
      );
    }
  }
}

function blocker(
  code: ExportBlocker["code"],
  message?: string,
  capability?: string,
): ExportBlocker {
  return {
    code,
    message: message ?? EXPORT_BLOCKER_MESSAGES[code],
    ...(capability ? { capability } : {}),
  };
}

function warning(code: ExportWarning["code"], message?: string): ExportWarning {
  return {
    code,
    message: message ?? EXPORT_WARNING_MESSAGES[code],
  };
}

function pushFormatChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
): void {
  const { format, resolution, fps } = manifest.output;
  if (format !== "webm" && format !== "mp4") {
    blockers.push(blocker("UNSUPPORTED_FORMAT"));
  }
  if (resolution !== "720p" && resolution !== "1080p") {
    blockers.push(blocker("UNSUPPORTED_RESOLUTION"));
  }
  if (fps !== 30) {
    blockers.push(blocker("UNSUPPORTED_FPS"));
  }
  if (!manifest.capabilities.supportedFormats.includes(format)) {
    if (format === "mp4") {
      blockers.push(
        blocker(
          "UNSUPPORTED_FORMAT",
          "MP4 blocked by preflight — H.264/AAC runtime probe unavailable in this session.",
          "mp4-runtime-probe",
        ),
      );
    } else {
      blockers.push(blocker("UNSUPPORTED_FORMAT"));
    }
  }
}

function pushTimelineChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
  warnings: ExportWarning[],
): void {
  const { renderDurationMs, contentDurationMs, sceneCount } = manifest.project;
  if (
    !Number.isFinite(renderDurationMs) ||
    renderDurationMs <= 0 ||
    sceneCount <= 0 ||
    manifest.scenes.length === 0
  ) {
    blockers.push(blocker("INVALID_TIMELINE"));
    return;
  }
  if (contentDurationMs > renderDurationMs) {
    blockers.push(
      blocker("INVALID_TIMELINE", "Content duration exceeds render duration."),
    );
  }
  for (const scene of manifest.scenes) {
    if (
      scene.durationMs <= 0 ||
      scene.endMs < scene.startMs ||
      scene.startMs + scene.durationMs !== scene.endMs
    ) {
      blockers.push(
        blocker("INVALID_TIMELINE", `Invalid timing for scene ${scene.id}.`),
      );
      break;
    }
  }
  if (renderDurationMs / 1000 > 28) {
    warnings.push(warning("LONG_EXPORT"));
  }
}

function pushMediaChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
): void {
  for (const scene of manifest.scenes) {
    const items = scene.mediaTimeline?.items ?? [];
    if (items.length === 0) {
      blockers.push(
        blocker(
          "MISSING_MEDIA",
          `Scene "${scene.id}" has no exportable media.`,
          scene.id,
        ),
      );
      continue;
    }

    for (const item of items) {
      const media = item.media;
      if (media.type === "placeholder") {
        blockers.push(
          blocker(
            "MISSING_MEDIA",
            `Scene "${scene.id}" media item has no exportable media.`,
            scene.id,
          ),
        );
        continue;
      }
      if (!media.source.trim()) {
        blockers.push(
          blocker(
            "MISSING_MEDIA",
            `Scene "${scene.id}" media item is missing a media source.`,
            scene.id,
          ),
        );
      }
    }
  }
}

function pushVideoTrimChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
): void {
  for (const scene of manifest.scenes) {
    const items = scene.mediaTimeline?.items ?? [];
    for (const item of items) {
      if (item.media.type !== "video") continue;
      const media = item.media;
      if (media.trimEndMs < media.trimStartMs) {
        blockers.push(blocker("INVALID_VIDEO_TRIM", undefined, scene.id));
        continue;
      }
      if (
        media.sourceDurationMs > 0 &&
        (media.trimStartMs > media.sourceDurationMs ||
          media.trimEndMs > media.sourceDurationMs)
      ) {
        blockers.push(blocker("INVALID_VIDEO_TRIM", undefined, scene.id));
      }
      if (media.trimEndMs === media.trimStartMs && media.sourceDurationMs > 0) {
        blockers.push(
          blocker(
            "INVALID_VIDEO_TRIM",
            `Video trim window is empty for a media item in scene ${scene.id}.`,
            scene.id,
          ),
        );
      }
    }
  }
}

function pushCaptionChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
  warnings: ExportWarning[],
): void {
  let partialFidelity = false;
  for (const caption of manifest.captions) {
    if (caption.endMs < caption.startMs) {
      blockers.push(
        blocker(
          "INVALID_TIMELINE",
          `Caption "${caption.id}" has invalid timing.`,
        ),
      );
    }
    const preset = caption.animation.preset;
    if (
      !(EXPORT_SUPPORTED_CAPTION_PRESETS as readonly string[]).includes(preset)
    ) {
      blockers.push(blocker("UNSUPPORTED_CAPTION_EFFECT", undefined, preset));
    }
    if ((EXPORT_PARTIAL_CAPTION_PRESETS as readonly string[]).includes(preset)) {
      partialFidelity = true;
    }
  }
  if (partialFidelity) {
    warnings.push(warning("PARTIAL_CAPTION_FIDELITY"));
  }
}

function pushAudioChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
): void {
  const { mode, voiceover, music } = manifest.audio;
  if ((mode === "voice" || mode === "voice-with-music") && !voiceover?.source) {
    blockers.push(blocker("MISSING_VOICEOVER"));
  }
  if (mode === "voice-with-music" && !music?.source) {
    blockers.push(blocker("MISSING_MUSIC"));
  }
  if (
    mode !== "silent" &&
    mode !== "voice" &&
    mode !== "voice-with-music"
  ) {
    blockers.push(blocker("UNSUPPORTED_AUDIO_MODE"));
  }
}

function pushTransitionChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
): void {
  for (const scene of manifest.scenes) {
    const transition = scene.transitionOut;
    if (!transition) continue;
    if (
      !(EXPORT_SUPPORTED_TRANSITIONS as readonly string[]).includes(transition.type)
    ) {
      blockers.push(
        blocker("UNSUPPORTED_TRANSITION", undefined, transition.type),
      );
    }
  }
}

function pushBrowserApiChecks(
  manifest: ExportManifest,
  blockers: ExportBlocker[],
  warnings: ExportWarning[],
): void {
  const env = manifest.capabilities.environment;
  if (!env.supportsCanvasCaptureStream || !env.supportsMediaRecorder) {
    blockers.push(blocker("BROWSER_EXPORT_UNSUPPORTED"));
  }
  if (!env.supportsManualCanvasFrameRequest) {
    blockers.push(blocker("MANUAL_CAPTURE_UNSUPPORTED"));
  }
  if (!env.supportsWebAssembly) {
    blockers.push(blocker("FFMPEG_UNAVAILABLE"));
  }
  if (env.browserName === "safari" || env.browserName === "firefox") {
    warnings.push(warning("BROWSER_SPECIFIC_RISK"));
  }
}

function pushMemoryWarnings(
  estimatedCost: ReturnType<typeof estimateExportCost>,
  warnings: ExportWarning[],
): void {
  if (
    estimatedCost.risk === "borderline" ||
    (estimatedCost.estimatedPeakMemoryBytes >= EXPORT_SAFE_PEAK_MEMORY_BYTES &&
      estimatedCost.estimatedPeakMemoryBytes < EXPORT_UNSAFE_PEAK_MEMORY_BYTES)
  ) {
    warnings.push(warning("BORDERLINE_MEMORY"));
  }
}
