/**
 * Frame-derived advisory progress — claim-safe, monotonic, bounded writes.
 * Never affects render output, fingerprints, or artifact identity.
 */

import {
  HEADLESS_RENDERING_PROGRESS_CEILING,
  HEADLESS_RENDERING_PROGRESS_FLOOR,
} from "../../domain/headless-render-constants";
import type { HeadlessAdvisoryProgress } from "../../domain/headless-render.types";

export const HEADLESS_FRAME_PROGRESS_MIN_WRITE_INTERVAL_MS = 750;

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

export function shouldEmitFrameProgressWrite(input: {
  readonly lastEmittedPercent: number | null;
  readonly nextPercent: number;
  readonly completedFrames: number;
  readonly totalFrames: number;
  readonly lastWriteAtMs: number | null;
  readonly nowMs: number;
}): boolean {
  if (
    input.lastEmittedPercent != null &&
    input.nextPercent < input.lastEmittedPercent
  ) {
    return false;
  }
  if (input.lastEmittedPercent === input.nextPercent) {
    return (
      input.totalFrames > 0 &&
      input.completedFrames >= input.totalFrames &&
      input.nextPercent === HEADLESS_RENDERING_PROGRESS_CEILING &&
      input.lastEmittedPercent !== HEADLESS_RENDERING_PROGRESS_CEILING
    );
  }
  if (input.lastEmittedPercent == null || input.lastWriteAtMs == null) {
    return true;
  }
  if (
    input.totalFrames > 0 &&
    input.completedFrames >= input.totalFrames &&
    input.nextPercent === HEADLESS_RENDERING_PROGRESS_CEILING
  ) {
    return true;
  }
  if (input.completedFrames === 1) {
    return true;
  }
  if (
    input.nowMs - input.lastWriteAtMs <
    HEADLESS_FRAME_PROGRESS_MIN_WRITE_INTERVAL_MS
  ) {
    return false;
  }
  return true;
}

/** Upper bound on distinct percent-step writes during rendering (35–59 inclusive). */
export function countMaxRenderingProgressPercentWrites(totalFrames: number): number {
  if (totalFrames <= 0) return 0;
  const span = HEADLESS_RENDERING_PROGRESS_CEILING - HEADLESS_RENDERING_PROGRESS_FLOOR;
  return Math.min(totalFrames, span + 1);
}

export function buildAdvisoryFrameProgress(input: {
  readonly completedFrames: number;
  readonly totalFrames: number;
  readonly nowMs: number;
}): HeadlessAdvisoryProgress {
  return Object.freeze({
    percent: deriveRenderingFrameProgressPercent(
      input.completedFrames,
      input.totalFrames,
    ),
    stage: "rendering",
    updatedAtMs: input.nowMs,
    completedFrames: input.completedFrames,
    totalFrames: input.totalFrames,
  });
}

export function simulateFrameProgressWriteCount(input: {
  readonly totalFrames: number;
  readonly nowMsStart?: number;
  readonly intervalMs?: number;
}): number {
  const intervalMs =
    input.intervalMs ?? HEADLESS_FRAME_PROGRESS_MIN_WRITE_INTERVAL_MS;
  let lastPercent: number | null = null;
  let lastWriteAtMs: number | null = null;
  let writes = 0;
  for (let completed = 1; completed <= input.totalFrames; completed += 1) {
    const nextPercent = deriveRenderingFrameProgressPercent(
      completed,
      input.totalFrames,
    );
    const nowMs = (input.nowMsStart ?? 0) + completed * intervalMs;
    if (
      shouldEmitFrameProgressWrite({
        lastEmittedPercent: lastPercent,
        nextPercent,
        completedFrames: completed,
        totalFrames: input.totalFrames,
        lastWriteAtMs,
        nowMs,
      })
    ) {
      writes += 1;
      lastPercent = nextPercent;
      lastWriteAtMs = nowMs;
    }
  }
  return writes;
}
