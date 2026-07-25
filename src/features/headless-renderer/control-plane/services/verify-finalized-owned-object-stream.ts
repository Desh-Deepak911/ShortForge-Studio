/**
 * Incremental finalized-object digest/length/MIME verification.
 * Never retains more than one stream chunk of payload bytes.
 * Used for asset_bytes during canonical materialization.
 */

import { createHash } from "node:crypto";

import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessR2ObjectIOPort } from "../ports/r2-object-io.port";
import type { HeadlessFinalizedOwnedObjectRecordV1 } from "../types/owned-object-record";
import {
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";

function digestHex(hasher: ReturnType<typeof createHash>): string {
  return `sha256:${hasher.digest("hex")}`;
}

export type VerifyFinalizedOwnedObjectStreamSuccess = {
  readonly record: HeadlessFinalizedOwnedObjectRecordV1;
  readonly streamedByteLength: number;
  readonly contentDigest: string;
  /** Peak payload chunks retained concurrently (must be ≤ 1). */
  readonly peakRetainedChunks: number;
};

/**
 * Stream and verify a finalized owned object without full-payload buffering.
 */
export async function verifyFinalizedOwnedObjectStream(input: {
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly io: HeadlessR2ObjectIOPort;
  readonly objectId: string;
  readonly ownerId: string;
  readonly nowMs: number;
  readonly maxBytes: number;
  /** Optional remaining aggregate budget across a job asset set. */
  readonly aggregateMaxBytesRemaining?: number;
  readonly expected?: {
    readonly projectId?: string;
    readonly jobId?: string;
    readonly operationId?: string;
    readonly purpose?: "asset_bytes";
    readonly slotKey?: string;
    readonly contentDigest?: string;
    readonly byteLength?: number;
    readonly mimeType?: string;
  };
  readonly signal?: AbortSignal;
}): Promise<
  HeadlessControlPlaneResult<VerifyFinalizedOwnedObjectStreamSuccess>
> {
  const loaded = await input.ownedObjectStore.getByObjectIdAndOwner({
    objectId: input.objectId,
    ownerId: input.ownerId,
  });
  if (!loaded.ok) return loaded;
  if (loaded.value == null) {
    return cpFail("JOB_NOT_FOUND", "Owned object not found.");
  }
  const record = loaded.value.record;
  if (record.stage !== "finalized") {
    return cpFail("TERMINAL_IMMUTABLE", "Owned object is not finalized.");
  }
  if (record.ownerId !== input.ownerId) {
    return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Owned object owner mismatch.");
  }
  if (
    input.expected?.projectId != null &&
    record.projectId !== input.expected.projectId
  ) {
    return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Owned object project mismatch.");
  }
  if (input.expected?.jobId != null && record.jobId !== input.expected.jobId) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Owned object job mismatch.",
    );
  }
  if (
    input.expected?.operationId != null &&
    record.operationId !== input.expected.operationId
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Owned object operation mismatch.",
    );
  }
  if (
    input.expected?.purpose != null &&
    record.purpose !== input.expected.purpose
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Owned object purpose mismatch.",
    );
  }
  if (
    input.expected?.slotKey != null &&
    record.slotKey !== input.expected.slotKey
  ) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Owned object slot mismatch.",
    );
  }
  if (record.expiresAtMs <= input.nowMs) {
    return cpFail("ASSET_EXPIRED", "Finalized owned object expired.");
  }
  if (record.byteLength > input.maxBytes) {
    return cpFail("BODY_TOO_LARGE", "Finalized object exceeds byte ceiling.");
  }
  if (
    input.aggregateMaxBytesRemaining != null &&
    record.byteLength > input.aggregateMaxBytesRemaining
  ) {
    return cpFail(
      "ASSET_BYTES_OVERFLOW",
      "Finalized object exceeds aggregate ceiling.",
    );
  }
  if (
    input.expected?.byteLength != null &&
    record.byteLength !== input.expected.byteLength
  ) {
    return cpFail(
      "ASSET_LENGTH_MISMATCH",
      "Finalized length does not match expected claim.",
    );
  }
  if (
    input.expected?.mimeType != null &&
    record.mimeType !== input.expected.mimeType
  ) {
    return cpFail(
      "ASSET_MIME_MISMATCH",
      "Finalized MIME does not match expected claim.",
    );
  }
  if (
    input.expected?.contentDigest != null &&
    record.contentDigest !== input.expected.contentDigest
  ) {
    return cpFail(
      "ASSET_DIGEST_MISMATCH",
      "Finalized digest does not match expected claim.",
    );
  }

  if (input.signal?.aborted) {
    return cpFail("OPERATION_ABORTED", "Object verification aborted.");
  }

  const meta = await input.io.readObjectMetadata(
    { storeId: record.storeId, objectKey: record.objectKey },
    input.ownerId,
  );
  if (!meta.ok) return meta;
  if (
    meta.value.revisionAuthority === "unavailable" ||
    meta.value.providerRevisionId == null
  ) {
    return cpFail(
      "OBJECT_REVISION_UNAVAILABLE",
      "Object revision authority unavailable.",
    );
  }
  const revisionAuthority =
    meta.value.revisionAuthority === "version_id" ? "version_id" : "etag";

  const hasher = createHash("sha256");
  let streamed = 0;
  let peakRetainedChunks = 0;
  let retained = 0;

  const stream = input.io.streamFullObject({
    locator: { storeId: record.storeId, objectKey: record.objectKey },
    ownerId: input.ownerId,
    signal: input.signal,
    maxBytes: Math.min(
      input.maxBytes,
      input.aggregateMaxBytesRemaining ?? input.maxBytes,
    ),
    requiredProviderRevisionId: meta.value.providerRevisionId,
    requiredRevisionAuthority: revisionAuthority,
  });

  let streamResult: HeadlessControlPlaneResult<{
    readonly byteLength: number;
    readonly mimeType: string;
  }> | null = null;

  try {
    while (true) {
      const next = await stream.next();
      if (next.done) {
        streamResult = next.value;
        retained = 0;
        break;
      }
      retained = 1;
      if (retained > peakRetainedChunks) peakRetainedChunks = retained;
      const chunk = next.value;
      streamed += chunk.byteLength;
      if (streamed > record.byteLength) {
        return cpFail(
          "ASSET_LENGTH_MISMATCH",
          "Streamed length exceeds finalized metadata.",
        );
      }
      hasher.update(chunk);
      // Drop reference — only one chunk retained at a time.
      retained = 0;
    }
  } catch {
    return cpFail("OBJECT_INTEGRITY_FAILED", "Object stream failed closed.");
  }

  if (streamResult == null || !streamResult.ok) {
    return streamResult ?? cpFail("INTERNAL_ERROR", "Object stream failed.");
  }
  if (streamResult.value.byteLength !== record.byteLength) {
    return cpFail(
      "ASSET_LENGTH_MISMATCH",
      "Streamed length does not match finalized metadata.",
    );
  }
  if (streamResult.value.mimeType !== record.mimeType) {
    return cpFail(
      "ASSET_MIME_MISMATCH",
      "Streamed MIME does not match finalized metadata.",
    );
  }

  const contentDigest = digestHex(hasher);
  if (contentDigest !== record.contentDigest) {
    return cpFail(
      "ASSET_DIGEST_MISMATCH",
      "Streamed digest does not match finalized metadata.",
    );
  }

  return cpOk(
    Object.freeze({
      record,
      streamedByteLength: streamed,
      contentDigest,
      peakRetainedChunks,
    }),
  );
}

/**
 * Overflow-safe preflight of an asset-byte set before any stream opens.
 */
export function preflightFinalizedAssetByteBudgets(input: {
  readonly assets: readonly {
    readonly byteLength: number;
    readonly slotKey: string | null;
  }[];
  readonly expectedSlotKeys: readonly string[];
  readonly maxAssets: number;
  readonly maxAssetBytes: number;
  readonly maxTotalAssetBytes: number;
}): HeadlessControlPlaneResult<{ readonly totalBytes: number }> {
  if (input.assets.length > input.maxAssets) {
    return cpFail("ASSET_BYTES_OVERFLOW", "Too many asset objects.");
  }
  if (input.assets.length !== input.expectedSlotKeys.length) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Asset count does not match snapshot slots.",
    );
  }

  const seen = new Set<string>();
  const expected = new Set(input.expectedSlotKeys);
  let total = 0;
  for (const asset of input.assets) {
    if (asset.slotKey == null || !expected.has(asset.slotKey)) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Foreign or missing asset slot.",
      );
    }
    if (seen.has(asset.slotKey)) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Duplicate asset slot.",
      );
    }
    seen.add(asset.slotKey);
    if (
      typeof asset.byteLength !== "number" ||
      !Number.isSafeInteger(asset.byteLength) ||
      asset.byteLength < 1 ||
      asset.byteLength > input.maxAssetBytes
    ) {
      return cpFail(
        "ASSET_BYTES_OVERFLOW",
        "Asset byte length is unsafe or exceeds ceiling.",
      );
    }
    const next = total + asset.byteLength;
    if (!Number.isSafeInteger(next) || next > input.maxTotalAssetBytes) {
      return cpFail(
        "ASSET_BYTES_OVERFLOW",
        "Aggregate asset bytes exceed ceiling.",
      );
    }
    total = next;
  }
  if (seen.size !== expected.size) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Missing finalized asset_bytes for snapshot slot.",
    );
  }
  return cpOk(Object.freeze({ totalBytes: total }));
}
