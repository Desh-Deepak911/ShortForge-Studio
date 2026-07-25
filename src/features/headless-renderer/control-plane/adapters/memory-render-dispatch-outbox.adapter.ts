/**
 * In-memory render-dispatch outbox — test/QA only.
 */

import {
  headlessDispatchBackoffMs,
  type HeadlessStoredRenderDispatchOutbox,
} from "../types/render-dispatch-outbox";
import type {
  HeadlessEnsureDispatchIntentInput,
  HeadlessRenderDispatchOutboxPort,
} from "../ports/render-dispatch-outbox.port";
import { validateHeadlessStoredRenderDispatchOutbox } from "../services/validate-render-dispatch-outbox";
import { cpFail, cpOk } from "../types/control-plane.types";
import { HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION } from "../types/render-dispatch-outbox";

function detach(
  record: HeadlessStoredRenderDispatchOutbox,
): HeadlessStoredRenderDispatchOutbox {
  const validated = validateHeadlessStoredRenderDispatchOutbox(record);
  if (!validated.ok) {
    throw new Error(validated.message);
  }
  return validated.record;
}

export class MemoryHeadlessRenderDispatchOutboxAdapter
  implements HeadlessRenderDispatchOutboxPort
{
  private readonly byId = new Map<string, HeadlessStoredRenderDispatchOutbox>();
  private forceNextReleaseStale = false;
  private forceNextRejectStale = false;
  private forceNextMarkDispatchedStale = false;
  private forceNextEnsureFailure = false;

  /** Test-only: next releaseWithBackoff returns stale (CAS not confirmed). */
  testingForceNextReleaseStale(): void {
    this.forceNextReleaseStale = true;
  }

  /** Test-only: next reject returns stale (CAS not confirmed). */
  testingForceNextRejectStale(): void {
    this.forceNextRejectStale = true;
  }

  /** Test-only: next markDispatched returns stale after broker success. */
  testingForceNextMarkDispatchedStale(): void {
    this.forceNextMarkDispatchedStale = true;
  }

  /** Test-only: next ensure/upsert fails (promotion rollback). */
  testingForceNextEnsureFailure(): void {
    this.forceNextEnsureFailure = true;
  }

  /**
   * Test-only: replace/seed a row without revalidation.
   * Used for hostile delivery/attempt mismatch fixtures only.
   */
  testingUnsafeSeed(record: HeadlessStoredRenderDispatchOutbox): void {
    this.byId.set(record.intent.dispatchId, structuredClone(record));
  }

  /** Test-only: remove a row by dispatch id. */
  testingUnsafeDelete(dispatchId: string): void {
    this.byId.delete(dispatchId);
  }

  /** Test hook — shared atomic insert used by memory job-store promote. */
  testingUpsertPendingAtomic(
    input: HeadlessEnsureDispatchIntentInput,
  ):
    | { readonly ok: true; readonly kind: "created" | "existing"; readonly record: HeadlessStoredRenderDispatchOutbox }
    | { readonly ok: false; readonly message: string } {
    if (this.forceNextEnsureFailure) {
      this.forceNextEnsureFailure = false;
      return { ok: false, message: "Dispatch outbox ensure failed." };
    }
    const dispatchId = input.deliveryId;
    const existing = this.byId.get(dispatchId);
    if (existing) {
      if (
        existing.intent.jobId !== input.jobId ||
        existing.intent.attempt !== input.attempt ||
        existing.intent.ownerId !== input.ownerId ||
        existing.intent.deliveryId !== input.deliveryId
      ) {
        return { ok: false, message: "Divergent dispatch identity rejected." };
      }
      return { ok: true, kind: "existing", record: detach(existing) };
    }
    // Also reject same job+attempt under different deliveryId.
    for (const row of this.byId.values()) {
      if (
        row.intent.jobId === input.jobId &&
        row.intent.attempt === input.attempt
      ) {
        if (row.intent.deliveryId !== input.deliveryId) {
          return { ok: false, message: "Divergent dispatch identity rejected." };
        }
        return { ok: true, kind: "existing", record: detach(row) };
      }
    }
    const record: HeadlessStoredRenderDispatchOutbox = {
      intent: {
        version: HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
        dispatchId,
        jobId: input.jobId,
        attempt: input.attempt,
        ownerId: input.ownerId,
        projectId: input.projectId,
        deliveryId: input.deliveryId,
        createdAtMs: input.nowMs,
      },
      state: "pending",
      claimToken: null,
      claimedAtMs: null,
      retryCount: 0,
      nextAttemptAtMs: input.nowMs,
      storeVersion: 1,
      updatedAtMs: input.nowMs,
      dispatchedAtMs: null,
      rejectReasonId: null,
    };
    const validated = validateHeadlessStoredRenderDispatchOutbox(record);
    if (!validated.ok) return validated;
    this.byId.set(dispatchId, validated.record);
    return { ok: true, kind: "created", record: detach(validated.record) };
  }

  async ensurePending(input: HeadlessEnsureDispatchIntentInput) {
    const result = this.testingUpsertPendingAtomic(input);
    if (!result.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", result.message);
    }
    return cpOk({ kind: result.kind, record: result.record });
  }

  async getByDispatchIdAndOwner(dispatchId: string, ownerId: string) {
    const row = this.byId.get(dispatchId);
    if (!row || row.intent.ownerId !== ownerId) {
      return cpFail("JOB_NOT_FOUND", "Dispatch intent not found.");
    }
    // Do not revalidate on read — write paths remain validated; hostile
    // test seeds must be readable for CAS truthfulness fixtures.
    return cpOk(structuredClone(row));
  }

  async getByJobAttemptAndOwner(input: {
    readonly jobId: string;
    readonly attempt: number;
    readonly ownerId: string;
  }) {
    for (const row of this.byId.values()) {
      if (
        row.intent.jobId === input.jobId &&
        row.intent.attempt === input.attempt &&
        row.intent.ownerId === input.ownerId
      ) {
        return cpOk(structuredClone(row));
      }
    }
    return cpOk(null);
  }

  async listDuePending(input: { readonly limit: number; readonly nowMs: number }) {
    if (
      typeof input.limit !== "number" ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 1000
    ) {
      return cpFail("INVALID_TRANSPORT", "Outbox list limit is invalid.");
    }
    const due: HeadlessStoredRenderDispatchOutbox[] = [];
    const sorted = [...this.byId.values()].sort(
      (a, b) => a.nextAttemptAtMs - b.nextAttemptAtMs,
    );
    for (const row of sorted) {
      if (row.state !== "pending") continue;
      if (row.nextAttemptAtMs > input.nowMs) continue;
      due.push(detach(row));
      if (due.length >= input.limit) break;
    }
    return cpOk(due);
  }

  async claimDue(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly nowMs: number;
    readonly claimLeaseMs: number;
  }) {
    const row = this.byId.get(input.dispatchId);
    if (!row || row.intent.ownerId !== input.ownerId) {
      return cpOk({ kind: "rejected" as const });
    }
    if (row.state === "dispatched" || row.state === "rejected") {
      return cpOk({ kind: "already_terminal" as const, record: detach(row) });
    }
    if (row.state === "claimed") {
      if (
        row.claimedAtMs != null &&
        row.claimedAtMs + input.claimLeaseMs > input.nowMs
      ) {
        return cpOk({ kind: "rejected" as const });
      }
      // expired claim — reclaim
    } else if (row.state === "pending") {
      if (row.nextAttemptAtMs > input.nowMs) {
        return cpOk({ kind: "rejected" as const });
      }
    } else {
      return cpOk({ kind: "rejected" as const });
    }

    const next: HeadlessStoredRenderDispatchOutbox = {
      ...row,
      state: "claimed",
      claimToken: input.claimToken,
      claimedAtMs: input.nowMs,
      storeVersion: row.storeVersion + 1,
      updatedAtMs: input.nowMs,
      dispatchedAtMs: null,
      rejectReasonId: null,
    };
    const validated = validateHeadlessStoredRenderDispatchOutbox(next);
    if (!validated.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }
    this.byId.set(input.dispatchId, validated.record);
    return cpOk({ kind: "claimed" as const, record: detach(validated.record) });
  }

  async markDispatched(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }) {
    if (this.forceNextMarkDispatchedStale) {
      this.forceNextMarkDispatchedStale = false;
      return cpOk({ kind: "stale" as const });
    }
    const row = this.byId.get(input.dispatchId);
    if (!row || row.intent.ownerId !== input.ownerId) {
      return cpOk({ kind: "rejected" as const });
    }
    if (row.state === "dispatched" || row.state === "rejected") {
      return cpOk({ kind: "already_terminal" as const, record: detach(row) });
    }
    if (
      row.state !== "claimed" ||
      row.claimToken !== input.claimToken ||
      row.storeVersion !== input.expectedStoreVersion
    ) {
      return cpOk({ kind: "stale" as const });
    }
    const next: HeadlessStoredRenderDispatchOutbox = {
      ...row,
      state: "dispatched",
      claimToken: null,
      claimedAtMs: null,
      dispatchedAtMs: input.nowMs,
      storeVersion: row.storeVersion + 1,
      updatedAtMs: input.nowMs,
      rejectReasonId: null,
    };
    const validated = validateHeadlessStoredRenderDispatchOutbox(next);
    if (!validated.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }
    this.byId.set(input.dispatchId, validated.record);
    return cpOk({
      kind: "dispatched" as const,
      record: detach(validated.record),
    });
  }

  async releaseWithBackoff(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }) {
    if (this.forceNextReleaseStale) {
      this.forceNextReleaseStale = false;
      return cpOk({ kind: "stale" as const });
    }
    const row = this.byId.get(input.dispatchId);
    if (!row || row.intent.ownerId !== input.ownerId) {
      return cpOk({ kind: "rejected" as const });
    }
    if (row.state === "dispatched" || row.state === "rejected") {
      return cpOk({ kind: "already_terminal" as const, record: detach(row) });
    }
    if (
      row.state !== "claimed" ||
      row.claimToken !== input.claimToken ||
      row.storeVersion !== input.expectedStoreVersion
    ) {
      return cpOk({ kind: "stale" as const });
    }
    const retryCount = row.retryCount + 1;
    const next: HeadlessStoredRenderDispatchOutbox = {
      ...row,
      state: "pending",
      claimToken: null,
      claimedAtMs: null,
      retryCount,
      nextAttemptAtMs: input.nowMs + headlessDispatchBackoffMs(retryCount),
      storeVersion: row.storeVersion + 1,
      updatedAtMs: input.nowMs,
      dispatchedAtMs: null,
      rejectReasonId: null,
    };
    const validated = validateHeadlessStoredRenderDispatchOutbox(next);
    if (!validated.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }
    this.byId.set(input.dispatchId, validated.record);
    return cpOk({ kind: "pending" as const, record: detach(validated.record) });
  }

  async reject(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
    readonly reasonId: import("../types/render-dispatch-outbox").HeadlessRenderDispatchRejectReasonId;
  }) {
    if (this.forceNextRejectStale) {
      this.forceNextRejectStale = false;
      return cpOk({ kind: "stale" as const });
    }
    const row = this.byId.get(input.dispatchId);
    if (!row || row.intent.ownerId !== input.ownerId) {
      return cpOk({
        kind: "stale" as const,
      });
    }
    if (row.state === "dispatched" || row.state === "rejected") {
      return cpOk({ kind: "already_terminal" as const, record: detach(row) });
    }
    if (
      row.state !== "claimed" ||
      row.claimToken !== input.claimToken ||
      row.storeVersion !== input.expectedStoreVersion
    ) {
      return cpOk({ kind: "stale" as const });
    }
    const next: HeadlessStoredRenderDispatchOutbox = {
      ...row,
      state: "rejected",
      claimToken: null,
      claimedAtMs: null,
      dispatchedAtMs: null,
      rejectReasonId: input.reasonId,
      storeVersion: row.storeVersion + 1,
      updatedAtMs: input.nowMs,
    };
    const validated = validateHeadlessStoredRenderDispatchOutbox(next);
    if (!validated.ok) {
      // DELIVERY_MISMATCH intentionally terminates hostile delivery identities
      // that fail the stable-form validator — still durably record rejection.
      if (input.reasonId === "DELIVERY_MISMATCH") {
        const stored = structuredClone(next);
        this.byId.set(input.dispatchId, stored);
        return cpOk({ kind: "rejected" as const, record: structuredClone(stored) });
      }
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }
    this.byId.set(input.dispatchId, validated.record);
    return cpOk({ kind: "rejected" as const, record: detach(validated.record) });
  }
}
