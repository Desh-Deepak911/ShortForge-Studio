/**
 * Injected context for R2 live matrix case runners.
 * Gate-on constructs Neon + R2 adapters; gate-off unit tests inject fakes.
 */

import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import type { HeadlessProjectAuthorizationPort } from "@/features/headless-renderer/control-plane/ports/project-authorization.port";
import type { HeadlessR2ObjectIOPort } from "@/features/headless-renderer/control-plane/ports/r2-object-io.port";
import type { HeadlessUploadCapabilityPort } from "@/features/headless-renderer/control-plane/ports/upload-capability.port";
import type { HeadlessDownloadCapabilityPort } from "@/features/headless-renderer/control-plane/ports/download-capability.port";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";

export type R2LiveSessionState = {
  jobId: string | null;
  operationId: string | null;
  objectId: string | null;
  objectKey: string | null;
  storeId: "assets" | "artifacts" | null;
  bytes: Uint8Array | null;
  digest: string | null;
  mime: string;
  expectedByteLength: number;
  artifactObjectId: string | null;
  artifactObjectKey: string | null;
  /** True after capability issue — never store the URL itself. */
  uploadCapabilityIssued: boolean;
};

export type R2LiveMatrixContext = {
  readonly runId: string;
  readonly ownerId: string;
  readonly otherOwnerId: string;
  readonly projectId: string;
  readonly nowMs: number;
  readonly sql: HeadlessSqlExecutor;
  readonly jobStore: HeadlessJobStorePort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly projectAuthorization: HeadlessProjectAuthorizationPort;
  readonly io: HeadlessR2ObjectIOPort;
  readonly uploadCapability: HeadlessUploadCapabilityPort;
  readonly downloadCapability: HeadlessDownloadCapabilityPort | null;
  readonly r2Config: HeadlessConfiguredR2Config;
  readonly createdJobIds: string[];
  readonly createdProjectIds: string[];
  readonly createdObjectIds: string[];
  readonly createdR2Locators: {
    storeId: "assets" | "artifacts";
    objectKey: string;
  }[];
  /** Mutable session bag shared across ordered cases. */
  readonly session: R2LiveSessionState;
};
