/**
 * Neon-backed aggregate maintenance health and cursor fencing state.
 */

import { mapHeadlessDatabaseFailure } from "../runtime/map-database-failure";
import type { HeadlessSqlExecutor } from "../runtime/sql-client";
import type { HeadlessMaintenanceStatePort } from "../ports/maintenance-state.port";
import type { HeadlessMaintenanceLeaseScope } from "../ports/maintenance-lease.port";
import type { HeadlessMaintenanceBatchCursor } from "../services/headless-export-maintenance-batch";
import {
  buildHeadlessMaintenanceHealthMetrics,
  type HeadlessMaintenanceAgeClass,
} from "../services/headless-export-maintenance-health-metrics";
import { cpOk } from "../types/control-plane.types";

const ENSURE_STATE_SQL = `
INSERT INTO public.headless_export_maintenance_state (scope, updated_at_ms)
VALUES ($1, $2)
ON CONFLICT (scope) DO NOTHING
`;

const READ_STATE_SQL = `
SELECT
  last_success_at_ms,
  last_failure_at_ms,
  consecutive_failure_count,
  lease_contention_count,
  provider_deletion_success_count,
  provider_deletion_failure_count,
  unsafe_deletion_rejection_count,
  project_source_deletion_attempt_count,
  cleanup_backlog_count,
  oldest_pending_cleanup_age_class,
  cursor_owner_id,
  cursor_last_object_id,
  cursor_fence_token
FROM public.headless_export_maintenance_state
WHERE scope = $1
`;

const RECORD_CONTENTION_SQL = `
UPDATE public.headless_export_maintenance_state
SET lease_contention_count = lease_contention_count + 1,
    updated_at_ms = $2
WHERE scope = $1
RETURNING scope
`;

const RECORD_OUTCOME_SQL = `
UPDATE public.headless_export_maintenance_state
SET
  last_success_at_ms = CASE WHEN $3 = 'success' THEN $2 ELSE last_success_at_ms END,
  last_failure_at_ms = CASE WHEN $3 = 'failure' THEN $2 ELSE last_failure_at_ms END,
  consecutive_failure_count = CASE
    WHEN $3 = 'success' THEN 0
    WHEN $3 = 'failure' THEN consecutive_failure_count + 1
    ELSE consecutive_failure_count
  END,
  provider_deletion_success_count = provider_deletion_success_count + $4,
  provider_deletion_failure_count = provider_deletion_failure_count + $5,
  unsafe_deletion_rejection_count = unsafe_deletion_rejection_count + $6,
  project_source_deletion_attempt_count = project_source_deletion_attempt_count + $7,
  cleanup_backlog_count = $8,
  oldest_pending_cleanup_age_class = $9,
  updated_at_ms = $2
WHERE scope = $1
  AND (
    cursor_fence_token IS NULL
    OR cursor_fence_token = $10
  )
RETURNING scope
`;

const ADVANCE_CURSOR_SQL = `
UPDATE public.headless_export_maintenance_state
SET cursor_owner_id = $3,
    cursor_last_object_id = $4,
    cursor_fence_token = $2,
    updated_at_ms = $5
WHERE scope = $1
  AND (
    cursor_fence_token IS NULL
    OR cursor_fence_token = $2
  )
RETURNING scope
`;

type StateRow = {
  readonly last_success_at_ms: number | null;
  readonly last_failure_at_ms: number | null;
  readonly consecutive_failure_count: number;
  readonly lease_contention_count: number;
  readonly provider_deletion_success_count: number;
  readonly provider_deletion_failure_count: number;
  readonly unsafe_deletion_rejection_count: number;
  readonly project_source_deletion_attempt_count: number;
  readonly cleanup_backlog_count: number;
  readonly oldest_pending_cleanup_age_class: HeadlessMaintenanceAgeClass;
  readonly cursor_owner_id: string | null;
  readonly cursor_last_object_id: string | null;
  readonly cursor_fence_token: string | null;
};

export class NeonHeadlessMaintenanceStateAdapter
  implements HeadlessMaintenanceStatePort
{
  constructor(private readonly sql: HeadlessSqlExecutor) {}

  private async ensureScope(scope: HeadlessMaintenanceLeaseScope, nowMs: number) {
    await this.sql.withClient(async (client) => {
      await client.query(ENSURE_STATE_SQL, [scope, nowMs]);
    });
  }

  private async readRow(scope: HeadlessMaintenanceLeaseScope): Promise<StateRow | null> {
    const rows = await this.sql.withClient(async (client) => {
      const result = await client.query<StateRow>(READ_STATE_SQL, [scope]);
      return result.rows;
    });
    return rows[0] ?? null;
  }

  async readMetrics(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly nowMs: number;
  }) {
    try {
      await this.ensureScope(input.scope, input.nowMs);
      const row = await this.readRow(input.scope);
      if (row == null) {
        return cpOk(
          buildHeadlessMaintenanceHealthMetrics({
            nowMs: input.nowMs,
            lastSuccessAtMs: null,
            lastFailureAtMs: null,
            consecutiveFailureCount: 0,
            cleanupBacklogCount: 0,
            oldestPendingCleanupAgeClass: "none",
            leaseContentionCount: 0,
            providerDeletionSuccessCount: 0,
            providerDeletionFailureCount: 0,
            unsafeDeletionRejectionCount: 0,
            projectSourceDeletionAttemptCount: 0,
          }),
        );
      }
      return cpOk(
        buildHeadlessMaintenanceHealthMetrics({
          nowMs: input.nowMs,
          lastSuccessAtMs: row.last_success_at_ms,
          lastFailureAtMs: row.last_failure_at_ms,
          consecutiveFailureCount: row.consecutive_failure_count,
          cleanupBacklogCount: row.cleanup_backlog_count,
          oldestPendingCleanupAgeClass: row.oldest_pending_cleanup_age_class,
          leaseContentionCount: row.lease_contention_count,
          providerDeletionSuccessCount: row.provider_deletion_success_count,
          providerDeletionFailureCount: row.provider_deletion_failure_count,
          unsafeDeletionRejectionCount: row.unsafe_deletion_rejection_count,
          projectSourceDeletionAttemptCount:
            row.project_source_deletion_attempt_count,
        }),
      );
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async recordLeaseContention(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly nowMs: number;
  }) {
    try {
      await this.ensureScope(input.scope, input.nowMs);
      const rows = await this.sql.withClient(async (client) => {
        const result = await client.query<{ scope: string }>(
          RECORD_CONTENTION_SQL,
          [input.scope, input.nowMs],
        );
        return result.rows;
      });
      if (rows.length === 0) {
        return mapHeadlessDatabaseFailure(new Error("maintenance_state_missing"));
      }
      return cpOk({ kind: "recorded" as const });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
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
    if (
      input.outcome === "lease_rejected" ||
      input.outcome === "environment_rejected"
    ) {
      return cpOk({ kind: "recorded" as const });
    }
    try {
      await this.ensureScope(input.scope, input.nowMs);
      const rows = await this.sql.withClient(async (client) => {
        const result = await client.query<{ scope: string }>(RECORD_OUTCOME_SQL, [
          input.scope,
          input.nowMs,
          input.outcome,
          input.providerDeletionSuccesses,
          input.providerDeletionFailures,
          input.unsafeDeletionRejections,
          input.projectSourceDeletionAttempts,
          input.cleanupBacklogCount,
          input.oldestPendingCleanupAgeClass,
          input.leaseToken,
        ]);
        return result.rows;
      });
      if (rows.length === 0) {
        return cpOk({ kind: "stale_fence" as const });
      }
      return cpOk({ kind: "recorded" as const });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async advanceCursor(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly cursor: HeadlessMaintenanceBatchCursor | null;
  }) {
    try {
      await this.ensureScope(input.scope, input.nowMs);
      const rows = await this.sql.withClient(async (client) => {
        const result = await client.query<{ scope: string }>(ADVANCE_CURSOR_SQL, [
          input.scope,
          input.leaseToken,
          input.cursor?.ownerId ?? null,
          input.cursor?.lastObjectId ?? null,
          input.nowMs,
        ]);
        return result.rows;
      });
      if (rows.length === 0) {
        return cpOk({ kind: "stale_fence" as const });
      }
      return cpOk({ kind: "advanced" as const });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async readCursor(input: { readonly scope: HeadlessMaintenanceLeaseScope }) {
    try {
      const row = await this.readRow(input.scope);
      if (
        row == null ||
        row.cursor_owner_id == null ||
        row.cursor_fence_token == null
      ) {
        return cpOk(null);
      }
      return cpOk(
        Object.freeze({
          ownerId: row.cursor_owner_id,
          lastObjectId: row.cursor_last_object_id,
        }),
      );
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }
}
