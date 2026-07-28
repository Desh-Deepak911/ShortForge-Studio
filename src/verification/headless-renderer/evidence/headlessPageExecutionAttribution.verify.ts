/**
 * Sprint 11E Phase 2E.2D.8F.2 — page substage failure + telemetry sanitization fixtures.
 * Run: npm run test:headless-page-execution-attribution
 */

import assert from "node:assert/strict";

import {
  buildClaimedRenderExecutionAttributionSnapshot,
  executionAttributionToSafeTelemetryFacts,
  sanitizeClaimedRenderExecutionAttributionSnapshot,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  classifyScrubbedPageFailureMessage,
  PAGE_EXECUTION_SUBSTAGE_IDS,
  PAGE_FAILURE_REASON_IDS,
  pageExecutionAttributionToTelemetryFacts,
  sanitizePageExecutionTelemetryFacts,
} from "@/features/headless-renderer/worker/chromium/page-execution-attribution";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2D.8F.2 — page execution attribution\n");

  test("page substage registry frozen at nine substages", () => {
    assert.equal(PAGE_EXECUTION_SUBSTAGE_IDS.length, 9);
    assert.deepEqual(PAGE_EXECUTION_SUBSTAGE_IDS, [
      "browser_context_create",
      "page_create",
      "page_navigation_or_content_load",
      "page_bundle_injection",
      "page_contract_ready",
      "page_request_submit",
      "page_response_wait",
      "page_response_validate",
      "page_cleanup",
    ]);
  });

  test("page failure reason registry includes bootstrap-safe reasons", () => {
    assert.ok(PAGE_FAILURE_REASON_IDS.length >= 21);
    assert.ok(PAGE_FAILURE_REASON_IDS.includes("page_bootstrap_asset_incoherent"));
  });

  for (const substage of PAGE_EXECUTION_SUBSTAGE_IDS) {
    test(`substage ${substage} maps to immutable safe failure reason`, () => {
      const attribution = classifyScrubbedPageFailureMessage({ substage });
      assert.equal(attribution.executionSubstage, substage);
      assert.ok(PAGE_FAILURE_REASON_IDS.includes(attribution.pageFailureReason));
    });
  }

  test("contract version mismatch attribution", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_contract_ready",
      contractVersionMismatch: true,
    });
    assert.equal(attribution.pageFailureReason, "page_contract_version_mismatch");
    assert.equal(attribution.pageResponseClass, "invalid_payload");
  });

  test("contract missing attribution", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_contract_ready",
      contractMissing: true,
    });
    assert.equal(attribution.pageFailureReason, "page_contract_missing");
  });

  test("bootstrap rejection attribution is not contract missing", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_contract_ready",
      bootstrapRejected: true,
      bootstrapReasonId: "asset_reference_incoherent",
    });
    assert.equal(attribution.pageFailureReason, "page_bootstrap_asset_incoherent");
    assert.equal(attribution.pageResponseClass, "rejected");
  });

  test("bundle injection failure attribution", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_bundle_injection",
    });
    assert.equal(attribution.pageFailureReason, "page_bundle_injection_failed");
  });

  test("timeout attribution", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_response_wait",
      timedOut: true,
    });
    assert.equal(attribution.pageFailureReason, "page_timeout");
    assert.equal(attribution.pageResponseClass, "timeout");
  });

  test("runtime exception attribution", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_request_submit",
      cancelled: true,
    });
    assert.equal(attribution.pageFailureReason, "page_runtime_exception");
  });

  test("invalid response attribution", () => {
    const attribution = classifyScrubbedPageFailureMessage({
      substage: "page_response_validate",
      responseInvalid: true,
    });
    assert.equal(attribution.pageFailureReason, "page_response_invalid");
  });

  test("safe telemetry facts exclude hostile keys", () => {
    const facts = pageExecutionAttributionToTelemetryFacts(
      classifyScrubbedPageFailureMessage({ substage: "page_contract_ready" }),
    );
    assert.ok(!("jobId" in facts));
    assert.ok(!("url" in facts));
    assert.ok(!("stack" in facts));
    assert.equal(facts.page_substage, "page_contract_ready");
  });

  test("sanitizePageExecutionTelemetryFacts rejects incomplete facts", () => {
    assert.equal(
      sanitizePageExecutionTelemetryFacts({
        execution_substage: "page_contract_ready",
      }),
      undefined,
    );
  });

  test("sanitizePageExecutionTelemetryFacts accepts allowlisted triple", () => {
    const parsed = sanitizePageExecutionTelemetryFacts({
      page_substage: "page_response_wait",
      page_failure_reason: "page_response_missing",
      page_response_class: "missing_payload",
    });
    assert.equal(parsed?.pageFailureReason, "page_response_missing");
  });

  test("claimed render snapshot preserves page fields in safe telemetry", () => {
    const snap = buildClaimedRenderExecutionAttributionSnapshot({
      executionSubstage: "page_response_validate",
      dispositionKind: "terminal_failure",
      durableJobStateClass: "failed",
      claimTokenCoherenceClass: "cleared_after_terminal",
      cleanupScheduledClass: "not_applicable",
      pageFailureReason: "page_response_invalid",
      pageResponseClass: "invalid_payload",
    });
    const facts = executionAttributionToSafeTelemetryFacts(snap);
    assert.equal(facts.page_failure_reason, "page_response_invalid");
    assert.ok(!("manifest" in facts));
  });

  test("no false success after page terminal failure disposition", () => {
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
    assert.equal(snap?.dispositionKind, "terminal_failure");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
