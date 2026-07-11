/**
 * Preview-only trim scrub override — never persisted to FootieScript / SceneMedia.
 */

export type VideoTrimPreviewActiveHandle = "start" | "end" | "range" | "numeric";

/** Which surface currently owns the single global trim-preview slot. */
export type VideoTrimPreviewSurface = "inspector" | "timeline";

export interface VideoTrimPreviewOverride {
  sceneId: string;
  trimStartMs: number;
  trimEndMs: number;
  scrubTimeMs: number;
  activeHandle: VideoTrimPreviewActiveHandle;
  isActive: boolean;
  /** Optional owner — used to cancel competing trim sessions. */
  surface?: VideoTrimPreviewSurface;
}

export interface ResolveTrimPreviewScrubTimeInput {
  activeHandle: VideoTrimPreviewActiveHandle;
  trimStartMs: number;
  trimEndMs: number;
  /** Source clip duration — used to clamp scrub time. */
  sourceDurationMs?: number;
}

export interface BuildVideoTrimPreviewOverrideInput {
  sceneId: string;
  trimStartMs: number;
  trimEndMs: number;
  activeHandle: VideoTrimPreviewActiveHandle;
  sourceDurationMs?: number;
  isActive?: boolean;
  surface?: VideoTrimPreviewSurface;
}
