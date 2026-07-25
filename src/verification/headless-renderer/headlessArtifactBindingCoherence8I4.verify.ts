/**
 * Sprint 11E Phase 2E.2D.8I.4 — artifact binding coherence + cleanup correction authority.
 * Run: npm run test:headless-artifact-binding-coherence-8i4
 */
import assert from "node:assert/strict";

import { buildValidatedArtifactObjectBinding } from "@/features/headless-renderer/control-plane/services/validate-artifact-object-binding";
import {
  runPostFrameBindingFailureAfterProviderFinalizeFixture,
  runPostFrameBindingFieldComparisonFixtures,
} from "@/features/headless-renderer/worker/testing/post-frame-failure-containment-fixtures";

import {
  executionProbeStagesFromTerminalAttribution,
  resolveExecutionProbeFailStageFromSubstage,
} from "./fly-render-live/execution-probe-stage-attribution";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2D.8I.4 — Artifact binding coherence correction\n");

  await test("production-shaped canonical R2 object key accepts binding builder", () => {
    const objectKey = [
      "staging",
      "finalized",
      "artifacts",
      "artifact",
      "a".repeat(16),
      "b".repeat(16),
      "c".repeat(16),
      "d".repeat(16),
      "none",
      "0".repeat(32),
    ].join("/");
    assert.equal(objectKey.length, 142);
    const digest = `sha256:${"a".repeat(64)}`;
    const built = buildValidatedArtifactObjectBinding({
      job: {
        state: "succeeded",
        jobId: "job_1",
        attempt: 1,
        ownership: { ownerId: "owner_a", projectId: "proj_a" },
        requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
        artifact: {
          contentDigest: digest,
          byteLength: 100,
          mimeType: "video/webm",
          fingerprint: `hra:sha256:${"b".repeat(64)}`,
          expiresAtMs: 9_000,
        },
      } as never,
      request: {
        ownership: { ownerId: "owner_a", projectId: "proj_a" },
        requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
      } as never,
      artifact: {
        contentDigest: digest,
        byteLength: 100,
        mimeType: "video/webm",
        fingerprint: `hra:sha256:${"b".repeat(64)}`,
        expiresAtMs: 9_000,
      } as never,
      finalized: {
        finalized: true,
        purpose: "artifact",
        ownerId: "owner_a",
        projectId: "proj_a",
        locator: {
          kind: "object_storage",
          storeId: "artifacts",
          objectKey,
        },
        contentDigest: digest,
        byteLength: 100,
        mimeType: "video/webm",
        expiresAtMs: 9_000,
      },
      nowMs: 1_000,
    });
    assert.equal(built.ok, true);
  });

  await test("complete successful binding shape accepts coherent inputs", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const built = buildValidatedArtifactObjectBinding({
      job: {
        state: "succeeded",
        jobId: "job_1",
        attempt: 1,
        ownership: { ownerId: "owner_a", projectId: "proj_a" },
        requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
        artifact: {
          contentDigest: digest,
          byteLength: 100,
          mimeType: "video/webm",
          fingerprint: `hra:sha256:${"b".repeat(64)}`,
          expiresAtMs: 9_000,
        },
      } as never,
      request: {
        ownership: { ownerId: "owner_a", projectId: "proj_a" },
        requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
      } as never,
      artifact: {
        contentDigest: digest,
        byteLength: 100,
        mimeType: "video/webm",
        fingerprint: `hra:sha256:${"b".repeat(64)}`,
        expiresAtMs: 9_000,
      } as never,
      finalized: {
        finalized: true,
        purpose: "artifact",
        ownerId: "owner_a",
        projectId: "proj_a",
        locator: {
          kind: "object_storage",
          storeId: "artifacts",
          objectKey: "artifact/key",
        },
        contentDigest: digest,
        byteLength: 100,
        mimeType: "video/webm",
        expiresAtMs: 9_000,
      },
      nowMs: 1_000,
    });
    assert.equal(built.ok, true);
  });

  await test("privacy-safe field comparison classifies individual mismatches", () => {
    const rows = runPostFrameBindingFieldComparisonFixtures();
    assert.equal(rows.digest.field, "content_digest");
    assert.equal(rows.digest.class, "mismatch");
    assert.equal(rows.digest.owningAuthority, "executed_artifact");
    assert.equal(rows.byteLength.field, "byte_length");
    assert.equal(rows.mimeType.field, "mime_type");
    assert.equal(rows.expiresAtMs.field, "expires_at_ms");
    assert.equal(rows.expiresAtMs.owningAuthority, "expiry_authority");
  });

  await test("missing finalized metadata fails closed at builder", () => {
    const built = buildValidatedArtifactObjectBinding({
      job: {
        state: "succeeded",
        jobId: "job_1",
        attempt: 1,
        ownership: { ownerId: "o", projectId: "p" },
        requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
        artifact: {
          contentDigest: `sha256:${"a".repeat(64)}`,
          byteLength: 10,
          mimeType: "video/webm",
          fingerprint: `hra:sha256:${"b".repeat(64)}`,
          expiresAtMs: 99,
        },
      } as never,
      request: {
        ownership: { ownerId: "o", projectId: "p" },
        requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
      } as never,
      artifact: {
        contentDigest: `sha256:${"a".repeat(64)}`,
        byteLength: 10,
        mimeType: "video/webm",
        fingerprint: `hra:sha256:${"b".repeat(64)}`,
        expiresAtMs: 99,
      } as never,
      finalized: {
        finalized: false,
        purpose: "artifact",
        ownerId: "o",
        projectId: "p",
        locator: {
          kind: "object_storage",
          storeId: "artifacts",
          objectKey: "k",
        },
        contentDigest: `sha256:${"a".repeat(64)}`,
        byteLength: 10,
        mimeType: "video/webm",
        expiresAtMs: 99,
      },
    });
    assert.equal(built.ok, false);
  });

  await test("provider finalize success then binding failure is sequence-coherent", async () => {
    const observed = await runPostFrameBindingFailureAfterProviderFinalizeFixture();
    assert.equal(observed.sequenceCoherent, true);
    assert.equal(observed.terminalSubstage, "artifact_binding_validation");
    assert.ok(observed.artifactBoundaries.includes("cleanup_completed"));
  });

  await test("probe stage attribution maps binding validation to artifact.binding_coherence", () => {
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

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
