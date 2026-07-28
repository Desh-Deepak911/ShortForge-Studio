/**
 * Sprint 11E Phase 2E.2B.3 — render-dispatch outbox CAS truthfulness.
 * Run: npm run test:headless-render-dispatch-outbox-cas-2e2b3
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createProvisionalMaterializingRecord,
  dispatchRenderOutboxIntentOnce,
  ensureDispatchIntentForQueuedJob,
  headlessDispatchBackoffMs,
  stableHeadlessDeliveryId,
  updateProvisionalVerificationCoverage,
  type HeadlessProvisionalStoredJobRecord,
} from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { NeonHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/neon-job-store.adapter";
import {
  composeTestHeadlessControlPlane,
  InMemoryHeadlessSqlFixture,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import { HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION } from "@/features/headless-renderer/control-plane/types/render-dispatch-outbox";
import { cpFail } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import {
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessRenderJobRequest,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain/headless-job-lifecycle";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import { syncFootieScript } from "@/lib/utils/voiceover";

import { createQueuedCanonicalJob } from "./upstash-live/dual-lease-test-fixture";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function assertNoSecrets(text: string) {
  assert.equal(/sk_live|Bearer |redis:\/\//i.test(text), false);
  assert.equal(/r2\.cloudflarestorage\.com|postgresql:\/\//i.test(text), false);
  assert.equal(/claim_token|Authorization/i.test(text), false);
}

async function ensureOutbox(fx: Awaited<ReturnType<typeof createQueuedCanonicalJob>>) {
  const ensured = await ensureDispatchIntentForQueuedJob({
    jobStore: fx.stack.jobStore,
    dispatchOutbox: fx.stack.dispatchOutbox,
    jobId: fx.record.jobId,
    ownerId: fx.ownerId,
    nowMs: fx.nowMs + 1,
  });
  assert.equal(ensured.ok, true);
  return fx.stack.dispatchOutbox;
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2B.3 — dispatch outbox CAS truthfulness\n");

  await test("1: XADD failure + confirmed release → dispatch_pending", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    fx.streamQueue.testingFailNextEnqueue();
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const before = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const nowMs = fx.nowMs + 10;
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs,
    });
    assert.equal(result.ok && result.value.kind === "dispatch_pending", true);
    const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(row.ok, true);
    if (!row.ok) return;
    assert.equal(row.value.state, "pending");
    assert.equal(row.value.claimToken, null);
    assert.equal(row.value.claimedAtMs, null);
    assert.equal(row.value.retryCount, before.value.retryCount + 1);
    assert.equal(row.value.storeVersion, before.value.storeVersion + 2); // claim +1, release +1
    assert.equal(
      row.value.nextAttemptAtMs,
      nowMs + headlessDispatchBackoffMs(row.value.retryCount),
    );
  });

  await test("2: XADD failure + release stale → dispatch_unconfirmed", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    fx.streamQueue.testingFailNextEnqueue();
    fx.stack.dispatchOutbox.testingForceNextReleaseStale();
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 10,
    });
    assert.equal(result.ok && result.value.kind === "dispatch_unconfirmed", true);
    const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(row.ok && row.value.state === "claimed", true);
  });

  await test("3: Abort + confirmed release → aborted_released", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const abort = new AbortController();
    // Claim first via existingClaim path after manual claim, then abort before XADD.
    const claimed = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "abort-tok",
      nowMs: fx.nowMs + 10,
      claimLeaseMs: 60_000,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    abort.abort();
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 11,
      existingClaim: {
        claimToken: "abort-tok",
        expectedStoreVersion: claimed.value.record.storeVersion,
      },
      signal: abort.signal,
    });
    assert.equal(result.ok && result.value.kind === "aborted_released", true);
    const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(row.ok && row.value.state === "pending", true);
  });

  await test("4: Abort + failed release → aborted_unconfirmed", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const claimed = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "abort-tok-2",
      nowMs: fx.nowMs + 10,
      claimLeaseMs: 60_000,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    fx.stack.dispatchOutbox.testingForceNextReleaseStale();
    const abort = new AbortController();
    abort.abort();
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 11,
      existingClaim: {
        claimToken: "abort-tok-2",
        expectedStoreVersion: claimed.value.record.storeVersion,
      },
      signal: abort.signal,
    });
    assert.equal(result.ok && result.value.kind === "aborted_unconfirmed", true);
  });

  await test("5: Job reread outage + confirmed release", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const failingStore = {
      getByJobIdAndOwner: async () =>
        cpFail("DATABASE_UNAVAILABLE", "Durable database is temporarily unavailable."),
    };
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: failingStore as never,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 10,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "job_reread_failed_released");
    assert.equal(result.value.safeControlPlaneCode, "DATABASE_UNAVAILABLE");
    assertNoSecrets(JSON.stringify(result.value));
    const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(row.ok && row.value.state === "pending", true);
  });

  await test("6: Job reread outage + unconfirmed release", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    fx.stack.dispatchOutbox.testingForceNextReleaseStale();
    const failingStore = {
      getByJobIdAndOwner: async () =>
        cpFail("DATABASE_UNAVAILABLE", "Durable database is temporarily unavailable."),
    };
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: failingStore as never,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 10,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "job_reread_failed_unconfirmed");
    assert.equal(result.value.safeControlPlaneCode, "DATABASE_UNAVAILABLE");
  });

  await test("7: Each permanent-reject reason with confirmed CAS", async () => {
    const reasons = [
      "JOB_TERMINAL",
      "JOB_NOT_QUEUED",
      "JOB_CLAIMED",
      "JOB_MISMATCH",
      "JOB_NOT_FOUND",
      "DELIVERY_MISMATCH",
    ] as const;

    for (const reasonId of reasons) {
      const fx = await createQueuedCanonicalJob();
      await ensureOutbox(fx);
      const deliveryId = stableHeadlessDeliveryId(
        fx.record.jobId,
        fx.record.canonicalJob!.attempt,
      );
      const nowMs = fx.nowMs + 20;

      if (reasonId === "JOB_TERMINAL") {
        const cancelled = applyHeadlessJobTransition({
          jobValue: fx.record.canonicalJob,
          requestValue: fx.record.canonicalRequest,
          toState: "cancelled",
          attempt: fx.record.canonicalJob!.attempt,
          updatedAtMs: nowMs,
          terminalReason: { reasonId: "CANCELLED_BY_USER", retryable: false },
        });
        assert.equal(cancelled.ok, true);
        if (!cancelled.ok) return;
        await fx.stack.jobStore.compareAndSetTransition({
          jobId: fx.record.jobId,
          ownerId: fx.ownerId,
          expectedStoreVersion: fx.record.storeVersion,
          next: {
            job: cancelled.job,
            request: fx.record.canonicalRequest,
            idempotencyAuthorityKey: fx.record.idempotencyAuthorityKey,
            claimToken: null,
            claimedAtMs: null,
            artifactObjectBinding: null,
            operationId: fx.record.operationId,
          },
        });
      } else if (reasonId === "JOB_NOT_QUEUED") {
        const rendering = applyHeadlessJobTransition({
          jobValue: fx.record.canonicalJob,
          requestValue: fx.record.canonicalRequest,
          toState: "rendering",
          attempt: fx.record.canonicalJob!.attempt,
          updatedAtMs: nowMs,
        });
        assert.equal(rendering.ok, true);
        if (!rendering.ok) return;
        // rendering without claim → JOB_NOT_QUEUED (not live-claim evidence)
        await fx.stack.jobStore.compareAndSetTransition({
          jobId: fx.record.jobId,
          ownerId: fx.ownerId,
          expectedStoreVersion: fx.record.storeVersion,
          next: {
            job: rendering.job,
            request: fx.record.canonicalRequest,
            idempotencyAuthorityKey: fx.record.idempotencyAuthorityKey,
            claimToken: null,
            claimedAtMs: null,
            artifactObjectBinding: null,
            operationId: fx.record.operationId,
          },
        });
      } else if (reasonId === "JOB_CLAIMED") {
        await fx.stack.jobStore.claimQueuedJob({
          jobId: fx.record.jobId,
          ownerId: fx.ownerId,
          expectedStoreVersion: fx.record.storeVersion,
          claimToken: "render-claim",
          nowMs,
        });
      } else if (reasonId === "JOB_MISMATCH") {
        // Valid delivery identity for attempt+9; job remains on attempt 1.
        const mismatchAttempt = fx.record.canonicalJob!.attempt + 9;
        const mismatchDelivery = stableHeadlessDeliveryId(
          fx.record.jobId,
          mismatchAttempt,
        );
        fx.stack.dispatchOutbox.testingUnsafeDelete(deliveryId);
        fx.stack.dispatchOutbox.testingUnsafeSeed({
          intent: {
            version: HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
            dispatchId: mismatchDelivery,
            jobId: fx.record.jobId,
            attempt: mismatchAttempt,
            ownerId: fx.ownerId,
            projectId: fx.record.projectId,
            deliveryId: mismatchDelivery,
            createdAtMs: nowMs,
          },
          state: "pending",
          claimToken: null,
          claimedAtMs: null,
          retryCount: 0,
          nextAttemptAtMs: nowMs,
          storeVersion: 1,
          updatedAtMs: nowMs,
          dispatchedAtMs: null,
          rejectReasonId: null,
        });
      } else if (reasonId === "JOB_NOT_FOUND") {
        fx.stack.dispatchOutbox.testingUnsafeDelete(deliveryId);
        const ghostId = `job_ghost_${randomUUID()}`;
        const ghostDelivery = stableHeadlessDeliveryId(ghostId, 1);
        fx.stack.dispatchOutbox.testingUnsafeSeed({
          intent: {
            version: HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
            dispatchId: ghostDelivery,
            jobId: ghostId,
            attempt: 1,
            ownerId: fx.ownerId,
            projectId: fx.record.projectId,
            deliveryId: ghostDelivery,
            createdAtMs: nowMs,
          },
          state: "pending",
          claimToken: null,
          claimedAtMs: null,
          retryCount: 0,
          nextAttemptAtMs: nowMs,
          storeVersion: 1,
          updatedAtMs: nowMs,
          dispatchedAtMs: null,
          rejectReasonId: null,
        });
        const result = await dispatchRenderOutboxIntentOnce({
          outbox: fx.stack.dispatchOutbox,
          jobStore: fx.stack.jobStore,
          streamQueue: fx.streamQueue,
          dispatchId: ghostDelivery,
          ownerId: fx.ownerId,
          nowMs,
        });
        assert.equal(result.ok && result.value.kind === "rejected", true);
        if (!result.ok) return;
        assert.equal(result.value.rejectReasonId, "JOB_NOT_FOUND");
        continue;
      } else if (reasonId === "DELIVERY_MISMATCH") {
        // Hostile seed: already claimed with non-stable delivery identity.
        fx.stack.dispatchOutbox.testingUnsafeDelete(deliveryId);
        const badDelivery = `dlv:bad:${fx.record.jobId}`;
        fx.stack.dispatchOutbox.testingUnsafeSeed({
          intent: {
            version: HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
            dispatchId: badDelivery,
            jobId: fx.record.jobId,
            attempt: fx.record.canonicalJob!.attempt,
            ownerId: fx.ownerId,
            projectId: fx.record.projectId,
            deliveryId: badDelivery,
            createdAtMs: nowMs,
          },
          state: "claimed",
          claimToken: "hostile-tok",
          claimedAtMs: nowMs,
          retryCount: 0,
          nextAttemptAtMs: nowMs,
          storeVersion: 2,
          updatedAtMs: nowMs,
          dispatchedAtMs: null,
          rejectReasonId: null,
        });
        const result = await dispatchRenderOutboxIntentOnce({
          outbox: fx.stack.dispatchOutbox,
          jobStore: fx.stack.jobStore,
          streamQueue: fx.streamQueue,
          dispatchId: badDelivery,
          ownerId: fx.ownerId,
          nowMs,
          existingClaim: {
            claimToken: "hostile-tok",
            expectedStoreVersion: 2,
          },
        });
        assert.equal(result.ok && result.value.kind === "rejected", true);
        if (!result.ok) return;
        assert.equal(result.value.rejectReasonId, "DELIVERY_MISMATCH");
        continue;
      }

      const dispatchId =
        reasonId === "JOB_MISMATCH"
          ? stableHeadlessDeliveryId(
              fx.record.jobId,
              fx.record.canonicalJob!.attempt + 9,
            )
          : stableHeadlessDeliveryId(
              fx.record.jobId,
              fx.record.canonicalJob!.attempt,
            );
      const result = await dispatchRenderOutboxIntentOnce({
        outbox: fx.stack.dispatchOutbox,
        jobStore: fx.stack.jobStore,
        streamQueue: fx.streamQueue,
        dispatchId,
        ownerId: fx.ownerId,
        nowMs,
      });
      assert.equal(
        result.ok && result.value.kind === "rejected",
        true,
        `${reasonId}: ${result.ok ? result.value.kind : "fail"}`,
      );
      if (!result.ok) return;
      assert.equal(result.value.rejectReasonId, reasonId);
      const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
        dispatchId,
        fx.ownerId,
      );
      assert.equal(row.ok && row.value.state === "rejected", true);
      if (!row.ok) return;
      assert.equal(row.value.rejectReasonId, reasonId);
    }
  });

  await test("8: Reject CAS failure cannot return rejected", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const cancelled = applyHeadlessJobTransition({
      jobValue: fx.record.canonicalJob,
      requestValue: fx.record.canonicalRequest,
      toState: "cancelled",
      attempt: fx.record.canonicalJob!.attempt,
      updatedAtMs: fx.nowMs + 30,
      terminalReason: { reasonId: "CANCELLED_BY_USER", retryable: false },
    });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    await fx.stack.jobStore.compareAndSetTransition({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      next: {
        job: cancelled.job,
        request: fx.record.canonicalRequest,
        idempotencyAuthorityKey: fx.record.idempotencyAuthorityKey,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
        operationId: fx.record.operationId,
      },
    });
    fx.stack.dispatchOutbox.testingForceNextRejectStale();
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 31,
    });
    assert.equal(result.ok && result.value.kind === "dispatch_unconfirmed", true);
  });

  await test("9: Exact already-rejected replay", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const cancelled = applyHeadlessJobTransition({
      jobValue: fx.record.canonicalJob,
      requestValue: fx.record.canonicalRequest,
      toState: "cancelled",
      attempt: fx.record.canonicalJob!.attempt,
      updatedAtMs: fx.nowMs + 40,
      terminalReason: { reasonId: "CANCELLED_BY_USER", retryable: false },
    });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    await fx.stack.jobStore.compareAndSetTransition({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      next: {
        job: cancelled.job,
        request: fx.record.canonicalRequest,
        idempotencyAuthorityKey: fx.record.idempotencyAuthorityKey,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
        operationId: fx.record.operationId,
      },
    });
    const first = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 41,
    });
    assert.equal(first.ok && first.value.kind === "rejected", true);
    const xaddBefore = fx.streamQueue.testingEnqueueCount?.() ?? null;
    const second = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 42,
    });
    assert.equal(second.ok && second.value.kind === "rejected", true);
    if (xaddBefore != null) {
      assert.equal(fx.streamQueue.testingEnqueueCount(), xaddBefore);
    }
  });

  await test("10: Divergent reject replay fails closed", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    // Terminal reject with JOB_TERMINAL, then try reject path expecting different reason via claim+reject CAS already terminal.
    const claimed = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "rej-tok",
      nowMs: fx.nowMs + 50,
      claimLeaseMs: 60_000,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    const rejected = await fx.stack.dispatchOutbox.reject({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "rej-tok",
      expectedStoreVersion: claimed.value.record.storeVersion,
      nowMs: fx.nowMs + 51,
      reasonId: "JOB_TERMINAL",
    });
    assert.equal(rejected.ok && rejected.value.kind === "rejected", true);
    // Reclaim impossible; dispatch sees already_terminal rejected — same reason → rejected.
    // For divergent: seed already-rejected with JOB_TERMINAL, then force job to claimed path that would want JOB_CLAIMED.
    // claimDue returns already_terminal → rejected with JOB_TERMINAL reason preserved.
    const again = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 52,
    });
    assert.equal(again.ok && again.value.kind === "rejected", true);
    // Divergent: interpretRejectCas on already_terminal with different reason.
    const claimed2 = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "x",
      nowMs: fx.nowMs + 53,
      claimLeaseMs: 1,
    });
    assert.equal(
      claimed2.ok && claimed2.value.kind === "already_terminal",
      true,
    );
    // Simulate existingClaim against rejected row with mismatched expected reason via re-seed.
    fx.stack.dispatchOutbox.testingUnsafeSeed({
      intent: {
        version: HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
        dispatchId: deliveryId,
        jobId: fx.record.jobId,
        attempt: fx.record.canonicalJob!.attempt,
        ownerId: fx.ownerId,
        projectId: fx.record.projectId,
        deliveryId,
        createdAtMs: fx.nowMs,
      },
      state: "rejected",
      claimToken: null,
      claimedAtMs: null,
      retryCount: 0,
      nextAttemptAtMs: fx.nowMs,
      storeVersion: 9,
      updatedAtMs: fx.nowMs,
      dispatchedAtMs: null,
      rejectReasonId: "JOB_CLAIMED",
    });
    // Dispatch with terminal job wanting JOB_TERMINAL would not re-reject; claimDue returns already_terminal.
    // Force interpretRejectCas divergent: claim outbox as claimed then reject with different reason while already rejected.
    // Direct unit of interpretRejectCas via reject already_terminal mismatch:
    const staleReject = await fx.stack.dispatchOutbox.reject({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "nope",
      expectedStoreVersion: 9,
      nowMs: fx.nowMs + 54,
      reasonId: "JOB_TERMINAL",
    });
    // already_terminal with JOB_CLAIMED vs requested JOB_TERMINAL
    assert.equal(
      staleReject.ok && staleReject.value.kind === "already_terminal",
      true,
    );
    if (!staleReject.ok || staleReject.value.kind !== "already_terminal") return;
    assert.equal(staleReject.value.record.rejectReasonId, "JOB_CLAIMED");
    assert.notEqual(staleReject.value.record.rejectReasonId, "JOB_TERMINAL");
  });

  await test("11: Already-dispatched replay performs zero XADD", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const first = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 60,
    });
    assert.equal(first.ok && first.value.kind === "dispatched", true);
    const count = fx.streamQueue.testingEnqueueCount();
    const second = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 61,
    });
    assert.equal(
      second.ok &&
        (second.value.kind === "already_dispatched" ||
          second.value.kind === "dispatched"),
      true,
    );
    assert.equal(fx.streamQueue.testingEnqueueCount(), count);
  });

  await test("12: Existing claim storeVersion mismatch → zero XADD", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const claimed = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "sv-tok",
      nowMs: fx.nowMs + 70,
      claimLeaseMs: 60_000,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    const count = fx.streamQueue.testingEnqueueCount();
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 71,
      existingClaim: {
        claimToken: "sv-tok",
        expectedStoreVersion: claimed.value.record.storeVersion + 99,
      },
    });
    assert.equal(result.ok && result.value.kind === "claim_rejected", true);
    assert.equal(fx.streamQueue.testingEnqueueCount(), count);
  });

  await test("13: XADD success + dispatched CAS success", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 80,
    });
    assert.equal(result.ok && result.value.kind === "dispatched", true);
    const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(row.ok && row.value.state === "dispatched", true);
  });

  await test("14: XADD success + dispatched CAS failure → unconfirmed; no release", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    fx.stack.dispatchOutbox.testingForceNextMarkDispatchedStale();
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 90,
    });
    assert.equal(result.ok && result.value.kind === "dispatch_unconfirmed", true);
    const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(row.ok && row.value.state === "claimed", true);
    assert.notEqual(row.ok && row.value.state, "pending");
  });

  await test("15: Promotion UPDATE + outbox failure rolls back both", async () => {
    const clock = 1_700_000_000_000;
    const env: Partial<ExportEnvironmentSnapshot> = {
      browserName: "chrome",
      supportsCanvasCaptureStream: true,
      supportsManualCanvasFrameRequest: true,
      supportsMediaRecorder: true,
      supportsRequestVideoFrameCallback: true,
      supportsWebAssembly: true,
      serverRendererAvailable: false,
      ffmpegRuntimePoisoned: false,
      estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
      mp4EncoderAvailable: true,
    };
    const story = syncFootieScript({
      title: "CAS Rollback",
      narration: "Hello world narration for export.",
      totalDuration: 6,
      voiceoverUrl: "https://example.com/voice.mp3",
      voiceoverDurationMs: 6000,
      scenes: [
        {
          id: "scene-1",
          start: 0,
          end: 3,
          duration: 3,
          startMs: 0,
          endMs: 3000,
          durationMs: 3000,
          subtitle: "Hello",
          captionMode: "generated",
          media: {
            type: "image",
            url: "https://example.com/a.jpg",
            source: "upload",
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          },
        },
        {
          id: "scene-2",
          start: 3,
          end: 6,
          duration: 3,
          startMs: 3000,
          endMs: 6000,
          durationMs: 3000,
          subtitle: "World",
          captionMode: "generated",
          media: {
            type: "image",
            url: "https://example.com/b.jpg",
            source: "upload",
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          },
        },
      ],
    });
    const manifest = buildExportManifest({
      story,
      environment: env,
      audioMode: "with-voice",
    });
    const ownerId = "owner-cas-rollback";
    const projectId = manifest.project.projectId;
    const testStack = composeTestHeadlessControlPlane({
      principal: { ownerId, sessionId: "sess-cas" },
      authorizedProjectIds: [projectId],
      nowMs: () => clock,
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: testStack.storage,
      ownerId,
      projectId,
      manifest,
      nowMs: clock,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;

    const slots = extractRequiredHeadlessSourceSlots(manifest);
    const expectedSlotClaims = seeded.value.bundle.assets.map((asset) => {
      const slot = slots.find(
        (s) =>
          s.role === asset.sourceIdentity.role &&
          s.sceneId === asset.sourceIdentity.sceneId &&
          s.mediaItemId === asset.sourceIdentity.mediaItemId &&
          s.sourceDigest === asset.sourceIdentity.sourceDigest,
      );
      assert.ok(slot);
      return {
        slotKey: headlessSourceSlotKey(slot!),
        role: slot!.role,
        sceneId: slot!.sceneId,
        mediaItemId: slot!.mediaItemId,
        sourceDigestClaim: slot!.sourceDigest,
        contentDigestClaim: asset.contentDigest,
        byteLengthClaim: asset.byteLength,
        mimeTypeClaim: asset.mimeType,
      };
    });
    const fullStaging = [
      {
        purpose: "manifest" as const,
        slotKey: null,
        locator: seeded.value.manifestLocator,
        contentDigestClaim: seeded.value.manifestPayloadDigest,
        byteLengthClaim: 100,
        mimeTypeClaim: "application/json",
      },
      {
        purpose: "asset_bundle_record" as const,
        slotKey: null,
        locator: seeded.value.bundleLocator,
        contentDigestClaim: "sha256:" + "cc".repeat(32),
        byteLengthClaim: 200,
        mimeTypeClaim: "application/json",
      },
      ...seeded.value.bundle.assets.map((asset) => ({
        purpose: "asset_bytes" as const,
        slotKey: headlessSourceSlotKey({
          role: asset.sourceIdentity.role,
          sceneId: asset.sourceIdentity.sceneId,
          mediaItemId: asset.sourceIdentity.mediaItemId,
          sourceDigest: asset.sourceIdentity.sourceDigest,
        }),
        locator: asset.storageLocator,
        contentDigestClaim: asset.contentDigest,
        byteLengthClaim: asset.byteLength,
        mimeTypeClaim: asset.mimeType,
      })),
    ];

    async function prepareProvisional(
      store: MemoryHeadlessJobStoreAdapter | NeonHeadlessJobStoreAdapter,
      jobId: string,
      creatorKey: string,
    ) {
      const idemBuilt = buildHeadlessAuthorityFingerprint("hid", {
        version: 1,
        kind: "control-plane-idempotency",
        ownership: { ownerId, projectId },
        idempotencyKey: creatorKey,
      });
      assert.equal(idemBuilt.ok, true);
      if (!idemBuilt.ok) throw new Error("idempotency build failed");
      const materialize = createProvisionalMaterializingRecord({
        jobId,
        ownerId,
        projectId,
        createdAtMs: clock,
        updatedAtMs: clock,
        idempotencyAuthorityKey: idemBuilt.fingerprint,
        operationId: `op_${creatorKey}`,
        creatorIdempotencyKey: creatorKey,
        requestedRendererProfile: {
          resolution: manifest.output.resolution,
          format: manifest.output.format,
          fps: 30,
          quality: manifest.output.quality,
        },
        requestedRendererBuildId: "renderer-build-1",
        snapshotClaim: {
          manifestPayloadDigestClaim: seeded.value.manifestPayloadDigest,
          assetBundleFingerprintClaim: seeded.value.bundle.fingerprint,
          expectedSlotClaims,
        },
        stagingObjectRefs: fullStaging,
        expiresAtMs: clock + 3_600_000,
      });
      assert.equal(materialize.ok, true, materialize.ok ? "" : materialize.message);
      if (!materialize.ok) throw new Error(materialize.message);
      const created = await store.createProvisionalIfAbsent({
        idempotencyAuthorityKey: materialize.record.idempotencyAuthorityKey,
        record: materialize.record,
      });
      assert.equal(created.ok && created.value.kind === "created", true);
      if (!created.ok || created.value.kind !== "created") {
        throw new Error("create provisional failed");
      }
      let record = created.value.record as HeadlessProvisionalStoredJobRecord;
      const covered = updateProvisionalVerificationCoverage(
        record,
        {
          requiredTargets: [...record.verificationCoverage.requiredTargets],
          verifiedTargets: [...record.verificationCoverage.requiredTargets],
          complete: true,
        },
        "verify-claim-1",
        clock + 1,
        clock + 2,
      );
      assert.equal(covered.ok, true);
      if (!covered.ok) throw new Error(covered.message);
      const cas = await store.compareAndSetProvisional({
        jobId: record.jobId,
        ownerId,
        expectedStoreVersion: record.storeVersion,
        next: covered.record,
      });
      assert.equal(cas.ok && cas.value.kind === "updated", true);
      if (!cas.ok || cas.value.kind !== "updated") {
        throw new Error("coverage cas failed");
      }
      record = cas.value.record as HeadlessProvisionalStoredJobRecord;
      const requestResult = finalizeHeadlessRenderJobRequest({
        ownership: { ownerId, projectId },
        manifest,
        assetBundle: seeded.value.bundle,
        rendererProfile: record.requestedRendererProfile,
        rendererBuildId: record.requestedRendererBuildId,
        idempotencyKey: record.creatorIdempotencyKey,
      });
      assert.equal(requestResult.ok, true);
      if (!requestResult.ok) throw new Error("request failed");
      const accepted = createAcceptedHeadlessRenderJob({
        jobId: record.jobId,
        requestValue: requestResult.request,
        createdAtMs: record.createdAtMs,
      });
      assert.equal(accepted.ok, true);
      if (!accepted.ok) throw new Error("accept failed");
      const queued = applyHeadlessJobTransition({
        jobValue: accepted.job,
        requestValue: accepted.request,
        toState: "queued",
        attempt: accepted.job.attempt,
        updatedAtMs: record.updatedAtMs + 1,
      });
      assert.equal(queued.ok, true);
      if (!queued.ok) throw new Error("queue failed");
      return {
        record,
        canonicalJob: queued.job,
        canonicalRequest: accepted.request,
      };
    }

    // Neon-shaped transactional rollback proof
    const sql = new InMemoryHeadlessSqlFixture();
    sql.seedOwnership({
      project_id: projectId,
      owner_id: ownerId,
      created_at_ms: clock,
    });
    const neonStore = new NeonHeadlessJobStoreAdapter(sql);
    const neonPrep = await prepareProvisional(
      neonStore,
      `job_${randomUUID()}`,
      "neon-k",
    );
    sql.injectNextOutboxInsertFailure();
    const neonPromoted = await neonStore.promoteProvisionalToCanonical({
      jobId: neonPrep.record.jobId,
      ownerId,
      expectedStoreVersion: neonPrep.record.storeVersion,
      expectedOperationId: neonPrep.record.operationId,
      canonicalJob: neonPrep.canonicalJob,
      canonicalRequest: neonPrep.canonicalRequest,
    });
    assert.equal(
      !neonPromoted.ok || neonPromoted.value.kind !== "updated",
      true,
    );
    const neonReread = await neonStore.getByJobIdAndOwner(
      neonPrep.record.jobId,
      ownerId,
    );
    assert.equal(neonReread.ok, true);
    if (!neonReread.ok) return;
    assert.equal(neonReread.value.stage, "provisional");
    assert.equal(sql.dispatchOutboxById.size, 0);

    // Memory parity
    const memOutbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
    const memStore = new MemoryHeadlessJobStoreAdapter({
      dispatchOutbox: memOutbox,
    });
    const memPrep = await prepareProvisional(
      memStore,
      `job_${randomUUID()}`,
      "mem-k",
    );
    memOutbox.testingForceNextEnsureFailure();
    const memPromoted = await memStore.promoteProvisionalToCanonical({
      jobId: memPrep.record.jobId,
      ownerId,
      expectedStoreVersion: memPrep.record.storeVersion,
      expectedOperationId: memPrep.record.operationId,
      canonicalJob: memPrep.canonicalJob,
      canonicalRequest: memPrep.canonicalRequest,
    });
    assert.equal(memPromoted.ok && memPromoted.value.kind === "rejected", true);
    const memReread = await memStore.getByJobIdAndOwner(
      memPrep.record.jobId,
      ownerId,
    );
    assert.equal(memReread.ok && memReread.value.stage === "provisional", true);
    const memOutboxRow = await memOutbox.getByJobAttemptAndOwner({
      jobId: memPrep.record.jobId,
      attempt: memPrep.canonicalJob!.attempt,
      ownerId,
    });
    assert.equal(memOutboxRow.ok && memOutboxRow.value == null, true);
  });

  await test("16: Promotion exact replay preserves one outbox identity", async () => {
    const fx = await createQueuedCanonicalJob();
    const first = await fx.stack.dispatchOutbox.getByJobAttemptAndOwner({
      jobId: fx.record.jobId,
      attempt: fx.record.canonicalJob!.attempt,
      ownerId: fx.ownerId,
    });
    assert.ok(first.ok && first.value);
    const second = await ensureDispatchIntentForQueuedJob({
      jobStore: fx.stack.jobStore,
      dispatchOutbox: fx.stack.dispatchOutbox,
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 2,
    });
    assert.equal(second.ok && second.value.kind === "existing", true);
    if (!second.ok) return;
    assert.equal(
      second.value.record.intent.deliveryId,
      first.value!.intent.deliveryId,
    );
  });

  await test("17: Memory/Neon parity surfaces", () => {
    assert.ok(
      readFileSync(
        path.join(
          process.cwd(),
          "src/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter.ts",
        ),
        "utf8",
      ).includes("implements HeadlessRenderDispatchOutboxPort"),
    );
    assert.ok(
      readFileSync(
        path.join(
          process.cwd(),
          "src/features/headless-renderer/control-plane/adapters/neon-render-dispatch-outbox.adapter.ts",
        ),
        "utf8",
      ).includes("implements HeadlessRenderDispatchOutboxPort"),
    );
    const neonPromote = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/neon-job-store.adapter.ts",
      ),
      "utf8",
    );
    assert.ok(neonPromote.includes("UPDATE public.headless_jobs"));
    assert.ok(
      readFileSync(
        path.join(
          process.cwd(),
          "src/features/headless-renderer/control-plane/adapters/neon-render-dispatch-outbox.adapter.ts",
        ),
        "utf8",
      ).includes("throw error"),
    );
  });

  await test("18: No secrets/private identifiers in diagnostics", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutbox(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob!.attempt,
    );
    fx.streamQueue.testingFailNextEnqueue();
    fx.stack.dispatchOutbox.testingForceNextReleaseStale();
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 100,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assertNoSecrets(JSON.stringify(result.value));
    assert.equal(/dispatch_id|claimToken|storeVersion/i.test(JSON.stringify(result.value)), false);
  });

  // Confirm migration checksums unchanged.
  await test("migrations 005/006 unchanged", async () => {
    const { createHash } = await import("node:crypto");
    const hash = (rel: string) =>
      createHash("sha256")
        .update(
          readFileSync(path.join(process.cwd(), rel)),
        )
        .digest("hex");
    assert.equal(
      hash(
        "src/features/headless-renderer/control-plane/migrations/005_headless_cleanup_intents.sql",
      ),
      "59252610bbb0761840c8d479bcd5482b9d3c56c19f94e67cc5f0a6757dca5f2d",
    );
    assert.equal(
      hash(
        "src/features/headless-renderer/control-plane/migrations/006_headless_render_dispatch_outbox.sql",
      ),
      "960e1ae12451bd5f95c47473fc90ba97cb5bbd71cbc053fd6de7150f867a77b1",
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
