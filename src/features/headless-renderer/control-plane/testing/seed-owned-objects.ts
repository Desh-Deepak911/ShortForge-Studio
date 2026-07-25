/**
 * Test-only owned-object seeding utilities.
 * Must never be imported by production Route Handlers.
 */

import { createHash } from "node:crypto";

import type { ExportManifest } from "@/features/export/domain/headless-safe";

import {
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessAssetBundle,
  HEADLESS_ASSET_DESCRIPTOR_VERSION,
  type HeadlessAssetBundleV1,
  type HeadlessAssetDescriptorV1,
  type HeadlessRequiredSourceSlot,
} from "../../domain";
import type { MemoryHeadlessStorageAdapter } from "../adapters/memory-storage.adapter";
import type { HeadlessStoragePort } from "../ports/storage.port";
import {
  HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS,
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function seedOwnedJsonObject(input: {
  storage: HeadlessStoragePort;
  ownerId: string;
  projectId: string;
  purpose: "manifest" | "asset_bundle_record" | "asset_bytes";
  json?: unknown;
  bytes?: Uint8Array;
  mimeType: string;
  expiresAtMs: number;
}): Promise<
  HeadlessControlPlaneResult<{
    locator: HeadlessAssetDescriptorV1["storageLocator"];
    contentDigest: string;
    byteLength: number;
    mimeType: string;
    expiresAtMs: number;
  }>
> {
  const bytes =
    input.bytes ??
    new TextEncoder().encode(JSON.stringify(input.json ?? null));
  const digest = digestBytes(bytes);
  const session = await input.storage.createUploadSession({
    ownerId: input.ownerId,
    projectId: input.projectId,
    purpose: input.purpose,
    mimeType: input.mimeType,
    expiresAtMs: input.expiresAtMs,
  });
  if (!session.ok) return session;
  const written = await input.storage.writeUploadBytes({
    capabilityToken: session.value.capabilityToken,
    bytes,
  });
  if (!written.ok) return written;
  const finalized = await input.storage.finalizeUploadedObject({
    capabilityToken: session.value.capabilityToken,
    expectedContentDigest: digest,
  });
  if (!finalized.ok) return finalized;
  return cpOk({
    locator: finalized.value.locator,
    contentDigest: finalized.value.contentDigest,
    byteLength: finalized.value.byteLength,
    mimeType: finalized.value.mimeType,
    expiresAtMs: finalized.value.expiresAtMs,
  });
}

/**
 * Upload real bytes for every required source slot and build a bundle from
 * finalized owned-object metadata (not invented store-1/obj-N locators).
 */
export async function seedOwnedManifestAndBundle(input: {
  storage: HeadlessStoragePort;
  ownerId: string;
  projectId: string;
  manifest: ExportManifest;
  nowMs: number;
  /** Lease beyond nowMs; defaults to 2× minimum lease. */
  leaseMs?: number;
  assetByteFactory?: (slot: HeadlessRequiredSourceSlot, index: number) => Uint8Array;
  mimeForSlot?: (slot: HeadlessRequiredSourceSlot) => string;
}): Promise<
  HeadlessControlPlaneResult<{
    manifestLocator: HeadlessAssetDescriptorV1["storageLocator"];
    manifestPayloadDigest: string;
    bundle: HeadlessAssetBundleV1;
    bundleLocator: HeadlessAssetDescriptorV1["storageLocator"];
    assetLocators: readonly HeadlessAssetDescriptorV1["storageLocator"][];
  }>
> {
  const leaseMs = input.leaseMs ?? HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2;
  const expiresAtMs = input.nowMs + leaseMs;

  const manifestSeed = await seedOwnedJsonObject({
    storage: input.storage,
    ownerId: input.ownerId,
    projectId: input.projectId,
    purpose: "manifest",
    json: input.manifest,
    mimeType: "application/json",
    expiresAtMs,
  });
  if (!manifestSeed.ok) return manifestSeed;

  const slots = extractRequiredHeadlessSourceSlots(input.manifest);
  const assets: HeadlessAssetDescriptorV1[] = [];
  const assetLocators: HeadlessAssetDescriptorV1["storageLocator"][] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const bytes =
      input.assetByteFactory?.(slot, i) ??
      new TextEncoder().encode(`asset-bytes-${i}-${slot.sourceDigest}`);
    const mimeType =
      input.mimeForSlot?.(slot) ??
      (slot.expectedMediaKind === "audio"
        ? "audio/mpeg"
        : slot.expectedMediaKind === "video"
          ? "video/mp4"
          : "image/jpeg");
    const seeded = await seedOwnedJsonObject({
      storage: input.storage,
      ownerId: input.ownerId,
      projectId: input.projectId,
      purpose: "asset_bytes",
      bytes,
      mimeType,
      expiresAtMs,
    });
    if (!seeded.ok) return seeded;
    assetLocators.push(seeded.value.locator);
    assets.push({
      version: HEADLESS_ASSET_DESCRIPTOR_VERSION,
      assetId: `asset-${i}`,
      sourceIdentity: {
        role: slot.role,
        sceneId: slot.sceneId,
        mediaItemId: slot.mediaItemId,
        sourceDigest: slot.sourceDigest,
        classification: slot.classification,
      },
      contentDigest: seeded.value.contentDigest,
      byteLength: seeded.value.byteLength,
      mimeType: seeded.value.mimeType,
      mediaKind: slot.expectedMediaKind,
      storageLocator: seeded.value.locator,
      expiresAtMs: seeded.value.expiresAtMs,
    });
  }

  const bundleResult = finalizeHeadlessAssetBundle({
    bundleId: "bundle-1",
    assets,
    manifest: input.manifest,
  });
  if (!bundleResult.ok) {
    return cpFail("BUNDLE_FINGERPRINT_MISMATCH", "Failed to finalize seeded bundle.");
  }

  const bundleSeed = await seedOwnedJsonObject({
    storage: input.storage,
    ownerId: input.ownerId,
    projectId: input.projectId,
    purpose: "asset_bundle_record",
    json: bundleResult.bundle,
    mimeType: "application/json",
    expiresAtMs,
  });
  if (!bundleSeed.ok) return bundleSeed;

  return cpOk({
    manifestLocator: manifestSeed.value.locator,
    manifestPayloadDigest: manifestSeed.value.contentDigest,
    bundle: bundleResult.bundle,
    bundleLocator: bundleSeed.value.locator,
    assetLocators,
  });
}

export function asMemoryStorage(
  storage: HeadlessStoragePort,
): MemoryHeadlessStorageAdapter | null {
  return storage instanceof Object &&
    "testingMutateStoredBytes" in storage
    ? (storage as MemoryHeadlessStorageAdapter)
    : null;
}
