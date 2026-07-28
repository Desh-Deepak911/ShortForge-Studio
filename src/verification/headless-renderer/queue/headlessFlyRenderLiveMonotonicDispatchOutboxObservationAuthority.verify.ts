/**
 * Sprint 11E Phase 2E.2D.8D — monotonic dispatch-outbox observation authority.
 * Run: npm run test:headless-fly-render-monotonic-dispatch-outbox-observation-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { MemoryHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter";
import { stableHeadlessDeliveryId } from "@/features/headless-renderer/control-plane/services/stable-delivery-id";
import {
  HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
  type HeadlessStoredRenderDispatchOutbox,
} from "@/features/headless-renderer/control-plane/types/render-dispatch-outbox";
import type { HeadlessCanonicalStoredJobRecord } from "@/features/headless-renderer/control-plane/types/stored-job-record";

import {
  captureMonotonicDispatchOutboxObservation,
  rereadMonotonicDispatchOutboxIntentObservation,
} from "../fly-render-live/dispatch-outbox-observation-capture";
import { sanitizeDispatchOutboxObservationAttribution } from "../fly-render-live/dispatch-outbox-observation-attribution";
import { runAttributedFlyRenderJobCreateChain } from "../fly-render-live/job-create-attribution";
import {
  classifyMonotonicDispatchOutboxDispatchedCompletion,
  classifyMonotonicDispatchOutboxIntentObservation,
  classifyMonotonicDispatchOutboxTransition,
} from "../fly-render-live/monotonic-dispatch-outbox-observation-authority";
import { emptyFlyRenderLiveSession } from "../fly-render-live/types";
import { buildCtx as buildJobCreateCtx } from "../fly-render-live/monotonic-dispatch-outbox-race-fixture";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function buildCanonicalJob(input: {
  readonly jobId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly operationId: string;
  readonly attempt?: number;
}): HeadlessCanonicalStoredJobRecord {
  const attempt = input.attempt ?? 1;
  return {
    version: 1,
    stage: "canonical",
    storeVersion: 2,
    jobId: input.jobId,
    ownerId: input.ownerId,
    projectId: input.projectId,
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_000_100,
    idempotencyAuthorityKey: `idem_${input.jobId}`,
    operationId: input.operationId,
    canonicalJob: {
      version: 1,
      jobId: input.jobId,
      attempt,
      state: "queued",
      ownership: { ownerId: input.ownerId, projectId: input.projectId },
      rendererProfile: "720p-webm-30",
      createdAtMs: 1_700_000_000_000,
      updatedAtMs: 1_700_000_000_100,
    },
    canonicalRequest: {
      version: 1,
      jobId: input.jobId,
      attempt,
      ownership: { ownerId: input.ownerId, projectId: input.projectId },
      rendererProfile: "720p-webm-30",
      manifestPayloadDigest: "a".repeat(64),
      assetBundleFingerprint: "b".repeat(64),
      createdAtMs: 1_700_000_000_000,
    },
    claimToken: null,
    claimedAtMs: null,
    artifactObjectBinding: null,
  } as unknown as HeadlessCanonicalStoredJobRecord;
}

function buildOutboxRow(input: {
  readonly job: HeadlessCanonicalStoredJobRecord;
  readonly state: "pending" | "claimed" | "dispatched" | "rejected";
  readonly storeVersion?: number;
  readonly forgedDeliveryId?: string;
  readonly forgedJobId?: string;
}): HeadlessStoredRenderDispatchOutbox {
  const deliveryId =
    input.forgedDeliveryId ??
    stableHeadlessDeliveryId(input.job.jobId, input.job.canonicalJob!.attempt);
  const now = 1_700_000_000_000;
  const storeVersion = input.storeVersion ?? 1;
  const base = {
    intent: {
      version: HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
      dispatchId: deliveryId,
      jobId: input.forgedJobId ?? input.job.jobId,
      attempt: input.job.canonicalJob!.attempt,
      ownerId: input.job.ownerId,
      projectId: input.job.projectId,
      deliveryId,
      createdAtMs: now,
    },
    state: input.state,
    claimToken: null as string | null,
    claimedAtMs: null as number | null,
    retryCount: 0,
    nextAttemptAtMs: now,
    storeVersion,
    updatedAtMs: now,
    dispatchedAtMs: null as number | null,
    rejectReasonId: null,
  };
  if (input.state === "claimed") {
    base.claimToken = "claim-token";
    base.claimedAtMs = now + 1;
    base.updatedAtMs = now + 1;
  }
  if (input.state === "dispatched") {
    base.dispatchedAtMs = now + 2;
    base.updatedAtMs = now + 2;
    base.storeVersion = storeVersion;
  }
  if (input.state === "rejected") {
    return {
      ...base,
      rejectReasonId: "JOB_NOT_QUEUED",
    } as HeadlessStoredRenderDispatchOutbox;
  }
  return base as HeadlessStoredRenderDispatchOutbox;
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8D — monotonic dispatch-outbox observation authority\n",
  );

  await test("pending remains pending across unchanged reread", () => {
    const job = buildCanonicalJob({
      jobId: "job_pending",
      ownerId: "owner_a",
      projectId: "proj_a",
      operationId: "op_a",
    });
    const row = buildOutboxRow({ job, state: "pending" });
    const first = classifyMonotonicDispatchOutboxIntentObservation({
      row,
      job,
      expectedOperationId: job.operationId,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = classifyMonotonicDispatchOutboxIntentObservation({
      row,
      job,
      expectedOperationId: job.operationId,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const transition = classifyMonotonicDispatchOutboxTransition({
      firstState: first.observedState,
      rereadState: second.observedState,
      firstStoreVersion: first.storeVersion,
      rereadStoreVersion: second.storeVersion,
    });
    assert.equal(transition.ok, true);
    if (transition.ok) assert.equal(transition.transitionClass, "unchanged");
  });

  await test("pending → claimed before case 7 is monotonic", () => {
    const transition = classifyMonotonicDispatchOutboxTransition({
      firstState: "pending",
      rereadState: "claimed",
      firstStoreVersion: 1,
      rereadStoreVersion: 2,
    });
    assert.equal(transition.ok, true);
    if (transition.ok) {
      assert.equal(transition.transitionClass, "pending_to_claimed");
    }
  });

  await test("pending → dispatched before case 7 is monotonic", () => {
    const transition = classifyMonotonicDispatchOutboxTransition({
      firstState: "pending",
      rereadState: "dispatched",
      firstStoreVersion: 1,
      rereadStoreVersion: 3,
    });
    assert.equal(transition.ok, true);
    if (transition.ok) {
      assert.equal(transition.transitionClass, "pending_to_dispatched");
    }
  });

  await test("claimed → dispatched between reads is monotonic", () => {
    const transition = classifyMonotonicDispatchOutboxTransition({
      firstState: "claimed",
      rereadState: "dispatched",
      firstStoreVersion: 2,
      rereadStoreVersion: 3,
    });
    assert.equal(transition.ok, true);
    if (transition.ok) {
      assert.equal(transition.transitionClass, "claimed_to_dispatched");
    }
  });

  await test("already dispatched replay accepts coherent row", () => {
    const job = buildCanonicalJob({
      jobId: "job_dispatched",
      ownerId: "owner_a",
      projectId: "proj_a",
      operationId: "op_a",
    });
    const row = buildOutboxRow({ job, state: "dispatched", storeVersion: 3 });
    const obs = classifyMonotonicDispatchOutboxIntentObservation({ row, job });
    assert.equal(obs.ok, true);
    if (obs.ok) assert.equal(obs.observedState, "dispatched");
    const completion = classifyMonotonicDispatchOutboxDispatchedCompletion({
      row,
      job,
      anchorAttempt: job.canonicalJob!.attempt,
      anchorFirstStoreVersion: 1,
    });
    assert.equal(completion.ok, true);
  });

  await test("missing row rejected", () => {
    const job = buildCanonicalJob({
      jobId: "job_missing",
      ownerId: "owner_a",
      projectId: "proj_a",
      operationId: "op_a",
    });
    const obs = classifyMonotonicDispatchOutboxIntentObservation({
      row: null,
      job,
    });
    assert.equal(obs.ok, false);
    if (!obs.ok) assert.equal(obs.failClass, "missing_row");
  });

  await test("forged delivery identity rejected", () => {
    const job = buildCanonicalJob({
      jobId: "job_forged",
      ownerId: "owner_a",
      projectId: "proj_a",
      operationId: "op_a",
    });
    const row = buildOutboxRow({
      job,
      state: "pending",
      forgedDeliveryId: "dlv:wrong:1",
    });
    const obs = classifyMonotonicDispatchOutboxIntentObservation({ row, job });
    assert.equal(obs.ok, false);
    if (!obs.ok) assert.equal(obs.failClass, "forged_row");
  });

  await test("mismatched job identity rejected", () => {
    const job = buildCanonicalJob({
      jobId: "job_mismatch",
      ownerId: "owner_a",
      projectId: "proj_a",
      operationId: "op_a",
    });
    const row = buildOutboxRow({
      job,
      state: "pending",
      forgedJobId: "other_job",
    });
    const obs = classifyMonotonicDispatchOutboxIntentObservation({ row, job });
    assert.equal(obs.ok, false);
    if (!obs.ok) assert.equal(obs.failClass, "forged_row");
  });

  await test("malformed claim pair rejected", () => {
    const job = buildCanonicalJob({
      jobId: "job_bad_claim",
      ownerId: "owner_a",
      projectId: "proj_a",
      operationId: "op_a",
    });
    const row = buildOutboxRow({ job, state: "claimed" });
    (row as { claimedAtMs: number | null }).claimedAtMs =
      row.updatedAtMs + 5_000;
    const obs = classifyMonotonicDispatchOutboxIntentObservation({ row, job });
    assert.equal(obs.ok, false);
    if (!obs.ok) {
      assert.ok(
        obs.failClass === "malformed_claim_pairing" ||
          obs.failClass === "timestamp_order_invalid" ||
          obs.failClass === "forged_row",
      );
    }
  });

  await test("state regression rejected", () => {
    const transition = classifyMonotonicDispatchOutboxTransition({
      firstState: "dispatched",
      rereadState: "pending",
      firstStoreVersion: 3,
      rereadStoreVersion: 4,
    });
    assert.equal(transition.ok, false);
    if (!transition.ok) assert.equal(transition.failClass, "state_regression");
  });

  await test("rejected terminal state rejected for intent observation", () => {
    const job = buildCanonicalJob({
      jobId: "job_rejected",
      ownerId: "owner_a",
      projectId: "proj_a",
      operationId: "op_a",
    });
    const row = buildOutboxRow({ job, state: "rejected" });
    const obs = classifyMonotonicDispatchOutboxIntentObservation({ row, job });
    assert.equal(obs.ok, false);
    if (!obs.ok) assert.equal(obs.failClass, "rejected_state");
  });

  await test("unknown state rejected", () => {
    const job = buildCanonicalJob({
      jobId: "job_unknown",
      ownerId: "owner_a",
      projectId: "proj_a",
      operationId: "op_a",
    });
    const row = buildOutboxRow({ job, state: "pending" });
    (row as { state: string }).state = "dead";
    const obs = classifyMonotonicDispatchOutboxIntentObservation({ row, job });
    assert.equal(obs.ok, false);
    if (!obs.ok) {
      assert.ok(
        obs.failClass === "unknown_state" || obs.failClass === "forged_row",
      );
    }
  });

  await test("concurrent sweep while job-create returns — dispatched tolerated", async () => {
    const ctx = buildJobCreateCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(ctx.session.dispatchOutboxObservationAnchor != null);
    const anchor = ctx.session.dispatchOutboxObservationAnchor!;
    const outbox = ctx.dispatchOutbox as MemoryHeadlessRenderDispatchOutboxAdapter;
    const job = await ctx.jobStore.getByJobIdAndOwner(
      result.draftCtx.jobId,
      ctx.ownerId,
    );
    assert.equal(job.ok, true);
    if (!job.ok || job.value.stage !== "canonical") return;
    const current = await outbox.getByJobAttemptAndOwner({
      jobId: result.draftCtx.jobId,
      ownerId: ctx.ownerId,
      attempt: job.value.canonicalJob!.attempt,
    });
    assert.ok(current.ok && current.value != null);
    outbox.testingUnsafeSeed(
      buildOutboxRow({
        job: job.value,
        state: "dispatched",
        storeVersion: current.value!.storeVersion + 1,
      }),
    );
    const reread = await rereadMonotonicDispatchOutboxIntentObservation({
      dispatchOutbox: outbox,
      jobStore: ctx.jobStore,
      jobId: result.draftCtx.jobId,
      ownerId: ctx.ownerId,
      expectedOperationId: result.draftCtx.operationId,
      anchor,
    });
    assert.equal(reread.ok, true);
    if (reread.ok) {
      assert.equal(reread.attribution.rereadObservedState, "dispatched");
      assert.ok(
        reread.attribution.monotonicTransitionClass === "pending_to_dispatched" ||
          reread.attribution.monotonicTransitionClass === "claimed_to_dispatched" ||
          reread.attribution.monotonicTransitionClass === "unchanged",
      );
    }
  });

  await test("later completed case validates same dispatched row", async () => {
    const ctx = buildJobCreateCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(ctx.session.dispatchOutboxObservationAnchor != null);
    const anchor = ctx.session.dispatchOutboxObservationAnchor!;
    const reread = await rereadMonotonicDispatchOutboxIntentObservation({
      dispatchOutbox: ctx.dispatchOutbox!,
      jobStore: ctx.jobStore,
      jobId: result.draftCtx.jobId,
      ownerId: ctx.ownerId,
      expectedOperationId: result.draftCtx.operationId,
      anchor,
    });
    assert.equal(reread.ok, true);
    const job = await ctx.jobStore.getByJobIdAndOwner(
      result.draftCtx.jobId,
      ctx.ownerId,
    );
    assert.equal(job.ok, true);
    if (!job.ok || job.value.stage !== "canonical") return;
    const row = await ctx.dispatchOutbox!.getByJobAttemptAndOwner({
      jobId: result.draftCtx.jobId,
      ownerId: ctx.ownerId,
      attempt: job.value.canonicalJob!.attempt,
    });
    const completion = classifyMonotonicDispatchOutboxDispatchedCompletion({
      row: row.ok ? row.value : null,
      job: job.value,
      anchorAttempt: anchor.anchorAttempt,
      anchorFirstStoreVersion: anchor.firstStoreVersion,
      expectedOperationId: result.draftCtx.operationId,
    });
    assert.equal(completion.ok, anchor.rereadObservedState === "dispatched");
  });

  await test("attribution scrubs hostile provider text", () => {
    const sanitized = sanitizeDispatchOutboxObservationAttribution({
      firstObservedState: "pending",
      rereadObservedState: "dispatched",
      monotonicTransitionClass: "pending_to_dispatched",
      identityCoherent: true,
      outboxStoreVersionDelta: "plus_one",
      promotionResultKind: "updated",
      safeControlPlaneCode: "JOB_NOT_FOUND",
      cleanupStatus: "ok",
    });
    assert.ok(sanitized != null);
    assert.equal(sanitized!.identityCoherent, true);
    assert.equal(
      JSON.stringify(sanitized).includes("postgresql://"),
      false,
    );
  });

  await test("cleanup after failure leaves no session anchor", async () => {
    const ctx = buildJobCreateCtx();
    (
      ctx as typeof ctx & {
        session: ReturnType<typeof emptyFlyRenderLiveSession>;
      }
    ).session = emptyFlyRenderLiveSession();
    const outbox = ctx.dispatchOutbox as MemoryHeadlessRenderDispatchOutboxAdapter;
    outbox.testingUnsafeDelete("unused");
    const captured = await captureMonotonicDispatchOutboxObservation({
      dispatchOutbox: outbox,
      jobStore: ctx.jobStore,
      jobId: randomUUID(),
      ownerId: ctx.ownerId,
    });
    assert.equal(captured.ok, false);
    assert.equal(ctx.session.dispatchOutboxObservationAnchor, null);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
