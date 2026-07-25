/**
 * Sprint 11C.1 / 11C.1A — Verify every asset descriptor against owned storage
 * bytes before job acceptance, persistence, or queueing.
 *
 * Expiry authority: finalized object metadata.expiresAtMs is authoritative;
 * descriptor.expiresAtMs must equal it exactly (no silent repair).
 */

import { createHash } from "node:crypto";

import {
  HEADLESS_MAX_TOTAL_ASSET_BYTES,
} from "../../domain/headless-render-constants";
import type {
  HeadlessAssetBundleV1,
  HeadlessAssetDescriptorV1,
  HeadlessOwnershipBinding,
} from "../../domain/headless-render.types";
import type { HeadlessStoragePort } from "../ports/storage.port";
import {
  HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS,
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function locatorEqual(
  a: HeadlessAssetDescriptorV1["storageLocator"],
  b: HeadlessAssetDescriptorV1["storageLocator"],
): boolean {
  return (
    a.kind === b.kind &&
    a.storeId === b.storeId &&
    a.objectKey === b.objectKey
  );
}

function isSafeTimestampMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/** Compute nowMs + lease without silent overflow. */
export function headlessMinExpiryDeadline(
  nowMs: number,
): HeadlessControlPlaneResult<number> {
  if (!isSafeTimestampMs(nowMs)) {
    return cpFail("ASSET_EXPIRY_UNSAFE", "nowMs is not a safe non-negative integer.");
  }
  const minExpiry = nowMs + HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS;
  if (!Number.isSafeInteger(minExpiry)) {
    return cpFail(
      "ASSET_LEASE_OVERFLOW",
      "nowMs + minimum lease exceeds Number.MAX_SAFE_INTEGER.",
    );
  }
  return cpOk(minExpiry);
}

export async function verifyOwnedAssetBytes(input: {
  storage: HeadlessStoragePort;
  ownership: HeadlessOwnershipBinding;
  bundle: HeadlessAssetBundleV1;
  nowMs: number;
  /** Override aggregate ceiling (tests only). */
  maxTotalAssetBytes?: number;
}): Promise<HeadlessControlPlaneResult<true>> {
  const maxTotal = input.maxTotalAssetBytes ?? HEADLESS_MAX_TOTAL_ASSET_BYTES;
  const minExpiryResult = headlessMinExpiryDeadline(input.nowMs);
  if (!minExpiryResult.ok) return minExpiryResult;
  const minExpiry = minExpiryResult.value;

  let aggregate = 0;
  for (const asset of input.bundle.assets) {
    if (!isSafeTimestampMs(asset.expiresAtMs)) {
      return cpFail(
        "ASSET_EXPIRY_UNSAFE",
        `descriptor.expiresAtMs is not a finite safe integer for assetId=${asset.assetId}.`,
      );
    }

    const opened = await input.storage.openOwnedObject(
      asset.storageLocator,
      input.ownership.ownerId,
      input.nowMs,
    );
    if (!opened.ok) {
      if (opened.issues[0]?.code === "OBJECT_INTEGRITY_FAILED") {
        return opened;
      }
      return cpFail(
        "ASSET_NOT_FOUND",
        `Owned asset bytes missing for assetId=${asset.assetId}.`,
      );
    }
    const { metadata, bytes } = opened.value;

    if (!isSafeTimestampMs(metadata.expiresAtMs)) {
      return cpFail(
        "ASSET_EXPIRY_UNSAFE",
        "Finalized metadata.expiresAtMs is not a finite safe integer.",
      );
    }
    if (asset.expiresAtMs !== metadata.expiresAtMs) {
      return cpFail(
        "ASSET_EXPIRY_MISMATCH",
        "descriptor.expiresAtMs must equal finalized metadata.expiresAtMs exactly.",
      );
    }

    if (metadata.ownerId !== input.ownership.ownerId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Asset owner mismatch.");
    }
    if (metadata.projectId !== input.ownership.projectId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Asset project mismatch.");
    }
    if (metadata.purpose !== "asset_bytes") {
      return cpFail(
        "ASSET_PURPOSE_MISMATCH",
        "Asset object purpose must be asset_bytes.",
      );
    }
    if (!metadata.finalized) {
      return cpFail("ASSET_NOT_FOUND", "Asset object is not finalized.");
    }
    if (!locatorEqual(metadata.locator, asset.storageLocator)) {
      return cpFail("ASSET_LOCATOR_MISMATCH", "Storage locator mismatch.");
    }
    if (input.nowMs > metadata.expiresAtMs) {
      return cpFail("ASSET_EXPIRED", "Asset object expired.");
    }
    if (metadata.expiresAtMs < minExpiry) {
      return cpFail(
        "ASSET_LEASE_INSUFFICIENT",
        `Asset lease must extend at least ${HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS}ms beyond acceptance.`,
      );
    }

    const actualDigest = digestOf(bytes);
    if (actualDigest !== asset.contentDigest) {
      return cpFail(
        "ASSET_DIGEST_MISMATCH",
        "Actual asset bytes digest does not match descriptor.contentDigest.",
      );
    }
    if (metadata.contentDigest !== actualDigest) {
      return cpFail(
        "ASSET_DIGEST_MISMATCH",
        "Stored metadata digest does not match actual bytes.",
      );
    }
    if (bytes.byteLength !== asset.byteLength) {
      return cpFail(
        "ASSET_LENGTH_MISMATCH",
        "Actual asset byteLength does not match descriptor.",
      );
    }
    if (metadata.byteLength !== asset.byteLength) {
      return cpFail(
        "ASSET_LENGTH_MISMATCH",
        "Metadata byteLength does not match descriptor.",
      );
    }
    if (metadata.mimeType !== asset.mimeType) {
      return cpFail(
        "ASSET_MIME_MISMATCH",
        "Asset MIME type does not match descriptor.",
      );
    }

    aggregate += bytes.byteLength;
    if (aggregate > maxTotal) {
      return cpFail(
        "ASSET_BYTES_OVERFLOW",
        "Aggregate verified asset bytes exceed domain ceiling.",
      );
    }
  }

  return cpOk(true as const);
}
