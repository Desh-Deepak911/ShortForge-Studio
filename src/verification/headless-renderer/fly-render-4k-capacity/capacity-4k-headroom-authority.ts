/**
 * Sprint 11E Phase 2E.2D.8K — frozen 4K hosted capacity headroom rule.
 *
 * Derived from:
 * - Fly staging render VM: performance / 4 CPU / 8192 MiB
 * - Canonical 4K profile workspace + artifact ceilings
 * - OOM safety margin (never claim at VM hard limit)
 */

import { HEADLESS_FLY_STAGING_RENDER_VM } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-topology";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";

import type { Capacity4kProfileId } from "./capacity-4k-profile-audit";

/** Fly render Machine memory limit — authoritative VM ceiling. */
export const CAPACITY_4K_RENDER_VM_MEMORY_MB =
  HEADLESS_FLY_STAGING_RENDER_VM.memoryMb;

/** Process-tree peak RSS must stay below this fraction of VM RAM. */
export const CAPACITY_4K_OOM_SAFETY_RATIO = 0.85 as const;

export const CAPACITY_4K_VM_PEAK_RSS_CEILING_BYTES = Math.floor(
  CAPACITY_4K_RENDER_VM_MEMORY_MB * 1024 * 1024 * CAPACITY_4K_OOM_SAFETY_RATIO,
);

export type Capacity4kHeadroomVerdict =
  | "capacity_claim_justified"
  | "insufficient_headroom"
  | "oom_or_restart_observed"
  | "measurement_incomplete";

export type Capacity4kHeadroomEvaluation = {
  readonly verdict: Capacity4kHeadroomVerdict;
  readonly peakProcessTreeRssBytes: number | null;
  readonly vmPeakRssCeilingBytes: number;
  readonly profileWorkspaceBytes: number;
  readonly profileArtifactBytes: number;
  readonly headroomBytes: number | null;
  readonly fullCapacityClaimJustified: boolean;
};

export function evaluateCapacity4kProcessTreeHeadroom(input: {
  readonly profileId: Capacity4kProfileId;
  readonly peakProcessTreeRssBytes: number | null;
  readonly oomOrRestartObserved: boolean;
  readonly samplingComplete: boolean;
}): Capacity4kHeadroomEvaluation {
  const profile = HEADLESS_OUTPUT_PROFILES[input.profileId];
  const vmCeiling = CAPACITY_4K_VM_PEAK_RSS_CEILING_BYTES;
  const profileWorkspaceBytes = profile.maxWorkspaceBytes;
  const profileArtifactBytes = profile.maxArtifactBytes;

  if (input.oomOrRestartObserved) {
    return Object.freeze({
      verdict: "oom_or_restart_observed",
      peakProcessTreeRssBytes: input.peakProcessTreeRssBytes,
      vmPeakRssCeilingBytes: vmCeiling,
      profileWorkspaceBytes,
      profileArtifactBytes,
      headroomBytes: null,
      fullCapacityClaimJustified: false,
    });
  }

  if (!input.samplingComplete || input.peakProcessTreeRssBytes == null) {
    return Object.freeze({
      verdict: "measurement_incomplete",
      peakProcessTreeRssBytes: input.peakProcessTreeRssBytes,
      vmPeakRssCeilingBytes: vmCeiling,
      profileWorkspaceBytes,
      profileArtifactBytes,
      headroomBytes: null,
      fullCapacityClaimJustified: false,
    });
  }

  const peak = input.peakProcessTreeRssBytes;
  const headroomBytes = vmCeiling - peak;
  const withinVm = peak <= vmCeiling;

  if (!withinVm || headroomBytes < 0) {
    return Object.freeze({
      verdict: "insufficient_headroom",
      peakProcessTreeRssBytes: peak,
      vmPeakRssCeilingBytes: vmCeiling,
      profileWorkspaceBytes,
      profileArtifactBytes,
      headroomBytes,
      fullCapacityClaimJustified: false,
    });
  }

  return Object.freeze({
    verdict: "capacity_claim_justified",
    peakProcessTreeRssBytes: peak,
    vmPeakRssCeilingBytes: vmCeiling,
    profileWorkspaceBytes,
    profileArtifactBytes,
    headroomBytes,
    fullCapacityClaimJustified: true,
  });
}
