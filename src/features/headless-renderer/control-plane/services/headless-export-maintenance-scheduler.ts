/**
 * Scheduled export maintenance sweeps for the hosted verify worker loop.
 *
 * Reuses the existing verify process group — no additional Machine is required.
 * When maintenance is enabled, durable Neon lease and state ports are required;
 * disabled mode performs zero lease, database, Redis or provider work.
 */

import { randomUUID } from "node:crypto";

import {
  evaluateHeadlessExportMaintenanceEnablement,
  HEADLESS_EXPORT_MAINTENANCE_DEFAULT_INTERVAL_MS,
} from "../../domain/headless-export-maintenance-enablement";
import type { HeadlessArtifactCleanupPort } from "../ports/artifact-cleanup.port";
import type { HeadlessArtifactObjectIOPort } from "../ports/artifact-object-io.port";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessMaintenanceLeasePort } from "../ports/maintenance-lease.port";
import type { HeadlessMaintenanceStatePort } from "../ports/maintenance-state.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import {
  runHeadlessExportMaintenanceBatchOnce,
  HEADLESS_MAINTENANCE_GLOBAL_SCOPE,
  HEADLESS_MAINTENANCE_LEASE_MS,
} from "./headless-export-maintenance-batch";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessMaintenanceSweepTelemetry = {
  readonly action: "maintenance_sweep";
  readonly status: "started" | "completed" | "skipped" | "failed";
  readonly processed: number;
  readonly leaseContention: boolean;
};

const GLOBAL_MAINTENANCE_OWNER = HEADLESS_MAINTENANCE_GLOBAL_SCOPE;

/**
 * Creates a stoppable maintenance scheduler with bounded single-flight sweeps.
 */
export function createHeadlessExportMaintenanceScheduler(input: {
  readonly envName: string;
  readonly maintenanceEnabledFlag: string | null | undefined;
  readonly leasePort: HeadlessMaintenanceLeasePort | null;
  readonly maintenanceState: HeadlessMaintenanceStatePort | null;
  readonly cleanup: HeadlessArtifactCleanupPort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly objectIo: HeadlessArtifactObjectIOPort;
  readonly nowMs?: () => number;
  readonly intervalMs?: number;
  readonly holderClass?: string;
  readonly onSweep?: (telemetry: HeadlessMaintenanceSweepTelemetry) => void;
}): {
  readonly runOnce: () => Promise<
    HeadlessControlPlaneResult<{ readonly processed: number }>
  >;
  readonly start: () => void;
  readonly stop: () => void;
  readonly isRunning: () => boolean;
} {
  const nowMs = input.nowMs ?? (() => Date.now());
  const enablement = evaluateHeadlessExportMaintenanceEnablement({
    envName: input.envName,
    maintenanceEnabledFlag: input.maintenanceEnabledFlag,
    intervalMs: input.intervalMs ?? HEADLESS_EXPORT_MAINTENANCE_DEFAULT_INTERVAL_MS,
  });
  let accepting = enablement.ok;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sweepActive = false;

  const runOnce = async () => {
    if (!accepting || !enablement.ok) {
      input.onSweep?.({
        action: "maintenance_sweep",
        status: "skipped",
        processed: 0,
        leaseContention: false,
      });
      return { ok: true as const, value: { processed: 0 } };
    }
    if (
      input.leasePort == null ||
      input.maintenanceState == null
    ) {
      input.onSweep?.({
        action: "maintenance_sweep",
        status: "failed",
        processed: 0,
        leaseContention: false,
      });
      return {
        ok: false as const,
        issues: [
          {
            code: "CONFIGURATION_UNAVAILABLE" as const,
            message: "Maintenance lease authority unavailable.",
          },
        ],
      };
    }
    if (sweepActive) {
      await input.maintenanceState.recordLeaseContention({
        scope: GLOBAL_MAINTENANCE_OWNER,
        nowMs: nowMs(),
      });
      input.onSweep?.({
        action: "maintenance_sweep",
        status: "skipped",
        processed: 0,
        leaseContention: true,
      });
      return { ok: true as const, value: { processed: 0 } };
    }
    sweepActive = true;
    input.onSweep?.({
      action: "maintenance_sweep",
      status: "started",
      processed: 0,
      leaseContention: false,
    });
    const leaseToken = randomUUID();
    const lease = await input.leasePort.claim({
      scope: GLOBAL_MAINTENANCE_OWNER,
      leaseToken,
      nowMs: nowMs(),
      leaseMs: HEADLESS_MAINTENANCE_LEASE_MS,
      holderClass: input.holderClass ?? "verify_worker",
    });
    if (!lease.ok) {
      sweepActive = false;
      input.onSweep?.({
        action: "maintenance_sweep",
        status: "failed",
        processed: 0,
        leaseContention: false,
      });
      return lease as HeadlessControlPlaneResult<{ processed: number }>;
    }
    if (lease.value.kind === "lease_rejected") {
      await input.maintenanceState.recordLeaseContention({
        scope: GLOBAL_MAINTENANCE_OWNER,
        nowMs: nowMs(),
      });
      sweepActive = false;
      input.onSweep?.({
        action: "maintenance_sweep",
        status: "skipped",
        processed: 0,
        leaseContention: true,
      });
      return { ok: true as const, value: { processed: 0 } };
    }
    try {
      const cursorResult = await input.maintenanceState.readCursor({
        scope: GLOBAL_MAINTENANCE_OWNER,
      });
      const cursor = cursorResult.ok ? cursorResult.value : null;
      const batch = await runHeadlessExportMaintenanceBatchOnce({
        envName: input.envName,
        ownerId: GLOBAL_MAINTENANCE_OWNER,
        nowMs,
        leaseToken,
        leasePort: input.leasePort,
        maintenanceState: input.maintenanceState,
        cleanup: input.cleanup,
        ownedObjectStore: input.ownedObjectStore,
        jobStore: input.jobStore,
        objectIo: input.objectIo,
        expectation: {
          ownerId: GLOBAL_MAINTENANCE_OWNER,
          projectId: GLOBAL_MAINTENANCE_OWNER,
          jobId: GLOBAL_MAINTENANCE_OWNER,
          operationId: GLOBAL_MAINTENANCE_OWNER,
          envName: input.envName,
        },
        cursor,
        dryRun: false,
      });
      sweepActive = false;
      if (!batch.ok) {
        input.onSweep?.({
          action: "maintenance_sweep",
          status: "failed",
          processed: 0,
          leaseContention: false,
        });
        return batch as HeadlessControlPlaneResult<{ processed: number }>;
      }
      if (batch.value.status === "lease_rejected") {
        await input.maintenanceState.recordLeaseContention({
          scope: GLOBAL_MAINTENANCE_OWNER,
          nowMs: nowMs(),
        });
        input.onSweep?.({
          action: "maintenance_sweep",
          status: "skipped",
          processed: 0,
          leaseContention: true,
        });
        return { ok: true as const, value: { processed: 0 } };
      }
      input.onSweep?.({
        action: "maintenance_sweep",
        status: "completed",
        processed: batch.value.processed,
        leaseContention: false,
      });
      return { ok: true as const, value: { processed: batch.value.processed } };
    } finally {
      await input.leasePort.release({
        scope: GLOBAL_MAINTENANCE_OWNER,
        leaseToken,
        nowMs: nowMs(),
      });
    }
  };

  const start = () => {
    if (!enablement.ok || timer != null) return;
    const jitter = Math.floor(Math.random() * enablement.jitterMs);
    setTimeout(() => {
      void runOnce();
      timer = setInterval(() => {
        void runOnce();
      }, enablement.intervalMs);
    }, jitter);
  };

  const stop = () => {
    accepting = false;
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };

  return {
    runOnce,
    start,
    stop,
    isRunning: () => accepting && timer != null,
  };
}
