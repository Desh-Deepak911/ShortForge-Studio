/**
 * Production adapter materialization — dynamically imported only when
 * composition seams are closed AND packaging resolves these modules into the
 * deployable worker bundle. Keep out of the default hosted entry graph so the
 * foundation image cannot pull export/product UI via Neon domain imports.
 *
 * 2E.2A: job-bound R2 storage factory + Neon cleanup adapter are available for
 * render composition wiring; consumer loop still packaging-blocked.
 */

import { NeonHeadlessMaintenanceLeaseAdapter } from "../../control-plane/adapters/neon-maintenance-lease.adapter";
import { NeonHeadlessMaintenanceStateAdapter } from "../../control-plane/adapters/neon-maintenance-state.adapter";
import { NeonHeadlessArtifactCleanupAdapter } from "../../control-plane/adapters/neon-artifact-cleanup.adapter";
import { NeonHeadlessJobStoreAdapter } from "../../control-plane/adapters/neon-job-store.adapter";
import { NeonHeadlessOwnedObjectStoreAdapter } from "../../control-plane/adapters/neon-owned-object-store.adapter";
import { NeonHeadlessRenderDispatchOutboxAdapter } from "../../control-plane/adapters/neon-render-dispatch-outbox.adapter";
import type { HeadlessRenderDispatchOutboxPort } from "../../control-plane/ports/render-dispatch-outbox.port";
import {
  createR2JobBoundStorageAdapter,
  type HostedJobBoundStorageContext,
} from "../../control-plane/adapters/r2-job-bound-storage.adapter";
import { R2StorageAdapter } from "../../control-plane/adapters/r2-storage.adapter";
import type { HeadlessMaintenanceLeasePort } from "../../control-plane/ports/maintenance-lease.port";
import type { HeadlessMaintenanceStatePort } from "../../control-plane/ports/maintenance-state.port";
import type { HeadlessArtifactCleanupPort } from "../../control-plane/ports/artifact-cleanup.port";
import type { HeadlessJobStorePort } from "../../control-plane/ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../../control-plane/ports/owned-object-store.port";
import type { HeadlessR2ObjectIOPort } from "../../control-plane/ports/r2-object-io.port";
import type { HeadlessStoragePort } from "../../control-plane/ports/storage.port";
import type { HeadlessStreamQueuePort } from "../../control-plane/ports/stream-queue.port";
import { FlyMachineWakeAdapter } from "../../control-plane/adapters/fly-machine-wake.adapter";
import { readConfiguredHeadlessDatabaseUrl } from "../../control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "../../control-plane/runtime/neon-sql-executor";
import type { HeadlessSqlExecutor } from "../../control-plane/runtime/sql-client";
import { readConfiguredHeadlessR2Config } from "../../control-plane/runtime/r2-environment";
import { classifyHeadlessQueueProvider } from "../../control-plane/runtime/queue-provider";
import {
  readConfiguredHeadlessFlyVerifyWakeConfig,
  readConfiguredHeadlessFlyWakeConfig,
} from "../../control-plane/runtime/fly-wake-environment";
import { cpFail } from "../../control-plane/types/control-plane.types";
import type { HeadlessWorkerWakePort } from "../../control-plane/ports/worker-wake.port";
import {
  readConfiguredHeadlessUpstashConsumerConfig,
  type HeadlessQueueLeaseSettings,
} from "../../control-plane/runtime/upstash-environment";
import { UpstashTcpStreamConsumerAdapter } from "../queue/upstash-tcp-stream-consumer.adapter";
import type { HeadlessCanonicalStoredJobRecord } from "../../control-plane/types/stored-job-record";
import {
  executeClaimedRender,
  mapClaimedRenderToHostedResult,
  type HostedClaimedRenderResult,
} from "../runtime/execute-claimed-render";
import {
  createHostedProviderBackedBoundaryTelemetry,
} from "../runtime/provider-backed-boundary-telemetry";
import type { HeadlessHostedWorkerEventSink } from "./hosted-events";
import type { HeadlessConfiguredHostedWorkerEnvironment } from "./hosted-environment";
import type { HeadlessStoredOwnedObject } from "../../control-plane/ports/owned-object-store.port";

export function materializeHostedWorkerAdapters(input: {
  readonly config: HeadlessConfiguredHostedWorkerEnvironment;
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly eventSink?: HeadlessHostedWorkerEventSink;
  readonly observationBoundaryMs?: number;
}): {
  /** Neon SQL executor — used for schema preflight before queue/R2 intake. */
  readonly sql: HeadlessSqlExecutor;
  readonly jobStore: HeadlessJobStorePort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly artifactCleanup: HeadlessArtifactCleanupPort;
  readonly maintenanceLease: HeadlessMaintenanceLeasePort;
  readonly maintenanceState: HeadlessMaintenanceStatePort;
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort;
  readonly streamQueue: HeadlessStreamQueuePort & {
    close?: () => Promise<void>;
  };
  readonly r2ObjectIo: HeadlessR2ObjectIOPort;
  /**
   * Bind a job-scoped HeadlessStoragePort for render materialize/upload.
   * Must be called with the canonical attempt context — never client keys.
   */
  readonly createJobBoundStorage: (
    context: HostedJobBoundStorageContext,
  ) => HeadlessStoragePort;
  /**
   * Render-mode claimed execution — shared claimed-render executor over Neon
   * job store + Neon cleanup + R2 job-bound storage. Never re-claims.
   */
  readonly createOnClaimedRender: () => (input: {
    readonly claimedRecord: HeadlessCanonicalStoredJobRecord;
    readonly claimToken: string;
    readonly signal: AbortSignal;
  }) => Promise<HostedClaimedRenderResult>;
  /**
   * Verify-mode claimed execution — kept in this external module so the
   * foundation entry bundle never pulls ExportManifest validators.
   */
  readonly createOnClaimedVerify: () => (input: {
    readonly claimToken: string;
    readonly claimedObject: HeadlessStoredOwnedObject;
    readonly ownerId: string;
    readonly objectId: string;
    readonly expectedStoreVersion: number;
    readonly signal: AbortSignal;
  }) => Promise<{ readonly kind: string; readonly reasonId: string }>;
  readonly leaseSettings: HeadlessQueueLeaseSettings;
  /** This process's own Machine; used only for idle shutdown. */
  readonly workerWake: HeadlessWorkerWakePort | null;
  /** Render Machine; used after verify promotion and by outbox dispatch. */
  readonly renderWake?: HeadlessWorkerWakePort | null;
  readonly close: () => Promise<void>;
} {
  const env = input.env ?? process.env;
  const databaseUrl = readConfiguredHeadlessDatabaseUrl(env);
  const r2Config = readConfiguredHeadlessR2Config(env);
  const queueProvider = classifyHeadlessQueueProvider(env);
  const neonQueue =
    queueProvider.status === "configured" && queueProvider.provider === "neon";
  const upstashConfig = neonQueue
    ? null
    : readConfiguredHeadlessUpstashConsumerConfig(env);
  if (databaseUrl == null || r2Config == null || (!neonQueue && upstashConfig == null)) {
    throw new Error("HOSTED_ADAPTER_CONFIG_INVALID");
  }
  if (upstashConfig != null && upstashConfig.envName !== input.config.envName) {
    throw new Error("HOSTED_ADAPTER_ENV_MISMATCH");
  }

  const sql = createNeonSqlExecutor({ connectionString: databaseUrl });
  const jobStore = new NeonHeadlessJobStoreAdapter(sql);
  const ownedObjectStore = new NeonHeadlessOwnedObjectStoreAdapter(sql);
  const artifactCleanup = new NeonHeadlessArtifactCleanupAdapter(sql);
  const maintenanceLease = new NeonHeadlessMaintenanceLeaseAdapter(sql);
  const maintenanceState = new NeonHeadlessMaintenanceStateAdapter(sql);
  const dispatchOutbox = new NeonHeadlessRenderDispatchOutboxAdapter(sql);
  const streamQueue =
    neonQueue || upstashConfig == null
      ? createNeonUnavailableStreamQueue()
      : new UpstashTcpStreamConsumerAdapter({
          config: upstashConfig,
        });
  const r2ObjectIo = new R2StorageAdapter({
    env,
    configOverride: r2Config,
  });
  const renderWakeConfig = readConfiguredHeadlessFlyWakeConfig(env);
  const workerWakeConfig =
    input.config.mode === "verify"
      ? readConfiguredHeadlessFlyVerifyWakeConfig(env)
      : renderWakeConfig;
  const workerWake =
    queueProvider.provider === "neon" && workerWakeConfig != null
      ? new FlyMachineWakeAdapter({ config: workerWakeConfig })
      : null;
  const renderWake =
    queueProvider.provider === "neon" && renderWakeConfig != null
      ? new FlyMachineWakeAdapter({ config: renderWakeConfig })
      : null;

  return {
    sql,
    jobStore,
    ownedObjectStore,
    artifactCleanup,
    maintenanceLease,
    maintenanceState,
    dispatchOutbox,
    streamQueue,
    r2ObjectIo,
    createJobBoundStorage: (context) =>
      createR2JobBoundStorageAdapter({
        r2: r2ObjectIo,
        ownedObjectStore,
        jobStore,
        context,
      }),
    createOnClaimedRender: () => {
      const envName = input.config.envName;
      return async (hookInput) => {
        const boundaryTelemetry = createHostedProviderBackedBoundaryTelemetry({
          eventSink: input.eventSink,
          nowMs: () => Date.now(),
          correlation: Object.freeze({
            machineClass: "exact_render",
            concurrencyClass: "single",
            executionWindowClass: "bounded",
            claimAckCorrelationClass: "current_run",
            observationBoundaryMs: input.observationBoundaryMs ?? Date.now(),
          }),
          mode: "render",
        });
        const executed = await executeClaimedRender({
          claimedRecord: hookInput.claimedRecord,
          claimToken: hookInput.claimToken,
          jobStore,
          artifactCleanup,
          envName: input.config.envName,
          signal: hookInput.signal,
          nowMs: () => Date.now(),
          boundaryTelemetry,
          storageAdapterClass: "r2_job_bound",
          resolveStorage: (coherent) => {
            const assets = coherent.canonicalRequest.assetBundle.assets;
            const maxAssetExpiry = assets.reduce(
              (max, asset) => Math.max(max, asset.expiresAtMs),
              Date.now(),
            );
            return createR2JobBoundStorageAdapter({
              r2: r2ObjectIo,
              ownedObjectStore,
              jobStore,
              context: {
                ownerId: coherent.ownerId,
                projectId: coherent.projectId,
                jobId: coherent.jobId,
                operationId: coherent.operationId,
                attempt: coherent.canonicalJob.attempt,
                environmentNamespace: envName,
                artifactExpiresAtMs: maxAssetExpiry,
                allowedSourceLocators: assets.map((a) => a.storageLocator),
                nowMs: () => Date.now(),
              },
            });
          },
        });
        return mapClaimedRenderToHostedResult(executed);
      };
    },
    createOnClaimedVerify: () => {
      return async (hookInput) => {
        const { executeTrustedVerifyPromotion } = await import(
          "../../control-plane/services/execute-trusted-verify-promotion"
        );
        const result = await executeTrustedVerifyPromotion({
          claimedObject: hookInput.claimedObject,
          claimToken: hookInput.claimToken,
          ownerId: hookInput.ownerId,
          nowMs: Date.now(),
          signal: hookInput.signal,
          ownedObjectStore,
          jobStore,
          io: r2ObjectIo,
          streamQueue,
          dispatchOutbox,
          queueProvider: queueProvider.provider ?? undefined,
          wake: renderWake ?? undefined,
        });
        if (!result.ok) {
          return {
            kind: "verify_promotion_failed",
            reasonId: result.issues[0]?.code ?? "VERIFY_PROMOTION_FAILED",
          };
        }
        return {
          kind: result.value.kind,
          reasonId: result.value.reasonId,
        };
      };
    },
    leaseSettings: input.config.leaseSettings,
    workerWake,
    renderWake,
    close: async () => {
      await streamQueue.close?.();
    },
  };
}

function createNeonUnavailableStreamQueue(): HeadlessStreamQueuePort & {
  close?: () => Promise<void>;
} {
  const refuse = async () =>
    cpFail(
      "CONFIGURATION_UNAVAILABLE",
      "Upstash stream queue is not attached in Neon mode.",
    );
  return {
    enqueueRender: refuse,
    enqueueVerify: refuse,
    ensureConsumerGroups: refuse,
    readGroup: refuse,
    ack: refuse,
    autoClaimIdle: refuse,
    moveToDlq: refuse,
    close: async () => undefined,
  };
}
