/**
 * Sprint 11E Phase 2D.1F — run-scoped remote queue isolation (deterministic).
 * Run: npm run test:headless-upstash-run-scoped-remote-queue-isolation
 *
 * No provider contact. Proves QA run-scoped streams isolate delivery from
 * shared staging backlog while preserving production-protocol worker groups.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  consumeRenderDeliveryOnce,
  deriveHeadlessQueueStreamNames,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  createFakeUpstashRestClient,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { acquireIsolatedCaseDelivery } from "./upstash-live/case-delivery-authority";
import { finalizeIsolatedCaseDelivery } from "./upstash-live/case-delivery-finalize";
import { defaultUpstashLiveCleanup } from "./upstash-live/cleanup";
import { composeQaRunScopedHarnessPorts } from "./upstash-live/compose-qa-run-scoped-ports";
import { buildUpstashLiveSchemaFingerprint } from "./upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  seedQueuedCanonicalJob,
} from "./upstash-live/live-fixtures";
import {
  createQaRunScopedRestProducerPort,
  ensureQaRunScopedProductionGroups,
} from "./upstash-live/qa-run-scoped-queue";
import {
  deriveQaRunScopedStreamBinding,
  isValidQaRunScopedStreamBinding,
  QA_RUN_QUEUE_NAMESPACE_VERSION,
  streamKeyBelongsToQaRunBinding,
} from "./upstash-live/qa-run-stream-names";
import type { UpstashLiveMatrixContext } from "./upstash-live/types";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function noopSql(): HeadlessSqlExecutor {
  const client = {
    async query<T = Record<string, unknown>>() {
      return { rows: [{ n: "0" }] as T[] };
    },
  };
  return {
    async withClient(fn) {
      return fn(client as never);
    },
    async withTransaction(fn) {
      return fn(client as never);
    },
  };
}

async function buildQaRunCtx(runId = randomUUID()): Promise<{
  ctx: UpstashLiveMatrixContext;
  stream: MemoryHeadlessStreamQueueAdapter;
  sharedNames: ReturnType<typeof deriveHeadlessQueueStreamNames>;
}> {
  const stream = new MemoryHeadlessStreamQueueAdapter({
    envName: "staging",
    nowMs: () => 1_700_000_000_000,
  });
  await stream.ensureConsumerGroups();
  const sharedNames = deriveHeadlessQueueStreamNames("staging");
  const restClient = createFakeUpstashRestClient(stream.testingFake());
  const scoped = await composeQaRunScopedHarnessPorts({
    envName: "staging",
    runId,
    redis: stream,
    restClient,
  });
  assert.ok(scoped != null);
  const lifecycle = createUpstashLifecycleTracking();
  const ctx: UpstashLiveMatrixContext = {
    runId,
    ownerId: `uq_rs_${runId.slice(0, 8)}`,
    otherOwnerId: `uq_rs_o_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    env: { HEADLESS_ENV_NAME: "staging" },
    nowMs: 1_700_000_000_000,
    leaseSettings: Object.freeze({
      deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
      renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
      verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
      verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
    }),
    qaIdleMs: 50,
    sql: noopSql(),
    jobStore: new MemoryHeadlessJobStoreAdapter(),
    ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
    projectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
    restProducer: scoped!.restProducer,
    tcpConsumer: stream,
    streamQueue: stream,
    streamNames: scoped!.streamNames,
    streamAuthority: "qa_run_scoped",
    groupAuthorityEvidence: "production_protocol",
    qaRunStreamBinding: scoped!.binding,
    envName: "staging",
    createdJobIds: [],
    createdObjectIds: [],
    createdProjectIds: [],
    runOwnedActiveStreamIds: lifecycle.runOwnedActiveStreamIds,
    runOwnedStreamIds: lifecycle.runOwnedStreamIds,
    trackedStreamIds: lifecycle.trackedStreamIds,
    caseFinalizedStreamIds: lifecycle.caseFinalizedStreamIds,
    observedForeignStreamIds: [],
    trackedConsumerNames: [],
    activeQaGroups: lifecycle.activeQaGroups,
    trackedQaGroups: lifecycle.trackedQaGroups,
    finalizedQaGroups: lifecycle.finalizedQaGroups,
    trackedDlqIds: lifecycle.trackedDlqIds,
    session: emptyUpstashLiveSession(),
    preflightFingerprint: buildUpstashLiveSchemaFingerprint(),
  };
  return { ctx, stream, sharedNames };
}

async function snapshotShared(stream: MemoryHeadlessStreamQueueAdapter) {
  const names = stream.streamNames();
  const groups = await stream.qaXinfoGroups(names.renderStream);
  assert.equal(groups.ok, true);
  if (!groups.ok) return null;
  const prod = groups.groups.find((g) => g.name === names.renderGroup);
  const xrange = await stream.qaXrange({
    streamKey: names.renderStream,
    start: "-",
    end: "+",
    count: 1000,
  });
  return Object.freeze({
    lastDeliveredId: prod?.lastDeliveredId ?? null,
    pending: prod?.pending ?? null,
    consumers: prod?.consumers ?? null,
    entryIds: Object.freeze(xrange.map((e) => e.streamId)),
    groupCount: groups.groups.length,
  });
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1F — run-scoped remote queue isolation\n",
  );

  await test("namespace derivation is unguessable and bounded", () => {
    const a = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: "run-aaa",
    });
    const b = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: "run-bbb",
    });
    assert.ok(a != null && b != null);
    assert.equal(a!.namespaceVersion, QA_RUN_QUEUE_NAMESPACE_VERSION);
    assert.equal(a!.streamAuthority, "qa_run_scoped");
    assert.equal(a!.groupAuthority, "production_protocol");
    assert.equal(a!.names.renderGroup, "hfq:render-workers");
    assert.notEqual(a!.names.renderStream, b!.names.renderStream);
    assert.ok(a!.names.renderStream.startsWith("hfq:qa-run:v1:render:staging:"));
    assert.equal(a!.runDigest.length, 32);
    assert.equal(
      deriveQaRunScopedStreamBinding({ envName: "staging", runId: "" }),
      null,
    );
    assert.equal(
      isValidQaRunScopedStreamBinding({
        ...a!,
        names: { ...a!.names, renderStream: "hfq:render:staging" },
      }),
      false,
    );
  });

  await test(
    "foreign unread on shared staging does not affect run-scoped delivery",
    async () => {
      const { ctx, stream, sharedNames } = await buildQaRunCtx();
      const before = await snapshotShared(stream);
      assert.ok(before != null);

      // Foreign unread on shared staging production stream/group.
      const foreignId = await stream.qaXaddRaw(sharedNames.renderStream, {
        deliveryId: "del_foreign_shared",
        jobId: "job_foreign_shared",
        ownerId: "owner_foreign",
        attempt: "1",
        enqueuedAtMs: "1",
        deliveryKind: "render",
      });
      assert.ok(foreignId != null);

      const seeded = await seedQueuedCanonicalJob(ctx);
      assert.equal(seeded.ok, true);
      if (!seeded.ok) return;

      const acquired = await acquireIsolatedCaseDelivery({
        ctx,
        caseId: "rs.foreign.isolation",
        kind: "render",
        consumerLabel: "rs",
        groupAuthority: "production",
        mintDelivery: async () => {
          const enq = await ctx.restProducer.enqueueRender({
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            enqueuedAtMs: ctx.nowMs,
            deliveryKind: "render",
          });
          if (!enq.ok) return { ok: false, reasonId: "delivery_enqueue_failed" };
          return {
            ok: true,
            expected: {
              kind: "render",
              deliveryId: seeded.deliveryId,
              jobId: seeded.jobId,
              ownerId: ctx.ownerId,
              attempt: seeded.attempt,
              streamId: enq.value.streamId,
            },
          };
        },
      });
      if (!acquired.ok) {
        assert.fail(`acquire failed: ${acquired.reasonId}`);
      }
      assert.equal(acquired.group, "hfq:render-workers");
      assert.ok(
        acquired.streamKey.startsWith("hfq:qa-run:v1:render:staging:"),
      );
      // Foreign remains on shared staging; acquired entry is on run-scoped stream.
      const sharedPresence = await stream.qaProbeStreamEntry(
        sharedNames.renderStream,
        foreignId!,
      );
      assert.equal(sharedPresence.ok, true);
      if (!sharedPresence.ok) return;
      assert.equal(sharedPresence.present, true);
      const runPresence = await stream.qaProbeStreamEntry(
        acquired.streamKey,
        acquired.item.streamId,
      );
      assert.equal(runPresence.ok, true);
      if (!runPresence.ok) return;
      assert.equal(runPresence.present, true);
      await acquired.releaseLock();
    },
  );

  await test(
    "run-scoped production group reads expected first; claim+ACK+pending+finalize",
    async () => {
      const { ctx, stream, sharedNames } = await buildQaRunCtx();
      const before = await snapshotShared(stream);
      assert.ok(before != null);

      const seeded = await seedQueuedCanonicalJob(ctx);
      assert.equal(seeded.ok, true);
      if (!seeded.ok) return;

      const jobStore = ctx.jobStore as MemoryHeadlessJobStoreAdapter;
      let claimCalls = 0;
      const origClaim = jobStore.claimQueuedJob.bind(jobStore);
      jobStore.claimQueuedJob = async (input) => {
        claimCalls += 1;
        return origClaim(input);
      };

      const acquired = await acquireIsolatedCaseDelivery({
        ctx,
        caseId: "rs.claim.ack",
        kind: "render",
        consumerLabel: "claim",
        groupAuthority: "production",
        mintDelivery: async () => {
          const enq = await ctx.restProducer.enqueueRender({
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            enqueuedAtMs: ctx.nowMs,
            deliveryKind: "render",
          });
          if (!enq.ok) return { ok: false, reasonId: "delivery_enqueue_failed" };
          return {
            ok: true,
            expected: {
              kind: "render",
              deliveryId: seeded.deliveryId,
              jobId: seeded.jobId,
              ownerId: ctx.ownerId,
              attempt: seeded.attempt,
              streamId: enq.value.streamId,
            },
          };
        },
      });
      assert.equal(acquired.ok, true);
      if (!acquired.ok) return;

      const result = await consumeRenderDeliveryOnce({
        streamQueue: acquired.bindStreamQueue(),
        jobStore,
        entry: acquired.item.entry,
        streamId: acquired.item.streamId,
        nowMs: ctx.nowMs + 10,
        leaseSettings: ctx.leaseSettings,
        consumerName: acquired.consumerName,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.action, "claimed_and_acked");
      assert.equal(claimCalls, 1);

      const pending = await acquired.probePendingInGroup();
      assert.equal(pending.ok, true);
      if (!pending.ok) return;
      assert.equal(pending.pending, false);

      // Shared staging production group pending unchanged for foreign-less snapshot.
      const sharedPending = await stream.qaProbePendingInGroup(
        sharedNames.renderStream,
        sharedNames.renderGroup,
        acquired.item.streamId,
      );
      assert.equal(sharedPending.ok, true);
      if (!sharedPending.ok) return;
      assert.equal(sharedPending.pending, false);

      const fin = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: acquired.streamKey,
        streamId: acquired.item.streamId,
        kind: "render",
        sessionGroup: acquired.group,
        groupAuthority: "production",
        lockHandle: acquired.lockHandle,
        lockClock: acquired.lockClock,
        ackSessionGroup: false,
        expectPendingAlreadyCleared: true,
      });
      assert.equal(fin.ok, true);

      const after = await snapshotShared(stream);
      assert.deepEqual(after, before);
    },
  );

  await test(
    "cleanup removes run-scoped stream/group; shared staging unchanged",
    async () => {
      const { ctx, stream, sharedNames } = await buildQaRunCtx();
      const before = await snapshotShared(stream);
      assert.ok(before != null);
      const binding = ctx.qaRunStreamBinding!;

      const seeded = await seedQueuedCanonicalJob(ctx);
      assert.equal(seeded.ok, true);
      if (!seeded.ok) return;
      const enq = await ctx.restProducer.enqueueRender({
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "render",
      });
      assert.equal(enq.ok, true);
      if (!enq.ok) return;
      ctx.runOwnedActiveStreamIds.push({
        stream: binding.names.renderStream,
        id: enq.value.streamId,
        kind: "render",
      });

      const cleanup = await defaultUpstashLiveCleanup(ctx, false);
      assert.equal(cleanup, "ok");

      const list = await stream.qaXinfoGroups(binding.names.renderStream);
      // After DEL, probe may fail or return empty — never report workers present.
      if (list.ok) {
        assert.equal(
          list.groups.some((g) => g.name === "hfq:render-workers"),
          false,
        );
      }
      const after = await snapshotShared(stream);
      assert.deepEqual(after, before);
      assert.equal(sharedNames.renderStream, "hfq:render:staging");
    },
  );

  await test("two concurrent QA runs use different namespaces", async () => {
    const a = await buildQaRunCtx(randomUUID());
    const b = await buildQaRunCtx(randomUUID());
    assert.notEqual(
      a.ctx.streamNames.renderStream,
      b.ctx.streamNames.renderStream,
    );
    assert.equal(
      streamKeyBelongsToQaRunBinding(
        a.ctx.qaRunStreamBinding!,
        b.ctx.streamNames.renderStream,
      ),
      false,
    );
  });

  await test("cross-run mutation is rejected", async () => {
    const a = await buildQaRunCtx();
    const b = await buildQaRunCtx();
    assert.equal(
      streamKeyBelongsToQaRunBinding(
        a.ctx.qaRunStreamBinding!,
        b.ctx.streamNames.renderStream,
      ),
      false,
    );
    // Forged producer targeting foreign run key fails closed via binding check
    // when constructing from a's redis with b's key manually:
    const forged = {
      ...a.ctx.qaRunStreamBinding!,
      names: {
        ...a.ctx.qaRunStreamBinding!.names,
        renderStream: b.ctx.streamNames.renderStream,
      },
    };
    assert.equal(isValidQaRunScopedStreamBinding(forged), false);
  });

  await test("malformed/forged namespace bindings fail closed", async () => {
    assert.equal(isValidQaRunScopedStreamBinding(null), false);
    assert.equal(isValidQaRunScopedStreamBinding({}), false);
    const ok = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: randomUUID(),
    });
    assert.ok(ok != null);
    assert.equal(
      isValidQaRunScopedStreamBinding({
        ...ok!,
        runDigest: "zzzz",
      }),
      false,
    );
    const stream = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
    const producer = createQaRunScopedRestProducerPort({
      client: createFakeUpstashRestClient(stream.testingFake()),
      binding: {
        ...ok!,
        names: {
          ...ok!.names,
          renderStream: "hfq:render:staging",
        },
      },
    });
    const enq = await producer.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_x", 1),
      jobId: "job_x",
      ownerId: "owner_x",
      attempt: 1,
      enqueuedAtMs: 1,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, false);
  });

  await test("cleanup/provider probe failure prevents PASS", async () => {
    const { ctx, stream } = await buildQaRunCtx();
    const binding = ctx.qaRunStreamBinding!;
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const enq = await ctx.restProducer.enqueueRender({
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    if (!enq.ok) return;
    ctx.runOwnedActiveStreamIds.push({
      stream: binding.names.renderStream,
      id: enq.value.streamId,
      kind: "render",
    });

    const orig = stream.qaProbeStreamEntry.bind(stream);
    stream.qaProbeStreamEntry = async () => ({
      ok: false,
      reasonId: "stream_probe_failed",
    });
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    stream.qaProbeStreamEntry = orig;
    assert.equal(cleanup, "failed");
  });

  await test(
    "production routes/barrels cannot import or request QA stream bindings",
    () => {
      const root = path.resolve(__dirname, "../../features/headless-renderer");
      const index = readFileSync(path.join(root, "control-plane/index.ts"), "utf8");
      assert.equal(index.includes("qa-run-stream-names"), false);
      assert.equal(index.includes("deriveQaRunScopedStreamBinding"), false);
      assert.equal(index.includes("composeQaRunScopedHarnessPorts"), false);
      assert.equal(index.includes("qa-run-scoped-stream-key"), false);
      const productDir = path.join(root, "product");
      const walk = (dir: string, out: string[] = []): string[] => {
        for (const name of readdirSync(dir)) {
          const full = path.join(dir, name);
          if (statSync(full).isDirectory()) walk(full, out);
          else if (/\.tsx?$/.test(name)) out.push(full);
        }
        return out;
      };
      if (statSync(productDir, { throwIfNoEntry: false })?.isDirectory()) {
        for (const file of walk(productDir)) {
          const src = readFileSync(file, "utf8");
          assert.equal(src.includes("deriveQaRunScoped"), false);
          assert.equal(src.includes("qaRunStreamBinding"), false);
        }
      }
    },
  );

  await test(
    "shared-stream foreign unread remains a valid negative fixture",
    async () => {
      const runId = randomUUID();
      const stream = new MemoryHeadlessStreamQueueAdapter({
        envName: "staging",
        nowMs: () => 1_700_000_000_000,
      });
      await stream.ensureConsumerGroups();
      const names = stream.streamNames();
      const lifecycle = createUpstashLifecycleTracking();
      const ctx: UpstashLiveMatrixContext = {
        runId,
        ownerId: `uq_neg_${runId.slice(0, 8)}`,
        otherOwnerId: `uq_neg_o_${runId.slice(0, 8)}`,
        projectId: randomUUID(),
        env: { HEADLESS_ENV_NAME: "staging" },
        nowMs: 1_700_000_000_000,
        leaseSettings: Object.freeze({
          deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
          renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
          verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
          verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
        }),
        qaIdleMs: 50,
        sql: noopSql(),
        jobStore: new MemoryHeadlessJobStoreAdapter(),
        ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
        projectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
        restProducer: stream,
        tcpConsumer: stream,
        streamQueue: stream,
        streamNames: names,
        streamAuthority: "production_env",
        envName: "staging",
        createdJobIds: [],
        createdObjectIds: [],
        createdProjectIds: [],
        runOwnedActiveStreamIds: lifecycle.runOwnedActiveStreamIds,
        runOwnedStreamIds: lifecycle.runOwnedStreamIds,
        trackedStreamIds: lifecycle.trackedStreamIds,
        caseFinalizedStreamIds: lifecycle.caseFinalizedStreamIds,
        observedForeignStreamIds: [],
        trackedConsumerNames: [],
        activeQaGroups: lifecycle.activeQaGroups,
        trackedQaGroups: lifecycle.trackedQaGroups,
        finalizedQaGroups: lifecycle.finalizedQaGroups,
        trackedDlqIds: lifecycle.trackedDlqIds,
        session: emptyUpstashLiveSession(),
        preflightFingerprint: buildUpstashLiveSchemaFingerprint(),
      };

      // Foreign unread before expected on shared staging.
      await stream.qaXaddRaw(names.renderStream, {
        deliveryId: "del_foreign",
        jobId: "job_foreign",
        ownerId: "owner_f",
        attempt: "1",
        enqueuedAtMs: "1",
        deliveryKind: "render",
      });

      const seeded = await seedQueuedCanonicalJob(ctx);
      assert.equal(seeded.ok, true);
      if (!seeded.ok) return;

      const acquired = await acquireIsolatedCaseDelivery({
        ctx,
        caseId: "neg.shared.foreign",
        kind: "render",
        consumerLabel: "neg",
        groupAuthority: "production",
        mintDelivery: async () => {
          const enq = await ctx.restProducer.enqueueRender({
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            enqueuedAtMs: ctx.nowMs,
            deliveryKind: "render",
          });
          if (!enq.ok) return { ok: false, reasonId: "delivery_enqueue_failed" };
          return {
            ok: true,
            expected: {
              kind: "render",
              deliveryId: seeded.deliveryId,
              jobId: seeded.jobId,
              ownerId: ctx.ownerId,
              attempt: seeded.attempt,
              streamId: enq.value.streamId,
            },
          };
        },
      });
      assert.equal(acquired.ok, false);
      if (acquired.ok) return;
      assert.equal(acquired.reasonId, "queue_precondition_not_isolated");
    },
  );

  await test("ensureQaRunScopedProductionGroups never uses shared keys", async () => {
    const stream = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
    await stream.ensureConsumerGroups();
    const binding = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: randomUUID(),
    });
    assert.ok(binding != null);
    const ok = await ensureQaRunScopedProductionGroups({
      redis: stream,
      binding: binding!,
    });
    assert.equal(ok, true);
    assert.notEqual(binding!.names.renderStream, "hfq:render:staging");
    const runList = await stream.qaXinfoGroups(binding!.names.renderStream);
    assert.equal(runList.ok, true);
    if (!runList.ok) return;
    assert.ok(runList.groups.some((g) => g.name === "hfq:render-workers"));
  });

  console.log(
    `\n${passed}/11 run-scoped remote queue isolation fixtures passed\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
