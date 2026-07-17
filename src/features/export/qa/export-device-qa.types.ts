/**
 * Device QA types (Sprint 6F).
 * Manual device results must never be fabricated — use evidenceClass honestly.
 */

import type { ExportArtifactValidation } from "@/features/export/validation";
import type { ExportFallbackChoice } from "@/features/export/formats";

export type ExportGoldenId =
  | "golden-a"
  | "golden-b"
  | "golden-c"
  | "golden-d"
  | "golden-e"
  | "golden-f"
  | "golden-g";

export type ExportQaEvidenceClass =
  | "automated-semantic"
  | "local-artifact"
  | "manual-device"
  | "not-tested";

export type ExportManualCheckResult =
  | "pass"
  | "fail"
  | "pass-with-warning"
  | "not-tested"
  | "n/a";

export interface ExportManualQaChecks {
  readonly playbackStarts: ExportManualCheckResult;
  readonly durationCorrect: ExportManualCheckResult;
  readonly audioPresentAsRequired: ExportManualCheckResult;
  readonly silentHasNoAudio: ExportManualCheckResult;
  readonly videoNormalSpeed: ExportManualCheckResult;
  readonly seekingWorks: ExportManualCheckResult;
  readonly finalFrameVisible: ExportManualCheckResult;
  readonly finalCaptionVisible: ExportManualCheckResult;
  readonly noCorruption: ExportManualCheckResult;
  readonly duckingAudible: ExportManualCheckResult;
  readonly fadeOutComplete: ExportManualCheckResult;
  readonly chunkSeamsInvisible: ExportManualCheckResult;
}

export interface ExportDeviceQaRun {
  readonly runId: string;
  readonly manifestFingerprint: string;
  readonly goldenId: ExportGoldenId;
  readonly evidenceClass: ExportQaEvidenceClass;

  readonly browser: string;
  readonly browserVersion?: string;
  readonly platform?: string;

  readonly format: "webm" | "mp4";
  readonly width: number;
  readonly height: number;
  readonly fps: 30;

  readonly projectDurationMs: number;
  readonly outputDurationMs?: number;
  readonly outputFileSizeBytes?: number;

  readonly wallClockExportMs: number;
  readonly peakMemoryEstimateBytes?: number;

  readonly validation?: ExportArtifactValidation;
  readonly manualChecks: ExportManualQaChecks;
  readonly notes?: string;
  readonly createdAtIso: string;
}

export interface ExportParityCheckpoint {
  readonly label: string;
  readonly progressRatio: number;
  readonly timestampMs: number;
  readonly sceneId: string;
  readonly sceneElapsedMs: number;
  /** Active timeline media item id at this checkpoint (null if unresolved). */
  readonly mediaItemId: string | null;
  /** Active item-local elapsed ms at this checkpoint (null if unresolved). */
  readonly mediaItemElapsedMs: number | null;
  readonly mediaType: string;
  readonly videoSourceTimeMs: number | null;
  readonly captionId: string | null;
  readonly captionProgress: number | null;
  readonly transitionActive: boolean;
}

export interface ExportPerformancePolicy {
  readonly resolution: "720p" | "1080p";
  readonly maxProjectDurationMs: number;
  readonly maxEstimatedFrames: number;
  readonly maxVideoScenes: number;
  readonly maxEstimatedPeakMemoryBytes: number;
  readonly classification: "approved" | "approved-with-warning" | "blocked";
  readonly rationale: string;
}

export interface ExportBrowserSupportRow {
  readonly browser: string;
  readonly classification: "Supported" | "Supported with warnings" | "Unsupported";
  readonly notes: string;
  readonly evidenceClass: ExportQaEvidenceClass;
}

export const DEFAULT_MANUAL_QA_NOT_TESTED: ExportManualQaChecks = {
  playbackStarts: "not-tested",
  durationCorrect: "not-tested",
  audioPresentAsRequired: "not-tested",
  silentHasNoAudio: "not-tested",
  videoNormalSpeed: "not-tested",
  seekingWorks: "not-tested",
  finalFrameVisible: "not-tested",
  finalCaptionVisible: "not-tested",
  noCorruption: "not-tested",
  duckingAudible: "not-tested",
  fadeOutComplete: "not-tested",
  chunkSeamsInvisible: "not-tested",
};

export type { ExportFallbackChoice };
