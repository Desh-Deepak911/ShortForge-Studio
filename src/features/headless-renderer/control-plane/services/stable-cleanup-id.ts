/**
 * Stable cleanup-intent identity — derived from job attempt + opaque locator.
 * Duplicate scheduling must reuse the same cleanupId (idempotent).
 */

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";

export function stableHeadlessCleanupId(input: {
  readonly jobId: string;
  readonly attempt: number;
  readonly storageLocator: HeadlessStorageLocatorIdentity;
}): string {
  const { jobId, attempt, storageLocator } = input;
  return `hci:${jobId}:a${attempt}:${storageLocator.storeId}:${storageLocator.objectKey}`;
}

export function stableHeadlessCleanupIdempotencyKey(input: {
  readonly jobId: string;
  readonly attempt: number;
  readonly storageLocator: HeadlessStorageLocatorIdentity;
}): string {
  return `hci-idem:${stableHeadlessCleanupId(input)}`;
}
