/**
 * Sprint 11E Phase 2D.1G.1 — DLQ ACK truthfulness (render + verify parity).
 * Run: npm run test:headless-upstash-dlq-ack-truthfulness
 *
 * No provider contact.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  consumeRenderDeliveryOnce,
  consumeVerifyDeliveryOnce,
  cpFail,
  createDualLeaseDlqAckObservation,
  deriveHeadlessQueueStreamNames,
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  stableHeadlessDeliveryId,
  stableHeadlessVerifyDeliveryId,
} from "@/features/headless-renderer/control-plane";
import {
  createFakeUpstashRestClient,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { composeQaRunScopedHarnessPorts } from "./upstash-live/compose-qa-run-scoped-ports";
import { createGroupBoundStreamQueue } from "./upstash-live/group-bound-stream-queue";
import {
  DLQ_ATTRIBUTION_REASON_IDS,
  DLQ_ATTRIBUTION_STAGE_IDS,
} from "./upstash-live/dlq-attribution";
import { createQaRunScopedTcpDlqWriter } from "./upstash-live/qa-run-scoped-dlq";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const LEASES = Object.freeze({
  deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
});

async function scopedPorts(runId = randomUUID()) {
  const stream = new MemoryHeadlessStreamQueueAdapter({
    envName: "staging",
    nowMs: () => 1_700_000_000_000,
  });
  await stream.ensureConsumerGroups();
  const restClient = createFakeUpstashRestClient(stream.testingFake());
  const scoped = await composeQaRunScopedHarnessPorts({
    envName: "staging",
    runId,
    redis: stream,
    restClient,
  });
  assert.ok(scoped != null);
  return { stream, scoped: scoped! };
}

async function enqueueAndReadRender(input: {
  readonly stream: MemoryHeadlessStreamQueueAdapter;
  readonly scoped: NonNullable<
    Awaited<ReturnType<typeof composeQaRunScopedHarnessPorts>>
  >;
  readonly ownerId: string;
  readonly group: string;
}) {
  const jobId = "job_missing_for_dlq";
  const deliveryId = stableHeadlessDeliveryId(jobId, 1);
  const enq = await input.scoped.restProducer.enqueueRender({
    deliveryId,
    jobId,
    ownerId: input.ownerId,
    attempt: 1,
    enqueuedAtMs: 1_700_000_000_000,
    deliveryKind: "render",
  });
  assert.equal(enq.ok, true);
  if (!enq.ok) throw new Error("enqueue failed");
  await input.stream.qaXgroupCreate({
    streamKey: input.scoped.binding.names.renderStream,
    group: input.group,
    id: "0",
    mkstream: true,
  });
  const read = await input.stream.qaXreadGroupInGroup({
    streamKey: input.scoped.binding.names.renderStream,
    group: input.group,
    consumerName: "c1",
    count: 1,
    blockMs: 1,
  });
  assert.equal(read.ok && read.items.length === 1, true);
  if (!read.ok) throw new Error("read failed");
  return {
    jobId,
    deliveryId,
    streamId: enq.value.streamId,
    entry: {
      deliveryId,
      jobId,
      ownerId: input.ownerId,
      attempt: 1,
      enqueuedAtMs: 1_700_000_000_000,
      deliveryKind: "render" as const,
    },
  };
}

async function enqueueAndReadVerify(input: {
  readonly stream: MemoryHeadlessStreamQueueAdapter;
  readonly scoped: NonNullable<
    Awaited<ReturnType<typeof composeQaRunScopedHarnessPorts>>
  >;
  readonly ownerId: string;
  readonly group: string;
}) {
  const ownedObjectId = "obj_missing_for_dlq";
  const deliveryId = stableHeadlessVerifyDeliveryId(ownedObjectId, 1);
  const enq = await input.scoped.restProducer.enqueueVerify({
    deliveryId,
    ownedObjectId,
    ownerId: input.ownerId,
    attempt: 1,
    enqueuedAtMs: 1_700_000_000_000,
    deliveryKind: "verify",
  });
  assert.equal(enq.ok, true);
  if (!enq.ok) throw new Error("enqueue failed");
  await input.stream.qaXgroupCreate({
    streamKey: input.scoped.binding.names.verifyStream,
    group: input.group,
    id: "0",
    mkstream: true,
  });
  const read = await input.stream.qaXreadGroupInGroup({
    streamKey: input.scoped.binding.names.verifyStream,
    group: input.group,
    consumerName: "c1",
    count: 1,
    blockMs: 1,
  });
  assert.equal(read.ok && read.items.length === 1, true);
  if (!read.ok) throw new Error("read failed");
  return {
    ownedObjectId,
    deliveryId,
    streamId: enq.value.streamId,
    entry: {
      deliveryId,
      ownedObjectId,
      ownerId: input.ownerId,
      attempt: 1,
      enqueuedAtMs: 1_700_000_000_000,
      deliveryKind: "verify" as const,
    },
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1G.1 — DLQ ACK truthfulness (render/verify)\n",
  );

  await test(
    "render: DLQ write + ACK success → dlq_acked; pending cleared",
    async () => {
      const { stream, scoped } = await scopedPorts();
      const ownerId = "owner_r1";
      const group = "uq_case_dlq_ack_ok_r";
      const minted = await enqueueAndReadRender({
        stream,
        scoped,
        ownerId,
        group,
      });
      const bound = createGroupBoundStreamQueue({
        restProducer: scoped.restProducer,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: group,
        streamKey: scoped.binding.names.renderStream,
        kind: "render",
        expected: {
          deliveryId: minted.deliveryId,
          jobId: minted.jobId,
          ownerId,
          attempt: 1,
          streamId: minted.streamId,
        },
        dlqAuthority: "qa_run_scoped",
        qaRunScopedDlqWriter: scoped.dlqWriter,
      });
      const obs = createDualLeaseDlqAckObservation();
      const result = await consumeRenderDeliveryOnce({
        streamQueue: bound,
        jobStore: new MemoryHeadlessJobStoreAdapter(),
        entry: minted.entry,
        streamId: minted.streamId,
        nowMs: 1_700_000_000_010,
        leaseSettings: LEASES,
        consumerName: "c1",
        qaDlqAckObservation: obs,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.action, "dlq_acked");
      assert.equal(obs.dlqWrite, "succeeded");
      assert.equal(obs.sourceAck, "succeeded");
      const pending = await stream.qaProbePendingInGroup(
        scoped.binding.names.renderStream,
        group,
        minted.streamId,
      );
      assert.equal(pending.ok && pending.pending === false, true);
      const shared = deriveHeadlessQueueStreamNames("staging");
      assert.equal(stream.testingFake().testingLength(shared.renderDlq), 0);
      assert.equal(
        stream.testingFake().testingLength(scoped.binding.names.renderDlq) >= 1,
        true,
      );
    },
  );

  await test(
    "verify: DLQ write + ACK success → dlq_acked; pending cleared",
    async () => {
      const { stream, scoped } = await scopedPorts();
      const ownerId = "owner_v1";
      const group = "uq_case_dlq_ack_ok_v";
      const minted = await enqueueAndReadVerify({
        stream,
        scoped,
        ownerId,
        group,
      });
      const bound = createGroupBoundStreamQueue({
        restProducer: scoped.restProducer,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: group,
        streamKey: scoped.binding.names.verifyStream,
        kind: "verify",
        expected: {
          kind: "verify",
          deliveryId: minted.deliveryId,
          ownedObjectId: minted.ownedObjectId,
          ownerId,
          attempt: 1,
          streamId: minted.streamId,
        },
        dlqAuthority: "qa_run_scoped",
        qaRunScopedDlqWriter: scoped.dlqWriter,
      });
      const obs = createDualLeaseDlqAckObservation();
      const result = await consumeVerifyDeliveryOnce({
        streamQueue: bound,
        ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
        entry: minted.entry,
        streamId: minted.streamId,
        nowMs: 1_700_000_000_010,
        leaseSettings: LEASES,
        consumerName: "c1",
        qaDlqAckObservation: obs,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.action, "dlq_acked");
      assert.equal(obs.dlqWrite, "succeeded");
      assert.equal(obs.sourceAck, "succeeded");
      const pending = await stream.qaProbePendingInGroup(
        scoped.binding.names.verifyStream,
        group,
        minted.streamId,
      );
      assert.equal(pending.ok && pending.pending === false, true);
    },
  );

  await test(
    "render: DLQ write failure → no ACK; observation called_failed",
    async () => {
      const { stream, scoped } = await scopedPorts();
      const ownerId = "owner_r2";
      const group = "uq_case_dlq_fail_r";
      const minted = await enqueueAndReadRender({
        stream,
        scoped,
        ownerId,
        group,
      });
      let ackCalls = 0;
      const failingWriter = createQaRunScopedTcpDlqWriter({
        redis: stream,
        binding: scoped.binding,
      });
      assert.ok(failingWriter != null);
      if (failingWriter == null) return;
      failingWriter.xaddDlq = (async () =>
        cpFail("INTERNAL_ERROR", "forced DLQ write failure")) as never;
      failingWriter.moveToDlq = ((i: never) => failingWriter.xaddDlq(i)) as never;
      const bound = createGroupBoundStreamQueue({
        restProducer: scoped.restProducer,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: group,
        streamKey: scoped.binding.names.renderStream,
        kind: "render",
        expected: {
          deliveryId: minted.deliveryId,
          jobId: minted.jobId,
          ownerId,
          attempt: 1,
          streamId: minted.streamId,
        },
        dlqAuthority: "qa_run_scoped",
        qaRunScopedDlqWriter: failingWriter,
        onProductionAck: () => {
          ackCalls += 1;
        },
      });
      // Count ACK via wrapper — QA path uses qaXackInGroup.
      const origAck = stream.qaXackInGroup.bind(stream);
      stream.qaXackInGroup = async (...args) => {
        ackCalls += 1;
        return origAck(...args);
      };
      const obs = createDualLeaseDlqAckObservation();
      const result = await consumeRenderDeliveryOnce({
        streamQueue: bound,
        jobStore: new MemoryHeadlessJobStoreAdapter(),
        entry: minted.entry,
        streamId: minted.streamId,
        nowMs: 1_700_000_000_010,
        leaseSettings: LEASES,
        consumerName: "c1",
        qaDlqAckObservation: obs,
      });
      assert.equal(result.ok, false);
      assert.equal(obs.dlqWrite, "called_failed");
      assert.equal(obs.sourceAck, "not_attempted");
      assert.equal(ackCalls, 0);
      const pending = await stream.qaProbePendingInGroup(
        scoped.binding.names.renderStream,
        group,
        minted.streamId,
      );
      assert.equal(pending.ok && pending.pending === true, true);
    },
  );

  await test(
    "verify: DLQ write failure → no ACK; observation called_failed",
    async () => {
      const { stream, scoped } = await scopedPorts();
      const ownerId = "owner_v2";
      const group = "uq_case_dlq_fail_v";
      const minted = await enqueueAndReadVerify({
        stream,
        scoped,
        ownerId,
        group,
      });
      let ackCalls = 0;
      const failingWriter = createQaRunScopedTcpDlqWriter({
        redis: stream,
        binding: scoped.binding,
      });
      assert.ok(failingWriter != null);
      if (failingWriter == null) return;
      failingWriter.xaddDlq = (async () =>
        cpFail("INTERNAL_ERROR", "forced DLQ write failure")) as never;
      failingWriter.moveToDlq = ((i: never) => failingWriter.xaddDlq(i)) as never;
      const bound = createGroupBoundStreamQueue({
        restProducer: scoped.restProducer,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: group,
        streamKey: scoped.binding.names.verifyStream,
        kind: "verify",
        expected: {
          kind: "verify",
          deliveryId: minted.deliveryId,
          ownedObjectId: minted.ownedObjectId,
          ownerId,
          attempt: 1,
          streamId: minted.streamId,
        },
        dlqAuthority: "qa_run_scoped",
        qaRunScopedDlqWriter: failingWriter,
      });
      const origAck = stream.qaXackInGroup.bind(stream);
      stream.qaXackInGroup = async (...args) => {
        ackCalls += 1;
        return origAck(...args);
      };
      const obs = createDualLeaseDlqAckObservation();
      const result = await consumeVerifyDeliveryOnce({
        streamQueue: bound,
        ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
        entry: minted.entry,
        streamId: minted.streamId,
        nowMs: 1_700_000_000_010,
        leaseSettings: LEASES,
        consumerName: "c1",
        qaDlqAckObservation: obs,
      });
      assert.equal(result.ok, false);
      assert.equal(obs.dlqWrite, "called_failed");
      assert.equal(obs.sourceAck, "not_attempted");
      assert.equal(ackCalls, 0);
    },
  );

  await test(
    "render: DLQ success + ACK failure → dlq_written_ack_pending; pending true",
    async () => {
      const { stream, scoped } = await scopedPorts();
      const ownerId = "owner_r3";
      const group = "uq_case_dlq_ack_fail_r";
      const minted = await enqueueAndReadRender({
        stream,
        scoped,
        ownerId,
        group,
      });
      // Fail group-bound ACK path: force qaXackInGroup false after DLQ.
      let ackAttempts = 0;
      stream.qaXackInGroup = async () => {
        ackAttempts += 1;
        return false;
      };
      const bound = createGroupBoundStreamQueue({
        restProducer: scoped.restProducer,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: group,
        streamKey: scoped.binding.names.renderStream,
        kind: "render",
        expected: {
          deliveryId: minted.deliveryId,
          jobId: minted.jobId,
          ownerId,
          attempt: 1,
          streamId: minted.streamId,
        },
        dlqAuthority: "qa_run_scoped",
        qaRunScopedDlqWriter: scoped.dlqWriter,
      });
      const obs = createDualLeaseDlqAckObservation();
      const result = await consumeRenderDeliveryOnce({
        streamQueue: bound,
        jobStore: new MemoryHeadlessJobStoreAdapter(),
        entry: minted.entry,
        streamId: minted.streamId,
        nowMs: 1_700_000_000_010,
        leaseSettings: LEASES,
        consumerName: "c1",
        qaDlqAckObservation: obs,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.action, "dlq_written_ack_pending");
      assert.equal(obs.dlqWrite, "succeeded");
      assert.equal(obs.sourceAck, "called_failed");
      assert.equal(ackAttempts >= 1, true);
      const pending = await stream.qaProbePendingInGroup(
        scoped.binding.names.renderStream,
        group,
        minted.streamId,
      );
      assert.equal(pending.ok && pending.pending === true, true);
      // DLQ write already happened (at-least-once; not exactly-once).
      assert.equal(
        stream.testingFake().testingLength(scoped.binding.names.renderDlq) >= 1,
        true,
      );
    },
  );

  await test(
    "verify: DLQ success + ACK failure → dlq_written_ack_pending; pending true",
    async () => {
      const { stream, scoped } = await scopedPorts();
      const ownerId = "owner_v3";
      const group = "uq_case_dlq_ack_fail_v";
      const minted = await enqueueAndReadVerify({
        stream,
        scoped,
        ownerId,
        group,
      });
      stream.qaXackInGroup = async () => false;
      const bound = createGroupBoundStreamQueue({
        restProducer: scoped.restProducer,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: group,
        streamKey: scoped.binding.names.verifyStream,
        kind: "verify",
        expected: {
          kind: "verify",
          deliveryId: minted.deliveryId,
          ownedObjectId: minted.ownedObjectId,
          ownerId,
          attempt: 1,
          streamId: minted.streamId,
        },
        dlqAuthority: "qa_run_scoped",
        qaRunScopedDlqWriter: scoped.dlqWriter,
      });
      const obs = createDualLeaseDlqAckObservation();
      const result = await consumeVerifyDeliveryOnce({
        streamQueue: bound,
        ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
        entry: minted.entry,
        streamId: minted.streamId,
        nowMs: 1_700_000_000_010,
        leaseSettings: LEASES,
        consumerName: "c1",
        qaDlqAckObservation: obs,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.action, "dlq_written_ack_pending");
      assert.equal(obs.dlqWrite, "succeeded");
      assert.equal(obs.sourceAck, "called_failed");
      const pending = await stream.qaProbePendingInGroup(
        scoped.binding.names.verifyStream,
        group,
        minted.streamId,
      );
      assert.equal(pending.ok && pending.pending === true, true);
    },
  );

  await test(
    "attribution reasons include pending-clear authority; never invent exactly-once",
    () => {
      assert.ok(DLQ_ATTRIBUTION_REASON_IDS.includes("dlq_tcp_xadd_failed"));
      assert.ok(DLQ_ATTRIBUTION_REASON_IDS.includes("source_ack_failed"));
      assert.ok(
        DLQ_ATTRIBUTION_REASON_IDS.includes("source_pending_not_cleared"),
      );
      assert.ok(
        DLQ_ATTRIBUTION_REASON_IDS.includes("source_pending_probe_failed"),
      );
      assert.ok(DLQ_ATTRIBUTION_STAGE_IDS.indexOf("dlq_tcp_xadd") <
        DLQ_ATTRIBUTION_STAGE_IDS.indexOf("source_ack"));
      // Bounded retry policy: ACK-pending leaves source pending → redelivery
      // may duplicate DLQ under at-least-once (documented; not exactly-once).
      assert.equal(
        DLQ_ATTRIBUTION_REASON_IDS.includes("exactly_once_dlq" as never),
        false,
      );
    },
  );

  await test(
    "production_env DLQ path remains compatible (dlq_acked)",
    async () => {
      const stream = new MemoryHeadlessStreamQueueAdapter({
        envName: "staging",
        nowMs: () => 1_700_000_000_000,
      });
      await stream.ensureConsumerGroups();
      const jobId = "job_missing_for_dlq";
      const deliveryId = stableHeadlessDeliveryId(jobId, 1);
      const enq = await stream.enqueueRender({
        deliveryId,
        jobId,
        ownerId: "owner_prod",
        attempt: 1,
        enqueuedAtMs: 1_700_000_000_000,
        deliveryKind: "render",
      });
      assert.equal(enq.ok, true);
      if (!enq.ok) return;
      const read = await stream.readGroup({
        kind: "render",
        consumerName: "c1",
        count: 1,
        blockMs: 0,
      });
      assert.equal(read.ok && read.value.length === 1, true);
      if (!read.ok) return;
      const result = await consumeRenderDeliveryOnce({
        streamQueue: stream,
        jobStore: new MemoryHeadlessJobStoreAdapter(),
        entry: read.value[0]!.entry,
        streamId: read.value[0]!.streamId,
        nowMs: 1_700_000_000_010,
        leaseSettings: LEASES,
        consumerName: "c1",
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.action, "dlq_acked");
      const shared = deriveHeadlessQueueStreamNames("staging");
      assert.equal(
        stream.testingFake().testingLength(shared.renderDlq) >= 1,
        true,
      );
    },
  );

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
