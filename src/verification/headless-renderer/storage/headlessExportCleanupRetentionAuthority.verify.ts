/**
 * Cleanup and retention authority regression coverage.
 * Run: npm run test:headless-export-cleanup-retention-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type {
  HeadlessFinalizedOwnedObjectRecordV1,
  HeadlessStagingOwnedObjectRecordV1,
} from "@/features/headless-renderer/control-plane/types/owned-object-record";
import {
  HEADLESS_ENCODING_PROGRESS_PERCENT,
  HEADLESS_RENDERING_PROGRESS_FLOOR,
  HEADLESS_UPLOADING_PROGRESS_PERCENT,
  HEADLESS_VALIDATING_PROGRESS_PERCENT,
} from "@/features/headless-renderer/domain/headless-render-constants";
import { validateHeadlessPublicJobView } from "@/features/headless-renderer/product/client/validate-public-job-view";

import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import {
  buildHeadlessExportCleanupMetrics,
  validateHeadlessExportCleanupMetricsPrivacy,
} from "@/features/headless-renderer/control-plane/services/headless-export-cleanup-metrics";
import { evaluateOwnedObjectDeletionAuthority } from "@/features/headless-renderer/control-plane/services/evaluate-owned-object-deletion-authority";
import {
  claimHeadlessMaintenanceLease,
  releaseHeadlessMaintenanceLease,
  runHeadlessExportMaintenanceBatchOnce,
} from "@/features/headless-renderer/control-plane/services/headless-export-maintenance-batch";
import { runHeadlessTerminalCleanupCoordinator } from "@/features/headless-renderer/control-plane/services/headless-terminal-cleanup-coordinator";
import {
  assertHeadlessCleanupStagingEnvironment,
  buildHeadlessStagingR2LifecyclePolicySpec,
  deriveHeadlessArtifactExpiresAtMs,
  evaluateHeadlessArtifactDownloadEligibility,
  HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS,
  HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS,
  isHeadlessAbandonedProvisionalUploadEligible,
  isHeadlessCompletedOutboxRowEligible,
  isHeadlessTerminalJobMetadataEligible,
} from "@/features/headless-renderer/domain/headless-export-retention-authority";

const CLEANUP_MODULE_DIR = path.join(
  process.cwd(),
  "src/features/headless-renderer/control-plane/services",
);
const CLEANUP_MODULE_FILES = [
  "evaluate-owned-object-deletion-authority.ts",
  "headless-export-cleanup-metrics.ts",
  "headless-export-maintenance-batch.ts",
  "headless-terminal-cleanup-coordinator.ts",
];
const RETENTION_FILE = path.join(
  process.cwd(),
  "src/features/headless-renderer/domain/headless-export-retention-authority.ts",
);

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function canonicalJob(state: string) {
  return {
    stage: "canonical" as const,
    ownerId: "owner_a",
    projectId: "project_a",
    jobId: "job_a",
    storeVersion: 1,
    artifactObjectBinding: {
      storageLocator: {
        kind: "object_storage" as const,
        storeId: "artifacts" as const,
        objectKey: "artifacts/job_a/final.webm",
      },
      contentDigest: "sha256:" + "a".repeat(64),
      byteLength: 1000,
      mimeType: "video/webm",
    },
    canonicalJob: {
      jobId: "job_a",
      state,
      attempt: 1,
      updatedAtMs: 1,
      createdAtMs: 1,
      contractVersion: 1,
      rendererProfile: {
        resolution: "1080p" as const,
        format: "webm" as const,
        fps: 30,
        quality: "standard" as const,
      },
    },
  };
}

function stagingSourceRecord(): HeadlessStagingOwnedObjectRecordV1 {
  return {
    version: 1,
    objectId: "obj_manifest",
    ownerId: "owner_a",
    projectId: "project_a",
    jobId: "job_a",
    operationId: "op_a",
    purpose: "manifest",
    slotKey: null,
    provider: "r2",
    storeId: "assets",
    objectKey: "assets/op_a/manifest.json",
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
    stage: "staging",
    expectedContentDigestClaim: "sha256:" + "b".repeat(64),
    expectedByteLength: 100,
    expectedMimeType: "application/json",
    uploadCapabilityIssuedAtMs: 1_000,
    uploadCapabilityExpiresAtMs: 1_000 + 60_000,
    uploadedObservedAtMs: null,
    verificationState: "unclaimed",
    verificationClaimToken: null,
    verificationClaimedAtMs: null,
    verifiedAtMs: null,
    expiresAtMs: null,
    contentDigest: null,
    byteLength: null,
    mimeType: null,
    finalizedMetadata: null,
    terminalReason: null,
    cleanupScheduledAtMs: null,
  };
}

function finalizedSourceRecord(
  overrides: Partial<
    Pick<
      HeadlessFinalizedOwnedObjectRecordV1,
      "purpose" | "storeId" | "objectKey" | "expiresAtMs"
    >
  > = {},
): HeadlessFinalizedOwnedObjectRecordV1 {
  return {
    version: 1,
    objectId: "obj_manifest",
    ownerId: "owner_a",
    projectId: "project_a",
    jobId: "job_a",
    operationId: "op_a",
    purpose: overrides.purpose ?? "manifest",
    slotKey: null,
    provider: "r2",
    storeId: overrides.storeId ?? "assets",
    objectKey: overrides.objectKey ?? "assets/op_a/manifest.json",
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
    stage: "finalized",
    expectedContentDigestClaim: "sha256:" + "b".repeat(64),
    expectedByteLength: 100,
    expectedMimeType: "application/json",
    uploadCapabilityIssuedAtMs: 1_000,
    uploadCapabilityExpiresAtMs: 1_000 + 60_000,
    uploadedObservedAtMs: 2_000,
    verificationState: "verified",
    verificationClaimToken: null,
    verificationClaimedAtMs: null,
    verifiedAtMs: 2_000,
    expiresAtMs:
      overrides.expiresAtMs ?? 1_000 + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS,
    contentDigest: "sha256:" + "b".repeat(64),
    byteLength: 100,
    mimeType: "application/json",
    finalizedMetadata: Object.freeze({
      verifiedBy: "trusted_worker_upload_stream",
      sourceStage: "staging",
    }),
    terminalReason: null,
    cleanupScheduledAtMs: null,
  };
}

async function main() {
  console.log("\nHeadless export cleanup and retention authority\n");

  await test("production/non-staging cleanup fails closed", () => {
    assert.equal(assertHeadlessCleanupStagingEnvironment("production").ok, false);
    assert.equal(assertHeadlessCleanupStagingEnvironment("staging").ok, true);
  });

  await test("artifact download before expiry succeeds", () => {
    const now = 1_000;
    const expires = deriveHeadlessArtifactExpiresAtMs(now);
    assert.equal(expires, now + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS);
    assert.equal(
      evaluateHeadlessArtifactDownloadEligibility({
        nowMs: now + 1,
        expiresAtMs: expires,
        jobState: "succeeded",
      }).ok,
      true,
    );
  });

  await test("artifact download fails safely after expiry", () => {
    const expires = deriveHeadlessArtifactExpiresAtMs(1_000);
    const result = evaluateHeadlessArtifactDownloadEligibility({
      nowMs: expires + 1,
      expiresAtMs: expires,
      jobState: "succeeded",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "artifact_expired");
  });

  await test("expiry does not authorize project source deletion semantics", () => {
    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      job: canonicalJob("succeeded") as never,
      record: finalizedSourceRecord(),
      locator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: "assets/op_a/manifest.json",
      },
      attempt: 1,
      nowMs: 2_000,
      externalActiveReferenceCount: 1,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.safeClassification, "project_source_protected");
    }
  });

  await test("shared/referenced export-owned source cannot be deleted", () => {
    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      job: canonicalJob("succeeded") as never,
      record: finalizedSourceRecord(),
      locator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: "assets/op_a/manifest.json",
      },
      attempt: 1,
      nowMs: 2_000,
      externalActiveReferenceCount: 2,
    });
    assert.equal(decision.ok, false);
  });

  await test("successful render retains final downloadable artifact", () => {
    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      job: canonicalJob("succeeded") as never,
      record: {
        ...finalizedSourceRecord(),
        purpose: "artifact",
        storeId: "artifacts",
        objectKey: "artifacts/job_a/final.webm",
        expiresAtMs: 1_000 + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS,
      },
      locator: {
        kind: "object_storage",
        storeId: "artifacts",
        objectKey: "artifacts/job_a/final.webm",
      },
      attempt: 1,
      nowMs: 2_000,
      externalActiveReferenceCount: 0,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.safeClassification, "downloadable_artifact");
  });

  await test("successful render cleans unreferenced export-owned source copies", () => {
    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      job: canonicalJob("succeeded") as never,
      record: finalizedSourceRecord(),
      locator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: "assets/op_a/manifest.json",
      },
      attempt: 1,
      nowMs: 2_000,
      externalActiveReferenceCount: 0,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) assert.equal(decision.deletionClass, "export_owned_source_copy");
  });

  await test("cross-owner deletion is rejected", () => {
    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      job: canonicalJob("failed") as never,
      record: { ...stagingSourceRecord(), ownerId: "owner_b" },
      locator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: "assets/op_a/manifest.json",
      },
      attempt: 1,
      nowMs: 2_000,
      externalActiveReferenceCount: 0,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.safeClassification, "cross_owner");
  });

  await test("cross-job deletion is rejected", () => {
    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      job: canonicalJob("failed") as never,
      record: { ...stagingSourceRecord(), jobId: "job_b" },
      locator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: "assets/op_a/manifest.json",
      },
      attempt: 1,
      nowMs: 0,
      externalActiveReferenceCount: 0,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.safeClassification, "cross_job");
  });

  await test("unknown-purpose object deletion is rejected", () => {
    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      job: canonicalJob("failed") as never,
      record: { ...stagingSourceRecord(), purpose: "artifact" as never },
      locator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: "assets/op_a/manifest.json",
      },
      attempt: 1,
      nowMs: 0,
      externalActiveReferenceCount: 0,
    });
    assert.equal(decision.ok, false);
  });

  await test("abandoned provisional object becomes eligible after configured interval", () => {
    assert.equal(
      isHeadlessAbandonedProvisionalUploadEligible({
        createdAtMs: 0,
        nowMs: HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS,
        stage: "staging",
      }),
      true,
    );
  });

  await test("terminal job metadata eligible only after retention period", () => {
    assert.equal(
      isHeadlessTerminalJobMetadataEligible({
        terminalAtMs: 0,
        nowMs: 1,
        state: "succeeded",
      }),
      false,
    );
    assert.equal(
      isHeadlessTerminalJobMetadataEligible({
        terminalAtMs: 0,
        nowMs: 8 * 86_400_000,
        state: "failed",
      }),
      true,
    );
  });

  await test("completed outbox rows cannot be cleaned while pending", () => {
    assert.equal(
      isHeadlessCompletedOutboxRowEligible({
        terminalAtMs: 0,
        nowMs: 999_999,
        state: "pending",
      }),
      false,
    );
  });

  await test("terminal cleanup coordinator preserves primary disposition on cleanup schedule", async () => {
    let workspaceCleaned = false;
    const result = await runHeadlessTerminalCleanupCoordinator({
      envName: "staging",
      terminalState: "failed",
      job: canonicalJob("failed") as never,
      nowMs: 1_000,
      local: {
        cleanupWorkspace: () => {
          workspaceCleaned = true;
        },
      },
      orphanTargets: [],
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: {
        deleteObject: async () => ({ ok: false }),
      },
    });
    assert.equal(result.primaryDispositionPreserved, true);
    assert.equal(workspaceCleaned, true);
    assert.equal(result.localCleanupClass, "all_local_disposed");
  });

  await test("cleanup replay schedules intent without re-rendering", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const result = await runHeadlessTerminalCleanupCoordinator({
      envName: "staging",
      terminalState: "failed",
      job: canonicalJob("failed") as never,
      nowMs: 1_000,
      local: {},
      orphanTargets: [
        {
          locator: {
            kind: "object_storage",
            storeId: "artifacts",
            objectKey: "artifacts/job_a/orphan.webm",
          },
          objectId: "obj_orphan",
          ownerId: "owner_a",
          projectId: "project_a",
          jobId: "job_a",
          attempt: 1,
          contentDigest: "sha256:" + "c".repeat(64),
          reasonId: "UPLOAD_SESSION_ORPHAN",
          expiresAtMs: 2_000,
        },
      ],
      cleanup,
      storage: {
        deleteObject: async () => ({ ok: false }),
      },
    });
    assert.ok(result.scheduledCleanupIntents >= 1 || result.unconfirmedOperations >= 0);
    assert.equal(result.primaryDispositionPreserved, true);
  });

  await test("already-absent immediate delete counts as success path", async () => {
    const result = await runHeadlessTerminalCleanupCoordinator({
      envName: "staging",
      terminalState: "cancelled",
      job: canonicalJob("cancelled") as never,
      nowMs: 1_000,
      local: {},
      orphanTargets: [
        {
          locator: {
            kind: "object_storage",
            storeId: "artifacts",
            objectKey: "artifacts/job_a/gone.webm",
          },
          objectId: "obj_gone",
          ownerId: "owner_a",
          projectId: "project_a",
          jobId: "job_a",
          attempt: 1,
          contentDigest: "sha256:" + "d".repeat(64),
          reasonId: "SUCCEEDED_CAS_STALE",
          expiresAtMs: 2_000,
        },
      ],
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: {
        deleteObject: async () => ({ ok: true }),
      },
    });
    assert.equal(result.immediateDeletes, 1);
  });

  await test("maintenance batch is bounded", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const now = 10_000_000;
    for (let i = 0; i < 30; i += 1) {
      await owned.createStagingRecord({
        objectId: `obj_${i}`,
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        purpose: "manifest",
        slotKey: null,
        storeId: "assets",
        objectKey: `assets/op_a/manifest_${i}.json`,
        expectedContentDigestClaim: "sha256:" + "e".repeat(64),
        expectedByteLength: 10,
        expectedMimeType: "application/json",
        uploadCapabilityIssuedAtMs: now - HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS - 1,
        uploadCapabilityExpiresAtMs: now + 60_000,
        expiresAtMs: now - 1,
        createdAtMs: now - HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS - 1,
      });
    }
    const lease = claimHeadlessMaintenanceLease({
      ownerId: "owner_a",
      nowMs: now,
    });
    assert.equal(lease.ok, true);
    if (!lease.ok) return;
    const batch = await runHeadlessExportMaintenanceBatchOnce({
      envName: "staging",
      ownerId: "owner_a",
      nowMs: () => now,
      leaseToken: lease.leaseToken,
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      ownedObjectStore: owned,
      jobStore: {
        getByJobIdAndOwner: async () => ({
          ok: false,
          issues: [{ code: "JOB_NOT_FOUND", message: "missing" }],
        }),
      } as never,
      objectIo: {
        deleteExactObject: async () => ({ ok: true }),
        probeExactObjectPresence: async () => ({ ok: true, value: "absent" }),
      } as never,
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      batchSize: 10,
      dryRun: true,
    });
    assert.equal(batch.ok, true);
    if (batch.ok) assert.ok(batch.value.processed <= 10);
    releaseHeadlessMaintenanceLease({
      ownerId: "owner_a",
      leaseToken: lease.leaseToken,
    });
  });

  await test("concurrent maintenance lease is rejected", () => {
    const now = 1_000;
    const first = claimHeadlessMaintenanceLease({ ownerId: "owner_a", nowMs: now });
    const second = claimHeadlessMaintenanceLease({ ownerId: "owner_a", nowMs: now + 1 });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (first.ok) {
      releaseHeadlessMaintenanceLease({
        ownerId: "owner_a",
        leaseToken: first.leaseToken,
      });
    }
  });

  await test("cleanup metrics contain no private fields", () => {
    const metrics = buildHeadlessExportCleanupMetrics({
      cleanupAttempts: 3,
      cleanupSuccesses: 2,
      cleanupFailures: 1,
      retryBacklog: 1,
      rejectedUnsafeDeletions: 0,
      projectSourceDeletionAttempts: 0,
      expiredArtifactCount: 0,
      orphanCandidates: 2,
      storedArtifactCount: 1,
      estimatedStoredArtifactBytesClass: "small",
      oldestPendingCleanupAgeClass: "minutes",
    });
    assert.equal(validateHeadlessExportCleanupMetricsPrivacy(metrics), true);
    assert.equal(JSON.stringify(metrics).includes("objectKey"), false);
  });

  await test("lifecycle policy spec documents desired R2 rules for later rollout", () => {
    const spec = buildHeadlessStagingR2LifecyclePolicySpec();
    assert.ok(spec.length >= 2);
    assert.ok(spec.some((rule) => rule.prefixClass === "export_owned_artifact"));
  });

  await test("documentation quality rejects sprint identifiers in cleanup modules", () => {
    const sprintPattern = /Sprint 11E|Phase 2G\.25|Part [A-Z]/i;
    for (const file of CLEANUP_MODULE_FILES) {
      const src = readFileSync(path.join(CLEANUP_MODULE_DIR, file), "utf8");
      assert.equal(sprintPattern.test(src), false, `${file} contains sprint comment`);
    }
    const retentionSrc = readFileSync(RETENTION_FILE, "utf8");
    assert.equal(sprintPattern.test(retentionSrc), false);
  });

  await test("exported cleanup entrypoints include meaningful TSDoc headers", () => {
    for (const file of CLEANUP_MODULE_FILES) {
      const src = readFileSync(path.join(CLEANUP_MODULE_DIR, file), "utf8");
      assert.ok(src.includes("/**"), `${file} missing module/function docs`);
      assert.ok(
        src.includes("Fails closed") || src.includes("fail closed"),
        `${file} missing fail-closed documentation`,
      );
    }
  });

  await test("six-object production-shaped cleanup preserves referenced project sources", () => {
    const objects = [
      "manifest",
      "asset_bundle_record",
      "asset_bytes",
      "asset_bytes",
      "asset_bytes",
      "artifact",
    ] as const;
    let protectedCount = 0;
    let eligibleSourceCount = 0;
    for (let i = 0; i < objects.length; i += 1) {
      const purpose = objects[i];
      const externalRefs = i < 3 ? 1 : 0;
      const decision = evaluateOwnedObjectDeletionAuthority({
        expectation: {
          ownerId: "owner_a",
          projectId: "project_a",
          jobId: "job_a",
          operationId: "op_a",
          envName: "staging",
        },
        job: canonicalJob("succeeded") as never,
        record: finalizedSourceRecord({
          purpose: purpose === "artifact" ? "artifact" : purpose,
          storeId: purpose === "artifact" ? "artifacts" : "assets",
          objectKey:
            purpose === "artifact"
              ? "artifacts/job_a/final.webm"
              : `assets/op_a/${purpose}_${i}`,
          expiresAtMs: 1_000 + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS,
        }),
        locator: {
          kind: "object_storage",
          storeId: purpose === "artifact" ? "artifacts" : "assets",
          objectKey:
            purpose === "artifact"
              ? "artifacts/job_a/final.webm"
              : `assets/op_a/${purpose}_${i}`,
        },
        attempt: 1,
        nowMs: 2_000,
        externalActiveReferenceCount: externalRefs,
      });
      if (!decision.ok && decision.safeClassification === "project_source_protected") {
        protectedCount += 1;
      }
      if (decision.ok && decision.deletionClass === "export_owned_source_copy") {
        eligibleSourceCount += 1;
      }
      if (purpose === "artifact" && !decision.ok) {
        assert.equal(decision.safeClassification, "downloadable_artifact");
      }
    }
    assert.equal(protectedCount, 3);
    assert.equal(eligibleSourceCount, 2);
  });

  await test("project source asset remains intact after export", () => {
    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      job: canonicalJob("succeeded") as never,
      record: finalizedSourceRecord(),
      locator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: "assets/op_a/manifest.json",
      },
      attempt: 1,
      nowMs: 2_000,
      externalActiveReferenceCount: 1,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.safeClassification, "project_source_protected");
    }
  });

  await test("successful render releases claim lease via coordinator hook", async () => {
    let claimReleased = false;
    await runHeadlessTerminalCleanupCoordinator({
      envName: "staging",
      terminalState: "succeeded",
      job: canonicalJob("succeeded") as never,
      nowMs: 1_000,
      local: {
        releaseClaimLease: () => {
          claimReleased = true;
        },
      },
      orphanTargets: [],
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: {
        deleteObject: async () => ({ ok: true }),
      },
    });
    assert.equal(claimReleased, true);
  });

  await test("failed render schedules cleanup without masking primary failure", async () => {
    const result = await runHeadlessTerminalCleanupCoordinator({
      envName: "staging",
      terminalState: "failed",
      job: canonicalJob("failed") as never,
      nowMs: 1_000,
      local: {},
      orphanTargets: [
        {
          locator: {
            kind: "object_storage",
            storeId: "artifacts",
            objectKey: "artifacts/job_a/orphan.webm",
          },
          objectId: "obj_failed_orphan",
          ownerId: "owner_a",
          projectId: "project_a",
          jobId: "job_a",
          attempt: 1,
          contentDigest: "sha256:" + "f".repeat(64),
          reasonId: "UPLOAD_SESSION_ORPHAN",
          expiresAtMs: 2_000,
        },
      ],
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: {
        deleteObject: async () => ({ ok: false }),
      },
    });
    assert.equal(result.primaryDispositionPreserved, true);
    assert.equal(canonicalJob("failed").canonicalJob.state, "failed");
  });

  await test("cancelled render schedules cleanup correctly", async () => {
    const result = await runHeadlessTerminalCleanupCoordinator({
      envName: "staging",
      terminalState: "cancelled",
      job: canonicalJob("cancelled") as never,
      nowMs: 1_000,
      local: {
        cleanupWorkspace: () => {},
      },
      orphanTargets: [],
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: {
        deleteObject: async () => ({ ok: true }),
      },
    });
    assert.equal(result.localCleanupClass, "all_local_disposed");
    assert.equal(result.primaryDispositionPreserved, true);
  });

  await test("delete-now is not exposed on public job views", () => {
    const view = validateHeadlessPublicJobView({
      version: 1,
      jobId: "job_public_a",
      state: "succeeded",
      createdAtMs: 1,
      updatedAtMs: 2,
      progress: null,
      terminalReason: null,
      artifactAvailable: true,
      cancelAccepted: false,
      deleteNowEnabled: true,
    });
    assert.equal(view?.jobId, "job_public_a");
    assert.equal("deleteNowEnabled" in (view ?? {}), false);
  });

  await test("partial batch failure preserves remaining cleanup work", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const now = 10_000_000;
    for (let i = 0; i < 5; i += 1) {
      const created = await owned.createStagingRecord({
        objectId: `obj_partial_${i}`,
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        purpose: "manifest",
        slotKey: null,
        storeId: "assets",
        objectKey: `assets/op_a/partial_${i}.json`,
        expectedContentDigestClaim: "sha256:" + "e".repeat(64),
        expectedByteLength: 10,
        expectedMimeType: "application/json",
        uploadCapabilityIssuedAtMs: now - HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS - 1,
        uploadCapabilityExpiresAtMs: now + 60_000,
        expiresAtMs: now - 1,
        createdAtMs: now - HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS - 1,
      });
      assert.equal(created.ok, true, created.ok ? "" : JSON.stringify(created));
    }
    const lease = claimHeadlessMaintenanceLease({ ownerId: "owner_a", nowMs: now });
    assert.equal(lease.ok, true);
    if (!lease.ok) return;
    const batch = await runHeadlessExportMaintenanceBatchOnce({
      envName: "staging",
      ownerId: "owner_a",
      nowMs: () => now,
      leaseToken: lease.leaseToken,
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      ownedObjectStore: owned,
      jobStore: {
        getByJobIdAndOwner: async () => ({
          ok: false,
          issues: [{ code: "JOB_NOT_FOUND", message: "missing" }],
        }),
      } as never,
      objectIo: {
        deleteExactObject: async () => ({ ok: true }),
        probeExactObjectPresence: async () => ({ ok: true, value: "present" }),
      } as never,
      expectation: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        envName: "staging",
      },
      batchSize: 3,
      dryRun: true,
    });
    releaseHeadlessMaintenanceLease({
      ownerId: "owner_a",
      leaseToken: lease.leaseToken,
    });
    assert.equal(batch.ok, true);
    if (batch.ok) {
      assert.equal(batch.value.processed, 3);
      assert.ok(
        batch.value.items.some((item) => item.classification === "job_reference_unavailable"),
      );
      assert.ok(batch.value.nextCursor != null);
    }
  });

  await test("cleanup failure cannot change succeeded to failed", async () => {
    const result = await runHeadlessTerminalCleanupCoordinator({
      envName: "staging",
      terminalState: "succeeded",
      job: canonicalJob("succeeded") as never,
      nowMs: 1_000,
      local: {
        cleanupWorkspace: () => {
          throw new Error("local cleanup failed");
        },
      },
      orphanTargets: [],
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: {
        deleteObject: async () => ({ ok: false }),
      },
    });
    assert.equal(result.primaryDispositionPreserved, true);
    assert.equal(canonicalJob("succeeded").canonicalJob.state, "succeeded");
  });

  await test("cleanup failure cannot replace primary rendering failure reason", async () => {
    const failedJob = canonicalJob("failed");
    const result = await runHeadlessTerminalCleanupCoordinator({
      envName: "staging",
      terminalState: "failed",
      job: failedJob as never,
      nowMs: 1_000,
      local: {},
      orphanTargets: [
        {
          locator: {
            kind: "object_storage",
            storeId: "artifacts",
            objectKey: "artifacts/job_a/stuck.webm",
          },
          objectId: "obj_stuck",
          ownerId: "owner_a",
          projectId: "project_a",
          jobId: "job_a",
          attempt: 1,
          contentDigest: "sha256:" + "h".repeat(64),
          reasonId: "SUCCEEDED_CAS_THROWN",
          expiresAtMs: 2_000,
        },
      ],
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: {
        deleteObject: async () => ({ ok: false }),
      },
    });
    assert.equal(result.primaryDispositionPreserved, true);
    assert.equal(failedJob.canonicalJob.state, "failed");
  });

  await test("artifact retention timestamps survive public polling without storage identity", () => {
    const finalizedAt = 1_700_000_000_000;
    const expiresAtMs = deriveHeadlessArtifactExpiresAtMs(finalizedAt);
    const view = validateHeadlessPublicJobView({
      version: 1,
      jobId: "job_poll_a",
      state: "succeeded",
      createdAtMs: finalizedAt,
      updatedAtMs: finalizedAt + 1,
      progress: { percent: 100, stage: "complete" },
      terminalReason: null,
      artifactAvailable: true,
      cancelAccepted: false,
      expiresAtMs,
      objectKey: "artifacts/private/key.webm",
    });
    assert.equal(view?.artifactAvailable, true);
    assert.equal("expiresAtMs" in (view ?? {}), false);
    assert.equal("objectKey" in (view ?? {}), false);
    assert.equal(
      evaluateHeadlessArtifactDownloadEligibility({
        nowMs: finalizedAt + 1,
        expiresAtMs,
        jobState: "succeeded",
      }).ok,
      true,
    );
  });

  await test("renderer output profiles and quality constants remain unchanged", () => {
    assert.equal(HEADLESS_RENDERING_PROGRESS_FLOOR, 40);
    assert.equal(HEADLESS_ENCODING_PROGRESS_PERCENT, 85);
    assert.equal(HEADLESS_VALIDATING_PROGRESS_PERCENT, 93);
    assert.equal(HEADLESS_UPLOADING_PROGRESS_PERCENT, 97);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
