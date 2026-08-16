/**
 * Production adapter composition for the staging website control plane.
 *
 * Phase 2G.4 wires a staging-only signed session + Neon durable adapters and reports
 * R2 / Upstash producer classification — but R2 AWS adapters, TCP consumers,
 * upload routes, and queue workers remain absent from live product paths.
 * Activation is fail-closed and staging-only. Never constructs memory/test
 * adapters or TCP consumers. Composition itself opens no provider connection.
 */

import { StagingSessionPrincipalAdapter } from "../adapters/staging-session-principal.adapter";
import { NeonHeadlessJobStoreAdapter } from "../adapters/neon-job-store.adapter";
import { NeonHeadlessOwnedObjectStoreAdapter } from "../adapters/neon-owned-object-store.adapter";
import { NeonHeadlessProjectAuthorizationAdapter } from "../adapters/neon-project-authorization.adapter";
import { R2DownloadCapabilityAdapter } from "../adapters/r2-download-capability.adapter";
import { R2UploadCapabilityAdapter } from "../adapters/r2-upload-capability.adapter";
import { UnavailableHeadlessPrincipalAdapter } from "../adapters/unavailable-principal.adapter";
import { UnavailableHeadlessProjectAuthorizationAdapter } from "../adapters/unavailable-project-authorization.adapter";
import { UnavailableUpstashRestQueueProducerAdapter } from "../adapters/unavailable-upstash-rest-queue-producer.adapter";
import { UpstashRestQueueProducerAdapter } from "../adapters/upstash-rest-queue-producer.adapter";
import { FlyMachineWakeAdapter } from "../adapters/fly-machine-wake.adapter";
import type { HeadlessWorkerWakePort } from "../ports/worker-wake.port";
import { readConfiguredHeadlessFlyVerifyWakeConfig } from "./fly-wake-environment";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessPrincipalPort } from "../ports/principal.port";
import type { HeadlessProjectAuthorizationPort } from "../ports/project-authorization.port";
import type { HeadlessDownloadCapabilityPort } from "../ports/download-capability.port";
import { UnavailableHeadlessDownloadCapabilityAdapter } from "../ports/download-capability.port";
import type { HeadlessUploadCapabilityPort } from "../ports/upload-capability.port";
import { UnavailableHeadlessUploadCapabilityAdapter } from "../ports/upload-capability.port";
import {
  classifyStagingSessionEnvironment,
  readStagingSessionConfiguration,
  type StagingSessionEnvironmentStatus,
} from "./staging-session-environment";
import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
  type HeadlessNeonEnvironmentStatus,
} from "./neon-environment";
import { createNeonSqlExecutor } from "./neon-sql-executor";
import {
  classifyHeadlessR2Environment,
  type HeadlessR2EnvironmentStatus,
} from "./r2-environment";
import {
  classifyHeadlessUpstashProducerEnvironment,
  readConfiguredHeadlessUpstashProducerConfig,
  type HeadlessUpstashProducerEnvironmentStatus,
} from "./upstash-environment";
import {
  classifyHeadlessQueueProvider,
  shouldConstructUpstashRestProducer,
  type HeadlessQueueProviderClassification,
} from "./queue-provider";
import {
  classifyStagingHeadlessControlPlaneActivation,
  type StagingHeadlessControlPlaneActivationStatus,
} from "./staging-control-plane-activation";

export type ProductionHeadlessControlPlaneComposition = {
  readonly productionAvailable: boolean;
  readonly canCreateJob: boolean;
  readonly reason: "CONFIGURATION_UNAVAILABLE";
  readonly activationStatus: StagingHeadlessControlPlaneActivationStatus;
  /** True only when the staging session environment is configured. */
  readonly stagingSessionConfigured: boolean;
  readonly stagingSessionEnvironmentStatus: StagingSessionEnvironmentStatus;
  /** True only when Neon DATABASE_URL classification is `configured`. */
  readonly neonDatabaseConfigured: boolean;
  readonly neonEnvironmentStatus: HeadlessNeonEnvironmentStatus;
  /** R2 env classification — never opens a network connection. */
  readonly r2EnvironmentStatus: HeadlessR2EnvironmentStatus;
  /** True only when R2 classification is `configured`. */
  readonly r2Configured: boolean;
  /** Upstash REST producer classification — never opens a network connection. */
  readonly upstashProducerEnvironmentStatus: HeadlessUpstashProducerEnvironmentStatus;
  /** True only when Upstash REST producer classification is `configured`. */
  readonly upstashProducerConfigured: boolean;
  /** Safe queue-provider diagnostic — never includes credentials. */
  readonly queueProvider: HeadlessQueueProviderClassification;
  /**
   * Optional REST producer when staging session + Neon + Upstash are configured.
   * Never a TCP consumer. Null when not fully configured.
   * Presence does not flip productionAvailable / canCreateJob.
   */
  readonly upstashRestProducer:
    | UpstashRestQueueProducerAdapter
    | UnavailableUpstashRestQueueProducerAdapter
    | null;
  readonly principal: HeadlessPrincipalPort;
  readonly projectAuthorization: HeadlessProjectAuthorizationPort;
  /**
   * Durable job store when staging session + Neon are both configured.
   * Null otherwise — never a memory/test adapter.
   */
  readonly jobStore: HeadlessJobStorePort | null;
  /**
   * Durable owned-object metadata store when staging session + Neon are both configured.
   * Null otherwise. Does not imply upload/download routes are enabled.
   */
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort | null;
  readonly uploadCapability: HeadlessUploadCapabilityPort;
  readonly downloadCapability: HeadlessDownloadCapabilityPort;
  /** Neon verify wake only. Never constructed for Upstash. Never logs tokens. */
  readonly verifyWake: HeadlessWorkerWakePort | null;
};

export function composeProductionHeadlessControlPlane(): ProductionHeadlessControlPlaneComposition {
  const activationStatus = classifyStagingHeadlessControlPlaneActivation();
  const stagingSessionEnvironmentStatus =
    classifyStagingSessionEnvironment();
  const stagingSessionConfiguration = readStagingSessionConfiguration();
  const stagingSessionConfigured =
    stagingSessionEnvironmentStatus === "configured" &&
    stagingSessionConfiguration != null;
  const neonEnvironmentStatus = classifyHeadlessNeonEnvironment();
  const neonDatabaseConfigured = neonEnvironmentStatus === "configured";
  const r2EnvironmentStatus = classifyHeadlessR2Environment();
  const r2Configured = r2EnvironmentStatus === "configured";
  const upstashProducerEnvironmentStatus =
    classifyHeadlessUpstashProducerEnvironment();
  const upstashProducerConfigured =
    upstashProducerEnvironmentStatus === "configured";
  const queueProvider = classifyHeadlessQueueProvider();

  const principal: HeadlessPrincipalPort = stagingSessionConfigured
    ? new StagingSessionPrincipalAdapter(stagingSessionConfiguration!)
    : new UnavailableHeadlessPrincipalAdapter();

  // Durable adapters only when both identity and database are configured.
  // Still never flips productionAvailable / canCreateJob. No upload route.
  // Never constructs TCP consumer in web compose.
  let projectAuthorization: HeadlessProjectAuthorizationPort =
    new UnavailableHeadlessProjectAuthorizationAdapter();
  let jobStore: HeadlessJobStorePort | null = null;
  let ownedObjectStore: HeadlessOwnedObjectStorePort | null = null;
  let uploadCapability: HeadlessUploadCapabilityPort =
    new UnavailableHeadlessUploadCapabilityAdapter();
  let downloadCapability: HeadlessDownloadCapabilityPort =
    new UnavailableHeadlessDownloadCapabilityAdapter();
  let upstashRestProducer:
    | UpstashRestQueueProducerAdapter
    | UnavailableUpstashRestQueueProducerAdapter
    | null = null;
  let verifyWake: HeadlessWorkerWakePort | null = null;

  if (stagingSessionConfigured && neonDatabaseConfigured) {
    const connectionString = readConfiguredHeadlessDatabaseUrl();
    if (connectionString != null) {
      const sql = createNeonSqlExecutor({ connectionString });
      projectAuthorization = new NeonHeadlessProjectAuthorizationAdapter(sql);
      jobStore = new NeonHeadlessJobStoreAdapter(sql);
      ownedObjectStore = new NeonHeadlessOwnedObjectStoreAdapter(sql);
      if (r2Configured) {
        uploadCapability = new R2UploadCapabilityAdapter({
          ownedObjectStore,
          browserCompatible: true,
        });
        downloadCapability = new R2DownloadCapabilityAdapter({
          ownedObjectStore,
          jobStore,
        });
      }
    }
  }

  if (
    stagingSessionConfigured &&
    neonDatabaseConfigured &&
    upstashProducerConfigured &&
    shouldConstructUpstashRestProducer(queueProvider)
  ) {
    const config = readConfiguredHeadlessUpstashProducerConfig();
    if (config != null) {
      // Construct REST producer only — never connects during compose.
      // Adapter holds config; first enqueue would network (routes still blocked).
      upstashRestProducer = new UpstashRestQueueProducerAdapter({ config });
    } else {
      upstashRestProducer = new UnavailableUpstashRestQueueProducerAdapter();
    }
  }

  if (queueProvider.provider === "neon" && queueProvider.status === "configured") {
    const flyVerify = readConfiguredHeadlessFlyVerifyWakeConfig();
    if (flyVerify != null) {
      verifyWake = new FlyMachineWakeAdapter({ config: flyVerify });
    }
  }

  const neonQueueReady =
    queueProvider.status === "configured" &&
    queueProvider.provider === "neon" &&
    verifyWake != null;
  const upstashQueueReady =
    queueProvider.provider !== "neon" &&
    upstashProducerConfigured &&
    upstashRestProducer instanceof UpstashRestQueueProducerAdapter;
  const productionAvailable =
    activationStatus === "active" &&
    stagingSessionConfigured &&
    neonDatabaseConfigured &&
    r2Configured &&
    jobStore != null &&
    ownedObjectStore != null &&
    queueProvider.status !== "invalid" &&
    (neonQueueReady || upstashQueueReady);

  return {
    productionAvailable,
    canCreateJob: productionAvailable,
    reason: "CONFIGURATION_UNAVAILABLE",
    activationStatus,
    stagingSessionConfigured,
    stagingSessionEnvironmentStatus,
    neonDatabaseConfigured,
    neonEnvironmentStatus,
    r2EnvironmentStatus,
    r2Configured,
    upstashProducerEnvironmentStatus,
    upstashProducerConfigured,
    queueProvider,
    upstashRestProducer,
    principal,
    projectAuthorization,
    jobStore,
    ownedObjectStore,
    uploadCapability,
    downloadCapability,
    verifyWake,
  };
}
