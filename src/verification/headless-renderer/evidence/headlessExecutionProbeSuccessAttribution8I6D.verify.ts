/**
 * Sprint 11E Phase 2E.2D.8I.6D — success-attribution evidence closure authority.
 * Run: npm run test:headless-execution-probe-success-attribution-8i6d
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildClaimedRenderExecutionAttributionSnapshot } from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";

import {
  executionProbeCannotFalsePass,
  executionProbeSuccessAttributionIsAuthoritative,
  writeFlyRenderExecutionProbeEvidence,
} from "../fly-render-live/claimed-render-execution-probe-evidence";
import { deriveExecutionProbeSuccessAttribution } from "../fly-render-live/execution-probe-success-attribution";
import {
  build8I6CAllPassNullAttributionFixture,
  buildAllPassFailedCleanupFixture,
  buildBoundaryIngestionFailureFixture,
  buildIllegalFailureCasBoundaryFixture,
  buildIncompleteAttributionFixture,
  buildMissingSucceededCasProofFixture,
  buildSuccessAttributionDerivedFixture,
  buildTerminalFailureDisguisedFixture,
} from "../fly-render-live/execution-probe-success-attribution-fixtures";
import { buildHeadlessFlyRenderLiveSmokeWorkloadEvidence } from "../fly-render-live/smoke-workload";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8I.6D — success-attribution evidence closure\n",
  );

  await test("8I.6C all-stage-PASS shape starts with null stage attribution", () => {
    const fixture = build8I6CAllPassNullAttributionFixture();
    assert.equal(fixture.stageAttribution, null);
    assert.equal(fixture.stages.every((stage) => stage.status === "PASS"), true);
  });

  await test("authoritative signals derive succeeded attribution", () => {
    const derived = deriveExecutionProbeSuccessAttribution(
      buildSuccessAttributionDerivedFixture(),
    );
    assert.equal(derived.ok, true);
    if (derived.ok) {
      assert.equal(derived.attribution.dispositionKind, "succeeded");
      assert.equal(derived.attribution.executionSubstage, "succeeded_cas");
      assert.equal(derived.attribution.durableJobStateClass, "succeeded");
      assert.equal(
        executionProbeSuccessAttributionIsAuthoritative(derived.attribution),
        true,
      );
    }
  });

  await test("all stages PASS but missing succeeded-CAS proof fails closed", () => {
    const derived = deriveExecutionProbeSuccessAttribution(
      buildMissingSucceededCasProofFixture(),
    );
    assert.equal(derived.ok, false);
    if (!derived.ok) {
      assert.equal(
        derived.failureCategory,
        "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BOUNDARY_SEQUENCE_INCOHERENT",
      );
    }
  });

  await test("all stages PASS but failed cleanup fails closed", () => {
    const derived = deriveExecutionProbeSuccessAttribution(
      buildAllPassFailedCleanupFixture(),
    );
    assert.equal(derived.ok, false);
    if (!derived.ok) {
      assert.equal(
        derived.failureCategory,
        "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_CLEANUP_FAILED",
      );
    }
  });

  await test("terminal failure disguised behind stage booleans fails closed", () => {
    const derived = deriveExecutionProbeSuccessAttribution(
      buildTerminalFailureDisguisedFixture(),
    );
    assert.equal(derived.ok, false);
    if (!derived.ok) {
      assert.equal(
        derived.failureCategory,
        "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_TERMINAL_DISGUISED",
      );
    }
  });

  await test("boundary-ingestion failure fails closed", () => {
    const derived = deriveExecutionProbeSuccessAttribution(
      buildBoundaryIngestionFailureFixture(),
    );
    assert.equal(derived.ok, false);
    if (!derived.ok) {
      assert.equal(
        derived.failureCategory,
        "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BOUNDARY_INGESTION_FAILED",
      );
    }
  });

  await test("illegal failure CAS after succeeded CAS fails closed", () => {
    const derived = deriveExecutionProbeSuccessAttribution(
      buildIllegalFailureCasBoundaryFixture(),
    );
    assert.equal(derived.ok, false);
    if (!derived.ok) {
      assert.equal(
        derived.failureCategory,
        "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BOUNDARY_SEQUENCE_INCOHERENT",
      );
    }
  });

  await test("incomplete delivery disposition fails closed", () => {
    const derived = deriveExecutionProbeSuccessAttribution(
      buildIncompleteAttributionFixture(),
    );
    assert.equal(derived.ok, false);
    if (!derived.ok) {
      assert.equal(
        derived.failureCategory,
        "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_DELIVERY_DISPOSITION_NOT_SUCCEEDED",
      );
    }
  });

  await test("successful evidence write accepts dispositionKind=succeeded", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fep-8i6d-"));
    const evidencePath = path.join(dir, "probe.md");
    try {
      const derived = deriveExecutionProbeSuccessAttribution(
        buildSuccessAttributionDerivedFixture(),
      );
      assert.equal(derived.ok, true);
      if (!derived.ok) return;
      writeFlyRenderExecutionProbeEvidence({
        evidencePath,
        document: {
          title: "test",
          overall: "PASS",
          eligibilityVerdict: "ELIGIBLE",
          startedAtIso: "2026-07-25T08:23:00.000Z",
          endedAtIso: "2026-07-25T08:24:00.000Z",
          failureSubstage: null,
          failureReasonId: null,
          executionAttribution: derived.attribution,
          cleanupStatus: "ok",
          executionStages: [],
          smokeWorkload: buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(),
          resourceObservation: null,
          executionDurationMs: 1000,
          artifactAuthority: null,
          acceptedImageDigestSha256:
            "7a97f472859f5f8071d0311ee4d77c29f44ff44cb402aa57eed8f13872a74794",
          owningBoundaryEvidence: null,
          owningBoundaryIngestionFailure: null,
          boundaryEmissionClassification: null,
          jobCreateAttribution: null,
          notes: ["safe"],
        },
      });
      assert.equal(
        executionProbeCannotFalsePass({
          overall: "PASS",
          executionAttribution: derived.attribution,
        } as never),
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await test("terminal failure cannot convert to PASS evidence", () => {
    assert.throws(() =>
      writeFlyRenderExecutionProbeEvidence({
        evidencePath: ".tmp/execution-probe-false-pass-8i6d.md",
        document: {
          title: "x",
          overall: "PASS",
          eligibilityVerdict: "x",
          startedAtIso: null,
          endedAtIso: null,
          failureSubstage: null,
          failureReasonId: null,
          executionAttribution: buildClaimedRenderExecutionAttributionSnapshot({
            executionSubstage: "terminal_failure_cas",
            dispositionKind: "terminal_failure",
            durableJobStateClass: "failed",
            claimTokenCoherenceClass: "cleared_after_terminal",
            cleanupScheduledClass: "not_applicable",
            boundedDurationMs: 100,
          }),
          cleanupStatus: "ok",
          executionStages: [],
          smokeWorkload: null,
          resourceObservation: null,
          executionDurationMs: null,
          artifactAuthority: null,
          acceptedImageDigestSha256: null,
          owningBoundaryEvidence: null,
          owningBoundaryIngestionFailure: null,
          boundaryEmissionClassification: null,
          jobCreateAttribution: null,
          notes: [],
        },
      }),
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
