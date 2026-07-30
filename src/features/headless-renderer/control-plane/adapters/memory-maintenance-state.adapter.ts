/**
 * In-memory aggregate maintenance health and cursor fencing for tests.
 */

import type { HeadlessMaintenanceStatePort } from "../ports/maintenance-state.port";
import type { HeadlessMaintenanceLeaseScope } from "../ports/maintenance-lease.port";
import type { HeadlessMaintenanceBatchCursor } from "../services/headless-export-maintenance-batch";
import {
  buildHeadlessMaintenanceHealthMetrics,
  type HeadlessMaintenanceAgeClass,
} from "../services/headless-export-maintenance-health-metrics";
import { cpOk } from "../types/control-plane.types";

type StateRow = {
  lastSuccessAtMs: number | null;
  lastFailureAtMs: number | null;
  consecutiveFailureCount: number;
  leaseContentionCount: number;
  providerDeletionSuccessCount: number;
  providerDeletionFailureCount: number;
  unsafeDeletionRejectionCount: number;
  projectSourceDeletionAttemptCount: number;
  cleanupBacklogCount: number;
  oldestPendingCleanupAgeClass: HeadlessMaintenanceAgeClass;
  cursor: HeadlessMaintenanceBatchCursor | null;
  cursorFenceToken: string | null;
};

const state = new Map<HeadlessMaintenanceLeaseScope, StateRow>();

function ensureScope(scope: HeadlessMaintenanceLeaseScope): StateRow {
  const existing = state.get(scope);
  if (existing != null) return existing;
  const row: StateRow = {
    lastSuccessAtMs: null,
    lastFailureAtMs: null,
    consecutiveFailureCount: 0,
    leaseContentionCount: 0,
    providerDeletionSuccessCount: 0,
    providerDeletionFailureCount: 0,
    unsafeDeletionRejectionCount: 0,
    projectSourceDeletionAttemptCount: 0,
    cleanupBacklogCount: 0,
    oldestPendingCleanupAgeClass: "none",
    cursor: null,
    cursorFenceToken: null,
  };
  state.set(scope, row);
  return row;
}

export class MemoryHeadlessMaintenanceStateAdapter
  implements HeadlessMaintenanceStatePort
{
  async readMetrics(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly nowMs: number;
  }) {
    const row = ensureScope(input.scope);
    return cpOk(
      buildHeadlessMaintenanceHealthMetrics({
        nowMs: input.nowMs,
        lastSuccessAtMs: row.lastSuccessAtMs,
        lastFailureAtMs: row.lastFailureAtMs,
        consecutiveFailureCount: row.consecutiveFailureCount,
        cleanupBacklogCount: row.cleanupBacklogCount,
        oldestPendingCleanupAgeClass: row.oldestPendingCleanupAgeClass,
        leaseContentionCount: row.leaseContentionCount,
        providerDeletionSuccessCount: row.providerDeletionSuccessCount,
        providerDeletionFailureCount: row.providerDeletionFailureCount,
        unsafeDeletionRejectionCount: row.unsafeDeletionRejectionCount,
        projectSourceDeletionAttemptCount: row.projectSourceDeletionAttemptCount,
      }),
    );
  }

  async recordLeaseContention(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly nowMs: number;
  }) {
    const row = ensureScope(input.scope);
    row.leaseContentionCount += 1;
    return cpOk({ kind: "recorded" as const });
  }

  async recordSweepOutcome(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly outcome: "success" | "failure" | "lease_rejected" | "environment_rejected";
    readonly providerDeletionSuccesses: number;
    readonly providerDeletionFailures: number;
    readonly unsafeDeletionRejections: number;
    readonly projectSourceDeletionAttempts: number;
    readonly cleanupBacklogCount: number;
    readonly oldestPendingCleanupAgeClass: HeadlessMaintenanceAgeClass;
  }) {
    const row = ensureScope(input.scope);
    if (
      row.cursorFenceToken != null &&
      row.cursorFenceToken !== input.leaseToken &&
      (input.outcome === "success" || input.outcome === "failure")
    ) {
      return cpOk({ kind: "stale_fence" as const });
    }
    if (input.outcome === "success") {
      row.lastSuccessAtMs = input.nowMs;
      row.consecutiveFailureCount = 0;
    } else if (input.outcome === "failure") {
      row.lastFailureAtMs = input.nowMs;
      row.consecutiveFailureCount += 1;
    }
    row.providerDeletionSuccessCount += input.providerDeletionSuccesses;
    row.providerDeletionFailureCount += input.providerDeletionFailures;
    row.unsafeDeletionRejectionCount += input.unsafeDeletionRejections;
    row.projectSourceDeletionAttemptCount += input.projectSourceDeletionAttempts;
    row.cleanupBacklogCount = input.cleanupBacklogCount;
    row.oldestPendingCleanupAgeClass = input.oldestPendingCleanupAgeClass;
    return cpOk({ kind: "recorded" as const });
  }

  async advanceCursor(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly cursor: HeadlessMaintenanceBatchCursor | null;
  }) {
    const row = ensureScope(input.scope);
    if (
      row.cursorFenceToken != null &&
      row.cursorFenceToken !== input.leaseToken
    ) {
      return cpOk({ kind: "stale_fence" as const });
    }
    row.cursor = input.cursor;
    row.cursorFenceToken = input.leaseToken;
    return cpOk({ kind: "advanced" as const });
  }

  async readCursor(input: { readonly scope: HeadlessMaintenanceLeaseScope }) {
    const row = ensureScope(input.scope);
    return cpOk(row.cursor);
  }
}

export function resetMemoryMaintenanceStateForTests(): void {
  state.clear();
}
