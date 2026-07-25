/**
 * Sprint 11E Phase 2D.1B — bounded enqueue-stage attribution (deterministic).
 * Run: npm run test:headless-upstash-enqueue-attribution
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import {
  attributedFailureToEnqueueRenderEvidence,
  ENQUEUE_ATTRIBUTION_REASON_IDS,
  ENQUEUE_ATTRIBUTION_STAGE_IDS,
  runAttributedRenderEnqueue,
  scrubEnqueueAttributionStages,
} from "./upstash-live/enqueue-attribution";
import { assertUpstashEvidencePrivacyStructure } from "./upstash-live/evidence-privacy-authority";
import { buildUpstashLiveSchemaFingerprint } from "./upstash-live/evidence-authority";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "./upstash-live/live-fixtures";
import { renderUpstashLiveEvidenceMarkdown } from "./upstash-live/evidence";
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

function buildCtx(overrides?: {
  readonly jobStore?: MemoryHeadlessJobStoreAdapter;
  readonly projectAuthorization?: MemoryHeadlessProjectOwnershipAdapter;
}): {
  ctx: UpstashLiveMatrixContext;
  stream: MemoryHeadlessStreamQueueAdapter;
} {
  const runId = randomUUID();
  const stream = new MemoryHeadlessStreamQueueAdapter({
    envName: "staging",
    nowMs: () => 1_700_000_000_000,
  });
  const lifecycle = createUpstashLifecycleTracking();
  const ctx: UpstashLiveMatrixContext = {
    runId,
    ownerId: `uq_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `uq_other_${runId.slice(0, 8)}`,
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
    jobStore: overrides?.jobStore ?? new MemoryHeadlessJobStoreAdapter(),
    ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
    projectAuthorization:
      overrides?.projectAuthorization ??
      new MemoryHeadlessProjectOwnershipAdapter(),
    restProducer: stream,
    tcpConsumer: stream,
    streamQueue: stream,
    streamNames: stream.streamNames(),
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
  return { ctx, stream };
}

async function main() {
  console.log("\nSprint 11E Phase 2D.1B — Upstash enqueue attribution\n");

  await test("stage and reason registries are frozen allowlists", () => {
    assert.ok(ENQUEUE_ATTRIBUTION_STAGE_IDS.includes("rest_xadd"));
    assert.ok(ENQUEUE_ATTRIBUTION_REASON_IDS.includes("rest_xadd_transport_failed"));
    assert.equal(Object.isFrozen(ENQUEUE_ATTRIBUTION_STAGE_IDS), true);
    assert.equal(Object.isFrozen(ENQUEUE_ATTRIBUTION_REASON_IDS), true);
  });

  await test("happy path records sequential stages through rest_xtrim", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedRenderEnqueue({
      ctx,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const names = result.stages.map((s) => s.stage);
    assert.ok(names.includes("project_ownership"));
    assert.ok(names.includes("fixture_manifest"));
    assert.ok(names.includes("neon_job_insert"));
    assert.ok(names.includes("queue_entry_validation"));
    assert.ok(names.includes("rest_xadd"));
    assert.ok(names.includes("rest_response_validation"));
    assert.ok(names.includes("rest_xtrim"));
    assert.equal(result.stages.every((s) => s.status !== "failed"), true);
  });

  await test("ownership failure stops before REST", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    // Pre-claim with a different owner so probe owner cannot access.
    const { ctx } = buildCtx({ projectAuthorization: auth });
    await auth.claimUnownedProject(
      { ownerId: "hostile_other", sessionId: "s" },
      ctx.projectId,
    );
    let xaddCalls = 0;
    const result = await runAttributedRenderEnqueue({
      ctx,
      restOps: {
        streamKey: ctx.streamNames.renderStream,
        xadd: async () => {
          xaddCalls += 1;
          return "1-0";
        },
        xtrim: async () => 0,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "project_ownership");
    assert.equal(result.failureReasonId, "project_ownership_failed");
    assert.equal(xaddCalls, 0);
  });

  await test("job insert failure causes zero REST calls", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const broken = buildCtx({ jobStore });
    jobStore.createIfAbsent = async () =>
      ({
        ok: false as const,
        issues: [
          {
            code: "STORAGE_UNAVAILABLE" as const,
            message: "injected",
          },
        ],
      }) as Awaited<ReturnType<MemoryHeadlessJobStoreAdapter["createIfAbsent"]>>;

    let xaddCalls = 0;
    const result = await runAttributedRenderEnqueue({
      ctx: broken.ctx,
      restOps: {
        streamKey: broken.ctx.streamNames.renderStream,
        xadd: async () => {
          xaddCalls += 1;
          return "1-0";
        },
        xtrim: async () => 0,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "neon_job_insert");
    assert.equal(result.failureReasonId, "neon_job_insert_failed");
    assert.equal(xaddCalls, 0);
  });

  await test("invalid queue entry causes zero REST calls", async () => {
    const { ctx } = buildCtx();
    let xaddCalls = 0;
    const result = await runAttributedRenderEnqueue({
      ctx,
      forceInvalidQueueEntry: true,
      restOps: {
        streamKey: ctx.streamNames.renderStream,
        xadd: async () => {
          xaddCalls += 1;
          return "1-0";
        },
        xtrim: async () => 0,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "queue_entry_validation");
    assert.equal(result.failureReasonId, "queue_entry_invalid");
    assert.equal(xaddCalls, 0);
  });

  await test("REST transport failure is distinct stage + scrubbed", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedRenderEnqueue({
      ctx,
      restOps: {
        streamKey: ctx.streamNames.renderStream,
        xadd: async () => {
          throw new Error("UPSTASH_REDIS_REST_TOKEN=secret https://evil.example");
        },
        xtrim: async () => 0,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "rest_xadd");
    assert.equal(result.failureReasonId, "rest_xadd_transport_failed");
    const evidence = attributedFailureToEnqueueRenderEvidence(result);
    const privacy = assertUpstashEvidencePrivacyStructure(evidence);
    assert.equal(privacy.ok, true, privacy.ok ? "" : privacy.message);
    const md = renderUpstashLiveEvidenceMarkdown({
      title: "t",
      overall: "FAIL",
      eligibilityVerdict: "x",
      startedAtIso: null,
      endedAtIso: null,
      cases: [evidence],
      schemaFingerprint: null,
      cleanupStatus: "ok",
      notes: ["safe note"],
    });
    assert.equal(md.includes("UPSTASH_REDIS"), false);
    assert.equal(md.includes("https://"), false);
    assert.equal(md.includes("secret"), false);
  });

  await test("null XADD response fails closed at rest_response_validation", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedRenderEnqueue({
      ctx,
      restOps: {
        streamKey: ctx.streamNames.renderStream,
        xadd: async () => null,
        xtrim: async () => 0,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "rest_response_validation");
    assert.equal(result.failureReasonId, "rest_response_invalid");
  });

  await test("XADD success + trim failure remains enqueue success", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedRenderEnqueue({
      ctx,
      restOps: {
        streamKey: ctx.streamNames.renderStream,
        xadd: async () => "42-0",
        xtrim: async () => {
          throw new Error("trim boom");
        },
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.trimBestEffortFailed, true);
    const trim = result.stages.find((s) => s.stage === "rest_xtrim");
    assert.equal(trim?.status, "best_effort_failed");
    assert.equal(trim?.reasonId, "rest_trim_failed");
  });

  await test("scrubEnqueueAttributionStages drops unknown fields", () => {
    const scrubbed = scrubEnqueueAttributionStages([
      { stage: "rest_xadd", status: "ok" },
      {
        stage: "rest_xadd",
        status: "failed",
        reasonId: "not_a_real_reason" as never,
      },
      { stage: "not_a_stage" as never, status: "ok" },
    ]);
    assert.equal(scrubbed.length, 2);
    assert.equal(scrubbed[1]?.reasonId, undefined);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
