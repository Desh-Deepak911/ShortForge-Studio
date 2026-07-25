/**
 * Bounded full-object read for small JSON authorities only
 * (manifest / asset_bundle_record).
 *
 * Allocates at most one maxBytes buffer. Never use for asset_bytes —
 * use verifyFinalizedOwnedObjectStream instead.
 */

import { createHash } from "node:crypto";

import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessR2ObjectIOPort } from "../ports/r2-object-io.port";
import type { HeadlessFinalizedOwnedObjectRecordV1 } from "../types/owned-object-record";
import { cpFail, cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

function digestHex(hasher: ReturnType<typeof createHash>): string {
  return `sha256:${hasher.digest("hex")}`;
}

export async function loadFinalizedOwnedObjectBytes(input: {
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly io: HeadlessR2ObjectIOPort;
  readonly objectId: string;
  readonly ownerId: string;
  readonly nowMs: number;
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
  /** When set, rejects purposes other than these (JSON authorities). */
  readonly allowedPurposes?: readonly (
    | "manifest"
    | "asset_bundle_record"
  )[];
}): Promise<
  HeadlessControlPlaneResult<{
    readonly record: HeadlessFinalizedOwnedObjectRecordV1;
    readonly bytes: Uint8Array;
  }>
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
    input.allowedPurposes != null &&
    !input.allowedPurposes.includes(
      record.purpose as "manifest" | "asset_bundle_record",
    )
  ) {
    return cpFail(
      "ASSET_PURPOSE_MISMATCH",
      "Bounded JSON loader rejected non-JSON purpose.",
    );
  }
  if (record.expiresAtMs <= input.nowMs) {
    return cpFail("ASSET_EXPIRED", "Finalized owned object expired.");
  }
  if (record.byteLength > input.maxBytes) {
    return cpFail("BODY_TOO_LARGE", "Finalized object exceeds byte ceiling.");
  }

  if (input.signal?.aborted) {
    return cpFail("OPERATION_ABORTED", "Object load aborted.");
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

  // Single pre-sized buffer — no chunks[] accumulation.
  const bytes = new Uint8Array(record.byteLength);
  let offset = 0;
  const hasher = createHash("sha256");
  const stream = input.io.streamFullObject({
    locator: { storeId: record.storeId, objectKey: record.objectKey },
    ownerId: input.ownerId,
    signal: input.signal,
    maxBytes: input.maxBytes,
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
        break;
      }
      const chunk = next.value;
      if (offset + chunk.byteLength > record.byteLength) {
        return cpFail(
          "ASSET_LENGTH_MISMATCH",
          "Streamed length exceeds finalized metadata.",
        );
      }
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
      hasher.update(chunk);
    }
  } catch {
    return cpFail("OBJECT_INTEGRITY_FAILED", "Object stream failed closed.");
  }

  if (streamResult == null || !streamResult.ok) {
    return streamResult ?? cpFail("INTERNAL_ERROR", "Object stream failed.");
  }
  if (streamResult.value.byteLength !== record.byteLength || offset !== record.byteLength) {
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

  const digest = digestHex(hasher);
  if (digest !== record.contentDigest) {
    return cpFail(
      "ASSET_DIGEST_MISMATCH",
      "Streamed digest does not match finalized metadata.",
    );
  }

  return cpOk(Object.freeze({ record, bytes }));
}
