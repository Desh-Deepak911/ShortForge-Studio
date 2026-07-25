/**
 * Sprint 11E Phase 2E.2D.8K — bounded 4K hosted capacity workloads.
 * Short functional smoke does not infer full operational-duration capacity.
 */

import type { HeadlessRendererProfile } from "@/features/headless-renderer/domain";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";

import {
  buildCapacity4kOperationalDurationFramePlan,
  buildCapacity4kShortFunctionalFramePlan,
  CAPACITY_4K_SHORT_FUNCTIONAL_CONTENT_MS,
  type Capacity4kCertificationLevel,
  type Capacity4kFramePlanAuthority,
} from "./capacity-4k-frame-plan-authority";
import {
  CAPACITY_4K_NATIVE_TARGET,
  type Capacity4kProfileId,
} from "./capacity-4k-profile-audit";

/** Short functional poll timeout — bounded smoke only, not operational capacity. */
export const CAPACITY_4K_SHORT_FUNCTIONAL_POLL_TIMEOUT_MS = 300_000 as const;

/** Operational-duration poll timeout — frozen production maximum only. */
export const CAPACITY_4K_OPERATIONAL_POLL_TIMEOUT_MS = 900_000 as const;

export type Capacity4kWorkloadBoundary = {
  readonly profileId: Capacity4kProfileId;
  readonly certificationLevel: Capacity4kCertificationLevel;
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
  readonly pollTimeoutMs: number;
  readonly claimsShortFunctional4kSupport: boolean;
  readonly claimsOperationalDuration4kCapacity: boolean;
  readonly infersFullOperationalCapacityFromShortSmoke: false;
  readonly nativeTargetWidth: typeof CAPACITY_4K_NATIVE_TARGET.width;
  readonly nativeTargetHeight: typeof CAPACITY_4K_NATIVE_TARGET.height;
  readonly fps: 30;
  readonly frozen1080pSnapshotRequired: true;
  readonly rendererBuildId: string;
  readonly rendererProfile: HeadlessRendererProfile;
  readonly framePlan: Capacity4kFramePlanAuthority;
};

export function buildCapacity4kShortFunctionalBoundary(
  profileId: Capacity4kProfileId,
): Capacity4kWorkloadBoundary {
  const profile = HEADLESS_OUTPUT_PROFILES[profileId];
  if (profile.resolution !== "4k") {
    throw new Error("4K capacity boundary requires a 4K profile.");
  }
  const framePlan = buildCapacity4kShortFunctionalFramePlan(profileId);
  return Object.freeze({
    profileId,
    certificationLevel: "short_functional",
    contentDurationMs: framePlan.contentDurationMs,
    renderDurationMs: framePlan.renderDurationMs,
    pollTimeoutMs: CAPACITY_4K_SHORT_FUNCTIONAL_POLL_TIMEOUT_MS,
    claimsShortFunctional4kSupport: true,
    claimsOperationalDuration4kCapacity: false,
    infersFullOperationalCapacityFromShortSmoke: false,
    nativeTargetWidth: CAPACITY_4K_NATIVE_TARGET.width,
    nativeTargetHeight: CAPACITY_4K_NATIVE_TARGET.height,
    fps: 30,
    frozen1080pSnapshotRequired: true,
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    rendererProfile: Object.freeze({
      resolution: profile.resolution,
      format: profile.format,
      fps: profile.fps,
      quality: "standard" as const,
    }),
    framePlan,
  });
}

export function buildCapacity4kOperationalDurationBoundary(
  profileId: Capacity4kProfileId,
): Capacity4kWorkloadBoundary {
  const profile = HEADLESS_OUTPUT_PROFILES[profileId];
  if (profile.resolution !== "4k") {
    throw new Error("4K operational boundary requires a 4K profile.");
  }
  const framePlan = buildCapacity4kOperationalDurationFramePlan(profileId);
  return Object.freeze({
    profileId,
    certificationLevel: "operational_duration",
    contentDurationMs: framePlan.contentDurationMs,
    renderDurationMs: framePlan.renderDurationMs,
    pollTimeoutMs: CAPACITY_4K_OPERATIONAL_POLL_TIMEOUT_MS,
    claimsShortFunctional4kSupport: false,
    claimsOperationalDuration4kCapacity: true,
    infersFullOperationalCapacityFromShortSmoke: false,
    nativeTargetWidth: CAPACITY_4K_NATIVE_TARGET.width,
    nativeTargetHeight: CAPACITY_4K_NATIVE_TARGET.height,
    fps: 30,
    frozen1080pSnapshotRequired: true,
    rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
    rendererProfile: Object.freeze({
      resolution: profile.resolution,
      format: profile.format,
      fps: profile.fps,
      quality: "standard" as const,
    }),
    framePlan,
  });
}

export function buildCapacity4kShortFunctionalMatrixBoundaries(): readonly Capacity4kWorkloadBoundary[] {
  return Object.freeze([
    buildCapacity4kShortFunctionalBoundary("4k-webm-30"),
    buildCapacity4kShortFunctionalBoundary("4k-mp4-30"),
  ]);
}

export function buildCapacity4kOperationalDurationMatrixBoundaries(): readonly Capacity4kWorkloadBoundary[] {
  return Object.freeze([
    buildCapacity4kOperationalDurationBoundary("4k-webm-30"),
    buildCapacity4kOperationalDurationBoundary("4k-mp4-30"),
  ]);
}

export function assertCapacity4kShortSmokeDoesNotInferOperationalCapacity(
  boundary: Capacity4kWorkloadBoundary,
): { readonly ok: true } | { readonly ok: false; readonly failClass: string } {
  if (boundary.infersFullOperationalCapacityFromShortSmoke !== false) {
    return { ok: false, failClass: "short_smoke_infers_operational_capacity" };
  }
  if (
    boundary.certificationLevel === "short_functional" &&
    boundary.contentDurationMs !== CAPACITY_4K_SHORT_FUNCTIONAL_CONTENT_MS
  ) {
    return { ok: false, failClass: "short_content_duration_mismatch" };
  }
  if (
    boundary.certificationLevel === "short_functional" &&
    boundary.claimsOperationalDuration4kCapacity
  ) {
    return { ok: false, failClass: "short_smoke_claims_operational_capacity" };
  }
  return { ok: true };
}
