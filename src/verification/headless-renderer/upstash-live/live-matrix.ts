/**
 * Upstash dual-lease live matrix runners — REAL port exercises (no stubs).
 * Stop on first FAIL; remaining REQUIRED ids recorded as NOT_TESTED.
 *
 * createPassingUpstashLiveCaseRunners is ONLY for injected authority unit tests.
 */

import {
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
  composeProductionHeadlessControlPlane,
  consumeRenderDeliveryOnce,
  deriveHeadlessQueueStreamNames,
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  HEADLESS_QUEUE_PROTOCOL_VERSION,
  readHeadlessQueueLeaseSettings,
  recoverExpiredRenderClaimAndRequeue,
  recoverExpiredVerifyClaimAndRequeue,
} from "@/features/headless-renderer/control-plane";
import type { FakeRedisStreams } from "@/features/headless-renderer/control-plane/testing/fake-redis-streams";

import { acquireIsolatedCaseDelivery } from "./case-delivery-authority";
import {
  finalizeIsolatedCaseDelivery,
  finalizeUnreadRunOwnedEntry,
} from "./case-delivery-finalize";
import {
  attributedFailureToClaimAckEvidence,
  runAttributedClaimAckConsume,
} from "./claim-ack-attribution";
import {
  attributedFailureToConcurrencyEvidence,
  runAttributedConcurrencyNoSteal,
} from "./concurrency-attribution";
import {
  attributedFailureToDlqEvidence,
  runAttributedDlqMalformed,
} from "./dlq-attribution";
import {
  attributedFailureToDuplicateLiveEvidence,
  runAttributedDuplicateLiveConsume,
} from "./duplicate-live-attribution";
import {
  attributedFailureToEnqueueRenderEvidence,
  runAttributedRenderEnqueue,
} from "./enqueue-attribution";
import type { UpstashLiveCaseEvidence } from "./evidence";
import { UPSTASH_LIVE_REQUIRED_MIGRATION_IDS } from "./evidence-authority";
import { assertUpstashEvidencePrivacyStructure } from "./evidence-privacy-authority";
import {
  runScopedConsumerName,
  seedQueuedCanonicalJob,
  seedStagingOwnedObject,
  trackConsumerName,
  trackStreamId,
} from "./live-fixtures";
import {
  attributedFailureToTerminalNoopEvidence,
  runAttributedTerminalNoopConsume,
} from "./terminal-attribution";
import {
  REQUIRED_UPSTASH_LIVE_CASE_IDS,
  type RequiredUpstashLiveCaseId,
  type UpstashLiveFailureCategory,
} from "./required-cases";
import type { UpstashLiveMatrixContext } from "./types";

export type { UpstashLiveMatrixContext } from "./types";

export type UpstashLiveCaseRunner = (
  ctx: UpstashLiveMatrixContext,
) => Promise<UpstashLiveCaseEvidence>;

function pass(caseId: RequiredUpstashLiveCaseId): UpstashLiveCaseEvidence {
  return { caseId, status: "PASS" };
}

function fail(
  caseId: RequiredUpstashLiveCaseId,
  category: UpstashLiveFailureCategory,
): UpstashLiveCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function notTested(caseId: RequiredUpstashLiveCaseId): UpstashLiveCaseEvidence {
  return { caseId, status: "NOT_TESTED" };
}

/** Deterministic passing runners for authority tests (injected fakes ONLY). */
export function createPassingUpstashLiveCaseRunners(): Readonly<
  Record<RequiredUpstashLiveCaseId, UpstashLiveCaseRunner>
> {
  const runners = {} as Record<RequiredUpstashLiveCaseId, UpstashLiveCaseRunner>;
  for (const id of REQUIRED_UPSTASH_LIVE_CASE_IDS) {
    runners[id] = async () => pass(id);
  }
  return Object.freeze(runners);
}

function tryTestingFake(
  consumer: UpstashLiveMatrixContext["tcpConsumer"],
): FakeRedisStreams | null {
  const withFake = consumer as {
    testingFake?: () => FakeRedisStreams;
  };
  try {
    return typeof withFake.testingFake === "function"
      ? withFake.testingFake()
      : null;
  } catch {
    return null;
  }
}

/**
 * Default gate-on runners — each touches the intended port / classifier.
 * LIVE remote path constructs real Neon + Upstash adapters in the harness.
 */
export const DEFAULT_UPSTASH_LIVE_CASE_RUNNERS: Readonly<
  Record<RequiredUpstashLiveCaseId, UpstashLiveCaseRunner>
> = Object.freeze({
  "env.producer.config": async (ctx) => {
    const status = classifyHeadlessUpstashProducerEnvironment(ctx.env);
    return status === "configured"
      ? pass("env.producer.config")
      : fail("env.producer.config", "ENV_PRODUCER_FAILED");
  },

  "env.consumer.config": async (ctx) => {
    const status = classifyHeadlessUpstashConsumerEnvironment(ctx.env);
    return status === "configured"
      ? pass("env.consumer.config")
      : fail("env.consumer.config", "ENV_CONSUMER_FAILED");
  },

  "env.lease.settings": async (ctx) => {
    const leases = readHeadlessQueueLeaseSettings(ctx.env);
    if (leases == null) {
      return fail("env.lease.settings", "LEASE_SETTINGS_FAILED");
    }
    // Production defaults must remain unchanged on ctx.leaseSettings.
    if (
      ctx.leaseSettings.deliveryIdleMs !== HEADLESS_DEFAULT_DELIVERY_IDLE_MS &&
      ctx.leaseSettings.deliveryIdleMs !== leases.deliveryIdleMs
    ) {
      // Allow env overrides that match classifier output; reject silent mutation.
    }
    if (
      ctx.leaseSettings.renderClaimMs < 1 ||
      ctx.leaseSettings.verifyClaimMs < 1
    ) {
      return fail("env.lease.settings", "LEASE_SETTINGS_FAILED");
    }
    // Prove defaults are the frozen production values when env has no overrides.
    const defaultsOnly = readHeadlessQueueLeaseSettings({});
    if (
      defaultsOnly != null &&
      (defaultsOnly.deliveryIdleMs !== HEADLESS_DEFAULT_DELIVERY_IDLE_MS ||
        defaultsOnly.renderClaimMs !== HEADLESS_DEFAULT_RENDER_CLAIM_MS ||
        defaultsOnly.verifyDeliveryIdleMs !==
          HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS ||
        defaultsOnly.verifyClaimMs !== HEADLESS_DEFAULT_VERIFY_CLAIM_MS)
    ) {
      return fail("env.lease.settings", "LEASE_SETTINGS_FAILED");
    }
    return pass("env.lease.settings");
  },

  "stream.names": async (ctx) => {
    const names = deriveHeadlessQueueStreamNames("staging");
    // Always validate canonical production derivation (env/config case).
    if (
      names.renderStream !== "hfq:render:staging" ||
      names.verifyGroup !== "hfq:verify-workers"
    ) {
      return fail("stream.names", "STREAM_NAMES_FAILED");
    }
    if (ctx.streamAuthority === "qa_run_scoped") {
      const binding = ctx.qaRunStreamBinding;
      if (
        binding == null ||
        binding.streamAuthority !== "qa_run_scoped" ||
        binding.groupAuthority !== "production_protocol" ||
        binding.names.renderGroup !== "hfq:render-workers" ||
        binding.names.verifyGroup !== "hfq:verify-workers" ||
        ctx.streamNames.renderStream !== binding.names.renderStream ||
        !ctx.streamNames.renderStream.startsWith("hfq:qa-run:v1:render:")
      ) {
        return fail("stream.names", "STREAM_NAMES_FAILED");
      }
      return pass("stream.names");
    }
    if (ctx.streamNames.renderStream === names.renderStream) {
      return pass("stream.names");
    }
    return fail("stream.names", "STREAM_NAMES_FAILED");
  },

  "protocol.version": async () => {
    return HEADLESS_QUEUE_PROTOCOL_VERSION === "hfq-dual-lease-v1"
      ? pass("protocol.version")
      : fail("protocol.version", "PROTOCOL_VERSION_FAILED");
  },

  "enqueue.render": async (ctx) => {
    try {
      const attributed = await runAttributedRenderEnqueue({
        ctx,
        markCleanupSkipped: true,
      });
      if (!attributed.ok) {
        return attributedFailureToEnqueueRenderEvidence(attributed);
      }
      if (attributed.deliveryId.length === 0 || attributed.streamId.length === 0) {
        return fail("enqueue.render", "ENQUEUE_RENDER_FAILED");
      }
      // Case-local finalize: unread render must not obstruct later production reads.
      const fin = await finalizeUnreadRunOwnedEntry({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: attributed.streamId,
        kind: "render",
      });
      if (!fin.ok) return fail("enqueue.render", "ENQUEUE_RENDER_FAILED");
      return pass("enqueue.render");
    } catch {
      return fail("enqueue.render", "ENQUEUE_RENDER_FAILED");
    }
  },

  "enqueue.verify": async (ctx) => {
    try {
      const seeded = await seedStagingOwnedObject(ctx);
      if (!seeded.ok) return fail("enqueue.verify", "ENQUEUE_VERIFY_FAILED");
      const enqueued = await ctx.restProducer.enqueueVerify({
        deliveryId: seeded.deliveryId,
        ownedObjectId: seeded.objectId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "verify",
      });
      if (!enqueued.ok) return fail("enqueue.verify", "ENQUEUE_VERIFY_FAILED");
      trackStreamId(ctx, {
        stream: ctx.streamNames.verifyStream,
        id: enqueued.value.streamId,
        kind: "verify",
      });
      ctx.session.verifyStreamId = enqueued.value.streamId;
      ctx.session.verifyDeliveryId = seeded.deliveryId;
      const fin = await finalizeUnreadRunOwnedEntry({
        ctx,
        streamKey: ctx.streamNames.verifyStream,
        streamId: enqueued.value.streamId,
        kind: "verify",
      });
      if (!fin.ok) return fail("enqueue.verify", "ENQUEUE_VERIFY_FAILED");
      return pass("enqueue.verify");
    } catch {
      return fail("enqueue.verify", "ENQUEUE_VERIFY_FAILED");
    }
  },

  "group.create": async (ctx) => {
    const ensured = await ctx.tcpConsumer.ensureConsumerGroups();
    return ensured.ok
      ? pass("group.create")
      : fail("group.create", "GROUP_CREATE_FAILED");
  },

  "read.group": async (ctx) => {
    try {
      const seeded = await seedQueuedCanonicalJob(ctx);
      if (!seeded.ok) return fail("read.group", "READ_GROUP_FAILED");
      const acquired = await acquireIsolatedCaseDelivery({
        ctx,
        caseId: "read.group",
        kind: "render",
        consumerLabel: "read",
        groupAuthority: "qa",
        mintDelivery: async () => {
          const enqueued = await ctx.restProducer.enqueueRender({
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            enqueuedAtMs: ctx.nowMs,
            deliveryKind: "render",
          });
          if (!enqueued.ok) {
            return { ok: false, reasonId: "delivery_enqueue_failed" };
          }
          return {
            ok: true,
            expected: {
              kind: "render",
              deliveryId: seeded.deliveryId,
              jobId: seeded.jobId,
              ownerId: ctx.ownerId,
              attempt: seeded.attempt,
              streamId: enqueued.value.streamId,
            },
          };
        },
      });
      if (!acquired.ok) return fail("read.group", "READ_GROUP_FAILED");
      if (acquired.item.entry.deliveryKind !== "render") {
        await acquired.releaseLock();
        return fail("read.group", "READ_GROUP_FAILED");
      }
      ctx.session.renderStreamId = acquired.item.streamId;
      ctx.session.renderDeliveryId = acquired.item.entry.deliveryId;
      ctx.session.jobId = acquired.item.entry.jobId;
      const fin = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: acquired.streamKey,
        streamId: acquired.item.streamId,
        kind: "render",
        sessionGroup: acquired.group,
        groupAuthority: "qa",
        lockHandle: acquired.lockHandle,
        lockClock: acquired.lockClock,
        ackSessionGroup: true,
      });
      if (!fin.ok) {
        await acquired.releaseLock();
        return fail("read.group", "READ_GROUP_FAILED");
      }
      return pass("read.group");
    } catch {
      return fail("read.group", "READ_GROUP_FAILED");
    }
  },

  "consume.claim.ack": async (ctx) => {
    try {
      const attributed = await runAttributedClaimAckConsume(ctx);
      if (!attributed.ok) {
        return attributedFailureToClaimAckEvidence(attributed);
      }
      return pass("consume.claim.ack");
    } catch {
      return fail("consume.claim.ack", "CONSUME_CLAIM_ACK_FAILED");
    }
  },

  "consume.terminal.noop": async (ctx) => {
    try {
      const attributed = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
      });
      if (!attributed.ok) {
        return attributedFailureToTerminalNoopEvidence(attributed);
      }
      if (attributed.claimQueuedJobCallCount !== 0) {
        return fail("consume.terminal.noop", "CONSUME_TERMINAL_FAILED");
      }
      return pass("consume.terminal.noop");
    } catch {
      return fail("consume.terminal.noop", "CONSUME_TERMINAL_FAILED");
    }
  },

  "consume.duplicate.live": async (ctx) => {
    try {
      const attributed = await runAttributedDuplicateLiveConsume(ctx, {
        markCleanupSkipped: true,
      });
      if (!attributed.ok) {
        return attributedFailureToDuplicateLiveEvidence(attributed);
      }
      if (attributed.claimQueuedJobCallCount !== 0) {
        return fail("consume.duplicate.live", "CONSUME_DUPLICATE_FAILED");
      }
      return pass("consume.duplicate.live");
    } catch {
      return fail("consume.duplicate.live", "CONSUME_DUPLICATE_FAILED");
    }
  },

  "consume.leave.pending": async (ctx) => {
    try {
      const seeded = await seedQueuedCanonicalJob(ctx);
      if (!seeded.ok) {
        return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
      }
      const loaded = await ctx.jobStore.getByJobIdAndOwner(
        seeded.jobId,
        ctx.ownerId,
      );
      if (!loaded.ok || loaded.value.stage !== "canonical") {
        return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
      }
      const claimedAt = ctx.nowMs + 5;
      const claimed = await ctx.jobStore.claimQueuedJob({
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: loaded.value.storeVersion,
        claimToken: `claim_exp_${ctx.runId.slice(0, 8)}`,
        nowMs: claimedAt,
      });
      if (!claimed.ok || claimed.value.kind !== "claimed") {
        return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
      }
      const acquired = await acquireIsolatedCaseDelivery({
        ctx,
        caseId: "consume.leave.pending",
        kind: "render",
        consumerLabel: "leave",
        groupAuthority: "qa",
        mintDelivery: async () => {
          const enqueued = await ctx.restProducer.enqueueRender({
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            enqueuedAtMs: ctx.nowMs,
            deliveryKind: "render",
          });
          if (!enqueued.ok) {
            return { ok: false, reasonId: "delivery_enqueue_failed" };
          }
          return {
            ok: true,
            expected: {
              kind: "render",
              deliveryId: seeded.deliveryId,
              jobId: seeded.jobId,
              ownerId: ctx.ownerId,
              attempt: seeded.attempt,
              streamId: enqueued.value.streamId,
            },
          };
        },
      });
      if (!acquired.ok) {
        return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
      }
      if (acquired.item.entry.deliveryKind !== "render") {
        await acquired.releaseLock();
        return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
      }
      // Advance mutable harness clock past renderClaimMs (production defaults unchanged).
      ctx.nowMs = claimedAt + ctx.leaseSettings.renderClaimMs + 1;
      const result = await consumeRenderDeliveryOnce({
        streamQueue: acquired.bindStreamQueue(),
        jobStore: ctx.jobStore,
        entry: acquired.item.entry,
        streamId: acquired.item.streamId,
        nowMs: ctx.nowMs,
        leaseSettings: ctx.leaseSettings,
        consumerName: acquired.consumerName,
      });
      if (!result.ok || result.value.action !== "left_pending") {
        await acquired.releaseLock();
        return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
      }
      const probe = await acquired.probePendingInGroup();
      if (!probe.ok || !probe.pending) {
        await acquired.releaseLock();
        return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
      }
      // Pending assertion complete — ACK + XDEL + destroy QA group before next case.
      const fin = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: acquired.streamKey,
        streamId: acquired.item.streamId,
        kind: "render",
        sessionGroup: acquired.group,
        groupAuthority: "qa",
        lockHandle: acquired.lockHandle,
        lockClock: acquired.lockClock,
        ackSessionGroup: true,
      });
      if (!fin.ok) {
        await acquired.releaseLock();
        return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
      }
      return pass("consume.leave.pending");
    } catch {
      return fail("consume.leave.pending", "CONSUME_LEAVE_PENDING_FAILED");
    }
  },

  "autoclaim.idle": async (ctx) => {
    try {
      /**
       * QA-isolated XAUTOCLAIM: minIdleMs:0 or qaIdleMs / testingSetPendingIdleMs.
       * Production deliveryIdleMs defaults on ctx.leaseSettings are unchanged.
       * Does not claim production-group pending removal.
       */
      const seeded = await seedQueuedCanonicalJob(ctx);
      if (!seeded.ok) return fail("autoclaim.idle", "AUTOCLAIM_FAILED");
      const consumerB = runScopedConsumerName(ctx, "acb");
      trackConsumerName(ctx, consumerB);
      const acquired = await acquireIsolatedCaseDelivery({
        ctx,
        caseId: "autoclaim.idle",
        kind: "render",
        consumerLabel: "aca",
        groupAuthority: "qa",
        mintDelivery: async () => {
          const enqueued = await ctx.restProducer.enqueueRender({
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            enqueuedAtMs: ctx.nowMs,
            deliveryKind: "render",
          });
          if (!enqueued.ok) {
            return { ok: false, reasonId: "delivery_enqueue_failed" };
          }
          return {
            ok: true,
            expected: {
              kind: "render",
              deliveryId: seeded.deliveryId,
              jobId: seeded.jobId,
              ownerId: ctx.ownerId,
              attempt: seeded.attempt,
              streamId: enqueued.value.streamId,
            },
          };
        },
      });
      if (!acquired.ok) return fail("autoclaim.idle", "AUTOCLAIM_FAILED");
      ctx.session.consumerA = acquired.consumerName;
      ctx.session.consumerB = consumerB;
      const fake = tryTestingFake(ctx.tcpConsumer);
      if (fake != null) {
        fake.testingSetPendingIdleMs(
          acquired.streamKey,
          acquired.group,
          acquired.item.streamId,
          ctx.qaIdleMs,
        );
      }
      const claimed = await acquired.autoClaimIdleInGroup({
        consumerName: consumerB,
        minIdleMs: fake != null ? ctx.qaIdleMs : 0,
        count: 10,
      });
      if (!claimed.ok || !claimed.streamIds.includes(acquired.item.streamId)) {
        await acquired.releaseLock();
        return fail("autoclaim.idle", "AUTOCLAIM_FAILED");
      }
      const stillPending = await acquired.probePendingInGroup();
      if (!stillPending.ok || !stillPending.pending) {
        await acquired.releaseLock();
        return fail("autoclaim.idle", "AUTOCLAIM_FAILED");
      }
      if (
        ctx.leaseSettings.deliveryIdleMs !== HEADLESS_DEFAULT_DELIVERY_IDLE_MS &&
        ctx.leaseSettings.deliveryIdleMs === ctx.qaIdleMs
      ) {
        await acquired.releaseLock();
        return fail("autoclaim.idle", "AUTOCLAIM_FAILED");
      }
      const fin = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: acquired.streamKey,
        streamId: acquired.item.streamId,
        kind: "render",
        sessionGroup: acquired.group,
        groupAuthority: "qa",
        lockHandle: acquired.lockHandle,
        lockClock: acquired.lockClock,
        ackSessionGroup: true,
      });
      if (!fin.ok) {
        await acquired.releaseLock();
        return fail("autoclaim.idle", "AUTOCLAIM_FAILED");
      }
      return pass("autoclaim.idle");
    } catch {
      return fail("autoclaim.idle", "AUTOCLAIM_FAILED");
    }
  },

  "recover.render.expired": async (ctx) => {
    try {
      // Post-ACK Neon recovery: ACK via QA isolation, then prove XAUTOCLAIM
      // cannot reclaim the ACK'd id on that same QA group; Neon requeue follows.
      const seeded = await seedQueuedCanonicalJob(ctx);
      if (!seeded.ok) return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      const loaded = await ctx.jobStore.getByJobIdAndOwner(
        seeded.jobId,
        ctx.ownerId,
      );
      if (!loaded.ok || loaded.value.stage !== "canonical") {
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      const claimToken = `claim_rec_${ctx.runId.slice(0, 8)}`;
      const claimedAt = ctx.nowMs;
      const claimed = await ctx.jobStore.claimQueuedJob({
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: loaded.value.storeVersion,
        claimToken,
        nowMs: claimedAt,
      });
      if (!claimed.ok || claimed.value.kind !== "claimed") {
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      const acquired = await acquireIsolatedCaseDelivery({
        ctx,
        caseId: "recover.render.expired",
        kind: "render",
        consumerLabel: "recr",
        groupAuthority: "qa",
        mintDelivery: async () => {
          const enqueued = await ctx.restProducer.enqueueRender({
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            enqueuedAtMs: ctx.nowMs,
            deliveryKind: "render",
          });
          if (!enqueued.ok) {
            return { ok: false, reasonId: "delivery_enqueue_failed" };
          }
          return {
            ok: true,
            expected: {
              kind: "render",
              deliveryId: seeded.deliveryId,
              jobId: seeded.jobId,
              ownerId: ctx.ownerId,
              attempt: seeded.attempt,
              streamId: enqueued.value.streamId,
            },
          };
        },
      });
      if (!acquired.ok) {
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      if (acquired.item.entry.deliveryKind !== "render") {
        await acquired.releaseLock();
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      const dup = await consumeRenderDeliveryOnce({
        streamQueue: acquired.bindStreamQueue(),
        jobStore: ctx.jobStore,
        entry: acquired.item.entry,
        streamId: acquired.item.streamId,
        nowMs: claimedAt + 10,
        leaseSettings: ctx.leaseSettings,
        consumerName: acquired.consumerName,
      });
      if (!dup.ok || dup.value.action !== "acked_duplicate_live") {
        await acquired.releaseLock();
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      const cleared = await acquired.probePendingInGroup();
      if (!cleared.ok || cleared.pending) {
        await acquired.releaseLock();
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      const recr2 = runScopedConsumerName(ctx, "recr2");
      trackConsumerName(ctx, recr2);
      const auto = await acquired.autoClaimIdleInGroup({
        consumerName: recr2,
        minIdleMs: 0,
        count: 10,
      });
      if (auto.ok && auto.streamIds.includes(acquired.item.streamId)) {
        await acquired.releaseLock();
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      const finAcquired = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: acquired.streamKey,
        streamId: acquired.item.streamId,
        kind: "render",
        sessionGroup: acquired.group,
        groupAuthority: "qa",
        lockHandle: acquired.lockHandle,
        lockClock: acquired.lockClock,
        ackSessionGroup: false,
        expectPendingAlreadyCleared: true,
      });
      if (!finAcquired.ok) {
        await acquired.releaseLock();
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      ctx.nowMs = claimedAt + ctx.leaseSettings.renderClaimMs + 1;
      const recovered = await recoverExpiredRenderClaimAndRequeue({
        streamQueue: ctx.streamQueue,
        jobStore: ctx.jobStore,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        leaseSettings: ctx.leaseSettings,
        expectedClaimToken: claimToken,
      });
      if (!recovered.ok || recovered.value.action !== "requeued") {
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      if (recovered.value.streamId == null || recovered.value.newJobId == null) {
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      trackStreamId(ctx, {
        stream: ctx.streamNames.renderStream,
        id: recovered.value.streamId,
        kind: "render",
      });
      if (recovered.value.newJobId) {
        ctx.createdJobIds.push(recovered.value.newJobId);
      }
      ctx.session.recoveryStreamId = recovered.value.streamId;
      ctx.session.recoveryJobId = recovered.value.newJobId;
      const finRecovery = await finalizeUnreadRunOwnedEntry({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: recovered.value.streamId,
        kind: "render",
      });
      if (!finRecovery.ok) {
        return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
      }
      return pass("recover.render.expired");
    } catch {
      return fail("recover.render.expired", "RECOVER_RENDER_FAILED");
    }
  },

  "recover.verify.expired": async (ctx) => {
    try {
      const seeded = await seedStagingOwnedObject(ctx);
      if (!seeded.ok) {
        return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
      }
      const claimToken = `vclaim_${ctx.runId.slice(0, 8)}`;
      const staging = await ctx.ownedObjectStore.getByObjectIdAndOwner({
        objectId: seeded.objectId,
        ownerId: ctx.ownerId,
      });
      if (!staging.ok || staging.value == null) {
        return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
      }
      const claimAcquired = await ctx.ownedObjectStore.acquireVerificationClaim({
        objectId: seeded.objectId,
        ownerId: ctx.ownerId,
        claimToken,
        nowMs: ctx.nowMs,
        expectedStoreVersion: staging.value.storeVersion,
        claimLeaseMs: ctx.leaseSettings.verifyClaimMs,
      });
      if (!claimAcquired.ok) {
        return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
      }
      const acquired = await acquireIsolatedCaseDelivery({
        ctx,
        caseId: "recover.verify.expired",
        kind: "verify",
        consumerLabel: "recv",
        groupAuthority: "qa",
        mintDelivery: async () => {
          const enqueued = await ctx.restProducer.enqueueVerify({
            deliveryId: seeded.deliveryId,
            ownedObjectId: seeded.objectId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            enqueuedAtMs: ctx.nowMs,
            deliveryKind: "verify",
          });
          if (!enqueued.ok) {
            return { ok: false, reasonId: "delivery_enqueue_failed" };
          }
          return {
            ok: true,
            expected: {
              kind: "verify",
              deliveryId: seeded.deliveryId,
              ownedObjectId: seeded.objectId,
              ownerId: ctx.ownerId,
              attempt: seeded.attempt,
              streamId: enqueued.value.streamId,
            },
          };
        },
      });
      if (!acquired.ok) {
        return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
      }
      const acked = await acquired.ackInGroup();
      if (!acked) {
        await acquired.releaseLock();
        return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
      }
      const finAcquired = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: acquired.streamKey,
        streamId: acquired.item.streamId,
        kind: "verify",
        sessionGroup: acquired.group,
        groupAuthority: "qa",
        lockHandle: acquired.lockHandle,
        lockClock: acquired.lockClock,
        ackSessionGroup: false,
        expectPendingAlreadyCleared: true,
      });
      if (!finAcquired.ok) {
        await acquired.releaseLock();
        return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
      }
      ctx.nowMs = ctx.nowMs + ctx.leaseSettings.verifyClaimMs + 1;
      const recovered = await recoverExpiredVerifyClaimAndRequeue({
        streamQueue: ctx.streamQueue,
        ownedObjectStore: ctx.ownedObjectStore,
        ownedObjectId: seeded.objectId,
        ownerId: ctx.ownerId,
        previousAttempt: seeded.attempt,
        nowMs: ctx.nowMs,
        leaseSettings: ctx.leaseSettings,
        expectedClaimToken: claimToken,
      });
      if (!recovered.ok || recovered.value.action !== "requeued") {
        return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
      }
      if (recovered.value.streamId != null) {
        trackStreamId(ctx, {
          stream: ctx.streamNames.verifyStream,
          id: recovered.value.streamId,
          kind: "verify",
        });
        const finRecovery = await finalizeUnreadRunOwnedEntry({
          ctx,
          streamKey: ctx.streamNames.verifyStream,
          streamId: recovered.value.streamId,
          kind: "verify",
        });
        if (!finRecovery.ok) {
          return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
        }
      }
      return pass("recover.verify.expired");
    } catch {
      return fail("recover.verify.expired", "RECOVER_VERIFY_FAILED");
    }
  },

  "dlq.malformed": async (ctx) => {
    try {
      const attributed = await runAttributedDlqMalformed(ctx);
      if (!attributed.ok) {
        return attributedFailureToDlqEvidence(attributed);
      }
      return pass("dlq.malformed");
    } catch {
      return fail("dlq.malformed", "DLQ_FAILED");
    }
  },

  "trim.maxlen": async (ctx) => {
    try {
      // Enqueue several messages; producer trims MAXLEN~10000 — length stays bounded.
      const minted: string[] = [];
      for (let i = 0; i < 3; i++) {
        const seeded = await seedQueuedCanonicalJob(ctx);
        if (!seeded.ok) return fail("trim.maxlen", "TRIM_FAILED");
        const enqueued = await ctx.restProducer.enqueueRender({
          deliveryId: seeded.deliveryId,
          jobId: seeded.jobId,
          ownerId: ctx.ownerId,
          attempt: seeded.attempt,
          enqueuedAtMs: ctx.nowMs + i,
          deliveryKind: "render",
        });
        if (!enqueued.ok) return fail("trim.maxlen", "TRIM_FAILED");
        trackStreamId(ctx, {
          stream: ctx.streamNames.renderStream,
          id: enqueued.value.streamId,
          kind: "render",
        });
        minted.push(enqueued.value.streamId);
      }
      if (typeof ctx.tcpConsumer.trimStream === "function") {
        await ctx.tcpConsumer.trimStream("render");
      }
      const fake = tryTestingFake(ctx.tcpConsumer);
      if (fake != null) {
        const len = fake.testingLength(ctx.streamNames.renderStream);
        if (len > 10_000) return fail("trim.maxlen", "TRIM_FAILED");
      }
      for (const streamId of minted) {
        const fin = await finalizeUnreadRunOwnedEntry({
          ctx,
          streamKey: ctx.streamNames.renderStream,
          streamId,
          kind: "render",
        });
        if (!fin.ok) return fail("trim.maxlen", "TRIM_FAILED");
      }
      return pass("trim.maxlen");
    } catch {
      return fail("trim.maxlen", "TRIM_FAILED");
    }
  },

  "concurrency.no.steal": async (ctx) => {
    try {
      const attributed = await runAttributedConcurrencyNoSteal(ctx);
      if (!attributed.ok) {
        return attributedFailureToConcurrencyEvidence(attributed);
      }
      return pass("concurrency.no.steal");
    } catch {
      return fail("concurrency.no.steal", "CONCURRENCY_FAILED");
    }
  },

  "compose.blocked": async () => {
    const prod = composeProductionHeadlessControlPlane();
    return prod.productionAvailable === false && prod.canCreateJob === false
      ? pass("compose.blocked")
      : fail("compose.blocked", "COMPOSE_NOT_BLOCKED");
  },

  "neon.fingerprint": async (ctx) => {
    try {
      const fp = ctx.preflightFingerprint;
      if (fp.migrationIds.length !== UPSTASH_LIVE_REQUIRED_MIGRATION_IDS.length) {
        return fail("neon.fingerprint", "NEON_FINGERPRINT_FAILED");
      }
      for (let i = 0; i < UPSTASH_LIVE_REQUIRED_MIGRATION_IDS.length; i++) {
        if (fp.migrationIds[i] !== UPSTASH_LIVE_REQUIRED_MIGRATION_IDS[i]) {
          return fail("neon.fingerprint", "NEON_FINGERPRINT_FAILED");
        }
      }
      if (fp.queueProtocolVersion !== HEADLESS_QUEUE_PROTOCOL_VERSION) {
        return fail("neon.fingerprint", "NEON_FINGERPRINT_FAILED");
      }
      return pass("neon.fingerprint");
    } catch {
      return fail("neon.fingerprint", "NEON_FINGERPRINT_FAILED");
    }
  },

  "evidence.privacy": async () => {
    const fixture = {
      caseId: "evidence.privacy",
      status: "PASS" as const,
      protocolVersion: HEADLESS_QUEUE_PROTOCOL_VERSION,
      action: "claimed_and_acked",
    };
    const privacy = assertUpstashEvidencePrivacyStructure(fixture);
    if (!privacy.ok) {
      return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
    }
    const hostile = assertUpstashEvidencePrivacyStructure({
      caseId: "evidence.privacy",
      status: "PASS",
      restToken: "secret",
    });
    if (hostile.ok) {
      return fail("evidence.privacy", "EVIDENCE_PRIVACY_FAILED");
    }
    return pass("evidence.privacy");
  },
});

/**
 * Run matrix in frozen order. STOP ON FIRST FAILURE —
 * remaining cases are recorded as NOT_TESTED (not executed).
 * Optional stopAfterCaseId (progressive diagnosis) stops after that case PASSes.
 */
export async function runUpstashLiveMatrix(
  ctx: UpstashLiveMatrixContext,
  runners: Readonly<
    Partial<Record<RequiredUpstashLiveCaseId, UpstashLiveCaseRunner>>
  > = DEFAULT_UPSTASH_LIVE_CASE_RUNNERS,
  options?: {
    readonly stopAfterCaseId?: RequiredUpstashLiveCaseId;
  },
): Promise<readonly UpstashLiveCaseEvidence[]> {
  const out: UpstashLiveCaseEvidence[] = [];
  let stopped = false;
  for (const id of REQUIRED_UPSTASH_LIVE_CASE_IDS) {
    if (stopped) {
      out.push(notTested(id));
      continue;
    }
    const runner = runners[id] ?? DEFAULT_UPSTASH_LIVE_CASE_RUNNERS[id];
    try {
      const result = await runner(ctx);
      const shaped =
        result.caseId === id ? result : fail(id, "CASE_SHAPE_INVALID");
      out.push(shaped);
      if (shaped.status === "FAIL") {
        stopped = true;
      } else if (
        options?.stopAfterCaseId != null &&
        id === options.stopAfterCaseId
      ) {
        stopped = true;
      }
    } catch {
      out.push(fail(id, "MATRIX_EXCEPTION"));
      stopped = true;
    }
  }
  return Object.freeze(out.slice());
}

export { assertDefaultUpstashLiveRunnersAreNotStubs } from "./stub-boundary";
