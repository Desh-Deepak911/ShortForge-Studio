/**
 * Authoritative 720p smoke frame-plan breakdown — content vs render budget.
 * Sprint 11E Phase 2E.2D.8I.6B
 */

import type { ExportManifest } from "@/features/export/domain";
import {
  resolveExportContentEndMs,
  resolveExportRenderEndMs,
  resolveExportTotalFrames,
} from "@/features/export/timing";

import {
  HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS,
  HEADLESS_FLY_RENDER_LIVE_SMOKE_PROFILE_ID,
} from "./smoke-workload";

export type HeadlessFlyRenderSmokeFramePlanAuthority = {
  readonly profileId: typeof HEADLESS_FLY_RENDER_LIVE_SMOKE_PROFILE_ID;
  readonly fps: 30;
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
  readonly endBufferMs: number;
  readonly contentFrames: number;
  readonly renderedFrames: number;
  readonly paddingTailFrames: number;
};

/** Discrete content frames at 30fps — visual sampling stops at content end. */
export function resolveHeadlessContentFrameCount(input: {
  readonly contentDurationMs: number;
  readonly fps?: number;
}): number {
  const fps = input.fps ?? 30;
  const ms = input.contentDurationMs;
  if (!Number.isSafeInteger(ms) || ms < 1) return 0;
  return Math.max(1, Math.ceil((ms * fps) / 1000));
}

/** Rendered/export frame count — includes end-buffer tail frames. */
export function resolveHeadlessRenderedFrameCount(input: {
  readonly renderDurationMs: number;
  readonly fps?: number;
}): number {
  const fps = input.fps ?? 30;
  const ms = input.renderDurationMs;
  if (!Number.isSafeInteger(ms) || ms < 1) return 0;
  return Math.max(1, Math.ceil((ms * fps) / 1000));
}

export function buildHeadlessFlyRenderSmokeFramePlanAuthority(
  manifest: ExportManifest,
): HeadlessFlyRenderSmokeFramePlanAuthority {
  const fps = manifest.output.fps === 30 ? 30 : 30;
  const contentDurationMs = resolveExportContentEndMs(manifest);
  const renderDurationMs = resolveExportRenderEndMs(manifest);
  const endBufferMs = Math.max(0, renderDurationMs - contentDurationMs);
  const renderedFrames = resolveExportTotalFrames(manifest);
  const contentFrames = resolveHeadlessContentFrameCount({
    contentDurationMs,
    fps,
  });
  const paddingTailFrames = Math.max(0, renderedFrames - contentFrames);
  return Object.freeze({
    profileId: HEADLESS_FLY_RENDER_LIVE_SMOKE_PROFILE_ID,
    fps,
    contentDurationMs,
    renderDurationMs,
    endBufferMs,
    contentFrames,
    renderedFrames,
    paddingTailFrames,
  });
}

export function buildHeadlessFlyRenderLiveSmokeFramePlanFromContentDurationMs(
  contentDurationMs: number = HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS,
): Pick<
  HeadlessFlyRenderSmokeFramePlanAuthority,
  | "contentDurationMs"
  | "contentFrames"
  | "renderedFrames"
  | "paddingTailFrames"
  | "renderDurationMs"
  | "endBufferMs"
> {
  const contentFrames = resolveHeadlessContentFrameCount({ contentDurationMs });
  // Live smoke manifest rounds content seconds → builder end buffer (400ms @ 2s).
  const renderDurationMs = contentDurationMs + 400;
  const renderedFrames = resolveHeadlessRenderedFrameCount({ renderDurationMs });
  return Object.freeze({
    contentDurationMs,
    renderDurationMs,
    endBufferMs: 400,
    contentFrames,
    renderedFrames,
    paddingTailFrames: renderedFrames - contentFrames,
  });
}
