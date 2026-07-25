/**
 * Provisional snapshot slot-claim authority — content identity without locator drift.
 * Used when finalized owned-object locators rebind canonical bundle descriptors.
 */

import {
  headlessSourceSlotKey,
  type HeadlessAssetBundleV1,
  type HeadlessAssetDescriptorV1,
} from "../../domain";
import type { HeadlessProvisionalSlotClaimV1 } from "../types/stored-job-record";

export function provisionalSnapshotSlotClaimsMatchAssetBundle(input: {
  readonly expectedSlotClaims: readonly HeadlessProvisionalSlotClaimV1[];
  readonly assets: readonly HeadlessAssetDescriptorV1[];
}): boolean {
  if (input.expectedSlotClaims.length !== input.assets.length) return false;
  const bySlot = new Map(
    input.assets.map((asset) => [
      headlessSourceSlotKey(asset.sourceIdentity),
      asset,
    ]),
  );
  for (const slot of input.expectedSlotClaims) {
    const asset = bySlot.get(slot.slotKey);
    if (asset == null) return false;
    if (asset.contentDigest !== slot.contentDigestClaim) return false;
    if (asset.byteLength !== slot.byteLengthClaim) return false;
    if (asset.mimeType !== slot.mimeTypeClaim) return false;
  }
  return true;
}

export function provisionalSnapshotSlotClaimsMatchBundle(
  expectedSlotClaims: readonly HeadlessProvisionalSlotClaimV1[],
  bundle: HeadlessAssetBundleV1,
): boolean {
  return provisionalSnapshotSlotClaimsMatchAssetBundle({
    expectedSlotClaims,
    assets: bundle.assets,
  });
}
