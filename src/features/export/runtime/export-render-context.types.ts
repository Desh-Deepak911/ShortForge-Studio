/**
 * ExportRenderContext — runtime-only state (Sprint 6C).
 * Must never hold semantic ExportManifest fields (scenes, captions, audio config).
 */

import type { ExportMediaCache } from "@/features/export/utils/export-media-cache.utils";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

export type ExportProgressStage =
  | "preparing"
  | "preloading"
  | "rendering"
  | "normalizing"
  | "encoding"
  | "mixing-audio"
  | "validating"
  | "finalizing";

export interface ExportProgressUpdate {
  readonly stage: ExportProgressStage;
  readonly progress: number;
  readonly message: string;
  readonly warning?: string;
}

export interface ExportProgressReporter {
  report(update: ExportProgressUpdate): void;
}

export interface ExportCancellationToken {
  readonly isCancelled: boolean;
  throwIfCancelled(): void;
  cancel(reason?: string): void;
}

export interface ExportDiagnostics {
  readonly events: ExportDiagnosticEvent[];
  push(event: Omit<ExportDiagnosticEvent, "atMs">): void;
}

export interface ExportDiagnosticEvent {
  readonly code: string;
  readonly message: string;
  readonly atMs: number;
  readonly detail?: Record<string, unknown>;
}

export interface ExportRuntimeEnvironment {
  readonly supportsManualCanvasCapture: boolean;
  readonly supportsMediaRecorder: boolean;
  readonly supportsRequestVideoFrameCallback: boolean;
  readonly browserName?: string;
}

export interface ExportTemporaryStorage {
  readonly objectUrls: string[];
  trackObjectUrl(url: string): string;
  revokeAll(): void;
}

export interface ExportFfmpegRuntime {
  getInstance(): Promise<FFmpeg>;
  reset(): Promise<void>;
  markPoisoned(reason?: string): void;
  readonly isPoisoned: boolean;
}

export interface ExportRenderContext {
  readonly canvas: HTMLCanvasElement;
  readonly canvasContext: CanvasRenderingContext2D;
  readonly ffmpeg: ExportFfmpegRuntime;
  readonly mediaCache: ExportMediaCache;
  readonly tempStorage: ExportTemporaryStorage;
  readonly cancellation: ExportCancellationToken;
  readonly progress: ExportProgressReporter;
  readonly diagnostics: ExportDiagnostics;
  readonly environment: ExportRuntimeEnvironment;
  /** Output pixel size from manifest (runtime allocation only). */
  readonly width: number;
  readonly height: number;
}

export interface CreateExportRenderContextOptions {
  readonly width: number;
  readonly height: number;
  readonly onProgress?: (update: ExportProgressUpdate) => void;
  readonly environment?: Partial<ExportRuntimeEnvironment>;
  readonly signal?: AbortSignal;
}
