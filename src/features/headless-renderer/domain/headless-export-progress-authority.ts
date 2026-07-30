/**
 * Sprint 11E Phase 2G.25A — single monotonic headless export progress authority.
 *
 * All website, control-plane, and worker advisory progress maps into these
 * global bands. Never compare raw percentages across incompatible legacy scales.
 */

import {
  HEADLESS_ENCODING_PROGRESS_PERCENT,
  HEADLESS_PREPARATION_PROGRESS_MAX,
  HEADLESS_QUEUE_PROGRESS_FLOOR,
  HEADLESS_QUEUE_PROGRESS_MAX,
  HEADLESS_RENDERING_PROGRESS_CEILING,
  HEADLESS_RENDERING_PROGRESS_FLOOR,
  HEADLESS_SUCCEEDED_PROGRESS_PERCENT,
  HEADLESS_UPLOADING_PROGRESS_PERCENT,
  HEADLESS_VALIDATING_PROGRESS_PERCENT,
} from "./headless-render-constants";
import type { HeadlessJobState } from "./headless-render.types";

/** Legacy website upload scale before job creation (15..92). */
export const HEADLESS_PREPARATION_LOCAL_PERCENT_MIN = 15 as const;
export const HEADLESS_PREPARATION_LOCAL_PERCENT_MAX = 92 as const;

/** Bounded polls before declaring frame telemetry temporarily unavailable. */
export const HEADLESS_RENDERING_FRAME_TELEMETRY_MISSING_POLL_THRESHOLD = 3 as const;

export const HEADLESS_RENDERING_FRAME_TELEMETRY_UNAVAILABLE_MESSAGE =
  "Rendering is active. Detailed frame progress is temporarily unavailable." as const;

export type HeadlessMissingFrameTelemetryClass =
  | "none"
  | "awaiting_first_poll"
  | "missing_after_bounded_polls";

export interface HeadlessGlobalProgressInput {
  readonly percent?: number | null;
  readonly stage?: string | null;
  readonly completedFrames?: number | null;
  readonly totalFrames?: number | null;
}

const TERMINAL_PROGRESS_STATES = new Set<HeadlessJobState>([
  "failed",
  "cancelled",
  "expired",
]);

export function mapHeadlessPreparationLocalPercent(localPercent: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(localPercent)));
  if (clamped <= HEADLESS_PREPARATION_LOCAL_PERCENT_MIN) {
    return 0;
  }
  if (clamped >= HEADLESS_PREPARATION_LOCAL_PERCENT_MAX) {
    return HEADLESS_PREPARATION_PROGRESS_MAX;
  }
  const ratio =
    (clamped - HEADLESS_PREPARATION_LOCAL_PERCENT_MIN) /
    (HEADLESS_PREPARATION_LOCAL_PERCENT_MAX - HEADLESS_PREPARATION_LOCAL_PERCENT_MIN);
  return Math.min(
    HEADLESS_PREPARATION_PROGRESS_MAX,
    Math.round(ratio * HEADLESS_PREPARATION_PROGRESS_MAX),
  );
}

export function clampHeadlessGlobalProgressPercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function deriveRenderingFrameProgressPercent(
  completedFrames: number,
  totalFrames: number,
): number {
  if (
    !Number.isInteger(completedFrames) ||
    !Number.isInteger(totalFrames) ||
    totalFrames <= 0 ||
    completedFrames <= 0
  ) {
    return HEADLESS_RENDERING_PROGRESS_FLOOR;
  }
  const clamped = Math.min(completedFrames, totalFrames);
  const span = HEADLESS_RENDERING_PROGRESS_CEILING - HEADLESS_RENDERING_PROGRESS_FLOOR;
  const derived =
    HEADLESS_RENDERING_PROGRESS_FLOOR +
    Math.floor((clamped / totalFrames) * span);
  return Math.min(derived, HEADLESS_RENDERING_PROGRESS_CEILING);
}

export function deriveHeadlessQueuedProgressPercent(
  incomingPercent: number | null | undefined,
): number {
  if (incomingPercent == null || !Number.isFinite(incomingPercent)) {
    return HEADLESS_QUEUE_PROGRESS_FLOOR;
  }
  return clampHeadlessGlobalProgressPercent(
    Math.max(
      HEADLESS_QUEUE_PROGRESS_FLOOR,
      Math.min(HEADLESS_QUEUE_PROGRESS_MAX, incomingPercent),
    ),
  );
}

export function deriveHeadlessRenderingGlobalPercent(input: {
  readonly completedFrames?: number | null;
  readonly totalFrames?: number | null;
  readonly incomingPercent?: number | null;
}): number {
  const completedFrames = input.completedFrames;
  const totalFrames = input.totalFrames;
  if (
    completedFrames != null &&
    totalFrames != null &&
    Number.isInteger(completedFrames) &&
    Number.isInteger(totalFrames) &&
    totalFrames > 0 &&
    completedFrames >= 0 &&
    completedFrames <= totalFrames
  ) {
    return deriveRenderingFrameProgressPercent(completedFrames, totalFrames);
  }
  if (input.incomingPercent != null && Number.isFinite(input.incomingPercent)) {
    return clampHeadlessGlobalProgressPercent(
      Math.max(
        HEADLESS_RENDERING_PROGRESS_FLOOR,
        Math.min(HEADLESS_RENDERING_PROGRESS_CEILING, input.incomingPercent),
      ),
    );
  }
  return HEADLESS_RENDERING_PROGRESS_FLOOR;
}

export function deriveHeadlessGlobalProgressPercent(input: {
  readonly state: HeadlessJobState;
  readonly progress: HeadlessGlobalProgressInput | null;
}): number | null {
  const { state, progress } = input;
  if (state === "succeeded") {
    return HEADLESS_SUCCEEDED_PROGRESS_PERCENT;
  }
  if (TERMINAL_PROGRESS_STATES.has(state)) {
    return null;
  }

  switch (state) {
    case "created":
    case "materializing": {
      const incoming = progress?.percent;
      if (incoming == null || !Number.isFinite(incoming)) {
        return null;
      }
      if (incoming <= HEADLESS_PREPARATION_PROGRESS_MAX) {
        return clampHeadlessGlobalProgressPercent(incoming);
      }
      return mapHeadlessPreparationLocalPercent(incoming);
    }
    case "queued":
      return deriveHeadlessQueuedProgressPercent(progress?.percent);
    case "rendering":
      return deriveHeadlessRenderingGlobalPercent({
        completedFrames: progress?.completedFrames,
        totalFrames: progress?.totalFrames,
        incomingPercent: progress?.percent,
      });
    case "encoding":
      return HEADLESS_ENCODING_PROGRESS_PERCENT;
    case "validating":
      return HEADLESS_VALIDATING_PROGRESS_PERCENT;
    case "uploading":
      return HEADLESS_UPLOADING_PROGRESS_PERCENT;
    default:
      return progress?.percent ?? null;
  }
}

export function reconcileHeadlessMonotonicProgress(input: {
  readonly previousPercent: number | null;
  readonly incomingPercent: number | null;
  readonly state: HeadlessJobState;
}): number | null {
  if (input.state === "succeeded") {
    return HEADLESS_SUCCEEDED_PROGRESS_PERCENT;
  }
  if (TERMINAL_PROGRESS_STATES.has(input.state)) {
    return input.previousPercent;
  }
  if (input.incomingPercent == null) {
    return input.previousPercent;
  }
  if (input.previousPercent == null) {
    return input.incomingPercent;
  }
  return Math.max(input.previousPercent, input.incomingPercent);
}

export function normalizeHeadlessAdvisoryFrameCounts(input: {
  readonly completedFrames?: number | null;
  readonly totalFrames?: number | null;
  readonly previousCompletedFrames: number | null;
  readonly previousTotalFrames: number | null;
}): {
  readonly completedFrames: number | null;
  readonly totalFrames: number | null;
} {
  const completedFrames = input.completedFrames;
  const totalFrames = input.totalFrames;
  if (completedFrames == null && totalFrames == null) {
    return {
      completedFrames: input.previousCompletedFrames,
      totalFrames: input.previousTotalFrames,
    };
  }
  if (
    completedFrames != null &&
    totalFrames != null &&
    Number.isInteger(completedFrames) &&
    Number.isInteger(totalFrames) &&
    totalFrames > 0 &&
    completedFrames >= 0 &&
    completedFrames <= totalFrames
  ) {
    return { completedFrames, totalFrames };
  }
  return {
    completedFrames: input.previousCompletedFrames,
    totalFrames: input.previousTotalFrames,
  };
}

export type HeadlessProductProgressState =
  | "preparing"
  | "materializing"
  | "uploading"
  | "creating_job"
  | "queued"
  | "rendering"
  | "encoding"
  | "validating"
  | "uploading_artifact"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "cancelling"
  | "retrying"
  | "checking_availability"
  | "unavailable"
  | "idle";

export function classifyHeadlessMissingFrameTelemetry(input: {
  readonly state: HeadlessProductProgressState;
  readonly completedFrames: number | null;
  readonly totalFrames: number | null;
  readonly pollsWithoutFrameTelemetry: number;
}): HeadlessMissingFrameTelemetryClass {
  if (input.state !== "rendering") {
    return "none";
  }
  if (
    input.completedFrames != null &&
    input.totalFrames != null &&
    input.totalFrames > 0
  ) {
    return "none";
  }
  if (
    input.pollsWithoutFrameTelemetry >=
    HEADLESS_RENDERING_FRAME_TELEMETRY_MISSING_POLL_THRESHOLD
  ) {
    return "missing_after_bounded_polls";
  }
  return "awaiting_first_poll";
}

export function deriveHeadlessMaterializeProgressPercent(
  localPercent: number | null | undefined,
): number | null {
  if (localPercent == null || !Number.isFinite(localPercent)) {
    return null;
  }
  return mapHeadlessPreparationLocalPercent(localPercent);
}
