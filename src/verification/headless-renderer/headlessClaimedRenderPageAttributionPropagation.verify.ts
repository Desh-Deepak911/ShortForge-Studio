/**
 * Sprint 11E Phase 2E.2D.8F.5 — claimed-render page attribution propagation authority.
 * Run: npm run test:headless-claimed-render-page-attribution-propagation
 */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runClaimedRenderPageParity } from "@/features/headless-renderer/worker/chromium/claimed-render-page-parity";
import {
  createInitialPageWorkspaceAttribution,
  isPageWorkspaceAttributionTelemetryComplete,
  PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES,
  pageWorkspaceAttributionToTelemetryFacts,
  sanitizePageWorkspaceAttributionFromTelemetryFacts,
} from "@/features/headless-renderer/worker/chromium/page-workspace-attribution";
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
import { renderFlyRenderExecutionProbeEvidenceMarkdown } from "./fly-render-live/claimed-render-execution-probe-evidence";
import { buildAttributionFromTerminalJob } from "./fly-render-live/claim-correlation-authority";
import { buildHeadlessFlyRenderLiveSmokeWorkloadEvidence } from "./fly-render-live/smoke-workload";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function terminalRenderResult(
  pageWorkspaceAttribution: ReturnType<typeof createInitialPageWorkspaceAttribution>,
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
      result: {
        kind: "failed",
        phase: "render",
        reasonId: "WORKER_FAILED",
      },
      executionSubstage: "page_contract_ready",
      durableJobState: "failed",
      storeVersionBefore: 1,
      storeVersionAfter: 2,
      claimTokenCoherenceClass: "cleared_after_terminal",
      boundedDurationMs: 900,
      pageFailureReason: "page_contract_missing",
      pageResponseClass: "missing_api",
      pageWorkspaceAttribution,
    }),
  };
}

async function withTempBundleDir(
  fn: (dir: string, bundlePath: string) => Promise<void> | void,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "fb-attr-prop-"));
  const distPage = join(process.cwd(), "dist/headless-worker/page-render.iife.js");
  assert.equal(existsSync(distPage), true);
  const bytes = readFileSync(distPage);
  const bundlePath = join(dir, "page-render.iife.js");
  writeFileSync(bundlePath, bytes);
  try {
    await fn(dir, bundlePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F.5 — claimed-render page attribution propagation authority\n",
  );

  await test("page workspace telemetry exposes fifteen safe classification fields", () => {
    assert.equal(PAGE_WORKSPACE_TELEMETRY_FIELD_NAMES.length, 15);
    const facts = pageWorkspaceAttributionToTelemetryFacts(
      createInitialPageWorkspaceAttribution(),
    );
    assert.equal(Object.keys(facts).length, 15);
    assert.equal(isPageWorkspaceAttributionTelemetryComplete(facts), true);
  });

  await test("missing workspace telemetry fields fail completeness", () => {
    const facts = pageWorkspaceAttributionToTelemetryFacts(
      createInitialPageWorkspaceAttribution(),
    );
    const incomplete = { ...facts };
    delete (incomplete as Record<string, string>).script_load_class;
    assert.equal(isPageWorkspaceAttributionTelemetryComplete(incomplete), false);
    assert.equal(
      sanitizePageWorkspaceAttributionFromTelemetryFacts(incomplete),
      undefined,
    );
  });

  await test("hostile workspace strings are scrubbed from telemetry emission", () => {
    assert.throws(() =>
      pageWorkspaceAttributionToTelemetryFacts({
        ...createInitialPageWorkspaceAttribution(),
        shippedArtifactResolutionClass: "https://evil.example" as never,
      }),
    );
  });

  await test("bootstrap rejection remains distinct from missing contract", () => {
    const bootstrapRejected = pageWorkspaceAttributionToTelemetryFacts({
      ...createInitialPageWorkspaceAttribution(),
      shippedArtifactResolutionClass: "resolved_readable",
      sourcePageArtifactPresent: "present_readable",
      sourceArtifactDigestMatch: "match",
      materializedArtifactPresent: "present_readable",
      materializedArtifactDigestMatch: "match",
      materializedByteLengthMatch: "match",
      indexScriptReferenceClass: "valid_relative",
      fileNavigationLoadClass: "loaded",
      scriptLoadClass: "loaded",
      scriptExecutionClass: "executed",
      pageErrorClass: "bootstrap_rejected",
      contractGlobalPresence: "present",
      contractVersionMatch: "match",
      bootstrapResponseClass: "rejected",
      cleanupDisposition: "ok",
    });
    const missingContract = pageWorkspaceAttributionToTelemetryFacts({
      ...sanitizePageWorkspaceAttributionFromTelemetryFacts(bootstrapRejected)!,
      pageErrorClass: "runtime_exception",
      contractGlobalPresence: "missing",
      contractVersionMatch: "not_applicable",
      bootstrapResponseClass: "missing_contract",
      scriptExecutionClass: "evaluation_error",
    });
    assert.notEqual(
      bootstrapRejected.bootstrap_response_class,
      missingContract.bootstrap_response_class,
    );
    assert.notEqual(
      bootstrapRejected.page_error_class,
      missingContract.page_error_class,
    );
  });

  await test("workspace attribution reaches hosted delivery telemetry", () => {
    const workspace = Object.freeze({
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
    const hosted = mapClaimedRenderToHostedResult(terminalRenderResult(workspace));
    const facts = executionAttributionToSafeTelemetryFacts(
      hosted.executionAttribution!,
    );
    assert.equal(facts.source_artifact_presence_class, "present_readable");
    assert.equal(facts.bootstrap_response_class, "missing_contract");
    assert.equal(facts.page_failure_reason, "page_contract_missing");
    assert.ok(!("424ad4a06e374162c1052682aa626126840dbcf3c54464d64719527fa7b7ea7d" in facts));
  });

  await test("workspace attribution reaches execution-probe evidence on terminal failure", () => {
    const workspace = Object.freeze({
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
    const markdown = renderFlyRenderExecutionProbeEvidenceMarkdown({
      title: "attribution propagation fixture",
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
        pageWorkspaceAttribution: workspace,
      }),
      cleanupStatus: "ok",
      executionStages: [{ stageId: "hosted.chromium_execution", status: "FAIL" }],
      smokeWorkload: buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(),
      resourceObservation: null,
      executionDurationMs: 900,
      artifactAuthority: null,
      acceptedImageDigestSha256: null,
      notes: ["fixture"],
    } as never);
    assert.match(markdown, /## Page workspace attribution/);
    assert.match(markdown, /source_artifact_presence_class=present_readable/);
    assert.match(markdown, /bootstrap_response_class=missing_contract/);
    assert.equal(markdown.includes("/tmp/"), false);
  });

  await test("cleanup runs and remains attributed", () => {
    const facts = pageWorkspaceAttributionToTelemetryFacts({
      ...createInitialPageWorkspaceAttribution(),
      shippedArtifactResolutionClass: "absent",
      sourcePageArtifactPresent: "absent",
      materializedArtifactPresent: "absent",
      cleanupDisposition: "ok",
    });
    assert.equal(facts.workspace_cleanup_class, "ok");
    assert.equal(facts.shipped_artifact_resolution_class, "absent");
  });

  await test("historical delivery events cannot supply current workspace attribution", () => {
    const historicalFacts = {
      execution_substage: "page_contract_ready",
      disposition_kind: "terminal_failure",
      durable_job_state_class: "failed",
      claim_token_coherence_class: "cleared_after_terminal",
      cleanup_scheduled_class: "not_applicable",
      binary_component_class: "chromium",
      bounded_duration_class: "under_30s",
      page_failure_reason: "page_contract_missing",
      page_response_class: "missing_api",
    };
    const parsedHistorical =
      sanitizeExecutionAttributionFromTelemetryFacts(historicalFacts);
    assert.ok(parsedHistorical != null);
    assert.equal(parsedHistorical.pageWorkspaceAttribution, undefined);

    const current = buildAttributionFromTerminalJob({
      job: {
        stage: "canonical",
        storeVersion: 3,
        claimToken: null,
        canonicalJob: {
          state: "failed",
          attempt: 1,
          updatedAtMs: 1_000,
          terminalReason: {
            reasonId: "WORKER_FAILED",
            retryable: false,
          },
        },
      } as never,
      deliveryEvents: [
        {
          name: "hosted.loop.delivery",
          atMs: 500,
          action: "terminalized_render_failure",
          reasonId: "page_contract_missing",
          facts: historicalFacts,
        },
        {
          name: "hosted.loop.delivery",
          atMs: 1_500,
          action: "terminalized_render_failure",
          reasonId: "page_contract_missing",
          facts: {
            ...historicalFacts,
            ...pageWorkspaceAttributionToTelemetryFacts({
              ...createInitialPageWorkspaceAttribution(),
              shippedArtifactResolutionClass: "resolved_readable",
              sourcePageArtifactPresent: "present_readable",
              sourceArtifactDigestMatch: "match",
              materializedArtifactPresent: "present_readable",
              materializedArtifactDigestMatch: "match",
              materializedByteLengthMatch: "match",
              indexScriptReferenceClass: "valid_relative",
              fileNavigationLoadClass: "loaded",
              scriptLoadClass: "loaded",
              scriptExecutionClass: "evaluation_error",
              pageErrorClass: "runtime_exception",
              contractGlobalPresence: "missing",
              contractVersionMatch: "not_applicable",
              bootstrapResponseClass: "missing_contract",
              cleanupDisposition: "ok",
            }),
          },
        },
      ],
      renderStartedAtMs: 1_000,
      initialStoreVersion: 2,
    });
    assert.ok(current != null);
    assert.equal(
      current.pageWorkspaceAttribution?.bootstrapResponseClass,
      "missing_contract",
    );
  });

  await test("claimed-render and diagnostic parity on production bundle", async () => {
    await withTempBundleDir(async (dir) => {
      const parity = await runClaimedRenderPageParity({
        env: { HEADLESS_HOSTED_WORKER_ROOT: dir },
      });
      assert.equal(parity.ok, true);
      if (!parity.ok) return;
      assert.equal(parity.smokeProfileId, "720p-webm-30");
      assert.equal(parity.contentDurationMs, 2_000);
      assert.equal(
        parity.productionFacts.materialized_artifact_digest_class,
        "match",
      );
    });
  });

  await test("production dist page artifact unchanged for parity fixture", () => {
    const hash = createHash("sha256")
      .update(readFileSync("dist/headless-worker/page-render.iife.js"))
      .digest("hex");
    assert.equal(
      hash,
      "424ad4a06e374162c1052682aa626126840dbcf3c54464d64719527fa7b7ea7d",
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
