/**
 * Durable maintenance lease authority regression coverage.
 * Run: npm run test:headless-neon-maintenance-lease-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  MemoryHeadlessMaintenanceLeaseAdapter,
  resetMemoryMaintenanceLeasesForTests,
} from "@/features/headless-renderer/control-plane/adapters/memory-maintenance-lease.adapter";
import {
  MemoryHeadlessMaintenanceStateAdapter,
  resetMemoryMaintenanceStateForTests,
} from "@/features/headless-renderer/control-plane/adapters/memory-maintenance-state.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import {
  HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
  runHeadlessExportMaintenanceBatchOnce,
} from "@/features/headless-renderer/control-plane/services/headless-export-maintenance-batch";
import { createHeadlessExportMaintenanceScheduler } from "@/features/headless-renderer/control-plane/services/headless-export-maintenance-scheduler";
import { evaluateHeadlessExportMaintenanceEnablement } from "@/features/headless-renderer/domain/headless-export-maintenance-enablement";
import type { HeadlessMaintenanceLeasePort } from "@/features/headless-renderer/control-plane/ports/maintenance-lease.port";
import { cpFail } from "@/features/headless-renderer/control-plane/types/control-plane.types";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

class RejectingLeaseAdapter implements HeadlessMaintenanceLeasePort {
  async claim(_input: {
    readonly scope: typeof HEADLESS_MAINTENANCE_GLOBAL_SCOPE;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly leaseMs: number;
    readonly holderClass: string;
  }) {
    return cpFail("DATABASE_UNAVAILABLE", "down");
  }

  async renew() {
    return cpFail("DATABASE_UNAVAILABLE", "down");
  }

  async release() {
    return cpFail("DATABASE_UNAVAILABLE", "down");
  }

  async assertActiveLease() {
    return cpFail("DATABASE_UNAVAILABLE", "down");
  }
}

async function main() {
  console.log("\nHeadless Neon maintenance lease authority\n");
  resetMemoryMaintenanceLeasesForTests();
  resetMemoryMaintenanceStateForTests();

  await test("concurrent acquisition rejects second holder", async () => {
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

  await test("expired lease can be reclaimed", async () => {
    resetMemoryMaintenanceLeasesForTests();
    const lease = new MemoryHeadlessMaintenanceLeaseAdapter();
    const tokenA = randomUUID();
    await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: tokenA,
      nowMs: 1,
      leaseMs: 10,
      holderClass: "verify_worker",
    });
    const reclaimed = await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 20,
      leaseMs: 60_000,
      holderClass: "verify_worker",
    });
    assert.equal(reclaimed.ok, true);
    assert.equal(reclaimed.value.kind, "claimed");
  });

  await test("stale token renewal is rejected", async () => {
    resetMemoryMaintenanceLeasesForTests();
    const lease = new MemoryHeadlessMaintenanceLeaseAdapter();
    const token = randomUUID();
    await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: token,
      nowMs: 1,
      leaseMs: 60_000,
      holderClass: "verify_worker",
    });
    const renew = await lease.renew({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 2,
      leaseMs: 60_000,
    });
    assert.equal(renew.ok, true);
    assert.equal(renew.value.kind, "stale_token");
  });

  await test("stale token release is rejected", async () => {
    resetMemoryMaintenanceLeasesForTests();
    const lease = new MemoryHeadlessMaintenanceLeaseAdapter();
    await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 1,
      leaseMs: 60_000,
      holderClass: "verify_worker",
    });
    const release = await lease.release({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 2,
    });
    assert.equal(release.ok, true);
    assert.equal(release.value.kind, "stale_token");
  });

  await test("stale worker cannot run provider deletion batch", async () => {
    resetMemoryMaintenanceLeasesForTests();
    const lease = new MemoryHeadlessMaintenanceLeaseAdapter();
    const activeToken = randomUUID();
    await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: activeToken,
      nowMs: 100,
      leaseMs: 60_000,
      holderClass: "verify_worker",
    });
    const batch = await runHeadlessExportMaintenanceBatchOnce({
      envName: "staging",
      ownerId: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      nowMs: () => 101,
      leaseToken: randomUUID(),
      leasePort: lease,
      maintenanceState: new MemoryHeadlessMaintenanceStateAdapter(),
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      objectIo: {
        deleteExactObject: async () => ({ ok: true, value: true as const }),
        probeExactObjectPresence: async () => ({ ok: true, value: "absent" }),
      },
      expectation: {
        ownerId: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
        projectId: "p",
        jobId: "j",
        operationId: "o",
        envName: "staging",
      },
      dryRun: true,
    });
    assert.equal(batch.ok, true);
    assert.equal(batch.value.status, "lease_rejected");
    assert.equal(batch.value.processed, 0);
  });

  await test("process crash followed by lease expiry allows reclaim", async () => {
    resetMemoryMaintenanceLeasesForTests();
    const lease = new MemoryHeadlessMaintenanceLeaseAdapter();
    await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 1,
      leaseMs: 5,
      holderClass: "verify_worker",
    });
    const reclaimed = await lease.claim({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 10,
      leaseMs: 60_000,
      holderClass: "verify_worker",
    });
    assert.equal(reclaimed.value.kind, "claimed");
  });

  await test("database failure before acquisition yields zero batch work", async () => {
    const scheduler = createHeadlessExportMaintenanceScheduler({
      envName: "staging",
      maintenanceEnabledFlag: "1",
      leasePort: new RejectingLeaseAdapter(),
      maintenanceState: new MemoryHeadlessMaintenanceStateAdapter(),
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      objectIo: {
        deleteExactObject: async () => ({ ok: true, value: true as const }),
        probeExactObjectPresence: async () => ({ ok: true, value: "absent" }),
      },
    });
    const result = await scheduler.runOnce();
    assert.equal(result.ok, false);
  });

  await test("cursor fencing rejects stale fence token", async () => {
    resetMemoryMaintenanceStateForTests();
    const state = new MemoryHeadlessMaintenanceStateAdapter();
    const advance = await state.advanceCursor({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 1,
      cursor: { ownerId: HEADLESS_MAINTENANCE_GLOBAL_SCOPE, lastObjectId: "obj_a" },
    });
    assert.equal(advance.ok, true);
    assert.equal(advance.value.kind, "advanced");
    await state.advanceCursor({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 2,
      cursor: { ownerId: HEADLESS_MAINTENANCE_GLOBAL_SCOPE, lastObjectId: "obj_b" },
    });
    const staleOutcome = await state.recordSweepOutcome({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: randomUUID(),
      nowMs: 3,
      outcome: "success",
      providerDeletionSuccesses: 1,
      providerDeletionFailures: 0,
      unsafeDeletionRejections: 0,
      projectSourceDeletionAttempts: 0,
      cleanupBacklogCount: 0,
      oldestPendingCleanupAgeClass: "none",
    });
    assert.equal(staleOutcome.ok, true);
    assert.equal(staleOutcome.value.kind, "stale_fence");
  });

  await test("disabled maintenance makes zero provider connections", () => {
    const enablement = evaluateHeadlessExportMaintenanceEnablement({
      envName: "staging",
      maintenanceEnabledFlag: "0",
    });
    assert.equal(enablement.ok, false);
  });

  await test("enabled maintenance requires durable lease port", async () => {
    const scheduler = createHeadlessExportMaintenanceScheduler({
      envName: "staging",
      maintenanceEnabledFlag: "1",
      leasePort: null,
      maintenanceState: null,
      cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
      ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      objectIo: {
        deleteExactObject: async () => ({ ok: true, value: true as const }),
        probeExactObjectPresence: async () => ({ ok: true, value: "absent" }),
      },
    });
    const result = await scheduler.runOnce();
    assert.equal(result.ok, false);
    assert.equal(result.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
