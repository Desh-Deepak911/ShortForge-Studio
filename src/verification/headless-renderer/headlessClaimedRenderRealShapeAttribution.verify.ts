/**
 * Sprint 11E Phase 2E.2D.8F.5.1 — real claimed-render attribution shape authority.
 * Run: npm run test:headless-claimed-render-real-shape-attribution
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createInitialPageWorkspaceAttribution,
  isPageWorkspaceAttributionTelemetryComplete,
  PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES,
  pageWorkspaceAttributionToTelemetryFacts,
  sanitizePageWorkspaceAttributionFromTelemetryFacts,
  sanitizePageWorkspaceAttributionSnapshot,
} from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";
import {
  PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID,
  resolvePageFailureReasonForAttributionFacts,
  resolveTerminalPageFailureAttribution,
  validatePageWorkspaceAttributionComplete,
} from "@/features/headless-renderer/worker/chromium/page-workspace-attribution-invariant";
import {
  buildClaimedRenderExecutionAttributionSnapshot,
  buildExecutionAttributionFromClaimedResult,
  executionAttributionToSafeTelemetryFacts,
  sanitizeExecutionAttributionFromTelemetryFacts,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  mapClaimedRenderToHostedResult,
  type ClaimedRenderExecutionResult,
} from "@/features/headless-renderer/worker/runtime/execute-claimed-render";
import {
  assertProductionChainWorkspaceFactsComplete,
  runClaimedRenderAttributionProductionChain,
  runMaterializeAttributionObservation,
} from "@/features/headless-renderer/worker/testing/claimed-render-attribution-production-chain";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { buildAttributionFromTerminalJob } from "./fly-render-live/claim-correlation-authority";
import { renderFlyRenderExecutionProbeEvidenceMarkdown } from "./fly-render-live/claimed-render-execution-probe-evidence";
import { buildHeadlessFlyRenderLiveSmokeWorkloadEvidence } from "./fly-render-live/smoke-workload";

const DIST = join(process.cwd(), "dist/headless-worker");
let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function completeWorkspace() {
  return Object.freeze({
    ...createInitialPageWorkspaceAttribution(),
    shippedArtifactResolutionClass: "resolved_readable" as const,
    sourcePageArtifactPresent: "present_readable" as const,
    sourceArtifactDigestMatch: "match" as const,
    materializedArtifactPresent: "present_readable" as const,
    materializedArtifactDigestMatch: "match" as const,
    materializedByteLengthMatch: "match" as const,
    indexScriptReferenceClass: "valid_relative" as const,
    fileNavigationLoadClass: "loaded" as const,
    scriptLoadClass: "loaded" as const,
    scriptExecutionClass: "evaluation_error" as const,
    pageErrorClass: "runtime_exception" as const,
    contractGlobalPresence: "missing" as const,
    contractVersionMatch: "not_applicable" as const,
    bootstrapResponseClass: "missing_contract" as const,
    cleanupDisposition: "ok" as const,
  });
}

function terminalFromWorkspace(
  workspace: ReturnType<typeof completeWorkspace>,
  pageFailureReason: "page_contract_missing" | "page_workspace_attribution_missing" = "page_contract_missing",
): ClaimedRenderExecutionResult {
  return {
    kind: "failed",
    phase: "render",
    reasonId: "WORKER_FAILED",
    coherenceRejection: null,
    evidence: null,
    orphanCleanup: null,
    succeededCasLost: false,
    executionAttribution: buildExecutionAttributionFromClaimedResult({
      result: { kind: "failed", phase: "render", reasonId: "WORKER_FAILED" },
      executionSubstage: "page_contract_ready",
      durableJobState: "failed",
      storeVersionBefore: 1,
      storeVersionAfter: 2,
      claimTokenCoherenceClass: "cleared_after_terminal",
      boundedDurationMs: 900,
      pageFailureReason,
      pageResponseClass: "missing_api",
      pageWorkspaceAttribution: workspace,
    }),
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.5.1 — real claimed-render attribution shape authority\n",
  );

  await test("completeness validator requires all fifteen enum-valid fields", () => {
    const complete = validatePageWorkspaceAttributionComplete(completeWorkspace());
    assert.equal(complete.ok, true);
    const incomplete = validatePageWorkspaceAttributionComplete({
      ...completeWorkspace(),
      scriptLoadClass: "not_a_real_class",
    });
    assert.equal(incomplete.ok, false);
    if (!incomplete.ok) {
      assert.equal(incomplete.failClass, "sanitize_rejected");
    }
  });

  await test("missing attribution after workspace prep becomes page_workspace_attribution_missing", () => {
    const resolved = resolveTerminalPageFailureAttribution({
      workspacePrepared: true,
      executionSubstage: "page_contract_ready",
      pageFailureReason: "page_contract_missing",
      pageWorkspaceAttribution: undefined,
    });
    assert.equal(resolved.pageFailureReason, PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID);
    assert.equal(resolved.pageWorkspaceAttribution, undefined);
  });

  await test("page_contract_missing is not emitted without complete workspace snapshot", () => {
    const reason = resolvePageFailureReasonForAttributionFacts({
      executionSubstage: "page_contract_ready",
      pageFailureReason: "page_contract_missing",
      pageWorkspaceAttribution: undefined,
    });
    assert.equal(reason, PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID);
  });

  await test("real page_contract_ready failure retains complete attribution through mapper", () => {
    const workspace = completeWorkspace();
    const snapshot = buildExecutionAttributionFromClaimedResult({
      result: { kind: "failed", phase: "render", reasonId: "WORKER_FAILED" },
      executionSubstage: "page_contract_ready",
      durableJobState: "failed",
      claimTokenCoherenceClass: "cleared_after_terminal",
      pageFailureReason: "page_contract_missing",
      pageResponseClass: "missing_api",
      pageWorkspaceAttribution: workspace,
    });
    assert.equal(snapshot.pageFailureReason, "page_contract_missing");
    assert.ok(snapshot.pageWorkspaceAttribution != null);
    const facts = executionAttributionToSafeTelemetryFacts(snapshot);
    assertProductionChainWorkspaceFactsComplete(facts);
    assert.equal(facts.page_failure_reason, "page_contract_missing");
  });

  await test("page bundle missing materialization retains fifteen workspace fields", async () => {
    const obs = await runMaterializeAttributionObservation({
      scenario: "page_bundle_missing",
    });
    const validated = validatePageWorkspaceAttributionComplete(
      obs.pageWorkspaceAttribution,
    );
    assert.equal(validated.ok, true);
  });

  await test("materialized digest mismatch retains materialization attribution", async () => {
    assert.equal(existsSync(join(DIST, "page-render.iife.js")), true);
    const obs = await runMaterializeAttributionObservation({
      scenario: "materialized_digest_mismatch",
    });
    const validated = validatePageWorkspaceAttributionComplete(
      obs.pageWorkspaceAttribution,
    );
    assert.equal(validated.ok, true);
  });

  await test("bootstrap rejection classification remains distinct", () => {
    const workspace = Object.freeze({
      ...completeWorkspace(),
      pageErrorClass: "bootstrap_rejected" as const,
      contractGlobalPresence: "present" as const,
      bootstrapResponseClass: "rejected" as const,
      scriptExecutionClass: "executed" as const,
    });
    const facts = pageWorkspaceAttributionToTelemetryFacts(workspace);
    assert.equal(facts.page_error_class, "bootstrap_rejected");
    assert.equal(facts.bootstrap_response_class, "rejected");
  });

  await test("missing attribution converted to page_workspace_attribution_missing in hosted telemetry", () => {
    const snapshot = buildExecutionAttributionFromClaimedResult({
      result: { kind: "failed", phase: "render", reasonId: "WORKER_FAILED" },
      executionSubstage: "page_contract_ready",
      durableJobState: "failed",
      claimTokenCoherenceClass: "cleared_after_terminal",
      pageFailureReason: "page_contract_missing",
      pageResponseClass: "missing_api",
    });
    assert.equal(
      snapshot.pageFailureReason,
      PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID,
    );
    assert.equal(snapshot.pageWorkspaceAttribution, undefined);
  });

  await test("terminal mapper round-trip preserves complete workspace facts", () => {
    const workspace = completeWorkspace();
    const hosted = mapClaimedRenderToHostedResult(terminalFromWorkspace(workspace));
    const facts = executionAttributionToSafeTelemetryFacts(hosted.executionAttribution!);
    const roundTrip = sanitizeExecutionAttributionFromTelemetryFacts(facts);
    assert.ok(roundTrip != null);
    assert.equal(
      validatePageWorkspaceAttributionComplete(roundTrip.pageWorkspaceAttribution).ok,
      true,
    );
    for (const key of PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES) {
      assert.equal(
        pageWorkspaceAttributionToTelemetryFacts(roundTrip.pageWorkspaceAttribution!)[key],
        facts[key],
      );
    }
  });

  await test("hosted telemetry round-trip preserves cleanup disposition", () => {
    const workspace = Object.freeze({
      ...completeWorkspace(),
      cleanupDisposition: "ok" as const,
    });
    const facts = executionAttributionToSafeTelemetryFacts(
      buildExecutionAttributionFromClaimedResult({
        result: { kind: "failed", phase: "render", reasonId: "WORKER_FAILED" },
        executionSubstage: "page_cleanup",
        durableJobState: "failed",
        claimTokenCoherenceClass: "cleared_after_terminal",
        pageFailureReason: "page_cleanup_failed",
        pageWorkspaceAttribution: workspace,
      }),
    );
    assert.equal(facts.workspace_cleanup_class, "ok");
  });

  await test("privacy scrubbing rejects hostile workspace enum strings", () => {
    assert.equal(
      sanitizePageWorkspaceAttributionSnapshot({
        ...completeWorkspace(),
        scriptLoadClass: "file:///etc/passwd",
      }),
      undefined,
    );
    const facts = executionAttributionToSafeTelemetryFacts(
      buildClaimedRenderExecutionAttributionSnapshot({
        executionSubstage: "page_contract_ready",
        dispositionKind: "terminal_failure",
        durableJobStateClass: "failed",
        claimTokenCoherenceClass: "cleared_after_terminal",
        pageWorkspaceAttribution: completeWorkspace(),
      }),
    );
    assert.equal(facts.source_artifact_presence_class, "present_readable");
    assert.equal(JSON.stringify(facts).includes("/tmp/"), false);
    assert.equal(JSON.stringify(facts).includes("postgresql://"), false);
  });

  await test("probe fallback without workspace facts yields page_workspace_attribution_missing", () => {
    const attribution = buildAttributionFromTerminalJob({
      job: {
        stage: "canonical",
        storeVersion: 3,
        claimToken: null,
        canonicalJob: {
          state: "failed",
          attempt: 1,
          updatedAtMs: 1_000,
          terminalReason: { reasonId: "WORKER_FAILED", retryable: false },
        },
      } as never,
      deliveryEvents: [],
      renderStartedAtMs: 0,
      initialStoreVersion: 1,
    });
    assert.ok(attribution != null);
    assert.equal(attribution.pageFailureReason, PAGE_WORKSPACE_ATTRIBUTION_MISSING_REASON_ID);
    assert.equal(attribution.pageWorkspaceAttribution, undefined);
  });

  await test("compiled hosted-worker bundle retains fifteen workspace telemetry key paths", () => {
    assert.equal(existsSync(join(DIST, "hosted-worker.js")), true);
    const bundle = readFileSync(join(DIST, "hosted-worker.js"), "utf8");
    for (const key of PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES) {
      assert.match(bundle, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(bundle, /page_workspace_attribution_missing/);
  });

  const chrome = resolveSystemChromeExecutable();
  if (chrome.ok && existsSync(join(DIST, "page-render.iife.js"))) {
    await test("production chain contract_missing preserves fifteen fields through executeClaimedRender", async () => {
      const chain = await runClaimedRenderAttributionProductionChain({
        scenario: "contract_missing",
        contentDurationMs: 1_000,
      });
      assert.equal(chain.renderSession.executionSubstage, "page_contract_ready");
      assert.equal(chain.renderSession.pageFailureReason, "page_contract_missing");
      assert.equal(
        validatePageWorkspaceAttributionComplete(chain.renderSession.pageWorkspaceAttribution).ok,
        true,
      );
      assert.equal(chain.claimedResult.kind, "failed");
      assert.ok(chain.claimedResult.executionAttribution != null);
      assert.equal(
        validatePageWorkspaceAttributionComplete(
          chain.claimedResult.executionAttribution!.pageWorkspaceAttribution,
        ).ok,
        true,
      );
      assert.equal(chain.workspaceTelemetryComplete, true);
      assertProductionChainWorkspaceFactsComplete(chain.hostedFacts);
      assert.equal(chain.hostedFacts.page_failure_reason, "page_contract_missing");
    });

    await test("compiled bundle round-trip matches source production-chain telemetry keys", async () => {
      const chain = await runClaimedRenderAttributionProductionChain({
        scenario: "contract_missing",
        contentDurationMs: 1_000,
      });
      const bundle = readFileSync(join(DIST, "hosted-worker.js"), "utf8");
      for (const key of PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES) {
        assert.equal(typeof chain.hostedFacts[key], "string");
        assert.match(bundle, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    });
  } else {
    console.log("  · skipped production-chain chrome tests (chrome or bundle unavailable)");
  }

  await test("execution-probe evidence renders complete workspace attribution without paths", () => {
    const markdown = renderFlyRenderExecutionProbeEvidenceMarkdown({
      title: "real-shape fixture",
      overall: "FAIL",
      eligibilityVerdict: "NOT ELIGIBLE",
      startedAtIso: "2026-07-23T00:00:00.000Z",
      endedAtIso: "2026-07-23T00:00:01.000Z",
      failureSubstage: "page_contract_ready",
      failureReasonId: "page_contract_missing",
      executionAttribution: buildClaimedRenderExecutionAttributionSnapshot({
        executionSubstage: "page_contract_ready",
        dispositionKind: "terminal_failure",
        durableJobStateClass: "failed",
        claimTokenCoherenceClass: "cleared_after_terminal",
        cleanupScheduledClass: "not_applicable",
        pageFailureReason: "page_contract_missing",
        pageResponseClass: "missing_api",
        pageWorkspaceAttribution: completeWorkspace(),
      }),
      cleanupStatus: "ok",
      executionStages: [{ stageId: "hosted.chromium_execution", status: "FAIL" }],
      smokeWorkload: buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(),
      resourceObservation: null,
      executionDurationMs: 900,
      artifactAuthority: null,
      acceptedImageDigestSha256: null,
      notes: ["real-shape fixture"],
    } as never);
    assert.match(markdown, /source_artifact_presence_class=present_readable/);
    assert.equal(markdown.includes("/tmp/"), false);
    assert.equal(markdown.includes("sha256:"), false);
  });

  await test("incomplete telemetry facts fail sanitize round-trip", () => {
    const facts = pageWorkspaceAttributionToTelemetryFacts(completeWorkspace());
    const incomplete = { ...facts };
    delete (incomplete as Record<string, string>).script_execution_class;
    assert.equal(isPageWorkspaceAttributionTelemetryComplete(incomplete), false);
    assert.equal(
      sanitizePageWorkspaceAttributionFromTelemetryFacts(incomplete),
      undefined,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
