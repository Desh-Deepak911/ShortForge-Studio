/**
 * Aggregate maintenance health state persisted with minimum fields only.
 *
 * Cursor advances require the active lease fencing token so stale workers cannot
 * move the maintenance checkpoint after lease loss.
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type { HeadlessMaintenanceBatchCursor } from "../services/headless-export-maintenance-batch";
import type { HeadlessMaintenanceHealthMetricsV1 } from "../services/headless-export-maintenance-health-metrics";
import type { HeadlessMaintenanceLeaseScope } from "./maintenance-lease.port";

export type HeadlessMaintenanceSweepOutcomeClass =
  | "success"
  | "failure"
  | "lease_rejected"
  | "environment_rejected";

export interface HeadlessMaintenanceStatePort {
  readMetrics(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly nowMs: number;
  }): Promise<HeadlessControlPlaneResult<HeadlessMaintenanceHealthMetricsV1>>;

  recordLeaseContention(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly nowMs: number;
  }): Promise<HeadlessControlPlaneResult<{ readonly kind: "recorded" }>>;

  recordSweepOutcome(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly outcome: HeadlessMaintenanceSweepOutcomeClass;
    readonly providerDeletionSuccesses: number;
    readonly providerDeletionFailures: number;
    readonly unsafeDeletionRejections: number;
    readonly projectSourceDeletionAttempts: number;
    readonly cleanupBacklogCount: number;
    readonly oldestPendingCleanupAgeClass:
      | "none"
      | "minutes"
      | "hours"
      | "days";
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "recorded" }
      | { readonly kind: "stale_fence" }
    >
  >;

  advanceCursor(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly cursor: HeadlessMaintenanceBatchCursor | null;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "advanced" }
      | { readonly kind: "stale_fence" }
    >
  >;

  readCursor(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
  }): Promise<
    HeadlessControlPlaneResult<HeadlessMaintenanceBatchCursor | null>
  >;
}
