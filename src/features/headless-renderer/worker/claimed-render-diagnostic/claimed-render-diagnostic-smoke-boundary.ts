/**
 * Bounded smoke boundary — mirrors execution-probe smoke-workload authority.
 */

import type { HeadlessRendererProfile } from "../../domain";
import { HEADLESS_OUTPUT_PROFILES } from "../runtime/output-profiles";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "../runtime/worker-types";

export const CLAIMED_RENDER_DIAGNOSTIC_SMOKE_CONTENT_DURATION_MS =
  2_000 as const;

export const CLAIMED_RENDER_DIAGNOSTIC_SMOKE_PROFILE_ID =
  "720p-webm-30" as const;

export type ClaimedRenderDiagnosticSmokeBoundary = {
  readonly profileId: typeof CLAIMED_RENDER_DIAGNOSTIC_SMOKE_PROFILE_ID;
  readonly contentDurationMs: typeof CLAIMED_RENDER_DIAGNOSTIC_SMOKE_CONTENT_DURATION_MS;
  readonly rendererBuildId: string;
  readonly rendererProfile: HeadlessRendererProfile;
};

export function buildClaimedRenderDiagnosticSmokeBoundary(): ClaimedRenderDiagnosticSmokeBoundary {
  const profile =
    HEADLESS_OUTPUT_PROFILES[CLAIMED_RENDER_DIAGNOSTIC_SMOKE_PROFILE_ID];
  if (profile.resolution === "4k") {
    throw new Error("Smoke workload must not use 4K profile.");
  }
  return Object.freeze({
    profileId: CLAIMED_RENDER_DIAGNOSTIC_SMOKE_PROFILE_ID,
    contentDurationMs: CLAIMED_RENDER_DIAGNOSTIC_SMOKE_CONTENT_DURATION_MS,
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    rendererProfile: Object.freeze({
      resolution: profile.resolution,
      format: profile.format,
      fps: profile.fps,
      quality: "high" as const,
    }),
  });
}
