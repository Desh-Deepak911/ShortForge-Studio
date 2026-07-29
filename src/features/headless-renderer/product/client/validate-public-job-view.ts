import { HEADLESS_MAX_ADVISORY_FRAME_COUNT } from "@/features/headless-renderer/domain/headless-render-constants";

import {
  HEADLESS_PUBLIC_JOB_STATES,
  type HeadlessDownloadCapabilityV1,
  type HeadlessPublicJobState,
  type HeadlessPublicJobView,
} from "./public-job.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateHeadlessPublicJobView(
  value: unknown,
): HeadlessPublicJobView | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  if (typeof value.jobId !== "string" || value.jobId.length < 8) return null;
  if (
    typeof value.state !== "string" ||
    !(HEADLESS_PUBLIC_JOB_STATES as readonly string[]).includes(value.state)
  ) {
    return null;
  }
  if (typeof value.createdAtMs !== "number" || !Number.isFinite(value.createdAtMs)) {
    return null;
  }
  if (typeof value.updatedAtMs !== "number" || !Number.isFinite(value.updatedAtMs)) {
    return null;
  }
  if (typeof value.artifactAvailable !== "boolean") return null;
  if (typeof value.cancelAccepted !== "boolean") return null;

  let progress: HeadlessPublicJobView["progress"] = null;
  if (value.progress != null) {
    if (!isRecord(value.progress)) return null;
    const percent =
      value.progress.percent === null
        ? null
        : typeof value.progress.percent === "number" &&
            Number.isFinite(value.progress.percent)
          ? Math.max(0, Math.min(100, value.progress.percent))
          : null;
    if (value.progress.percent !== null && percent === null) return null;
    const stage =
      value.progress.stage === null
        ? null
        : typeof value.progress.stage === "string"
          ? value.progress.stage.slice(0, 64)
          : null;
    if (value.progress.stage !== null && stage === null) return null;
    let completedFrames: number | null = null;
    if (value.progress.completedFrames !== undefined) {
      if (value.progress.completedFrames === null) {
        completedFrames = null;
      } else if (
        typeof value.progress.completedFrames === "number" &&
        Number.isInteger(value.progress.completedFrames) &&
        value.progress.completedFrames >= 0
      ) {
        completedFrames = value.progress.completedFrames;
      } else {
        return null;
      }
    }
    let totalFrames: number | null = null;
    if (value.progress.totalFrames !== undefined) {
      if (value.progress.totalFrames === null) {
        totalFrames = null;
      } else if (
        typeof value.progress.totalFrames === "number" &&
        Number.isInteger(value.progress.totalFrames) &&
        value.progress.totalFrames > 0 &&
        value.progress.totalFrames <= HEADLESS_MAX_ADVISORY_FRAME_COUNT
      ) {
        totalFrames = value.progress.totalFrames;
      } else {
        return null;
      }
    }
    if (
      completedFrames != null &&
      totalFrames != null &&
      completedFrames > totalFrames
    ) {
      return null;
    }
    progress = Object.freeze({
      percent,
      stage,
      ...(completedFrames != null ? { completedFrames } : {}),
      ...(totalFrames != null ? { totalFrames } : {}),
    });
  }

  let terminalReason: HeadlessPublicJobView["terminalReason"] = null;
  if (value.terminalReason != null) {
    if (!isRecord(value.terminalReason)) return null;
    if (typeof value.terminalReason.reasonId !== "string") return null;
    if (typeof value.terminalReason.retryable !== "boolean") return null;
    terminalReason = Object.freeze({
      reasonId: value.terminalReason.reasonId.slice(0, 80),
      retryable: value.terminalReason.retryable,
    });
  }

  // Succeeded without artifact is hostile — fail closed at validate time for UI.
  if (value.state === "succeeded" && value.artifactAvailable !== true) {
    return null;
  }

  return Object.freeze({
    version: 1 as const,
    jobId: value.jobId,
    state: value.state as HeadlessPublicJobState,
    createdAtMs: value.createdAtMs,
    updatedAtMs: value.updatedAtMs,
    progress,
    terminalReason,
    artifactAvailable: value.artifactAvailable,
    cancelAccepted: value.cancelAccepted,
  });
}

export function validateHeadlessDownloadCapability(
  value: unknown,
): HeadlessDownloadCapabilityV1 | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  if (typeof value.jobId !== "string" || value.jobId.length < 8) return null;
  if (typeof value.url !== "string" || value.url.length === 0) return null;
  // Never accept javascript: or data: download capabilities.
  if (!/^https?:\/\//i.test(value.url) && !value.url.startsWith("blob:")) {
    return null;
  }
  if (typeof value.expiresAtMs !== "number" || !Number.isFinite(value.expiresAtMs)) {
    return null;
  }
  if (typeof value.filename !== "string" || value.filename.length === 0) {
    return null;
  }
  // Safe filename: no path separators.
  if (/[\\/]/.test(value.filename) || value.filename.includes("..")) {
    return null;
  }
  return Object.freeze({
    version: 1 as const,
    jobId: value.jobId,
    url: value.url,
    expiresAtMs: value.expiresAtMs,
    filename: value.filename.slice(0, 180),
  });
}
