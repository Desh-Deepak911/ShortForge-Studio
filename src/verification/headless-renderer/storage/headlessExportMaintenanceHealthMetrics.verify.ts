/**
 * Maintenance health metrics regression coverage.
 * Run: npm run test:headless-export-maintenance-health-metrics
 */

import assert from "node:assert/strict";

import {
  MemoryHeadlessMaintenanceStateAdapter,
  resetMemoryMaintenanceStateForTests,
} from "@/features/headless-renderer/control-plane/adapters/memory-maintenance-state.adapter";
import {
  buildHeadlessMaintenanceHealthMetrics,
  validateHeadlessMaintenanceHealthMetricsPrivacy,
} from "@/features/headless-renderer/control-plane/services/headless-export-maintenance-health-metrics";
import { HEADLESS_MAINTENANCE_GLOBAL_SCOPE } from "@/features/headless-renderer/control-plane/services/headless-export-maintenance-batch";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nHeadless export maintenance health metrics\n");
  resetMemoryMaintenanceStateForTests();

  await test("metrics include deferred maintenance health classes", () => {
    const metrics = buildHeadlessMaintenanceHealthMetrics({
      nowMs: 100_000,
      lastSuccessAtMs: 90_000,
      lastFailureAtMs: 80_000,
      consecutiveFailureCount: 2,
      cleanupBacklogCount: 12,
      oldestPendingCleanupAgeClass: "hours",
      leaseContentionCount: 3,
      providerDeletionSuccessCount: 4,
      providerDeletionFailureCount: 1,
      unsafeDeletionRejectionCount: 2,
      projectSourceDeletionAttemptCount: 0,
    });
    assert.equal(metrics.lastSuccessfulMaintenanceAgeClass, "minutes");
    assert.equal(metrics.lastFailedMaintenanceAgeClass, "minutes");
    assert.equal(metrics.consecutiveFailureCountClass, "few");
    assert.equal(metrics.cleanupBacklogCountClass, "medium");
    assert.equal(metrics.oldestPendingCleanupAgeClass, "hours");
    assert.equal(metrics.projectSourceDeletionAttemptCount, 0);
    assert.equal(validateHeadlessMaintenanceHealthMetricsPrivacy(metrics), true);
  });

  await test("persisted state drives privacy-safe metrics snapshot", async () => {
    resetMemoryMaintenanceStateForTests();
    const state = new MemoryHeadlessMaintenanceStateAdapter();
    await state.recordLeaseContention({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      nowMs: 1,
    });
    await state.recordSweepOutcome({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      leaseToken: "token_a",
      nowMs: 2,
      outcome: "success",
      providerDeletionSuccesses: 1,
      providerDeletionFailures: 0,
      unsafeDeletionRejections: 0,
      projectSourceDeletionAttempts: 0,
      cleanupBacklogCount: 1,
      oldestPendingCleanupAgeClass: "minutes",
    });
    const metrics = await state.readMetrics({
      scope: HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
      nowMs: 3,
    });
    assert.equal(metrics.ok, true);
    if (!metrics.ok) return;
    assert.equal(metrics.value.leaseContentionCount, 1);
    assert.equal(metrics.value.providerDeletionSuccessCount, 1);
    assert.equal(
      validateHeadlessMaintenanceHealthMetricsPrivacy(metrics.value),
      true,
    );
    const serialized = JSON.stringify(metrics.value);
    assert.equal(/objectKey|ownerId|jobId|projectId|url|bucket/i.test(serialized), false);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
