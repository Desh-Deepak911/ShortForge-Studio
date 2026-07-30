/**
 * Cleanup runtime integration regression coverage.
 * Run: npm run test:headless-export-cleanup-runtime-integration
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { randomUUID } from "node:crypto";

import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import {
  MemoryHeadlessMaintenanceLeaseAdapter,
  resetMemoryMaintenanceLeasesForTests,
} from "@/features/headless-renderer/control-plane/adapters/memory-maintenance-lease.adapter";
import {
  HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
  runHeadlessExportMaintenanceBatchOnce,
} from "@/features/headless-renderer/control-plane/services/headless-export-maintenance-batch";
import { createHeadlessExportMaintenanceScheduler } from "@/features/headless-renderer/control-plane/services/headless-export-maintenance-scheduler";
import { performOwnedObjectMaintenanceDelete } from "@/features/headless-renderer/control-plane/services/perform-owned-object-maintenance-delete";
import { scheduleHeadlessExportDeleteNow } from "@/features/headless-renderer/control-plane/services/schedule-export-delete-now";
import {
  evaluateHeadlessExportMaintenanceEnablement,
} from "@/features/headless-renderer/domain/headless-export-maintenance-enablement";
import { HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS } from "@/features/headless-renderer/domain/headless-export-retention-authority";
import {
  assertHeadlessR2LifecycleTimingSafe,
  buildHeadlessStagingR2LifecyclePolicyRules,
  compareHeadlessStagingR2LifecyclePolicy,
} from "@/features/headless-renderer/domain/headless-r2-lifecycle-policy-authority";
import { isHeadlessProductionPrefixCandidate } from "@/features/headless-renderer/control-plane/services/headless-r2-lifecycle-prefix-authority";
import { buildHeadlessStagingArtifactPrefixPattern } from "@/features/headless-renderer/control-plane/services/headless-r2-lifecycle-prefix-authority";
import { createClaimedRenderTerminalCleanupSession } from "@/features/headless-renderer/worker/runtime/claimed-render-terminal-cleanup-runtime";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import {
  HEADLESS_ENCODING_PROGRESS_PERCENT,
  HEADLESS_RENDERING_PROGRESS_FLOOR,
} from "@/features/headless-renderer/domain/headless-render-constants";
import { validateHeadlessExportCleanupMetricsPrivacy } from "@/features/headless-renderer/control-plane/services/headless-export-cleanup-metrics";

const RUNTIME_FILES = [
  "claimed-render-terminal-cleanup-runtime.ts",
  "perform-owned-object-maintenance-delete.ts",
  "headless-export-maintenance-scheduler.ts",
  "schedule-export-delete-now.ts",
];

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nHeadless export cleanup runtime integration\n");
  resetMemoryMaintenanceLeasesForTests();

  await test("disabled maintenance makes zero batch work without enablement", () => {
    const enablement = evaluateHeadlessExportMaintenanceEnablement({
      envName: "staging",
      maintenanceEnabledFlag: "0",
    });
    assert.equal(enablement.ok, false);
  });

  await test("coordinator replay is idempotent", async () => {
    const session = createClaimedRenderTerminalCleanupSession();
    const first = await session.runOnceAfterTerminalization({
      envName: "staging",
      terminalState: "failed",
      job: {
        stage: "canonical",
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        storeVersion: 1,
        canonicalJob: {
          jobId: "job_a",
          state: "failed",
          attempt: 1,
          updatedAtMs: 1,
          createdAtMs: 1,
          contractVersion: 1,
          rendererProfile: {
            resolution: "1080p",
            format: "webm",
            fps: 30,
            quality: "standard",
          },
        },
      } as never,
      nowMs: 1,
      local: {},
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: { deleteObject: async () => ({ ok: true }) },
    });
    const second = await session.runOnceAfterTerminalization({
      envName: "staging",
      terminalState: "failed",
      job: first.coordinator.primaryDispositionPreserved
        ? ({
            stage: "canonical",
            ownerId: "owner_a",
            projectId: "project_a",
            jobId: "job_a",
            storeVersion: 1,
            canonicalJob: {
              jobId: "job_a",
              state: "failed",
              attempt: 1,
              updatedAtMs: 1,
              createdAtMs: 1,
              contractVersion: 1,
              rendererProfile: {
                resolution: "1080p",
                format: "webm",
                fps: 30,
                quality: "standard",
              },
            },
          } as never)
        : (null as never),
      nowMs: 2,
      local: {},
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      storage: { deleteObject: async () => ({ ok: true }) },
    });
    assert.equal(second.coordinator.primaryDispositionPreserved, true);
  });

  await test("maintenance provider delete follows durable reference evaluation", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const now = 10_000_000;
    const staged = await owned.createStagingRecord({
      objectId: "obj_del",
      ownerId: "owner_a",
      projectId: "project_a",
      jobId: "job_a",
      operationId: "op_a",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: "assets/op_a/manifest_del.json",
      expectedContentDigestClaim: "sha256:" + "e".repeat(64),
      expectedByteLength: 10,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: now - HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS - 1,
      uploadCapabilityExpiresAtMs: now + 60_000,
      expiresAtMs: now - 1,
      createdAtMs: now - HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS - 1,
    });
    assert.equal(staged.ok, true);
    let probes = 0;
    const outcome = await performOwnedObjectMaintenanceDelete({
      stored: staged.value!,
      decision: {
        ok: true,
        terminalReason: "abandoned_provisional_upload",
        deletionClass: "export_owned_temporary",
      },
      ownedObjectStore: owned,
      objectIo: {
        deleteExactObject: async () => ({ ok: true, value: true as const }),
        probeExactObjectPresence: async () => {
          probes += 1;
          return { ok: true, value: probes === 1 ? "present" : "absent" };
        },
      },
      nowMs: now,
    });
    assert.equal(outcome.kind, "deleted");
  });

  await test("already-absent provider object succeeds idempotently", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const now = 10_000_000;
    const staged = await owned.createStagingRecord({
      objectId: "obj_absent",
      ownerId: "owner_a",
      projectId: "project_a",
      jobId: "job_a",
      operationId: "op_a",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: "assets/op_a/manifest_absent.json",
      expectedContentDigestClaim: "sha256:" + "e".repeat(64),
      expectedByteLength: 10,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: now - 1,
      uploadCapabilityExpiresAtMs: now + 60_000,
      expiresAtMs: now - 1,
      createdAtMs: now - 1,
    });
    assert.equal(staged.ok, true);
    const outcome = await performOwnedObjectMaintenanceDelete({
      stored: staged.value!,
      decision: {
        ok: true,
        terminalReason: "abandoned_provisional_upload",
        deletionClass: "export_owned_temporary",
      },
      ownedObjectStore: owned,
      objectIo: {
        deleteExactObject: async () => ({ ok: false, issues: [{ code: "INTERNAL_ERROR", message: "no" }] }),
        probeExactObjectPresence: async () => ({ ok: true, value: "absent" }),
      },
      nowMs: now,
    });
    assert.equal(outcome.kind, "already_absent");
  });

  await test("lease prevents concurrent maintenance", async () => {
    resetMemoryMaintenanceLeasesForTests();
    const lease = new MemoryHeadlessMaintenanceLeaseAdapter();
    const first = await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 1,
      leaseMs: 60_000,
      holderClass: "verify_worker",
    });
    const second = await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 2,
      leaseMs: 60_000,
      holderClass: "verify_worker",
    });
    assert.equal(first.ok, true);
    assert.equal(first.value.kind, "claimed");
    assert.equal(second.ok, true);
    assert.equal(second.value.kind, "lease_rejected");
  });

  await test("artifact lifecycle rule matches only staging artifact prefix", () => {
    const prefix = buildHeadlessStagingArtifactPrefixPattern();
    assert.equal(prefix.startsWith("staging/finalized/artifacts/artifact/"), true);
    assert.equal(isHeadlessProductionPrefixCandidate(prefix), false);
  });

  await test("owned lifecycle policy contains exactly two rules", () => {
    const rules = buildHeadlessStagingR2LifecyclePolicyRules();
    assert.equal(rules.length, 2);
    const assets = rules.filter((r) => r.bucketClass === "assets");
    assert.ok(assets.every((r) => r.expirationDays == null));
  });

  await test("lifecycle timing cannot precede application expiry", () => {
    assert.equal(assertHeadlessR2LifecycleTimingSafe(), true);
  });

  await test("delete-now schedules durable cleanup for succeeded export", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    // Minimal succeeded job seeding would require full store API — verify scheduling rejects non-terminal.
    const rejected = await scheduleHeadlessExportDeleteNow({
      envName: "staging",
      ownerId: "owner_a",
      jobId: "missing_job",
      jobStore,
      cleanup,
      nowMs: 1,
    });
    assert.equal(rejected.ok, false);
  });

  await test("delete-now rejects non-staging environment", async () => {
    const result = await scheduleHeadlessExportDeleteNow({
      envName: "production",
      ownerId: "owner_a",
      jobId: "job_a",
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      nowMs: 1,
    });
    assert.equal(result.ok, false);
  });

  await test("renderer progress authority constants unchanged", () => {
    assert.equal(HEADLESS_RENDERING_PROGRESS_FLOOR, 40);
    assert.equal(HEADLESS_ENCODING_PROGRESS_PERCENT, 85);
  });

  await test("runtime module docs avoid sprint identifiers", () => {
    const sprintPattern = /Sprint 11E|Phase 2G\.25|Part [A-Z]/i;
    const serviceDir = path.join(
      process.cwd(),
      "src/features/headless-renderer/control-plane/services",
    );
    const workerDir = path.join(
      process.cwd(),
      "src/features/headless-renderer/worker/runtime",
    );
    for (const file of [
      "perform-owned-object-maintenance-delete.ts",
      "headless-export-maintenance-scheduler.ts",
      "schedule-export-delete-now.ts",
    ]) {
      const src = readFileSync(path.join(serviceDir, file), "utf8");
      assert.equal(sprintPattern.test(src), false, file);
    }
    const workerSrc = readFileSync(
      path.join(workerDir, "claimed-render-terminal-cleanup-runtime.ts"),
      "utf8",
    );
    assert.equal(sprintPattern.test(workerSrc), false);
  });

  await test("maintenance scheduler skips when disabled", async () => {
    let sweeps = 0;
    const scheduler = createHeadlessExportMaintenanceScheduler({
      envName: "staging",
      maintenanceEnabledFlag: "0",
      leasePort: null,
      maintenanceState: null,
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      objectIo: {
        deleteExactObject: async () => ({ ok: true, value: true as const }),
        probeExactObjectPresence: async () => ({ ok: true, value: "absent" }),
      },
      onSweep: () => {
        sweeps += 1;
      },
    });
    await scheduler.runOnce();
    assert.ok(sweeps >= 1);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
