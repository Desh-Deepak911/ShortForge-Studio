/**
 * In-memory artifact cleanup intent store — test/QA only.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import {
  cpFail,
  cpOk,
} from "../types/control-plane.types";
import type {
  HeadlessArtifactCleanupPort,
  HeadlessStoredCleanupIntent,
} from "../ports/artifact-cleanup.port";
import { validateHeadlessArtifactCleanupIntent } from "../services/validate-artifact-cleanup-intent";
import type {
  HeadlessArtifactCleanupIntentV1,
  HeadlessArtifactCleanupNoDeleteDisposition,
} from "../types/artifact-cleanup-intent";
import { isHeadlessArtifactCleanupTerminalState } from "../types/artifact-cleanup-intent";

function detachRecord(
  record: HeadlessStoredCleanupIntent,
): HeadlessStoredCleanupIntent {
  return deepFreezeHeadlessValue({
    storeVersion: record.storeVersion,
    intent: record.intent,
    state: record.state,
    claimToken: record.claimToken,
    claimedAtMs: record.claimedAtMs,
    completedAtMs: record.completedAtMs,
    idempotencyKey: record.idempotencyKey,
  });
}

function sameLocator(
  a: HeadlessArtifactCleanupIntentV1["storageLocator"],
  b: HeadlessArtifactCleanupIntentV1["storageLocator"],
): boolean {
  return (
    a.kind === b.kind &&
    a.storeId === b.storeId &&
    a.objectKey === b.objectKey
  );
}

function intentsEquivalent(
  a: HeadlessArtifactCleanupIntentV1,
  b: HeadlessArtifactCleanupIntentV1,
): boolean {
  return (
    a.version === b.version &&
    a.cleanupId === b.cleanupId &&
    a.jobId === b.jobId &&
    a.attempt === b.attempt &&
    a.ownerId === b.ownerId &&
    a.projectId === b.projectId &&
    a.objectId === b.objectId &&
    sameLocator(a.storageLocator, b.storageLocator) &&
    a.contentDigest === b.contentDigest &&
    a.reasonId === b.reasonId &&
    a.createdAtMs === b.createdAtMs &&
    a.expiresAtMs === b.expiresAtMs
  );
}

export class MemoryHeadlessArtifactCleanupAdapter
  implements HeadlessArtifactCleanupPort
{
  private readonly byCleanupId = new Map<string, HeadlessStoredCleanupIntent>();
  private readonly byIdempotency = new Map<string, string>();

  /** Test-only: force createIfAbsent to fail. */
  testingCreateFail = false;
  /** Test-only: force resolveWithoutDelete CAS to fail. */
  testingFailResolveWithoutDelete = false;
  /** Test-only: force failClaim CAS to fail. */
  testingFailFailClaim = false;
  /** Test-only: force complete CAS to fail. */
  testingFailComplete = false;

  testingCountForOwner(ownerId: string): number {
    let n = 0;
    for (const r of this.byCleanupId.values()) {
      if (r.intent.ownerId === ownerId) n += 1;
    }
    return n;
  }

  testingCountPendingForOwner(ownerId: string): number {
    let n = 0;
    for (const r of this.byCleanupId.values()) {
      if (
        r.intent.ownerId === ownerId &&
        (r.state === "pending" || r.state === "claimed")
      ) {
        n += 1;
      }
    }
    return n;
  }

  async createIfAbsent(input: {
    readonly idempotencyKey: string;
    readonly intent: HeadlessArtifactCleanupIntentV1;
  }) {
    if (this.testingCreateFail) {
      return cpFail("INTERNAL_ERROR", "forced cleanup create failure");
    }
    const validated = validateHeadlessArtifactCleanupIntent(input.intent);
    if (!validated.ok) {
      return cpFail("HOSTILE_INPUT", "Cleanup intent rejected.");
    }
    if (validated.intent.cleanupId !== input.intent.cleanupId) {
      return cpFail("INTERNAL_ERROR", "Cleanup intent identity drift.");
    }

    const existingId = this.byIdempotency.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.byCleanupId.get(existingId);
      if (!existing) {
        return cpFail("INTERNAL_ERROR", "Cleanup idempotency index corruption.");
      }
      if (!intentsEquivalent(existing.intent, validated.intent)) {
        return cpFail(
          "IDEMPOTENCY_CONFLICT",
          "Cleanup intent idempotency conflict.",
        );
      }
      return cpOk({ kind: "existing" as const, record: detachRecord(existing) });
    }

    if (this.byCleanupId.has(validated.intent.cleanupId)) {
      const existing = this.byCleanupId.get(validated.intent.cleanupId)!;
      if (existing.idempotencyKey !== input.idempotencyKey) {
        return cpFail("INTERNAL_ERROR", "Cleanup id collision.");
      }
      return cpOk({ kind: "existing" as const, record: detachRecord(existing) });
    }

    const record = detachRecord({
      storeVersion: 1,
      intent: validated.intent,
      state: "pending",
      claimToken: null,
      claimedAtMs: null,
      completedAtMs: null,
      idempotencyKey: input.idempotencyKey,
    });
    this.byCleanupId.set(record.intent.cleanupId, record);
    this.byIdempotency.set(input.idempotencyKey, record.intent.cleanupId);
    return cpOk({ kind: "created" as const, record: detachRecord(record) });
  }

  async getByCleanupIdAndOwner(cleanupId: string, ownerId: string) {
    const record = this.byCleanupId.get(cleanupId);
    if (!record || record.intent.ownerId !== ownerId) {
      return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
    }
    return cpOk(detachRecord(record));
  }

  async claimPending(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly nowMs: number;
    readonly claimLeaseMs: number;
  }) {
    const current = this.byCleanupId.get(input.cleanupId);
    if (!current || current.intent.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
    }
    if (isHeadlessArtifactCleanupTerminalState(current.state)) {
      return cpOk({
        kind: "already_terminal" as const,
        record: detachRecord(current),
      });
    }
    if (current.state === "claimed" && current.claimedAtMs != null) {
      const expires = current.claimedAtMs + input.claimLeaseMs;
      if (input.nowMs < expires && current.claimToken !== input.claimToken) {
        return cpOk({ kind: "rejected" as const });
      }
    }
    const next = detachRecord({
      storeVersion: current.storeVersion + 1,
      intent: current.intent,
      state: "claimed",
      claimToken: input.claimToken,
      claimedAtMs: input.nowMs,
      completedAtMs: null,
      idempotencyKey: current.idempotencyKey,
    });
    this.byCleanupId.set(input.cleanupId, next);
    return cpOk({ kind: "claimed" as const, record: detachRecord(next) });
  }

  async complete(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }) {
    if (this.testingFailComplete) {
      return cpFail("INTERNAL_ERROR", "forced complete failure");
    }
    const current = this.byCleanupId.get(input.cleanupId);
    if (!current || current.intent.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
    }
    if (isHeadlessArtifactCleanupTerminalState(current.state)) {
      return cpOk({
        kind: "already_terminal" as const,
        record: detachRecord(current),
      });
    }
    if (current.storeVersion !== input.expectedStoreVersion) {
      return cpOk({ kind: "stale" as const });
    }
    if (
      current.state !== "claimed" ||
      current.claimToken !== input.claimToken
    ) {
      return cpOk({ kind: "rejected" as const });
    }
    const next = detachRecord({
      storeVersion: current.storeVersion + 1,
      intent: current.intent,
      state: "completed",
      claimToken: null,
      claimedAtMs: current.claimedAtMs,
      completedAtMs: input.nowMs,
      idempotencyKey: current.idempotencyKey,
    });
    this.byCleanupId.set(input.cleanupId, next);
    return cpOk({ kind: "completed" as const, record: detachRecord(next) });
  }

  async resolveWithoutDelete(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
    readonly disposition: HeadlessArtifactCleanupNoDeleteDisposition;
  }) {
    if (this.testingFailResolveWithoutDelete) {
      return cpFail("INTERNAL_ERROR", "forced resolveWithoutDelete failure");
    }
    if (
      input.disposition !== "protected" &&
      input.disposition !== "rejected"
    ) {
      return cpFail("HOSTILE_INPUT", "Cleanup disposition rejected.");
    }
    const current = this.byCleanupId.get(input.cleanupId);
    if (!current || current.intent.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
    }
    if (isHeadlessArtifactCleanupTerminalState(current.state)) {
      if (current.state === input.disposition) {
        return cpOk({
          kind: "already_terminal" as const,
          record: detachRecord(current),
        });
      }
      return cpOk({ kind: "rejected" as const });
    }
    if (current.storeVersion !== input.expectedStoreVersion) {
      return cpOk({ kind: "stale" as const });
    }
    if (
      current.state !== "claimed" ||
      current.claimToken !== input.claimToken
    ) {
      return cpOk({ kind: "rejected" as const });
    }
    const next = detachRecord({
      storeVersion: current.storeVersion + 1,
      intent: current.intent,
      state: input.disposition,
      claimToken: null,
      claimedAtMs: current.claimedAtMs,
      completedAtMs: input.nowMs,
      idempotencyKey: current.idempotencyKey,
    });
    this.byCleanupId.set(input.cleanupId, next);
    return cpOk({ kind: "resolved" as const, record: detachRecord(next) });
  }

  async failClaim(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
  }) {
    if (this.testingFailFailClaim) {
      return cpFail("INTERNAL_ERROR", "forced failClaim failure");
    }
    const current = this.byCleanupId.get(input.cleanupId);
    if (!current || current.intent.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
    }
    if (isHeadlessArtifactCleanupTerminalState(current.state)) {
      return cpOk({
        kind: "already_terminal" as const,
        record: detachRecord(current),
      });
    }
    if (current.storeVersion !== input.expectedStoreVersion) {
      return cpOk({ kind: "stale" as const });
    }
    if (
      current.state !== "claimed" ||
      current.claimToken !== input.claimToken
    ) {
      return cpOk({ kind: "rejected" as const });
    }
    const next = detachRecord({
      storeVersion: current.storeVersion + 1,
      intent: current.intent,
      state: "pending",
      claimToken: null,
      claimedAtMs: null,
      completedAtMs: null,
      idempotencyKey: current.idempotencyKey,
    });
    this.byCleanupId.set(input.cleanupId, next);
    return cpOk({ kind: "pending" as const, record: detachRecord(next) });
  }

  async listRetryableForOwner(ownerId: string) {
    const out: HeadlessStoredCleanupIntent[] = [];
    for (const r of this.byCleanupId.values()) {
      if (
        r.intent.ownerId === ownerId &&
        (r.state === "pending" || r.state === "claimed")
      ) {
        out.push(detachRecord(r));
      }
    }
    return cpOk(Object.freeze(out) as readonly HeadlessStoredCleanupIntent[]);
  }
}
