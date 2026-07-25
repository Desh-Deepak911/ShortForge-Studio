/**
 * Canonical provisional verification target identities.
 * Required targets are derived from the frozen snapshot claim — never caller-chosen.
 */

import type {
  HeadlessProvisionalSnapshotClaimV1,
  HeadlessProvisionalStagingObjectRefV1,
  HeadlessProvisionalVerificationCoverageV1,
} from "../types/stored-job-record";

export const HEADLESS_VERIFICATION_TARGET_MANIFEST = "manifest" as const;
export const HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD =
  "asset_bundle_record" as const;

export function headlessAssetBytesVerificationTarget(
  slotKey: string,
): `asset_bytes:${string}` {
  return `asset_bytes:${slotKey}`;
}

/** Matches bounded slotKey rules used by snapshot/staging validators. */
function isVerificationTargetSlotKey(slotKey: string): boolean {
  return (
    slotKey.length > 0 &&
    slotKey.trim().length > 0 &&
    slotKey === slotKey.trim() &&
    slotKey.length <= 128 * 2 + 96 + "scene_media".length
  );
}

export function isHeadlessVerificationTargetId(
  value: string,
): value is
  | typeof HEADLESS_VERIFICATION_TARGET_MANIFEST
  | typeof HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD
  | `asset_bytes:${string}` {
  if (value === HEADLESS_VERIFICATION_TARGET_MANIFEST) return true;
  if (value === HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD) return true;
  if (!value.startsWith("asset_bytes:")) return false;
  const slotKey = value.slice("asset_bytes:".length);
  return isVerificationTargetSlotKey(slotKey);
}

/** Deterministic required targets from frozen snapshot claim. */
export function deriveRequiredVerificationTargets(
  snapshot: HeadlessProvisionalSnapshotClaimV1,
): readonly string[] {
  const assetTargets = snapshot.expectedSlotClaims.map((slot) =>
    headlessAssetBytesVerificationTarget(slot.slotKey),
  );
  // Stable order: manifest, bundle, then slot targets in snapshot slot order.
  return [
    HEADLESS_VERIFICATION_TARGET_MANIFEST,
    HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
    ...assetTargets,
  ];
}

export function stagingRefVerificationTarget(
  ref: HeadlessProvisionalStagingObjectRefV1,
): string | null {
  if (ref.purpose === "manifest") {
    return HEADLESS_VERIFICATION_TARGET_MANIFEST;
  }
  if (ref.purpose === "asset_bundle_record") {
    return HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD;
  }
  if (ref.purpose === "asset_bytes" && ref.slotKey != null) {
    return headlessAssetBytesVerificationTarget(ref.slotKey);
  }
  return null;
}

export function stagingTargetsPresent(
  refs: readonly HeadlessProvisionalStagingObjectRefV1[],
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const ref of refs) {
    const target = stagingRefVerificationTarget(ref);
    if (target != null) set.add(target);
  }
  return set;
}

export function coverageCompleteFromSets(
  required: readonly string[],
  verified: readonly string[],
): boolean {
  if (required.length !== verified.length) return false;
  const verifiedSet = new Set(verified);
  if (verifiedSet.size !== verified.length) return false;
  for (const target of required) {
    if (!verifiedSet.has(target)) return false;
  }
  return true;
}

export function emptyVerificationCoverage(
  snapshot: HeadlessProvisionalSnapshotClaimV1,
): HeadlessProvisionalVerificationCoverageV1 {
  const requiredTargets = deriveRequiredVerificationTargets(snapshot);
  return {
    requiredTargets,
    verifiedTargets: [],
    complete: false,
  };
}
