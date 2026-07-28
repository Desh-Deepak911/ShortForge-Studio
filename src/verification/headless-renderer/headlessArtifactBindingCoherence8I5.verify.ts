/**
 * Sprint 11E Phase 2E.2D.8I.5 — artifact binding coherence + evidence allowlist repair.
 * Run: npm run test:headless-artifact-binding-coherence-8i5
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildProductionShapedArtifactObjectKey,
  productionShapedArtifactObjectKeyLength,
} from "@/features/headless-renderer/control-plane/services/classify-artifact-object-binding-field-comparisons";
import { evaluateArtifactObjectBindingCoherence } from "@/features/headless-renderer/control-plane/services/evaluate-artifact-object-binding-coherence";
import { validateHeadlessArtifactObjectBinding, buildValidatedArtifactObjectBinding } from "@/features/headless-renderer/control-plane/services/validate-artifact-object-binding";
import { HEADLESS_MAX_ID_LENGTH, HEADLESS_MAX_OBJECT_KEY_LENGTH } from "@/features/headless-renderer/domain/headless-render-constants";
import {
  assertClaimedRenderExecutionReasonCrossAuthorityInvariant,
  EXECUTION_PROBE_MAPPED_FAILURE_REASON_IDS,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-reason-cross-authority";
import {
  isClaimedRenderExecutionReasonId,
  CLAIMED_RENDER_EXECUTION_REASON_IDS,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  runPostFrameBindingFailureAfterProviderFinalizeFixture,
  runPostFrameBindingFieldComparisonFixtures,
  runPostFramePrimaryPreservedWhenCleanupAlsoFailsFixture,
} from "@/features/headless-renderer/worker/testing/post-frame-failure-containment-fixtures";

import {
  executionProbeStagesFromTerminalAttribution,
  resolveExecutionProbeFailStageFromSubstage,
} from "./fly-render-live/execution-probe-stage-attribution";
import { buildHeadlessFlyRenderLiveSmokeWorkloadEvidence } from "./fly-render-live/smoke-workload";
import {
  writeFlyRenderExecutionProbeEvidence,
  EXECUTION_PROBE_ELIGIBILITY,
  EXECUTION_PROBE_EVIDENCE_TITLE,
  type FlyRenderExecutionProbeEvidenceDocument,
} from "./fly-render-live/claimed-render-execution-probe-evidence";
import { buildClaimedRenderExecutionAttributionSnapshot } from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function coherentBindingFixture(overrides?: {
  objectKey?: string;
}) {
  const digest = `sha256:${"a".repeat(64)}`;
  const objectKey = overrides?.objectKey ?? "artifact/key";
  const artifact = {
    contentDigest: digest,
    byteLength: 100,
    mimeType: "video/webm",
    fingerprint: `hra:sha256:${"b".repeat(64)}`,
    expiresAtMs: 9_000,
    rendererBuildId: "worker-build-a",
  };
  const job = {
    state: "succeeded" as const,
    jobId: "job_1",
    attempt: 1,
    ownership: { ownerId: "owner_a", projectId: "proj_a" },
    requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
    rendererBuildId: "worker-build-a",
    artifact,
  };
  const request = {
    ownership: { ownerId: "owner_a", projectId: "proj_a" },
    requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
  };
  const finalized = {
    finalized: true,
    purpose: "artifact" as const,
    ownerId: "owner_a",
    projectId: "proj_a",
    locator: {
      kind: "object_storage" as const,
      storeId: "artifacts",
      objectKey,
    },
    contentDigest: digest,
    byteLength: 100,
    mimeType: "video/webm",
    expiresAtMs: 9_000,
  };
  return { job, request, artifact, finalized };
}

function bindingFailureEvidenceDocument(): FlyRenderExecutionProbeEvidenceDocument {
  const attribution = buildClaimedRenderExecutionAttributionSnapshot({
    executionSubstage: "artifact_binding_validation",
    dispositionKind: "terminal_failure",
    durableJobStateClass: "failed",
    claimTokenCoherenceClass: "cleared_after_terminal",
    cleanupScheduledClass: "confirmed",
    safeWorkerCode: "WORKER_FAILED",
    primaryExecutionSubstage: "artifact_binding_validation",
    secondaryTerminalCasSubstage: "terminal_failure_cas",
    secondaryTerminalCasOutcome: "confirmed",
    terminalCasStoreVersionDelta: "plus_one",
  });
  const cases = executionProbeStagesFromTerminalAttribution({
    failStageId: "artifact.binding_coherence",
    failureCategory: "ARTIFACT_BINDING_INCOHERENT",
  });
  return {
    title: EXECUTION_PROBE_EVIDENCE_TITLE,
    overall: "FAIL",
    eligibilityVerdict: EXECUTION_PROBE_ELIGIBILITY.FAIL,
    startedAtIso: "2026-07-25T00:00:00.000Z",
    endedAtIso: "2026-07-25T00:00:05.000Z",
    cleanupStatus: "ok",
    failureSubstage: "artifact_binding_validation",
    failureReasonId: "artifact_binding_validation_failed",
    executionAttribution: attribution,
    executionStages: cases.map((stage) => ({
      stageId: stage.caseId,
      status: stage.status,
      ...(stage.failureCategory != null
        ? { failureCategory: stage.failureCategory }
        : {}),
    })),
    smokeWorkload: buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(),
    resourceObservation: null,
    executionDurationMs: 37_000,
    artifactAuthority: null,
    acceptedImageDigestSha256: null,
    owningBoundaryEvidence: null,
    owningBoundaryIngestionFailure: null,
    boundaryEmissionClassification: null,
    jobCreateAttribution: null,
    notes: ["fixture only — registered binding failure reason write path"],
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8I.5 — Binding coherence + evidence allowlist repair\n",
  );

  await test("production-shaped R2 object key exceeds bounded id length", () => {
    assert.equal(productionShapedArtifactObjectKeyLength(), 142);
    assert.ok(productionShapedArtifactObjectKeyLength() > 128);
  });

  await test("production-shaped locator accepts coherent binding evaluation", () => {
    const objectKey = buildProductionShapedArtifactObjectKey();
    const fixture = coherentBindingFixture({ objectKey });
    const evaluated = evaluateArtifactObjectBindingCoherence({
      ...fixture,
      nowMs: 1_000,
    } as never);
    assert.equal(evaluated.ok, true);
  });

  await test("8I.4C-shaped binding validation failure emits storage_locator invalid", () => {
    const objectKey = buildProductionShapedArtifactObjectKey();
    const fixture = coherentBindingFixture({ objectKey });
    // Simulate pre-fix validator rejection by truncating store id check path:
    // With fix applied, evaluation succeeds; invalid-field path uses overlong storeId.
    const evaluated = evaluateArtifactObjectBindingCoherence({
      ...fixture,
      finalized: {
        ...fixture.finalized,
        locator: {
          ...fixture.finalized.locator,
          storeId: "x".repeat(129),
        },
      },
      nowMs: 1_000,
    } as never);
    assert.equal(evaluated.ok, false);
    assert.equal(evaluated.failureSubstage, "binding_validation");
    assert.equal(evaluated.firstMismatch?.field, "storage_locator");
    assert.equal(evaluated.firstMismatch?.class, "invalid");
    assert.equal(
      evaluated.firstMismatch?.owningAuthority,
      "storage_locator_authority",
    );
  });

  await test("privacy-safe field comparison classifies individual mismatches", () => {
    const rows = runPostFrameBindingFieldComparisonFixtures();
    assert.equal(rows.digest.field, "content_digest");
    assert.equal(rows.digest.class, "mismatch");
    assert.equal(rows.byteLength.field, "byte_length");
    assert.equal(rows.mimeType.field, "mime_type");
    assert.equal(rows.expiresAtMs.field, "expires_at_ms");
  });

  await test("multiple field mismatches classify as multiple_field_mismatch", () => {
    const fixture = coherentBindingFixture();
    const evaluated = evaluateArtifactObjectBindingCoherence({
      ...fixture,
      finalized: {
        ...fixture.finalized,
        contentDigest: `sha256:${"d".repeat(64)}`,
        byteLength: 101,
      },
      nowMs: 1_000,
    } as never);
    assert.equal(evaluated.ok, false);
    assert.equal(evaluated.mismatchShape, "multiple_field_mismatch");
  });

  await test("artifact_binding_validation_failed is registered in reason allowlist", () => {
    assert.ok(
      CLAIMED_RENDER_EXECUTION_REASON_IDS.includes(
        "artifact_binding_validation_failed",
      ),
    );
    assert.ok(
      isClaimedRenderExecutionReasonId("artifact_binding_validation_failed"),
    );
    assert.ok(
      EXECUTION_PROBE_MAPPED_FAILURE_REASON_IDS.includes(
        "artifact_binding_validation_failed",
      ),
    );
  });

  await test("cross-authority execution reason invariant passes", () => {
    const result = assertClaimedRenderExecutionReasonCrossAuthorityInvariant();
    assert.equal(result.ok, true, result.ok ? "" : result.missingFromRegistry.join(","));
  });

  await test("registered binding failure reason persists execution probe evidence", () => {
    const evidencePath = join(
      mkdtempSync(join(tmpdir(), "fb-8i5-evidence-")),
      "probe.md",
    );
    writeFlyRenderExecutionProbeEvidence({
      evidencePath,
      document: bindingFailureEvidenceDocument(),
    });
    const md = readFileSync(evidencePath, "utf8");
    assert.match(md, /artifact_binding_validation_failed/);
    assert.match(md, /artifact\.binding_coherence.*FAIL/);
  });

  await test("unknown failure reason remains fail-closed for evidence writer", () => {
    const evidencePath = join(
      mkdtempSync(join(tmpdir(), "fb-8i5-evidence-fail-")),
      "probe.md",
    );
    assert.throws(
      () =>
        writeFlyRenderExecutionProbeEvidence({
          evidencePath,
          document: {
            ...bindingFailureEvidenceDocument(),
            failureReasonId: "not_a_registered_reason",
          },
        }),
      /failure_reason_invalid/,
    );
  });

  await test("provider finalize success then binding failure is sequence-coherent", async () => {
    const observed = await runPostFrameBindingFailureAfterProviderFinalizeFixture();
    assert.equal(observed.sequenceCoherent, true);
    assert.equal(observed.terminalSubstage, "artifact_binding_validation");
  });

  await test("terminal CAS secondary attribution preserved without masking binding primary", async () => {
    const observed =
      await runPostFramePrimaryPreservedWhenCleanupAlsoFailsFixture();
    assert.equal(observed.executionSubstage, "artifact_binding_validation");
    assert.equal(observed.primaryExecutionSubstage, "artifact_binding_validation");
  });

  await test("probe stage attribution preserves upstream PASS and binding FAIL", () => {
    assert.equal(
      resolveExecutionProbeFailStageFromSubstage("artifact_binding_validation"),
      "artifact.binding_coherence",
    );
    const stages = executionProbeStagesFromTerminalAttribution({
      failStageId: "artifact.binding_coherence",
      failureCategory: "ARTIFACT_BINDING_INCOHERENT",
    });
    const byId = new Map(stages.map((s) => [s.caseId, s.status]));
    assert.equal(byId.get("hosted.chromium_execution"), "PASS");
    assert.equal(byId.get("hosted.ffmpeg_execution"), "PASS");
    assert.equal(byId.get("r2.streamed_artifact_upload"), "PASS");
    assert.equal(byId.get("owned_object.finalized"), "PASS");
    assert.equal(byId.get("artifact.binding_coherence"), "FAIL");
    assert.equal(byId.get("job.succeeded_cas"), "NOT_TESTED");
  });

  await test("short test object key still builds validated binding", () => {
    const built = buildValidatedArtifactObjectBinding({
      ...coherentBindingFixture(),
      nowMs: 1_000,
    } as never);
    assert.equal(built.ok, true);
  });

  await test("storeId remains bounded at 128 while objectKey allows 1024", () => {
    assert.equal(HEADLESS_MAX_ID_LENGTH, 128);
    assert.equal(HEADLESS_MAX_OBJECT_KEY_LENGTH, 1024);
    const digest = `sha256:${"a".repeat(64)}`;
    const baseDraft = {
      version: 1,
      jobId: "job_1",
      attempt: 1,
      ownerId: "owner_a",
      projectId: "proj_a",
      contentDigest: digest,
      byteLength: 100,
      mimeType: "video/webm",
      artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
      requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
      expiresAtMs: 9_000,
    };
    const maxKey = `artifact/${"k".repeat(HEADLESS_MAX_OBJECT_KEY_LENGTH - 9)}`;
    assert.equal(maxKey.length, HEADLESS_MAX_OBJECT_KEY_LENGTH);
    assert.equal(
      validateHeadlessArtifactObjectBinding({
        ...baseDraft,
        storageLocator: {
          kind: "object_storage",
          storeId: "artifacts",
          objectKey: maxKey,
        },
      }).ok,
      true,
    );
    assert.equal(
      validateHeadlessArtifactObjectBinding({
        ...baseDraft,
        storageLocator: {
          kind: "object_storage",
          storeId: "x".repeat(129),
          objectKey: "artifact/key",
        },
      }).ok,
      false,
    );
    assert.equal(
      validateHeadlessArtifactObjectBinding({
        ...baseDraft,
        storageLocator: {
          kind: "object_storage",
          storeId: "artifacts",
          objectKey: `artifact/${"k".repeat(HEADLESS_MAX_OBJECT_KEY_LENGTH - 8)}`,
        },
      }).ok,
      false,
    );
    assert.equal(
      validateHeadlessArtifactObjectBinding({
        ...baseDraft,
        storageLocator: {
          kind: "object_storage",
          storeId: "artifacts",
          objectKey: "artifact/../unsafe",
        },
      }).ok,
      false,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
