/**
 * Single-materialization fixture identity for Fly render job-create chain.
 * One buildLiveDraft call — no post-fingerprint mutation or second manifest build.
 */

import { createHash } from "node:crypto";

import {
  extractRequiredHeadlessSourceSlots,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import type { HeadlessProvisionalStagingObjectRefV1 } from "@/features/headless-renderer/control-plane";

import type { LiveDraftContext } from "../neon-live/live-fixtures";
import { buildFlyRenderLiveProbeAssetBytes } from "./probe-asset-bytes";

export type FlyRenderJobCreateStagingPayload = {
  readonly purpose: HeadlessProvisionalStagingObjectRefV1["purpose"];
  readonly slotKey: string | null;
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly mime: string;
  readonly byteLength: number;
};

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Derive byte payloads matching authoritative staging refs from one draft context.
 */
export function deriveFlyRenderJobCreateStagingPayloads(
  draftCtx: LiveDraftContext,
): FlyRenderJobCreateStagingPayload[] {
  const { manifest, seeded, authoritativeStagingObjectRefs } = draftCtx;
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const bundleBytes = new TextEncoder().encode(JSON.stringify(seeded.bundle));
  const slots = extractRequiredHeadlessSourceSlots(manifest);

  return authoritativeStagingObjectRefs.map((ref) => {
    let bytes: Uint8Array;
    let mime: string;
    if (ref.purpose === "manifest") {
      bytes = manifestBytes;
      mime = "application/json";
    } else if (ref.purpose === "asset_bundle_record") {
      bytes = bundleBytes;
      mime = "application/json";
    } else {
      const slot = slots.find(
        (s) => headlessSourceSlotKey(s) === ref.slotKey,
      );
      if (slot == null) {
        throw new Error("fixture_slot_not_found");
      }
      const index = slots.indexOf(slot);
      const probeAsset = buildFlyRenderLiveProbeAssetBytes({ slot, index });
      bytes = probeAsset.bytes;
      mime = probeAsset.mime;
    }
    const digest = digestBytes(bytes);
    if (digest !== ref.contentDigestClaim) {
      throw new Error("fixture_digest_mismatch");
    }
    if (bytes.byteLength !== ref.byteLengthClaim) {
      throw new Error("fixture_byte_length_mismatch");
    }
    if (mime !== ref.mimeTypeClaim) {
      throw new Error("fixture_mime_mismatch");
    }
    return {
      purpose: ref.purpose,
      slotKey: ref.slotKey,
      bytes,
      digest,
      mime,
      byteLength: bytes.byteLength,
    };
  });
}

/**
 * Assert projectId is fixed before manifest fingerprint materialization.
 */
export function assertFlyRenderJobCreateProjectIdentity(input: {
  readonly ctxProjectId: string;
  readonly draftProjectId: string;
  readonly draftOwnerId: string;
  readonly ctxOwnerId: string;
}): { readonly ok: true } | { readonly ok: false; readonly code: string } {
  if (input.ctxProjectId !== input.draftProjectId) {
    return { ok: false, code: "project_identity_mismatch" };
  }
  if (input.ctxOwnerId !== input.draftOwnerId) {
    return { ok: false, code: "owner_identity_mismatch" };
  }
  return { ok: true };
}

export function buildR2CoherentStagingRefs(input: {
  readonly authoritativeRefs: readonly HeadlessProvisionalStagingObjectRefV1[];
  readonly r2Locators: readonly {
    readonly storeId: "assets" | "artifacts";
    readonly objectKey: string;
  }[];
}): readonly HeadlessProvisionalStagingObjectRefV1[] {
  if (input.authoritativeRefs.length !== input.r2Locators.length) {
    throw new Error("fixture_locator_count_mismatch");
  }
  return Object.freeze(
    input.authoritativeRefs.map((ref, i) => ({
      purpose: ref.purpose,
      slotKey: ref.slotKey,
      locator: {
        kind: "object_storage" as const,
        storeId: input.r2Locators[i]!.storeId,
        objectKey: input.r2Locators[i]!.objectKey,
      },
      contentDigestClaim: ref.contentDigestClaim,
      byteLengthClaim: ref.byteLengthClaim,
      mimeTypeClaim: ref.mimeTypeClaim,
    })),
  );
}
