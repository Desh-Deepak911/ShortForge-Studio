/**
 * Sprint 11E Phase 2E.2D.8I.6 — success-path observer, sequence, cleanup correction.
 * Run: npm run test:headless-execution-probe-success-path-observer-8i6
 */
import assert from "node:assert/strict";

import {
  classifyOwningBoundaryTerminalBranch,
  resolveBranchAwareMissingNextBoundary,
} from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import { validateOwningBoundarySequenceCoherence } from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";
import {
  runPostFrameCompleteFailureBranchFixture,
  runPostFrameIllegalFailureCasAfterSucceededFixture,
  runPostFrameMissingSucceededCasFixture,
  runPostFrameSuccessBranchWithoutFailureCasFixture,
} from "@/features/headless-renderer/worker/testing/post-frame-failure-containment-fixtures";
import {
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I52C,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_ENDED_MS,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_STARTED_MS,
} from "../fly-render-live/execution-probe-cleanup-recovery";
import { observeArtifactBindingCoherenceDurable } from "../fly-render-live/artifact-binding-coherence-observer";
import { FLY_RENDER_LIVE_FAILURE_CATEGORIES } from "../fly-render-live/required-cases";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8I.6 — success-path observer + sequence correction\n",
  );

  await test("8I.5.2C archived FAIL evidence SHA is frozen", () => {
    assert.equal(
      FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I52C,
      "9355792575999a4fb8fec0032f3519e7a3d0f08033c9e34e842b1a809c3d5076",
    );
    assert.ok(FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_STARTED_MS > 0);
    assert.ok(
      FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_ENDED_MS >
        FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_STARTED_MS,
    );
  });

  await test("success branch after job_succeeded_cas_completed does not expect terminal_failure_cas_started", () => {
    const observed = runPostFrameSuccessBranchWithoutFailureCasFixture();
    assert.equal(observed.sequenceCoherent, true);
    assert.equal(observed.missingNextBoundary, "cleanup_scheduled");
    assert.equal(
      classifyOwningBoundaryTerminalBranch({
        observedSequence: [
          "job_succeeded_cas_completed",
        ],
      }),
      "success",
    );
    assert.notEqual(
      resolveBranchAwareMissingNextBoundary({
        observedSequence: ["job_succeeded_cas_completed"],
        lastObservedBoundary: "job_succeeded_cas_completed",
      }),
      "terminal_failure_cas_started",
    );
  });

  await test("illegal failure CAS after succeeded CAS is incoherent", () => {
    const observed = runPostFrameIllegalFailureCasAfterSucceededFixture();
    assert.equal(observed.sequenceCoherent, false);
    assert.equal(
      observed.incoherenceClass,
      "illegal_failure_cas_after_succeeded_cas",
    );
  });

  await test("complete failure branch remains coherent", () => {
    const observed = runPostFrameCompleteFailureBranchFixture();
    assert.equal(observed.sequenceCoherent, true);
  });

  await test("8I.5.2C success-path sequence from evidence is coherent", () => {
    const observedSequence = [
      "claimed_context_validated",
      "canonical_request_loaded",
      "ffmpeg_preflight_started",
      "ffmpeg_preflight_completed",
      "source_assets_materialization_started",
      "source_assets_materialization_complete",
      "ffmpeg_process_started",
      "page_workspace_materialization_started",
      "page_workspace_materialization_complete",
      "browser_context_created",
      "page_created",
      "page_navigation_started",
      "page_navigation_complete",
      "page_script_execution_started",
      "page_script_execution_complete",
      "page_contract_observation_started",
      "page_contract_observation_complete",
      "page_bootstrap_started",
      "page_bootstrap_terminal",
      "frame_request_started",
      "frame_request_terminal",
      "chromium_session_cleanup",
      "ffmpeg_input_completed",
      "ffmpeg_process_terminal",
      "artifact_upload_started",
      "artifact_upload_completed",
      "owned_object_finalize_started",
      "owned_object_finalize_completed",
      "artifact_binding_validation_started",
      "artifact_binding_validation_completed",
      "job_succeeded_cas_started",
      "job_succeeded_cas_completed",
    ] as const;
    const coherence = validateOwningBoundarySequenceCoherence({
      observedSequence,
      providerContext: null,
      workspaceAttribution: null,
    });
    assert.equal(coherence.ok, true);
    assert.equal(
      resolveBranchAwareMissingNextBoundary({
        observedSequence,
        lastObservedBoundary: "job_succeeded_cas_completed",
      }),
      "cleanup_scheduled",
    );
  });

  await test("artifact.binding_coherence stage categories exclude HOSTED_RENDER_CLAIM_FAILED", () => {
    assert.ok(
      FLY_RENDER_LIVE_FAILURE_CATEGORIES.includes("ARTIFACT_BINDING_OBSERVATION_FAILED"),
    );
    assert.ok(
      FLY_RENDER_LIVE_FAILURE_CATEGORIES.includes(
        "ARTIFACT_BINDING_DURABLE_REREAD_FAILED",
      ),
    );
    assert.ok(
      FLY_RENDER_LIVE_FAILURE_CATEGORIES.includes("ARTIFACT_BINDING_INCOHERENT"),
    );
  });

  await test("durable binding observer rejects split poll without succeeded job", async () => {
    const ctx = {
      ownerId: "fep_owner_splitpoll",
      smokePollTimeoutMs: 100,
      session: { jobId: "job_split" },
      jobStore: {
        getByJobIdAndOwner: async () => ({
          ok: true,
          value: {
            stage: "canonical",
            storeVersion: 2,
            canonicalJob: {
              state: "encoding",
              attempt: 1,
              artifact: null,
            },
            artifactObjectBinding: null,
            canonicalRequest: null,
          },
        }),
      },
      ownedObjectStore: {
        listByJobIdAndOwner: async () => ({ ok: true, value: [] }),
      },
    } as unknown as Parameters<
      typeof observeArtifactBindingCoherenceDurable
    >[0];
    const result = await observeArtifactBindingCoherenceDurable(ctx, {
      providerFinalizationProven: true,
      bindingValidationCompleted: true,
      jobSucceededCasCompleted: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failureCategory, "ARTIFACT_BINDING_DURABLE_REREAD_FAILED");
    }
  });

  await test("durable binding observer passes monotonic succeeded reread", async () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const ctx = {
      ownerId: "fep_owner_reread",
      smokePollTimeoutMs: 100,
      session: {
        jobId: "job_reread",
        artifactObjectId: null,
        artifactObjectKey: null,
        storeId: null,
        artifactByteLength: null,
        artifactContentDigest: null,
        observedStoreVersion: null,
      },
      jobStore: {
        getByJobIdAndOwner: async () => ({
          ok: true,
          value: {
            stage: "canonical",
            storeVersion: 3,
            canonicalJob: {
              state: "succeeded",
              attempt: 1,
              jobId: "job_reread",
              ownership: { ownerId: "fep_owner_reread", projectId: "proj_a" },
              requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
              rendererBuildId: "worker-build-a",
              artifact: {
                contentDigest: digest,
                byteLength: 100,
                mimeType: "video/webm",
                fingerprint: `hra:sha256:${"b".repeat(64)}`,
                expiresAtMs: 9_000,
                rendererBuildId: "worker-build-a",
              },
            },
            artifactObjectBinding: {
              version: 1,
              jobId: "job_reread",
              attempt: 1,
              ownerId: "fep_owner_reread",
              projectId: "proj_a",
              storageLocator: {
                kind: "object_storage",
                storeId: "artifacts",
                objectKey: "artifact/key",
              },
              contentDigest: digest,
              byteLength: 100,
              mimeType: "video/webm",
              artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
              requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
              expiresAtMs: 9_000,
            },
            canonicalRequest: {
              ownership: { ownerId: "fep_owner_reread", projectId: "proj_a" },
              requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
            },
          },
        }),
      },
      ownedObjectStore: {
        listByJobIdAndOwner: async () => ({
          ok: true,
          value: [
            {
              record: {
                objectId: "obj_reread",
                purpose: "artifact",
                stage: "finalized",
                ownerId: "fep_owner_reread",
                projectId: "proj_a",
                storeId: "artifacts",
                objectKey: "artifact/key",
                contentDigest: digest,
                byteLength: 100,
                mimeType: "video/webm",
                expiresAtMs: 9_000,
              },
            },
          ],
        }),
      },
      createdObjectIds: [],
      createdR2Locators: [],
    } as never;
    const result = await observeArtifactBindingCoherenceDurable(ctx, {
      providerFinalizationProven: true,
      bindingValidationCompleted: true,
      jobSucceededCasCompleted: true,
    });
    assert.equal(result.ok, true);
    const observed = ctx as unknown as {
      session: { artifactObjectKey: string | null };
      createdObjectIds: string[];
    };
    assert.equal(observed.session.artifactObjectKey, "artifact/key");
    assert.equal(observed.createdObjectIds.length, 1);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
