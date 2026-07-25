/**
 * Monotonic staging-reference + coverage rules for provisional records.
 * Enforced by lifecycle helpers and by the job store on every provisional CAS.
 */

import type {
  HeadlessProvisionalSnapshotClaimV1,
  HeadlessProvisionalStagingObjectRefV1,
  HeadlessProvisionalVerificationCoverageV1,
} from "../types/stored-job-record";
import {
  coverageCompleteFromSets,
  deriveRequiredVerificationTargets,
  stagingRefVerificationTarget,
  stagingTargetsPresent,
} from "./provisional-verification-targets";

export type StagingMonotonicityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

function refsEqual(
  a: HeadlessProvisionalStagingObjectRefV1,
  b: HeadlessProvisionalStagingObjectRefV1,
): boolean {
  return (
    a.purpose === b.purpose &&
    a.slotKey === b.slotKey &&
    a.locator.kind === b.locator.kind &&
    a.locator.storeId === b.locator.storeId &&
    a.locator.objectKey === b.locator.objectKey &&
    a.contentDigestClaim === b.contentDigestClaim &&
    a.byteLengthClaim === b.byteLengthClaim &&
    a.mimeTypeClaim === b.mimeTypeClaim
  );
}

function snapshotAllowsRef(
  snapshot: HeadlessProvisionalSnapshotClaimV1,
  ref: HeadlessProvisionalStagingObjectRefV1,
): StagingMonotonicityResult {
  if (ref.purpose === "manifest") {
    if (ref.slotKey !== null) {
      return {
        ok: false,
        message: "Manifest staging reference must use null slot identity.",
      };
    }
    if (ref.contentDigestClaim !== snapshot.manifestPayloadDigestClaim) {
      return {
        ok: false,
        message:
          "Manifest staging digest claim must equal frozen manifest payload digest claim.",
      };
    }
    return { ok: true };
  }
  if (ref.purpose === "asset_bundle_record") {
    if (ref.slotKey !== null) {
      return {
        ok: false,
        message:
          "Asset-bundle staging reference must use null slot identity.",
      };
    }
    // Bundle record digest is an opaque staging claim; fingerprint authority
    // lives on the snapshot. Purpose/slot already constrained by validators.
    return { ok: true };
  }
  if (ref.purpose === "asset_bytes" && ref.slotKey != null) {
    const slot = snapshot.expectedSlotClaims.find(
      (s) => s.slotKey === ref.slotKey,
    );
    if (!slot) {
      return { ok: false, message: "Unknown asset slot in staging reference." };
    }
    if (
      ref.contentDigestClaim !== slot.contentDigestClaim ||
      ref.byteLengthClaim !== slot.byteLengthClaim ||
      ref.mimeTypeClaim !== slot.mimeTypeClaim
    ) {
      return {
        ok: false,
        message:
          "Asset-slot staging digest/length/MIME must equal frozen slot claim.",
      };
    }
    return { ok: true };
  }
  return { ok: false, message: "Invalid staging reference purpose/slot." };
}

/**
 * Shared create + CAS authority: every staging reference must bind to the
 * frozen snapshot. Empty / partial sets are allowed while materializing.
 */
export function assertStagingRefsBoundToSnapshot(input: {
  readonly snapshot: HeadlessProvisionalSnapshotClaimV1;
  readonly stagingObjectRefs: readonly HeadlessProvisionalStagingObjectRefV1[];
}): StagingMonotonicityResult {
  const required = new Set(deriveRequiredVerificationTargets(input.snapshot));
  const seenTargets = new Set<string>();

  for (const ref of input.stagingObjectRefs) {
    const target = stagingRefVerificationTarget(ref);
    if (target == null) {
      return { ok: false, message: "Staging reference has invalid target." };
    }
    if (!required.has(target)) {
      return {
        ok: false,
        message: "Staging reference target is not a required verification target.",
      };
    }
    if (seenTargets.has(target)) {
      return { ok: false, message: "Duplicate staging target binding." };
    }
    seenTargets.add(target);

    const claimOk = snapshotAllowsRef(input.snapshot, ref);
    if (!claimOk.ok) return claimOk;
  }

  return { ok: true };
}

/**
 * After create: existing refs immutable; new refs only for unbound required targets.
 */
export function assertProvisionalStagingRefsMonotonic(input: {
  readonly current: readonly HeadlessProvisionalStagingObjectRefV1[];
  readonly next: readonly HeadlessProvisionalStagingObjectRefV1[];
  readonly snapshot: HeadlessProvisionalSnapshotClaimV1;
}): StagingMonotonicityResult {
  const required = new Set(deriveRequiredVerificationTargets(input.snapshot));
  const currentByTarget = new Map<string, HeadlessProvisionalStagingObjectRefV1>();

  for (const ref of input.current) {
    const target = stagingRefVerificationTarget(ref);
    if (target == null) {
      return { ok: false, message: "Current staging ref has invalid target." };
    }
    currentByTarget.set(target, ref);
  }

  const bound = assertStagingRefsBoundToSnapshot({
    snapshot: input.snapshot,
    stagingObjectRefs: input.next,
  });
  if (!bound.ok) return bound;

  const nextByTarget = new Map<string, HeadlessProvisionalStagingObjectRefV1>();
  for (const ref of input.next) {
    const target = stagingRefVerificationTarget(ref);
    if (target == null) {
      return { ok: false, message: "Next staging ref has invalid target." };
    }
    nextByTarget.set(target, ref);
  }

  // Existing refs cannot be removed or changed.
  for (const [target, currentRef] of currentByTarget) {
    const nextRef = nextByTarget.get(target);
    if (nextRef == null) {
      return {
        ok: false,
        message: "Existing staging references cannot be removed.",
      };
    }
    if (!refsEqual(currentRef, nextRef)) {
      return {
        ok: false,
        message:
          "Existing staging reference locator/digest/length/MIME/purpose/slot cannot change.",
      };
    }
  }

  // Appends only for previously unbound required targets.
  for (const [target] of nextByTarget) {
    if (!currentByTarget.has(target) && !required.has(target)) {
      return { ok: false, message: "Unknown staging target append rejected." };
    }
  }

  if (input.next.length < input.current.length) {
    return {
      ok: false,
      message: "Staging references cannot shrink.",
    };
  }

  return { ok: true };
}

export function assertCoverageMonotonicAndBound(input: {
  readonly current: HeadlessProvisionalVerificationCoverageV1;
  readonly next: HeadlessProvisionalVerificationCoverageV1;
  readonly snapshot: HeadlessProvisionalSnapshotClaimV1;
  readonly stagingObjectRefs: readonly HeadlessProvisionalStagingObjectRefV1[];
}): StagingMonotonicityResult {
  const derivedRequired = deriveRequiredVerificationTargets(input.snapshot);
  if (
    input.next.requiredTargets.length !== derivedRequired.length ||
    input.next.requiredTargets.some((t, i) => t !== derivedRequired[i]) ||
    input.current.requiredTargets.length !== derivedRequired.length ||
    input.current.requiredTargets.some((t, i) => t !== derivedRequired[i])
  ) {
    return {
      ok: false,
      message: "requiredTargets must equal derived snapshot verification targets.",
    };
  }

  const stagingPresent = stagingTargetsPresent(input.stagingObjectRefs);
  for (const target of input.next.verifiedTargets) {
    if (!stagingPresent.has(target)) {
      return {
        ok: false,
        message:
          "Coverage cannot mark a target verified before its staging reference exists.",
      };
    }
  }

  const currentVerified = new Set(input.current.verifiedTargets);
  for (const target of input.current.verifiedTargets) {
    if (!input.next.verifiedTargets.includes(target)) {
      return { ok: false, message: "verifiedTargets cannot regress." };
    }
  }
  if (input.next.verifiedTargets.length < currentVerified.size) {
    return { ok: false, message: "verifiedTargets cannot regress." };
  }

  if (input.current.complete && !input.next.complete) {
    return { ok: false, message: "Verification complete cannot regress." };
  }

  const expectedComplete = coverageCompleteFromSets(
    input.next.requiredTargets,
    input.next.verifiedTargets,
  );
  if (input.next.complete !== expectedComplete) {
    return {
      ok: false,
      message: "complete must equal exact required/verified set equality.",
    };
  }

  return { ok: true };
}

/** Full provisional CAS write coherence beyond identity fields. */
export function assertProvisionalCasWriteRules(input: {
  readonly current: {
    readonly snapshotClaim: HeadlessProvisionalSnapshotClaimV1;
    readonly stagingObjectRefs: readonly HeadlessProvisionalStagingObjectRefV1[];
    readonly verificationCoverage: HeadlessProvisionalVerificationCoverageV1;
  };
  readonly next: {
    readonly snapshotClaim: HeadlessProvisionalSnapshotClaimV1;
    readonly stagingObjectRefs: readonly HeadlessProvisionalStagingObjectRefV1[];
    readonly verificationCoverage: HeadlessProvisionalVerificationCoverageV1;
  };
}): StagingMonotonicityResult {
  if (
    input.next.snapshotClaim.manifestPayloadDigestClaim !==
      input.current.snapshotClaim.manifestPayloadDigestClaim ||
    input.next.snapshotClaim.assetBundleFingerprintClaim !==
      input.current.snapshotClaim.assetBundleFingerprintClaim ||
    input.next.snapshotClaim.expectedSlotClaims.length !==
      input.current.snapshotClaim.expectedSlotClaims.length
  ) {
    return { ok: false, message: "Snapshot claim identity is immutable." };
  }

  const staging = assertProvisionalStagingRefsMonotonic({
    current: input.current.stagingObjectRefs,
    next: input.next.stagingObjectRefs,
    snapshot: input.current.snapshotClaim,
  });
  if (!staging.ok) return staging;

  return assertCoverageMonotonicAndBound({
    current: input.current.verificationCoverage,
    next: input.next.verificationCoverage,
    snapshot: input.current.snapshotClaim,
    stagingObjectRefs: input.next.stagingObjectRefs,
  });
}
