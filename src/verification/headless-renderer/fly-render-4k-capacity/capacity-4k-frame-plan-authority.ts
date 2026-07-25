/**
 * Sprint 11E Phase 2E.2D.8K — 4K certification frame plans (short + operational).
 */

import { HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS } from "@/features/headless-renderer/worker/runtime/output-profiles";
import {
  resolveHeadlessContentFrameCount,
  resolveHeadlessRenderedFrameCount,
} from "../fly-render-live/smoke-frame-plan-authority";
import {
  CAPACITY_4K_OPERATIONAL_CONTENT_MS,
  CAPACITY_4K_OPERATIONAL_MAX_FRAMES,
  CAPACITY_4K_OPERATIONAL_RENDER_MS,
  type Capacity4kProfileId,
} from "./capacity-4k-profile-audit";

export const CAPACITY_4K_SHORT_FUNCTIONAL_CONTENT_MS = 2_000 as const;
export const CAPACITY_4K_SHORT_FUNCTIONAL_RENDER_MS = 2_400 as const;
export const CAPACITY_4K_SHORT_FUNCTIONAL_CONTENT_FRAMES = 60 as const;
export const CAPACITY_4K_SHORT_FUNCTIONAL_RENDERED_FRAMES = 72 as const;
export const CAPACITY_4K_SHORT_FUNCTIONAL_PADDING_TAIL_FRAMES = 12 as const;

export type Capacity4kCertificationLevel =
  | "short_functional"
  | "operational_duration";

export type Capacity4kFramePlanAuthority = {
  readonly certificationLevel: Capacity4kCertificationLevel;
  readonly profileId: Capacity4kProfileId;
  readonly fps: 30;
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
  readonly endBufferMs: number;
  readonly contentFrames: number;
  readonly renderedFrames: number;
  readonly paddingTailFrames: number;
  readonly infersFullOperationalCapacity: boolean;
};

export function buildCapacity4kShortFunctionalFramePlan(
  profileId: Capacity4kProfileId,
): Capacity4kFramePlanAuthority {
  const contentDurationMs = CAPACITY_4K_SHORT_FUNCTIONAL_CONTENT_MS;
  const renderDurationMs = CAPACITY_4K_SHORT_FUNCTIONAL_RENDER_MS;
  const contentFrames = resolveHeadlessContentFrameCount({ contentDurationMs });
  const renderedFrames = resolveHeadlessRenderedFrameCount({ renderDurationMs });
  if (
    contentFrames !== CAPACITY_4K_SHORT_FUNCTIONAL_CONTENT_FRAMES ||
    renderedFrames !== CAPACITY_4K_SHORT_FUNCTIONAL_RENDERED_FRAMES
  ) {
    throw new Error("Short functional 4K frame plan drift.");
  }
  return Object.freeze({
    certificationLevel: "short_functional",
    profileId,
    fps: 30,
    contentDurationMs,
    renderDurationMs,
    endBufferMs: HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
    contentFrames,
    renderedFrames,
    paddingTailFrames: renderedFrames - contentFrames,
    infersFullOperationalCapacity: false,
  });
}

export function buildCapacity4kOperationalDurationFramePlan(
  profileId: Capacity4kProfileId,
): Capacity4kFramePlanAuthority {
  const contentDurationMs = CAPACITY_4K_OPERATIONAL_CONTENT_MS;
  const renderDurationMs = CAPACITY_4K_OPERATIONAL_RENDER_MS;
  const contentFrames = resolveHeadlessContentFrameCount({ contentDurationMs });
  const renderedFrames = resolveHeadlessRenderedFrameCount({ renderDurationMs });
  if (renderedFrames !== CAPACITY_4K_OPERATIONAL_MAX_FRAMES) {
    throw new Error("Operational 4K frame plan drift.");
  }
  return Object.freeze({
    certificationLevel: "operational_duration",
    profileId,
    fps: 30,
    contentDurationMs,
    renderDurationMs,
    endBufferMs: HEADLESS_ACCEPTED_EXPORT_END_BUFFER_MS,
    contentFrames,
    renderedFrames,
    paddingTailFrames: renderedFrames - contentFrames,
    infersFullOperationalCapacity: true,
  });
}
