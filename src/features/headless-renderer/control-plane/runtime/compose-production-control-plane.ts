/**
 * Production adapter composition for the staging website control plane.
 *
 * Phase 2B.2 / 2C.1A / 2D.1 may wire Clerk + Neon durable adapters and report
 * R2 / Upstash producer classification — but R2 AWS adapters, TCP consumers,
 * upload routes, and queue workers remain absent from live product paths.
 * Activation is fail-closed and staging-only. Never constructs memory/test
 * adapters or TCP consumers. Composition itself opens no provider connection.
 */

import { ClerkHeadlessPrincipalAdapter } from "../adapters/clerk-principal.adapter";
import { createProductionClerkAuthReader } from "../adapters/clerk-principal.adapter";
import { NeonHeadlessJobStoreAdapter } from "../adapters/neon-job-store.adapter";
import { NeonHeadlessOwnedObjectStoreAdapter } from "../adapters/neon-owned-object-store.adapter";
import { NeonHeadlessProjectAuthorizationAdapter } from "../adapters/neon-project-authorization.adapter";
import { R2DownloadCapabilityAdapter } from "../adapters/r2-download-capability.adapter";
import { R2UploadCapabilityAdapter } from "../adapters/r2-upload-capability.adapter";
import { UnavailableHeadlessPrincipalAdapter } from "../adapters/unavailable-principal.adapter";
import { UnavailableHeadlessProjectAuthorizationAdapter } from "../adapters/unavailable-project-authorization.adapter";
import { UnavailableUpstashRestQueueProducerAdapter } from "../adapters/unavailable-upstash-rest-queue-producer.adapter";
import { UpstashRestQueueProducerAdapter } from "../adapters/upstash-rest-queue-producer.adapter";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessPrincipalPort } from "../ports/principal.port";
import type { HeadlessProjectAuthorizationPort } from "../ports/project-authorization.port";
import type { HeadlessDownloadCapabilityPort } from "../ports/download-capability.port";
import { UnavailableHeadlessDownloadCapabilityAdapter } from "../ports/download-capability.port";
import type { HeadlessUploadCapabilityPort } from "../ports/upload-capability.port";
import { UnavailableHeadlessUploadCapabilityAdapter } from "../ports/upload-capability.port";
import {
  classifyClerkEnvironment,
  type ClerkEnvironmentStatus,
} from "./clerk-environment";
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
  classifyStagingHeadlessControlPlaneActivation,
  type StagingHeadlessControlPlaneActivationStatus,
} from "./staging-control-plane-activation";

export type ProductionHeadlessControlPlaneComposition = {
  readonly productionAvailable: boolean;
  readonly canCreateJob: boolean;
  readonly reason: "CONFIGURATION_UNAVAILABLE";
  readonly activationStatus: StagingHeadlessControlPlaneActivationStatus;
  /** True only when Clerk env classification is `configured`. */
  readonly clerkAuthenticationConfigured: boolean;
  readonly clerkEnvironmentStatus: ClerkEnvironmentStatus;
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
  /**
   * Optional REST producer when Clerk + Neon + Upstash are configured.
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
   * Durable job store when Clerk + Neon are both configured.
   * Null otherwise — never a memory/test adapter.
   */
  readonly jobStore: HeadlessJobStorePort | null;
  /**
   * Durable owned-object metadata store when Clerk + Neon are both configured.
   * Null otherwise. Does not imply upload/download routes are enabled.
   */
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort | null;
  readonly uploadCapability: HeadlessUploadCapabilityPort;
  readonly downloadCapability: HeadlessDownloadCapabilityPort;
};

export function composeProductionHeadlessControlPlane(): ProductionHeadlessControlPlaneComposition {
  const activationStatus = classifyStagingHeadlessControlPlaneActivation();
  const clerkEnvironmentStatus = classifyClerkEnvironment();
  const clerkAuthenticationConfigured = clerkEnvironmentStatus === "configured";
  const neonEnvironmentStatus = classifyHeadlessNeonEnvironment();
  const neonDatabaseConfigured = neonEnvironmentStatus === "configured";
  const r2EnvironmentStatus = classifyHeadlessR2Environment();
  const r2Configured = r2EnvironmentStatus === "configured";
  const upstashProducerEnvironmentStatus =
    classifyHeadlessUpstashProducerEnvironment();
  const upstashProducerConfigured =
    upstashProducerEnvironmentStatus === "configured";

  const principal: HeadlessPrincipalPort = clerkAuthenticationConfigured
    ? new ClerkHeadlessPrincipalAdapter(createProductionClerkAuthReader())
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

  if (clerkAuthenticationConfigured && neonDatabaseConfigured) {
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
    clerkAuthenticationConfigured &&
    neonDatabaseConfigured &&
    upstashProducerConfigured
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

  const productionAvailable =
    activationStatus === "active" &&
    clerkAuthenticationConfigured &&
    neonDatabaseConfigured &&
    r2Configured &&
    upstashProducerConfigured &&
    jobStore != null &&
    ownedObjectStore != null &&
    upstashRestProducer instanceof UpstashRestQueueProducerAdapter;

  return {
    productionAvailable,
    canCreateJob: productionAvailable,
    reason: "CONFIGURATION_UNAVAILABLE",
    activationStatus,
    clerkAuthenticationConfigured,
    clerkEnvironmentStatus,
    neonDatabaseConfigured,
    neonEnvironmentStatus,
    r2EnvironmentStatus,
    r2Configured,
    upstashProducerEnvironmentStatus,
    upstashProducerConfigured,
    upstashRestProducer,
    principal,
    projectAuthorization,
    jobStore,
    ownedObjectStore,
    uploadCapability,
    downloadCapability,
  };
}
