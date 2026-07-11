/**
 * Create device QA report JSON (Sprint 6F).
 */

import type {
  ExportDeviceQaRun,
  ExportManualQaChecks,
} from "./export-device-qa.types";
import { DEFAULT_MANUAL_QA_NOT_TESTED } from "./export-device-qa.types";

export interface CreateExportDeviceQaReportInput {
  readonly runId: string;
  readonly manifestFingerprint: string;
  readonly goldenId: ExportDeviceQaRun["goldenId"];
  readonly evidenceClass: ExportDeviceQaRun["evidenceClass"];
  readonly browser: string;
  readonly browserVersion?: string;
  readonly platform?: string;
  readonly format: "webm" | "mp4";
  readonly width: number;
  readonly height: number;
  readonly projectDurationMs: number;
  readonly wallClockExportMs: number;
  readonly outputDurationMs?: number;
  readonly outputFileSizeBytes?: number;
  readonly peakMemoryEstimateBytes?: number;
  readonly validation?: ExportDeviceQaRun["validation"];
  readonly manualChecks?: Partial<ExportManualQaChecks>;
  readonly notes?: string;
}

export function createExportDeviceQaReport(
  input: CreateExportDeviceQaReportInput,
): ExportDeviceQaRun {
  return {
    runId: input.runId,
    manifestFingerprint: input.manifestFingerprint,
    goldenId: input.goldenId,
    evidenceClass: input.evidenceClass,
    browser: input.browser,
    browserVersion: input.browserVersion,
    platform: input.platform,
    format: input.format,
    width: input.width,
    height: input.height,
    fps: 30,
    projectDurationMs: input.projectDurationMs,
    outputDurationMs: input.outputDurationMs,
    outputFileSizeBytes: input.outputFileSizeBytes,
    wallClockExportMs: input.wallClockExportMs,
    peakMemoryEstimateBytes: input.peakMemoryEstimateBytes,
    validation: input.validation,
    manualChecks: {
      ...DEFAULT_MANUAL_QA_NOT_TESTED,
      ...input.manualChecks,
    },
    notes: input.notes,
    createdAtIso: new Date().toISOString(),
  };
}

export function serializeExportDeviceQaReport(run: ExportDeviceQaRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}

export function hasFreezeBlockingManualFailure(run: ExportDeviceQaRun): boolean {
  if (run.evidenceClass === "not-tested") {
    return false;
  }
  const checks = Object.values(run.manualChecks);
  return checks.some((c) => c === "fail");
}
