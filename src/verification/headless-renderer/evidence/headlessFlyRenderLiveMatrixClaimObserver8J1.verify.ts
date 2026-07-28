/**
 * Sprint 11E Phase 2E.2D.8J.1 — matrix claim observer closure authority.
 * Run: npm run test:headless-fly-render-live-matrix-claim-observer-8j1
 */

import assert from "node:assert/strict";

import {
  classifyRenderClaimObservationAuthority,
  parseHostedRenderDeliveryEventsFromFlyLogs,
} from "../fly-render-live/claim-correlation-authority";
import {
  filterHostedRenderDeliveryEventsForRunObservation,
  resolveHostedDeliveryObservationBoundaryMs,
} from "../fly-render-live/hosted-delivery-event-ingestion";
import {
  build8JWorkerSuccessLogShape,
  buildActiveClaimJob,
  buildCurrentRunCorrelatedClaimSuccessEvents,
  buildForeignMachineRejectedEvents,
  buildHistoricalClaimExcludedEvents,
  buildMatrixClaimObserverSession,
  buildTerminalFailedJobWithCorrelatedClaim,
  buildTerminalSucceededJobWithoutClaimEvents,
  buildUnrelatedSecondDeliveryEvents,
  MATRIX_CLAIM_OBSERVER_FOREIGN_MACHINE_ID,
  MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
} from "../fly-render-live/matrix-claim-observer-fixtures";

import {
  createExactPassFlyRenderLiveCaseResults,
  REQUIRED_FLY_RENDER_LIVE_CASE_IDS,
} from "../fly-render-live/required-cases";
import { DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS } from "../fly-render-live/live-matrix";
import type { FlyRenderLiveMatrixContext } from "../fly-render-live/types";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function terminalJob(overrides: {
  state?: string;
  claimToken?: string | null;
  storeVersion?: number;
}) {
  return {
    stage: "canonical" as const,
    storeVersion: overrides.storeVersion ?? 2,
    claimToken: overrides.claimToken ?? null,
    canonicalJob: {
      state: overrides.state ?? "failed",
      terminalReason: { reasonId: "WORKER_FAILED", retryable: true },
      attempt: 1,
      jobId: "job",
    },
    jobId: "job",
    ownerId: "owner",
    operationId: "op",
  } as never;
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8J.1 — matrix claim observer closure authority\n",
  );

  await test("8J worker-success log shape parses correlated claim and terminal", () => {
    const parsed = parseHostedRenderDeliveryEventsFromFlyLogs(
      build8JWorkerSuccessLogShape(),
    );
    assert.ok(parsed.length >= 2);
    const filtered = filterHostedRenderDeliveryEventsForRunObservation({
      events: parsed,
      renderMachineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      observationBoundaryMs: Date.parse("2026-07-25T09:18:38.000Z"),
    });
    assert.equal(filtered.some((e) => e.action === "claimed_and_acked"), true);
    assert.equal(filtered.some((e) => e.action === "succeeded"), true);
    const authority = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "succeeded", claimToken: null, storeVersion: 2 }),
      session: buildMatrixClaimObserverSession({
        probeObservationBoundaryMs: Date.parse("2026-07-25T09:18:38.000Z"),
        renderEnqueuedAtMs: Date.parse("2026-07-25T09:18:38.000Z"),
        renderStartedAtMs: Date.parse("2026-07-25T09:18:38.000Z"),
      }),
      deliveryEvents: filtered,
      observationStartedAtMs: Date.parse("2026-07-25T09:18:38.000Z"),
      observationEndedAtMs: Date.parse("2026-07-25T09:18:49.000Z"),
    });
    assert.equal(authority.ok, true);
    if (authority.ok) {
      assert.equal(authority.authority, "fast_terminal_with_correlated_ack");
    }
  });

  await test("current-run correlated claim and success passes", () => {
    const events = buildCurrentRunCorrelatedClaimSuccessEvents({
      boundaryMs: 2_000,
      ackMs: 2_100,
      terminalMs: 2_400,
    });
    const result = classifyRenderClaimObservationAuthority({
      job: buildTerminalFailedJobWithCorrelatedClaim(),
      session: buildMatrixClaimObserverSession(),
      deliveryEvents: events,
      observationStartedAtMs: 2_000,
      observationEndedAtMs: 3_000,
    });
    assert.equal(result.ok, true);
  });

  await test("fast claim-to-terminal success passes with correlated ack", () => {
    const events = buildCurrentRunCorrelatedClaimSuccessEvents({
      boundaryMs: 2_000,
      ackMs: 2_050,
      terminalMs: 2_080,
    });
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "succeeded", claimToken: null, storeVersion: 3 }),
      session: buildMatrixClaimObserverSession({ initialStoreVersion: 2 }),
      deliveryEvents: events,
      observationStartedAtMs: 2_000,
      observationEndedAtMs: 2_100,
    });
    assert.equal(result.ok, true);
  });

  await test("historical pre-boundary claim excluded", () => {
    const session = buildMatrixClaimObserverSession({
      probeObservationBoundaryMs: 5_000,
      renderEnqueuedAtMs: 5_000,
      renderStartedAtMs: 5_000,
    });
    const filtered = filterHostedRenderDeliveryEventsForRunObservation({
      events: buildHistoricalClaimExcludedEvents(),
      renderMachineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      observationBoundaryMs: resolveHostedDeliveryObservationBoundaryMs(session),
    });
    assert.equal(filtered.length, 0);
    const result = classifyRenderClaimObservationAuthority({
      job: buildTerminalFailedJobWithCorrelatedClaim(),
      session,
      deliveryEvents: buildHistoricalClaimExcludedEvents(),
      observationStartedAtMs: 5_000,
      observationEndedAtMs: 6_000,
    });
    assert.equal(result.ok, false);
  });

  await test("foreign machine events rejected at ingestion", () => {
    const filtered = filterHostedRenderDeliveryEventsForRunObservation({
      events: buildForeignMachineRejectedEvents(),
      renderMachineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      observationBoundaryMs: 0,
    });
    assert.equal(filtered.length, 0);
    assert.equal(
      buildForeignMachineRejectedEvents()[0]?.machineId,
      MATRIX_CLAIM_OBSERVER_FOREIGN_MACHINE_ID,
    );
  });

  await test("unrelated second delivery rejected", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: buildTerminalFailedJobWithCorrelatedClaim(),
      session: buildMatrixClaimObserverSession(),
      deliveryEvents: buildUnrelatedSecondDeliveryEvents(),
      observationStartedAtMs: 2_000,
      observationEndedAtMs: 20_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rejectReason, "unrelated_delivery_event");
    }
  });

  await test("missing delivery events fail closed on terminal succeeded job", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: buildTerminalSucceededJobWithoutClaimEvents(),
      session: buildMatrixClaimObserverSession(),
      deliveryEvents: [],
      observationStartedAtMs: 2_000,
      observationEndedAtMs: 3_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rejectReason, "terminal_without_correlated_claim");
    }
  });

  await test("active claim passes without delivery events", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: buildActiveClaimJob(),
      session: buildMatrixClaimObserverSession(),
      deliveryEvents: [],
      observationStartedAtMs: 2_000,
      observationEndedAtMs: 3_000,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.authority, "active_claim");
  });

  await test("missing machine id rejected when render machine is known", () => {
    const filtered = filterHostedRenderDeliveryEventsForRunObservation({
      events: [
        Object.freeze({
          name: "hosted.loop.delivery" as const,
          atMs: 2_100,
          mode: "render",
          action: "claimed_and_acked",
        }),
      ],
      renderMachineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      observationBoundaryMs: 2_000,
    });
    assert.equal(filtered.length, 0);
  });

  await test("early matrix failure cleanup retains run manifest for verification", async () => {
    const createdJobIds = ["job-early-fail"];
    const createdObjectIds = ["obj-early-fail"];
    let queriedJobIds: string[] = [];
    const ctx = {
      ownerId: "frl_owner_00000000",
      otherOwnerId: "frl_other_00000000",
      createdJobIds,
      createdObjectIds,
      createdProjectIds: [],
      createdR2Locators: [],
      runOwnedActiveStreamIds: [],
      trackedStreamIds: [],
      tcpConsumer: null,
      io: { deleteObject: async () => {} },
      streamNames: { renderStream: "hfq:render:staging", renderGroup: "g" },
      sql: {
        withClient: async (fn: (client: unknown) => Promise<unknown>) =>
          fn({
            query: async (_sql: string, params?: unknown[]) => {
              if (Array.isArray(params) && params[0] === createdJobIds) {
                queriedJobIds = params[0] as unknown as string[];
              }
              return { rows: [{ n: "0" }] };
            },
          }),
        withTransaction: async (fn: (client: unknown) => Promise<void>) =>
          fn({
            query: async () => ({ rows: [] }),
          }),
      },
    } as unknown as FlyRenderLiveMatrixContext;

    const cleanupCase =
      await DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS["cleanup.complete"](ctx);
    assert.equal(queriedJobIds.length, 1);
    assert.equal(queriedJobIds[0], "job-early-fail");
    assert.equal(cleanupCase.caseId, "cleanup.complete");
    assert.equal(["PASS", "FAIL"].includes(cleanupCase.status), true);
  });

  await test("full 25-case continuation after claim PASS shape frozen", () => {
    assert.equal(REQUIRED_FLY_RENDER_LIVE_CASE_IDS.length, 25);
    assert.equal(REQUIRED_FLY_RENDER_LIVE_CASE_IDS[8], "hosted.render_claim");
    assert.equal(REQUIRED_FLY_RENDER_LIVE_CASE_IDS[9], "redis.ack_pending_cleared");
    const passCases = createExactPassFlyRenderLiveCaseResults();
    assert.equal(passCases[8]?.status, "PASS");
    assert.equal(passCases[8]?.caseId, "hosted.render_claim");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
