/**
 * Final export artifact validation types (Sprint 6E).
 */

export type ExportArtifactWarningCode =
  | "DURATION_NEAR_TOLERANCE"
  | "AUDIO_PROBE_UNAVAILABLE"
  | "CODEC_PROBE_UNAVAILABLE";

export type ExportArtifactErrorCode =
  | "FILE_TOO_SMALL"
  | "WRONG_MIME"
  | "WRONG_EXTENSION"
  | "MISSING_VIDEO"
  | "MISSING_AUDIO"
  | "UNEXPECTED_AUDIO"
  | "WRONG_RESOLUTION"
  | "WRONG_FPS"
  | "WRONG_DURATION"
  | "WRONG_CONTAINER"
  | "WRONG_CODEC"
  | "PROBE_FAILED"
  | "WEBM_RENAMED_AS_MP4"
  | "FINAL_FRAME_MISSING";

export interface ExportArtifactWarning {
  readonly code: ExportArtifactWarningCode;
  readonly message: string;
}

export interface ExportArtifactError {
  readonly code: ExportArtifactErrorCode;
  readonly message: string;
}

export interface ExportArtifactValidation {
  readonly valid: boolean;
  readonly format: "webm" | "mp4";
  readonly durationMs?: number;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly hasVideo: boolean;
  readonly hasAudio: boolean;
  readonly videoCodec?: string;
  readonly audioCodec?: string;
  readonly byteSize: number;
  readonly warnings: readonly ExportArtifactWarning[];
  readonly errors: readonly ExportArtifactError[];
}
