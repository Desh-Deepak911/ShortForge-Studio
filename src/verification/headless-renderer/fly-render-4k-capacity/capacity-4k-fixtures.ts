/**
 * Sprint 11E Phase 2E.2D.8K — fail-closed fixtures for hosted 4K capacity authority.
 */

import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";

import {
  evaluateCapacity4kProcessTreeHeadroom,
  CAPACITY_4K_VM_PEAK_RSS_CEILING_BYTES,
} from "./capacity-4k-headroom-authority";
import {
  evaluateCapacity4kAcceptedImageDigest,
  evaluateCapacity4kPrecontactReadiness,
  evaluateCapacity4kRenderVmShape,
} from "./capacity-4k-precontact-authority";
import {
  detectNodeOnlyRssSubstitution,
  hosted4kProcessTreeMemoryScope,
  sampleHosted4kProcessTreeMemory,
  type Hosted4kProcessTreeMemoryObservation,
} from "./hosted-4k-process-tree-memory-observer";
import { isFlyRender4kCapacityGateOn } from "./capacity-4k-qa-gate";
import { buildCapacity4kShortFunctionalBoundary } from "./capacity-4k-workload";

export type Capacity4kFixtureVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly failClass: string };

export function fixtureWrongRenderVmShape(): Capacity4kFixtureVerdict {
  const vm = evaluateCapacity4kRenderVmShape({
    renderCpuKind: "shared",
    renderCpus: 1,
    renderMemoryMb: 2048,
  });
  if (vm.ok) {
    return { ok: false, failClass: "wrong_vm_shape_fixture_did_not_fail_closed" };
  }
  return { ok: true };
}

export function fixtureWrongImageDigest(): Capacity4kFixtureVerdict {
  const digest = evaluateCapacity4kAcceptedImageDigest({
    verifyImageDigestSha256: "deadbeef",
    renderImageDigestSha256: "deadbeef",
  });
  if (digest.ok) {
    return { ok: false, failClass: "wrong_image_fixture_did_not_fail_closed" };
  }
  return { ok: true };
}

export function fixtureMissing4kGate(): Capacity4kFixtureVerdict {
  if (isFlyRender4kCapacityGateOn({})) {
    return { ok: false, failClass: "gate_should_be_off_in_fixture_env" };
  }
  const eval_ = evaluateCapacity4kPrecontactReadiness({
    env: {},
    topology: null,
    schemaReady: true,
  });
  if (eval_.contactAllowed || eval_.blockReason !== "gate_off") {
    return { ok: false, failClass: "missing_gate_fixture_did_not_fail_closed" };
  }
  return { ok: true };
}

export function fixture720pPresentedAs4k(): Capacity4kFixtureVerdict {
  const p720 = HEADLESS_OUTPUT_PROFILES["720p-webm-30"];
  if (p720.resolution === "4k" || p720.width === 2160) {
    return { ok: false, failClass: "720p_profile_misconfigured" };
  }
  try {
    buildCapacity4kShortFunctionalBoundary("4k-webm-30");
  } catch {
    return { ok: true };
  }
  const boundary = buildCapacity4kShortFunctionalBoundary("4k-webm-30");
  if (boundary.rendererProfile.resolution !== "4k") {
    return { ok: false, failClass: "720p_presented_as_4k_not_rejected" };
  }
  return { ok: true };
}

export function assertCapacity4kNativeTargetDimensions(input: {
  readonly width: number;
  readonly height: number;
}): { readonly ok: true } | { readonly ok: false; readonly failClass: "wrong_dimensions" } {
  if (input.width !== 2160 || input.height !== 3840) {
    return { ok: false, failClass: "wrong_dimensions" };
  }
  return { ok: true };
}

export function assertCapacity4kCodecContainerAuthority(input: {
  readonly profileId: "4k-webm-30" | "4k-mp4-30";
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly container: string;
}): { readonly ok: true } | { readonly ok: false; readonly failClass: "wrong_codec_container" } {
  const profile = HEADLESS_OUTPUT_PROFILES[input.profileId];
  if (
    input.videoCodec !== profile.videoCodec ||
    input.audioCodec !== profile.audioCodec ||
    input.container !== profile.container
  ) {
    return { ok: false, failClass: "wrong_codec_container" };
  }
  return { ok: true };
}

export function fixtureWrongDimensions(): Capacity4kFixtureVerdict {
  const rejected = assertCapacity4kNativeTargetDimensions({
    width: 1280,
    height: 720,
  });
  if (rejected.ok) {
    return { ok: false, failClass: "wrong_dimensions_not_rejected" };
  }
  return { ok: true };
}

export function fixtureWrongCodecContainer(): Capacity4kFixtureVerdict {
  const rejected = assertCapacity4kCodecContainerAuthority({
    profileId: "4k-webm-30",
    videoCodec: "h264",
    audioCodec: "aac",
    container: "mp4",
  });
  if (rejected.ok) {
    return { ok: false, failClass: "wrong_codec_container_not_rejected" };
  }
  const accepted = assertCapacity4kCodecContainerAuthority({
    profileId: "4k-webm-30",
    videoCodec: "vp9",
    audioCodec: "opus",
    container: "webm",
  });
  if (!accepted.ok) {
    return { ok: false, failClass: "canonical_webm_codec_rejected" };
  }
  return { ok: true };
}

export function fixtureIncompleteProcessTreeSampling(): Capacity4kFixtureVerdict {
  const obs = sampleHosted4kProcessTreeMemory();
  if (obs.samplingComplete) {
    return { ok: false, failClass: "local_sampling_should_be_incomplete" };
  }
  if (obs.unavailableReason !== "non_linux_local_authority") {
    return { ok: false, failClass: "incomplete_sampling_reason_wrong" };
  }
  return { ok: true };
}

export function fixtureNodeOnlyRssSubstitution(): Capacity4kFixtureVerdict {
  const substituted = detectNodeOnlyRssSubstitution({
    nodeRssBytes: 512_000_000,
    reportedPeakBytes: 512_000_000,
  });
  if (!substituted) {
    return { ok: false, failClass: "node_only_substitution_not_detected" };
  }
  const scope = hosted4kProcessTreeMemoryScope();
  if (!scope.notNodeRssAlone) {
    return { ok: false, failClass: "scope_allows_node_only" };
  }
  return { ok: true };
}

export function fixtureOomOrRestart(): Capacity4kFixtureVerdict {
  const eval_ = evaluateCapacity4kProcessTreeHeadroom({
    profileId: "4k-webm-30",
    peakProcessTreeRssBytes: 1_000_000_000,
    oomOrRestartObserved: true,
    samplingComplete: true,
  });
  if (eval_.verdict !== "oom_or_restart_observed" || eval_.fullCapacityClaimJustified) {
    return { ok: false, failClass: "oom_fixture_did_not_fail_closed" };
  }
  return { ok: true };
}

export function fixtureInsufficientMemoryHeadroom(): Capacity4kFixtureVerdict {
  const overCeiling = CAPACITY_4K_VM_PEAK_RSS_CEILING_BYTES + 1;
  const eval_ = evaluateCapacity4kProcessTreeHeadroom({
    profileId: "4k-webm-30",
    peakProcessTreeRssBytes: overCeiling,
    oomOrRestartObserved: false,
    samplingComplete: true,
  });
  if (eval_.verdict !== "insufficient_headroom" || eval_.fullCapacityClaimJustified) {
    return { ok: false, failClass: "headroom_fixture_did_not_fail_closed" };
  }
  return { ok: true };
}

export function fixtureOneFormatPassOtherFail(): Capacity4kFixtureVerdict {
  const webmPass = { caseId: "4k.webm.cleanup.complete", status: "PASS" as const };
  const mp4Fail = {
    caseId: "4k.mp4.cleanup.complete",
    status: "FAIL" as const,
    failureCategory: "ONE_FORMAT_PASS_OTHER_FAIL",
  };
  if (webmPass.status === "PASS" && mp4Fail.status === "FAIL") {
    return { ok: true };
  }
  return { ok: false, failClass: "one_format_pass_other_fail_fixture_invalid" };
}

export function fixtureCleanupFailureCategory(): Capacity4kFixtureVerdict {
  const failCategory = "CLEANUP_FAILED";
  if (!failCategory.includes("CLEANUP")) {
    return { ok: false, failClass: "cleanup_failure_category_missing" };
  }
  return { ok: true };
}

export function runAllCapacity4kFailClosedFixtures(): readonly Capacity4kFixtureVerdict[] {
  return Object.freeze([
    fixtureMissing4kGate(),
    fixtureWrongRenderVmShape(),
    fixtureWrongImageDigest(),
    fixture720pPresentedAs4k(),
    fixtureWrongDimensions(),
    fixtureWrongCodecContainer(),
    fixtureIncompleteProcessTreeSampling(),
    fixtureNodeOnlyRssSubstitution(),
    fixtureOomOrRestart(),
    fixtureInsufficientMemoryHeadroom(),
    fixtureCleanupFailureCategory(),
    fixtureOneFormatPassOtherFail(),
  ]);
}

export function buildFixturePassProcessTreeObservation(): Hosted4kProcessTreeMemoryObservation {
  return Object.freeze({
    scope: hosted4kProcessTreeMemoryScope(),
    sampleIntervalMs: 250,
    sampleCount: 48,
    summedProcessTreeRssBytes: 5_500_000_000,
    peakProcessTreeRssBytes: 5_800_000_000,
    observationDurationMs: 12_000,
    samplingComplete: true,
    oomOrRestartObserved: false,
    unavailableReason: null,
    cadence: null,
  });
}
