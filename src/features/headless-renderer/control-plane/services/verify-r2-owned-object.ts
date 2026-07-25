/**
 * Trusted Design B verification — stream full object, incremental sha256, atomic finalize.
 * Provider-neutral orchestration over injected owned-object store + R2 IO port.
 * NEVER enqueues render. Never logs bucket/key/URLs/signatures.
 *
 * Claimed path: execute under an existing durable verification claim (dual-lease).
 * Standalone path: acquire then delegate into the claimed executor — never a second claim.
 *
 * TOCTOU: after claim confirmed, HEAD for revision → require revisionAuthority !== unavailable →
 * stream with requiredProviderRevisionId bound. ETag/VersionId are NEVER sha256 authority.
 *
 * Coverage: finalize success is independent of coverage reconcile. On success,
 * `coverageReconciled` reports whether updateCoverage / reconcile succeeded.
 * Callers may retry reconcile; object remains finalized either way.
 */

import { createHash, randomUUID } from "node:crypto";

import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessR2ObjectIOPort } from "../ports/r2-object-io.port";
import type {
  HeadlessOwnedObjectRecordV1,
  HeadlessStagingOwnedObjectRecordV1,
} from "../types/owned-object-record";
import { cpFail, cpOk } from "../types/control-plane.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import { HEADLESS_MAX_ASSET_BYTES } from "../../domain/headless-render-constants";

export const HEADLESS_R2_VERIFY_ALLOWED_MIME_TYPES = Object.freeze([
  "application/json",
  "application/octet-stream",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/mp4",
] as const);

/** Truthful verification failure / claim-release disposition (never invented). */
export type HeadlessVerifyFailureDisposition =
  | "retryable"
  | "terminal_rejected"
  | "cleanup_pending"
  | "stale"
  | "unconfirmed"
  | "aborted";

export type HeadlessVerifyR2OwnedObjectInput = {
  readonly objectId: string;
  readonly ownerId: string;
  readonly nowMs: number;
  /** Optional per-object ceiling; defaults to HEADLESS_MAX_ASSET_BYTES. */
  readonly maxBytes?: number;
  /** Optional aggregate budget remaining across a job verify batch. */
  readonly aggregateMaxBytesRemaining?: number;
  readonly signal?: AbortSignal;
  readonly store: HeadlessOwnedObjectStorePort;
  readonly io: HeadlessR2ObjectIOPort;
  /**
   * Optional callback after successful finalize — e.g. update provisional
   * staging/coverage with trusted facts. Must not enqueue render.
   * Failure does not un-finalize; success returns coverageReconciled=false.
   */
  readonly updateCoverage?: (input: {
    readonly record: HeadlessOwnedObjectRecordV1;
  }) => Promise<HeadlessControlPlaneResult<true>>;
  /** When true (default), delete object bytes on reject; else mark cleanup_pending. */
  readonly deleteOnReject?: boolean;
  /** Verification claim lease; stale claims may be reclaimed after this window. */
  readonly claimLeaseMs?: number;
};

/**
 * Execute verification under an already-acquired durable claim.
 * Does not call acquireVerificationClaim. Rereads and confirms the live claim
 * before any R2 streaming I/O.
 */
export type HeadlessVerifyR2OwnedObjectUnderClaimInput = {
  readonly objectId: string;
  readonly ownerId: string;
  readonly claimToken: string;
  readonly expectedStoreVersion: number;
  readonly nowMs: number;
  readonly maxBytes?: number;
  readonly aggregateMaxBytesRemaining?: number;
  readonly signal?: AbortSignal;
  readonly store: HeadlessOwnedObjectStorePort;
  readonly io: HeadlessR2ObjectIOPort;
  readonly updateCoverage?: (input: {
    readonly record: HeadlessOwnedObjectRecordV1;
  }) => Promise<HeadlessControlPlaneResult<true>>;
  readonly deleteOnReject?: boolean;
};

export type HeadlessVerifyR2OwnedObjectSuccess = {
  readonly record: HeadlessOwnedObjectRecordV1;
  readonly storeVersion: number;
  readonly streamedByteLength: number;
  /**
   * True when updateCoverage was omitted or succeeded.
   * False when finalize committed but coverage reconcile failed —
   * object remains finalized; callers may retry reconcile.
   */
  readonly coverageReconciled: boolean;
};

export type HeadlessVerifyR2OwnedObjectFailureExtras = {
  readonly disposition?: HeadlessVerifyFailureDisposition;
};

function mimeAllowed(mime: string): boolean {
  return (HEADLESS_R2_VERIFY_ALLOWED_MIME_TYPES as readonly string[]).includes(
    mime,
  );
}

function digestHex(hasher: ReturnType<typeof createHash>): string {
  return `sha256:${hasher.digest("hex")}`;
}

function withDisposition(
  result: HeadlessControlPlaneResult<never>,
  disposition: HeadlessVerifyFailureDisposition,
): HeadlessControlPlaneResult<never> {
  if (result.ok) return result;
  return Object.freeze({
    ...result,
    disposition,
  }) as HeadlessControlPlaneResult<never> & HeadlessVerifyR2OwnedObjectFailureExtras;
}

/**
 * Confirm the exact live claim before external I/O. Zero R2 contact on mismatch.
 */
async function confirmLiveVerificationClaim(input: {
  readonly store: HeadlessOwnedObjectStorePort;
  readonly objectId: string;
  readonly ownerId: string;
  readonly claimToken: string;
  readonly expectedStoreVersion: number;
}): Promise<
  HeadlessControlPlaneResult<{
    readonly record: HeadlessStagingOwnedObjectRecordV1;
    readonly storeVersion: number;
  }>
> {
  const loaded = await input.store.getByObjectIdAndOwner({
    objectId: input.objectId,
    ownerId: input.ownerId,
  });
  if (!loaded.ok) return loaded;
  if (loaded.value == null) {
    return cpFail("JOB_NOT_FOUND", "Staging owned object not found.");
  }
  if (loaded.value.storeVersion !== input.expectedStoreVersion) {
    return cpFail("STALE_TRANSITION", "Owned object store version stale.");
  }
  const record = loaded.value.record;
  if (record.ownerId !== input.ownerId || record.objectId !== input.objectId) {
    return cpFail(
      "OBJECT_OWNERSHIP_MISMATCH",
      "Owned object identity mismatch.",
    );
  }
  if (record.stage === "finalized") {
    return cpFail("TERMINAL_IMMUTABLE", "Owned object already finalized.");
  }
  if (record.stage !== "staging") {
    return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
  }
  if (
    record.verificationState !== "claimed" ||
    record.verificationClaimToken !== input.claimToken
  ) {
    return cpFail("CLAIM_REJECTED", "Verification claim mismatch.");
  }
  return cpOk({
    record,
    storeVersion: loaded.value.storeVersion,
  });
}

/**
 * Stream/finalize under an existing durable verification claim.
 * Never acquires a second claim.
 */
export async function verifyAndFinalizeR2OwnedObjectUnderClaim(
  input: HeadlessVerifyR2OwnedObjectUnderClaimInput,
): Promise<HeadlessControlPlaneResult<HeadlessVerifyR2OwnedObjectSuccess>> {
  let claimToken: string | null = input.claimToken;
  let claimedStoreVersion: number | null = input.expectedStoreVersion;
  let stagingObjectKey: string | null = null;
  let stagingStoreId: "assets" | "artifacts" | null = null;

  try {
    const confirmed = await confirmLiveVerificationClaim({
      store: input.store,
      objectId: input.objectId,
      ownerId: input.ownerId,
      claimToken: input.claimToken,
      expectedStoreVersion: input.expectedStoreVersion,
    });
    if (!confirmed.ok) {
      const code = confirmed.issues[0]?.code;
      const disposition: HeadlessVerifyFailureDisposition =
        code === "STALE_TRANSITION"
          ? "stale"
          : code === "CLAIM_REJECTED"
            ? "stale"
            : "unconfirmed";
      return withDisposition(confirmed, disposition);
    }

    const staging = confirmed.value.record;
    claimedStoreVersion = confirmed.value.storeVersion;
    stagingObjectKey = staging.objectKey;
    stagingStoreId = staging.storeId;

    if (
      staging.expiresAtMs != null &&
      staging.expiresAtMs <= input.nowMs
    ) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "expired",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail("ASSET_EXPIRED", "Staging owned object lease expired."),
        rejected,
      );
    }

    if (!mimeAllowed(staging.expectedMimeType)) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "mime_policy",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail("ASSET_MIME_MISMATCH", "Staging MIME policy rejected."),
        rejected,
      );
    }

    const maxBytes = input.maxBytes ?? HEADLESS_MAX_ASSET_BYTES;
    if (staging.expectedByteLength > maxBytes) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "bytes_overflow",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail(
          "ASSET_BYTES_OVERFLOW",
          "Staging expected length exceeds ceiling.",
        ),
        rejected,
      );
    }
    if (
      input.aggregateMaxBytesRemaining != null &&
      staging.expectedByteLength > input.aggregateMaxBytesRemaining
    ) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "aggregate_overflow",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail(
          "ASSET_BYTES_OVERFLOW",
          "Staging expected length exceeds aggregate ceiling.",
        ),
        rejected,
      );
    }

    if (input.signal?.aborted) {
      const released = await releaseClaimConfirmed(input, claimToken!, claimedStoreVersion);
      return withDisposition(
        cpFail("OPERATION_ABORTED", "Verification aborted."),
        released,
      );
    }

    // TOCTOU revision bind: HEAD → require revision → conditional stream.
    const meta = await input.io.readObjectMetadata(
      {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
      },
      input.ownerId,
    );
    if (!meta.ok) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "metadata_failed",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(meta, rejected);
    }
    if (
      meta.value.revisionAuthority === "unavailable" ||
      meta.value.providerRevisionId == null
    ) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "revision_unavailable",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail(
          "OBJECT_REVISION_UNAVAILABLE",
          "Object revision authority unavailable.",
        ),
        rejected,
      );
    }
    const revisionAuthority =
      meta.value.revisionAuthority === "version_id" ? "version_id" : "etag";

    const hasher = createHash("sha256");
    let streamed = 0;

    const stream = input.io.streamFullObject({
      locator: {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
      },
      ownerId: input.ownerId,
      signal: input.signal,
      maxBytes: Math.min(
        maxBytes,
        input.aggregateMaxBytesRemaining ?? maxBytes,
      ),
      requiredProviderRevisionId: meta.value.providerRevisionId,
      requiredRevisionAuthority: revisionAuthority,
    });

    let streamResult: HeadlessControlPlaneResult<{
      readonly byteLength: number;
      readonly mimeType: string;
    }> | null = null;

    while (true) {
      const next = await stream.next();
      if (next.done) {
        streamResult = next.value;
        break;
      }
      const chunk = next.value;
      streamed += chunk.byteLength;
      if (streamed > staging.expectedByteLength) {
        const rejected = await rejectObject(input, {
          claimToken: claimToken!,
          storeVersion: claimedStoreVersion,
          reason: "length_overflow",
          locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
        });
        return withDisposition(
          cpFail(
            "ASSET_LENGTH_MISMATCH",
            "Streamed object length does not match claim.",
          ),
          rejected,
        );
      }
      hasher.update(chunk);
    }

    if (streamResult == null || !streamResult.ok) {
      const code =
        streamResult && !streamResult.ok
          ? streamResult.issues[0]?.code ?? "INTERNAL_ERROR"
          : "INTERNAL_ERROR";
      if (code === "OPERATION_ABORTED") {
        const released = await releaseClaimConfirmed(
          input,
          claimToken!,
          claimedStoreVersion,
        );
        return withDisposition(
          cpFail("OPERATION_ABORTED", "Verification aborted."),
          released === "retryable" ? "aborted" : released,
        );
      }
      if (code === "OBJECT_REVISION_MISMATCH") {
        const rejected = await rejectObject(input, {
          claimToken: claimToken!,
          storeVersion: claimedStoreVersion,
          reason: "revision_mismatch",
          locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
        });
        return withDisposition(
          cpFail(
            "OBJECT_REVISION_MISMATCH",
            "Object revision precondition failed.",
          ),
          rejected,
        );
      }
      if (code === "ASSET_BYTES_OVERFLOW") {
        const rejected = await rejectObject(input, {
          claimToken: claimToken!,
          storeVersion: claimedStoreVersion,
          reason: "bytes_overflow",
          locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
        });
        return withDisposition(
          cpFail(
            "ASSET_BYTES_OVERFLOW",
            "Object exceeds allowed byte ceiling.",
          ),
          rejected,
        );
      }
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "stream_failed",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail(
          "OBJECT_INTEGRITY_FAILED",
          "Full-object stream verification failed.",
        ),
        rejected,
      );
    }

    const observedMime = streamResult.value.mimeType;
    streamed = streamResult.value.byteLength;

    if (streamed !== staging.expectedByteLength) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "length_mismatch",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail(
          "ASSET_LENGTH_MISMATCH",
          "Streamed object length does not match claim.",
        ),
        rejected,
      );
    }

    const contentDigest = digestHex(hasher);
    if (contentDigest !== staging.expectedContentDigestClaim) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "digest_mismatch",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail(
          "ASSET_DIGEST_MISMATCH",
          "Streamed object digest does not match claim.",
        ),
        rejected,
      );
    }

    if (observedMime !== staging.expectedMimeType || !mimeAllowed(observedMime)) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "mime_mismatch",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail(
          "ASSET_MIME_MISMATCH",
          "Streamed object MIME does not match claim.",
        ),
        rejected,
      );
    }

    const expiresAtMs =
      staging.expiresAtMs != null
        ? staging.expiresAtMs
        : input.nowMs + 60 * 60 * 1000;
    if (expiresAtMs <= input.nowMs) {
      const rejected = await rejectObject(input, {
        claimToken: claimToken!,
        storeVersion: claimedStoreVersion,
        reason: "expired",
        locator: { storeId: stagingStoreId, objectKey: stagingObjectKey },
      });
      return withDisposition(
        cpFail("ASSET_EXPIRED", "Owned object lease expired."),
        rejected,
      );
    }

    if (input.signal?.aborted) {
      const released = await releaseClaimConfirmed(
        input,
        claimToken!,
        claimedStoreVersion,
      );
      return withDisposition(
        cpFail("OPERATION_ABORTED", "Verification aborted."),
        released === "retryable" ? "aborted" : released,
      );
    }

    const finalized = await input.store.finalizeStagingRecord({
      objectId: input.objectId,
      ownerId: input.ownerId,
      expectedStoreVersion: claimedStoreVersion,
      verificationClaimToken: claimToken!,
      contentDigest,
      byteLength: streamed,
      mimeType: observedMime,
      verifiedAtMs: input.nowMs,
      expiresAtMs,
      nowMs: input.nowMs,
    });

    if (!finalized.ok) {
      // Object may still be claimed — release only when CAS confirms.
      const released = await releaseClaimConfirmed(
        input,
        claimToken!,
        claimedStoreVersion,
      );
      const code = finalized.issues[0]?.code;
      const disposition: HeadlessVerifyFailureDisposition =
        code === "STALE_TRANSITION"
          ? "stale"
          : released === "unconfirmed"
            ? "unconfirmed"
            : released;
      return withDisposition(finalized, disposition);
    }

    // Finalized — cancellation must never un-finalize.
    claimToken = null;
    claimedStoreVersion = null;

    let coverageReconciled = true;
    if (input.updateCoverage) {
      const coverage = await input.updateCoverage({
        record: finalized.value.record,
      });
      coverageReconciled = coverage.ok;
    }

    return cpOk(
      Object.freeze({
        record: finalized.value.record,
        storeVersion: finalized.value.storeVersion,
        streamedByteLength: streamed,
        coverageReconciled,
      }),
    );
  } catch {
    if (claimToken != null && claimedStoreVersion != null) {
      await releaseClaimConfirmed(input, claimToken, claimedStoreVersion);
    }
    return withDisposition(
      cpFail("INTERNAL_ERROR", "Owned object verification failed."),
      "unconfirmed",
    );
  }
}

/**
 * Acquire a verification claim, then delegate into the claimed executor.
 * Never performs a second acquire for the same execution.
 */
export async function verifyAndFinalizeR2OwnedObject(
  input: HeadlessVerifyR2OwnedObjectInput,
): Promise<HeadlessControlPlaneResult<HeadlessVerifyR2OwnedObjectSuccess>> {
  try {
    const loaded = await input.store.getByObjectIdAndOwner({
      objectId: input.objectId,
      ownerId: input.ownerId,
    });
    if (!loaded.ok) return loaded;
    if (loaded.value == null) {
      return cpFail("JOB_NOT_FOUND", "Staging owned object not found.");
    }

    const staging = loaded.value.record;
    if (staging.stage !== "staging") {
      if (staging.stage === "finalized") {
        return cpFail(
          "TERMINAL_IMMUTABLE",
          "Owned object already finalized.",
        );
      }
      return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
    }

    if (
      staging.expiresAtMs != null &&
      staging.expiresAtMs <= input.nowMs
    ) {
      return cpFail("ASSET_EXPIRED", "Staging owned object lease expired.");
    }

    if (!mimeAllowed(staging.expectedMimeType)) {
      return cpFail("ASSET_MIME_MISMATCH", "Staging MIME policy rejected.");
    }

    const maxBytes = input.maxBytes ?? HEADLESS_MAX_ASSET_BYTES;
    if (staging.expectedByteLength > maxBytes) {
      return cpFail(
        "ASSET_BYTES_OVERFLOW",
        "Staging expected length exceeds ceiling.",
      );
    }
    if (
      input.aggregateMaxBytesRemaining != null &&
      staging.expectedByteLength > input.aggregateMaxBytesRemaining
    ) {
      return cpFail(
        "ASSET_BYTES_OVERFLOW",
        "Staging expected length exceeds aggregate ceiling.",
      );
    }

    const claimToken = randomUUID();
    const claimed = await input.store.acquireVerificationClaim({
      objectId: input.objectId,
      ownerId: input.ownerId,
      claimToken,
      nowMs: input.nowMs,
      expectedStoreVersion: loaded.value.storeVersion,
      claimLeaseMs: input.claimLeaseMs ?? 120_000,
    });
    if (!claimed.ok) return claimed;

    return verifyAndFinalizeR2OwnedObjectUnderClaim({
      objectId: input.objectId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion: claimed.value.storeVersion,
      nowMs: input.nowMs,
      maxBytes: input.maxBytes,
      aggregateMaxBytesRemaining: input.aggregateMaxBytesRemaining,
      signal: input.signal,
      store: input.store,
      io: input.io,
      updateCoverage: input.updateCoverage,
      deleteOnReject: input.deleteOnReject,
    });
  } catch {
    return cpFail("INTERNAL_ERROR", "Owned object verification failed.");
  }
}

async function releaseClaimConfirmed(
  input: Pick<
    HeadlessVerifyR2OwnedObjectUnderClaimInput,
    "store" | "objectId" | "ownerId" | "nowMs"
  >,
  claimToken: string,
  storeVersion: number,
): Promise<HeadlessVerifyFailureDisposition> {
  const released = await input.store.releaseVerificationClaim({
    objectId: input.objectId,
    ownerId: input.ownerId,
    claimToken,
    expectedStoreVersion: storeVersion,
    nowMs: input.nowMs,
  });
  if (!released.ok) {
    const code = released.issues[0]?.code;
    if (code === "STALE_TRANSITION" || code === "CLAIM_REJECTED") {
      return "stale";
    }
    if (code === "TERMINAL_IMMUTABLE") {
      // Already finalized or terminal — do not invent retryable release.
      return "unconfirmed";
    }
    return "unconfirmed";
  }
  if (released.value.record.stage !== "staging") {
    return "unconfirmed";
  }
  if (released.value.record.verificationState !== "unclaimed") {
    return "unconfirmed";
  }
  return "retryable";
}

/**
 * Truthful reject path:
 * - failVerificationClaim must confirm before treating as released
 * - delete then markRejected only when delete confirmed
 * - delete/CAS failure → cleanup_pending when that CAS confirms
 * - never invent terminal rejection after failed metadata CAS
 */
async function rejectObject(
  input: Pick<
    HeadlessVerifyR2OwnedObjectUnderClaimInput,
    "store" | "io" | "objectId" | "ownerId" | "nowMs" | "deleteOnReject"
  >,
  args: {
    claimToken: string;
    storeVersion: number;
    reason: string;
    locator: {
      storeId: "assets" | "artifacts";
      objectKey: string;
    };
  },
): Promise<HeadlessVerifyFailureDisposition> {
  const failed = await input.store.failVerificationClaim({
    objectId: input.objectId,
    ownerId: input.ownerId,
    claimToken: args.claimToken,
    expectedStoreVersion: args.storeVersion,
    nowMs: input.nowMs,
  });
  if (!failed.ok) {
    const code = failed.issues[0]?.code;
    if (code === "STALE_TRANSITION" || code === "CLAIM_REJECTED") {
      return "stale";
    }
    return "unconfirmed";
  }

  const afterFail = await input.store.getByObjectIdAndOwner({
    objectId: input.objectId,
    ownerId: input.ownerId,
  });
  if (!afterFail.ok || afterFail.value == null) {
    return "unconfirmed";
  }
  // Prefer reread storeVersion after failClaim (bumped).
  const storeVersion = afterFail.value.storeVersion;

  const deleteOnReject = input.deleteOnReject !== false;
  if (deleteOnReject) {
    let deleted = false;
    try {
      const del = await input.io.deleteObject(
        {
          storeId: args.locator.storeId,
          objectKey: args.locator.objectKey,
        },
        input.ownerId,
      );
      deleted = del.ok;
    } catch {
      deleted = false;
    }
    if (deleted) {
      const marked = await input.store.markRejected({
        objectId: input.objectId,
        ownerId: input.ownerId,
        expectedStoreVersion: storeVersion,
        terminalReason: args.reason,
        nowMs: input.nowMs,
      });
      if (
        marked.ok &&
        marked.value.record.stage === "rejected"
      ) {
        return "terminal_rejected";
      }
      // Bytes deleted but metadata CAS failed — schedule durable cleanup tracking.
      const pending = await input.store.markCleanupPending({
        objectId: input.objectId,
        ownerId: input.ownerId,
        expectedStoreVersion: storeVersion,
        terminalReason: args.reason,
        cleanupScheduledAtMs: input.nowMs,
        nowMs: input.nowMs,
      });
      if (
        pending.ok &&
        pending.value.record.stage === "cleanup_pending"
      ) {
        return "cleanup_pending";
      }
      return "unconfirmed";
    }
  }

  const pending = await input.store.markCleanupPending({
    objectId: input.objectId,
    ownerId: input.ownerId,
    expectedStoreVersion: storeVersion,
    terminalReason: args.reason,
    cleanupScheduledAtMs: input.nowMs,
    nowMs: input.nowMs,
  });
  if (pending.ok && pending.value.record.stage === "cleanup_pending") {
    return "cleanup_pending";
  }
  if (!pending.ok) {
    const code = pending.issues[0]?.code;
    if (code === "STALE_TRANSITION") return "stale";
  }
  return "unconfirmed";
}
