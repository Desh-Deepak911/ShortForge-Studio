/**
 * Export capability preflight constants and user-facing messages (Sprint 6B).
 */

import type { ExportBlockerCode, ExportWarningCode } from "./export-capability.types";

export {
  EXPORT_SAFE_PEAK_MEMORY_BYTES,
  EXPORT_UNSAFE_JPEG_SEQUENCE_BYTES,
  EXPORT_UNSAFE_PEAK_MEMORY_BYTES,
} from "./export-cost-estimate.utils";

/** Supported product transition effects (must match TransitionEffect). */
export const EXPORT_SUPPORTED_TRANSITIONS = [
  "cut",
  "fade",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "blur",
] as const;

/** Caption animation presets with full or partial browser export support. */
export const EXPORT_SUPPORTED_CAPTION_PRESETS = [
  "fade",
  "typewriter",
  "highlight",
  "none",
] as const;

/** Presets that may lose fidelity in current canvas export. */
export const EXPORT_PARTIAL_CAPTION_PRESETS = ["typewriter", "highlight"] as const;

export const EXPORT_BLOCKER_MESSAGES: Record<ExportBlockerCode, string> = {
  UNSUPPORTED_FORMAT:
    "This export format isn't supported. Choose WebM or MP4.",
  UNSUPPORTED_RESOLUTION:
    "This resolution isn't supported. Choose 720p or 1080p.",
  UNSUPPORTED_FPS: "Export only supports 30 FPS.",
  MISSING_MEDIA:
    "One or more scene assets are unavailable. Replace or remove the missing media before exporting.",
  MISSING_VOICEOVER:
    "Narration was requested but no voiceover audio is available. Generate voiceover or export without narration.",
  INVALID_TIMELINE:
    "This project's timeline is invalid. Check scene durations and try again.",
  INVALID_VIDEO_TRIM:
    "One or more video clips have an invalid trim range. Adjust the clip and try again.",
  UNSUPPORTED_TRANSITION:
    "This project uses a transition that isn't supported for export yet.",
  UNSUPPORTED_CAPTION_EFFECT:
    "This project uses a caption effect that isn't supported for export yet.",
  FONT_UNAVAILABLE:
    "A required caption font isn't available in this browser.",
  BROWSER_EXPORT_UNSUPPORTED:
    "This browser does not support the required export APIs. Use a supported Chromium-based browser.",
  MANUAL_CAPTURE_UNSUPPORTED:
    "This browser cannot capture canvas frames reliably for export. Use Chrome or Edge.",
  FFMPEG_UNAVAILABLE:
    "Video processing isn't available in this browser session. Reload and try again.",
  UNSAFE_MEMORY_ESTIMATE:
    "This project is estimated to exceed reliable browser memory for export.\n\nTry:\n• 720p browser export\n• reduce video-heavy scenes\n• future server renderer (coming later)",
  SERVER_RENDERER_REQUIRED:
    "This project is estimated to exceed reliable browser memory for 1080p export.\n\nTry:\n• 720p browser export\n• reduce video-heavy scenes\n• future server renderer (coming later)",
  POISONED_EXPORT_RUNTIME:
    "The previous export left the video processor in a bad state. Reload the page before exporting again.",
  INVALID_MANIFEST: "Export preparation produced an invalid manifest.",
  MISSING_MUSIC:
    "Background music was requested but no music track is available. Add music or export without it.",
  UNSUPPORTED_AUDIO_MODE:
    "This audio mode isn't supported for the selected export format.",
};

export const EXPORT_WARNING_MESSAGES: Record<ExportWarningCode, string> = {
  BORDERLINE_MEMORY:
    "This project is close to the safe browser memory limit.",
  LONG_EXPORT: "This export may take several minutes.",
  PARTIAL_CAPTION_FIDELITY:
    "Some caption effects have partial export fidelity.",
  BROWSER_SPECIFIC_RISK:
    "Export reliability varies by browser. Chrome or Edge is recommended.",
  SERVER_RENDERER_RECOMMENDED:
    "A server renderer is recommended for this project size.",
  TIMELINE_WARNING: "Timeline warnings were detected during export preparation.",
  RESOLUTION_PERFORMANCE_WARNING:
    "1080p export may be slower or use more memory on this project. You can continue, or switch to 720p for a more reliable browser export.",
  DEV_1080P_OVERRIDE:
    "1080p browser export is enabled in experimental developer mode.\n\nThis export may take longer and use significantly more browser memory.",
  VISUAL_PACING_DRAFT_NOT_APPLIED:
    "A Visual pacing suggestion has not been applied. Export will use the current sequence timing.",
  VISUAL_PACING_STALE:
    "Visual pacing is out of date. Export will use your current sequence timing.",
  VISUAL_PACING_METADATA_INVALID:
    "Saved Visual pacing metadata could not be read. Export will use the current sequence timing.",
  SOURCE_QUALITY_DIMENSIONS_UNKNOWN:
    "Some media dimensions are unavailable. Export will continue using the current framing.",
  SOURCE_QUALITY_MAY_UPSCALE:
    "Some media may be enlarged for this export and could look soft.",
  SOURCE_QUALITY_AGGRESSIVE_CROP:
    "Some media may be heavily cropped by the current vertical framing.",
};

/** @deprecated Sprint 6F.1 — use approveExportResolution instead of this flag. */
export const EXPORT_1080P_MIXED_REQUIRES_SERVER = false;
