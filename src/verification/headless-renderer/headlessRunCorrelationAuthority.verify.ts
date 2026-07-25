/**
 * Sprint 11E Phase 2E.2D.8F.2 — run-owned delivery correlation authority.
 * Run: npm run test:headless-run-correlation-authority
 */

import assert from "node:assert/strict";

import {
  buildClaimedRenderExecutionAttributionSnapshot,
  sanitizeClaimedRenderExecutionAttributionSnapshot,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  classifyRenderClaimObservationAuthority,
  type HostedRenderDeliveryEventObservation,
} from "./fly-render-live/claim-correlation-authority";
import {
  classifyRunOwnedDeliveryCorrelation,
  filterDeliveryEventsForRunCorrelation,
} from "./fly-render-live/run-correlation-authority";
import { emptyFlyRenderLiveSession } from "./fly-render-live/types";

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

function delivery(
  atMs: number,
  action: string,
  facts?: Readonly<Record<string, string>>,
): HostedRenderDeliveryEventObservation {
  return Object.freeze({
    name: "hosted.loop.delivery",
    atMs,
    mode: "render",
    action,
    reasonId: action,
    ...(facts != null ? { facts } : {}),
  });
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2D.8F.2 — run correlation authority\n");

  await test("historical pre-boundary events are excluded", () => {
    const filtered = filterDeliveryEventsForRunCorrelation({
      observationBoundaryMs: 5_000,
      events: [
        delivery(1_000, "claimed_and_acked"),
        delivery(6_000, "claimed_and_acked"),
      ],
    });
    assert.equal(filtered.boundaryExcluded, 1);
    assert.equal(filtered.eligible.length, 1);
    assert.equal(filtered.eligible[0]?.atMs, 6_000);
  });

  await test("exact run-owned claim correlation matches enqueue window", () => {
    const result = classifyRunOwnedDeliveryCorrelation({
      observationBoundaryMs: 0,
      renderEnqueuedAtMs: 10_000,
      renderStartedAtMs: 10_100,
      observationEndedAtMs: 12_000,
      deliveryEvents: [
        delivery(2_000, "claimed_and_acked"),
        delivery(10_500, "claimed_and_acked"),
        delivery(10_800, "terminalized_render_failure", {
          execution_substage: "page_contract_ready",
          disposition_kind: "terminal_failure",
          durable_job_state_class: "failed",
          claim_token_coherence_class: "cleared_after_terminal",
          cleanup_scheduled_class: "not_applicable",
          binary_component_class: "chromium",
          bounded_duration_class: "sub_second",
        }),
      ],
      hasActiveClaim: false,
      isTerminalJob: true,
      claimTokenCleared: true,
      initialStoreVersion: 1,
      terminalStoreVersion: 2,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.evidence.correlationClass, "matched");
      assert.equal(result.authority, "fast_terminal_with_correlated_ack");
    }
  });

  await test("historical unrelated ack before enqueue does not satisfy claim", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "failed", claimToken: null, storeVersion: 2 }),
      session: {
        ...emptyFlyRenderLiveSession(),
        renderEnqueuedAtMs: 10_000,
        renderStartedAtMs: 10_100,
        probeObservationBoundaryMs: 0,
        initialStoreVersion: 1,
      },
      deliveryEvents: [delivery(2_000, "claimed_and_acked")],
      observationStartedAtMs: 10_100,
      observationEndedAtMs: 11_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rejectReason, "terminal_without_correlated_claim");
    }
  });

  await test("fast claim→terminal remains valid claim proof", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "failed", claimToken: null, storeVersion: 2 }),
      session: {
        ...emptyFlyRenderLiveSession(),
        renderEnqueuedAtMs: 10_000,
        renderStartedAtMs: 10_100,
        probeObservationBoundaryMs: 0,
        initialStoreVersion: 1,
      },
      deliveryEvents: [
        delivery(10_200, "claimed_and_acked"),
        delivery(10_500, "terminalized_render_failure"),
      ],
      observationStartedAtMs: 10_100,
      observationEndedAtMs: 11_000,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.runDeliveryCorrelation.correlationClass, "matched");
    }
  });

  await test("competing in-window ack before terminal fails closed", () => {
    const result = classifyRunOwnedDeliveryCorrelation({
      observationBoundaryMs: 0,
      renderEnqueuedAtMs: 10_000,
      renderStartedAtMs: 10_100,
      observationEndedAtMs: 20_000,
      deliveryEvents: [
        delivery(10_200, "claimed_and_acked"),
        delivery(16_000, "claimed_and_acked"),
        delivery(18_000, "terminalized_render_failure"),
      ],
      hasActiveClaim: false,
      isTerminalJob: true,
      claimTokenCleared: true,
      initialStoreVersion: 1,
      terminalStoreVersion: 2,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rejectReason, "unrelated_delivery_event");
    }
  });

  await test("page substage telemetry sanitization accepts safe fields only", () => {
    const snap = sanitizeClaimedRenderExecutionAttributionSnapshot(
      buildClaimedRenderExecutionAttributionSnapshot({
        executionSubstage: "page_contract_ready",
        dispositionKind: "terminal_failure",
        durableJobStateClass: "failed",
        claimTokenCoherenceClass: "cleared_after_terminal",
        cleanupScheduledClass: "not_applicable",
        pageFailureReason: "page_contract_missing",
        pageResponseClass: "missing_api",
      }),
    );
    assert.ok(snap != null);
    assert.equal(snap?.executionSubstage, "page_contract_ready");
    assert.equal(snap?.pageFailureReason, "page_contract_missing");
  });

  await test("legacy page_execution telemetry maps to page_contract_ready", () => {
    const snap = sanitizeClaimedRenderExecutionAttributionSnapshot({
      executionSubstage: "page_execution",
      dispositionKind: "terminal_failure",
      durableJobStateClass: "failed",
      claimTokenCoherenceClass: "cleared_after_terminal",
      cleanupScheduledClass: "not_applicable",
      binaryComponentClass: "chromium",
      boundedDurationClass: "sub_second",
    });
    assert.equal(snap?.executionSubstage, "page_contract_ready");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
