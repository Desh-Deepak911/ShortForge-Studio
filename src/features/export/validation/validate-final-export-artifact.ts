/**
 * Model-based final artifact validation (Sprint 6E).
 * Distinguishes structural/model checks from device playback QA.
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import {
  resolveFinalArtifactDurationPolicy,
  type ExportFormatArtifact,
} from "@/features/export/formats/export-format-adapter.types";
import { resolveExportRenderEndMs, resolveExportTotalFrames } from "@/features/export/timing";

import type {
  ExportArtifactError,
  ExportArtifactValidation,
  ExportArtifactWarning,
} from "./export-artifact-validation.types";

const MIN_ARTIFACT_BYTES = 1024;

export interface ValidateFinalExportArtifactInput {
  readonly artifact: ExportFormatArtifact;
  readonly manifest: ExportManifest;
  /** Optional probed duration from browser/ffprobe when available. */
  readonly probedDurationMs?: number | null;
  readonly probedHasVideo?: boolean;
  readonly probedHasAudio?: boolean;
  readonly probedWidth?: number;
  readonly probedHeight?: number;
  readonly probedFps?: number;
  readonly probedVideoCodec?: string;
  readonly probedAudioCodec?: string;
  /** Semantic: final global frame was rendered during silent visual. */
  readonly finalFrameRendered?: boolean;
}

export function validateFinalExportArtifact(
  input: ValidateFinalExportArtifactInput,
): ExportArtifactValidation {
  const { artifact, manifest } = input;
  const errors: ExportArtifactError[] = [];
  const warnings: ExportArtifactWarning[] = [];
  const format = artifact.format;
  const expectedDurationMs = resolveExportRenderEndMs(manifest);
  const durationPolicy = resolveFinalArtifactDurationPolicy(expectedDurationMs);
  const expectedFrames = resolveExportTotalFrames(manifest);

  const byteSize = artifact.blob.size;
  if (byteSize < MIN_ARTIFACT_BYTES) {
    errors.push({
      code: "FILE_TOO_SMALL",
      message: `Artifact too small (${byteSize} bytes).`,
    });
  }

  const expectedMime =
    format === "mp4" ? "video/mp4" : "video/webm";
  const expectedExt = format === "mp4" ? ".mp4" : ".webm";
  if (!artifact.mimeType.toLowerCase().includes(format)) {
    errors.push({
      code: "WRONG_MIME",
      message: `Expected MIME containing ${expectedMime}, got ${artifact.mimeType}.`,
    });
  }
  if (!artifact.filename.toLowerCase().endsWith(expectedExt)) {
    errors.push({
      code: "WRONG_EXTENSION",
      message: `Expected extension ${expectedExt}, got ${artifact.filename}.`,
    });
  }

  // Never accept WebM bytes labeled/named as MP4.
  if (
    format === "mp4" &&
    (artifact.blob.type.toLowerCase().includes("webm") ||
      artifact.mimeType.toLowerCase().includes("webm"))
  ) {
    errors.push({
      code: "WEBM_RENAMED_AS_MP4",
      message: "WebM content must not be downloaded as MP4.",
    });
  }

  const hasVideo = input.probedHasVideo ?? true;
  if (!hasVideo) {
    errors.push({
      code: "MISSING_VIDEO",
      message: "Final artifact is missing a video stream.",
    });
  }

  const expectAudio =
    manifest.audio.mode === "voice" || manifest.audio.mode === "voice-with-music";
  const hasAudio = input.probedHasAudio ?? artifact.hasAudio;

  if (expectAudio && artifact.hasAudio && hasAudio === false) {
    errors.push({
      code: "MISSING_AUDIO",
      message: "Audio mode requires an audio stream.",
    });
  }
  if (manifest.audio.mode === "silent" && (artifact.hasAudio || hasAudio === true)) {
    // Silent WebM may be video-only; unexpected only when probe finds audio.
    if (input.probedHasAudio === true) {
      errors.push({
        code: "UNEXPECTED_AUDIO",
        message: "Silent export must not include an audio stream.",
      });
    }
  }

  if (
    input.probedWidth != null &&
    input.probedWidth !== manifest.output.width
  ) {
    errors.push({
      code: "WRONG_RESOLUTION",
      message: `Width ${input.probedWidth} !== ${manifest.output.width}.`,
    });
  }
  if (
    input.probedHeight != null &&
    input.probedHeight !== manifest.output.height
  ) {
    errors.push({
      code: "WRONG_RESOLUTION",
      message: `Height ${input.probedHeight} !== ${manifest.output.height}.`,
    });
  }

  if (input.probedFps != null) {
    const delta = Math.abs(input.probedFps - manifest.output.fps);
    if (delta > 0.5) {
      errors.push({
        code: "WRONG_FPS",
        message: `FPS ${input.probedFps} !== ${manifest.output.fps}.`,
      });
    }
  }

  if (input.probedDurationMs != null && Number.isFinite(input.probedDurationMs)) {
    const delta = Math.abs(input.probedDurationMs - expectedDurationMs);
    if (delta > durationPolicy.toleranceMs) {
      errors.push({
        code: "WRONG_DURATION",
        message: `Duration ${input.probedDurationMs}ms outside tolerance of ${expectedDurationMs}ms (±${durationPolicy.toleranceMs}).`,
      });
    } else if (delta > durationPolicy.toleranceMs * 0.5) {
      warnings.push({
        code: "DURATION_NEAR_TOLERANCE",
        message: `Duration near tolerance edge (${delta.toFixed(0)}ms).`,
      });
    }
  } else {
    warnings.push({
      code: "AUDIO_PROBE_UNAVAILABLE",
      message: "Duration probe unavailable — validated expected duration from manifest model.",
    });
  }

  if (input.finalFrameRendered === false) {
    errors.push({
      code: "FINAL_FRAME_MISSING",
      message: "Final semantic frame was not confirmed rendered.",
    });
  }

  // Model check: frame count implies duration.
  const modelDurationMs = (expectedFrames / manifest.output.fps) * 1000;
  if (Math.abs(modelDurationMs - expectedDurationMs) > durationPolicy.toleranceMs) {
    errors.push({
      code: "WRONG_DURATION",
      message: "Frame-count model disagrees with renderDurationMs.",
    });
  }

  return {
    valid: errors.length === 0,
    format,
    durationMs: input.probedDurationMs ?? expectedDurationMs,
    width: input.probedWidth ?? manifest.output.width,
    height: input.probedHeight ?? manifest.output.height,
    fps: input.probedFps ?? manifest.output.fps,
    hasVideo,
    hasAudio: expectAudio ? hasAudio : false,
    videoCodec: input.probedVideoCodec,
    audioCodec: input.probedAudioCodec,
    byteSize,
    warnings,
    errors,
  };
}
