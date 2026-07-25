/**
 * Bounded smoke workload for first hosted render live matrix run.
 * Not 4K — short duration, deterministic fixture, exact timeout.
 * Does not claim hosted 4K capacity readiness.
 */

import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";

import {
  buildHeadlessFlyRenderLiveSmokeFramePlanFromContentDurationMs,
} from "./smoke-frame-plan-authority";

/** Exact poll timeout for hosted render completion — bounded smoke only. */
export const HEADLESS_FLY_RENDER_LIVE_SMOKE_TIMEOUT_MS = 180_000 as const;

/** Short deterministic content duration — not a capacity claim. */
export const HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS = 2_000 as const;

/**
 * Smoke manifest render budget includes a 400ms end buffer beyond content duration.
 * Authoritative rendered frames = ceil(renderDurationMs × fps / 1000) = 72 @ 2s smoke.
 * Content frames alone = ceil(contentDurationMs × fps / 1000) = 60.
 * See smoke-frame-plan-authority.ts and resolveExportTotalFrames.
 */

/** 720p profile — explicitly not 4K. */
export const HEADLESS_FLY_RENDER_LIVE_SMOKE_PROFILE_ID = "720p-webm-30" as const;

export type HeadlessFlyRenderLiveSmokeBoundary = {
  readonly profileId: typeof HEADLESS_FLY_RENDER_LIVE_SMOKE_PROFILE_ID;
  readonly contentDurationMs: typeof HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS;
  readonly pollTimeoutMs: typeof HEADLESS_FLY_RENDER_LIVE_SMOKE_TIMEOUT_MS;
  readonly claims4kCapacity: false;
  readonly claimsHostedCapacity: false;
  readonly rendererBuildId: string;
  readonly rendererProfile: HeadlessRendererProfile;
};

export function buildHeadlessFlyRenderLiveSmokeBoundary(): HeadlessFlyRenderLiveSmokeBoundary {
  const profile = HEADLESS_OUTPUT_PROFILES[HEADLESS_FLY_RENDER_LIVE_SMOKE_PROFILE_ID];
  if (profile.resolution === "4k") {
    throw new Error("Smoke workload must not use 4K profile.");
  }
  return Object.freeze({
    profileId: HEADLESS_FLY_RENDER_LIVE_SMOKE_PROFILE_ID,
    contentDurationMs: HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS,
    pollTimeoutMs: HEADLESS_FLY_RENDER_LIVE_SMOKE_TIMEOUT_MS,
    claims4kCapacity: false,
    claimsHostedCapacity: false,
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    rendererProfile: Object.freeze({
      resolution: profile.resolution,
      format: profile.format,
      fps: profile.fps,
      quality: "standard" as const,
    }),
  });
}

export function buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(): {
  readonly profileId: typeof HEADLESS_FLY_RENDER_LIVE_SMOKE_PROFILE_ID;
  readonly contentDurationMs: typeof HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS;
  readonly pollTimeoutMs: typeof HEADLESS_FLY_RENDER_LIVE_SMOKE_TIMEOUT_MS;
  readonly claims4kCapacity: false;
  readonly framePlan: {
    readonly fps: 30;
    readonly contentFrames: number;
    readonly renderedFrames: number;
    readonly paddingTailFrames: number;
    readonly renderDurationMs: number;
    readonly endBufferMs: number;
  };
} {
  const boundary = buildHeadlessFlyRenderLiveSmokeBoundary();
  const frame = buildHeadlessFlyRenderLiveSmokeFramePlanFromContentDurationMs(
    boundary.contentDurationMs,
  );
  return Object.freeze({
    profileId: boundary.profileId,
    contentDurationMs: boundary.contentDurationMs,
    pollTimeoutMs: boundary.pollTimeoutMs,
    claims4kCapacity: false as const,
    framePlan: Object.freeze({
      fps: 30 as const,
      contentFrames: frame.contentFrames,
      renderedFrames: frame.renderedFrames,
      paddingTailFrames: frame.paddingTailFrames,
      renderDurationMs: frame.renderDurationMs,
      endBufferMs: frame.endBufferMs,
    }),
  });
}
