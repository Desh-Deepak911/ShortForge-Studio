/**
 * Shared memory fixture for monotonic dispatch-outbox race tests.
 */

import { randomUUID } from "node:crypto";

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter";
import { MemoryHeadlessProjectOwnershipAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-project-ownership.adapter";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";

import { emptyFlyRenderLiveSession } from "./types";
import type { FlyRenderLiveMatrixContext } from "./types";

const CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "supersecret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

export function buildCtx(overrides?: {
  readonly projectAuthorization?: MemoryHeadlessProjectOwnershipAdapter;
  readonly jobStore?: MemoryHeadlessJobStoreAdapter;
  readonly dispatchOutbox?: MemoryHeadlessRenderDispatchOutboxAdapter;
}): FlyRenderLiveMatrixContext {
  const runId = randomUUID();
  const fake = new FakeS3Client();
  const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
  const dispatchOutbox =
    overrides?.dispatchOutbox ?? new MemoryHeadlessRenderDispatchOutboxAdapter();
  const jobStore =
    overrides?.jobStore ??
    new MemoryHeadlessJobStoreAdapter({ dispatchOutbox });
  return {
    runId,
    ownerId: `frjc_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `frjc_other_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    nowMs: 1_700_000_000_000,
    sql: {
      withClient: async (fn: (client: unknown) => Promise<unknown>) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) }),
      withTransaction: async (fn: (client: unknown) => Promise<unknown>) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) }),
    } as FlyRenderLiveMatrixContext["sql"],
    jobStore,
    ownedObjectStore,
    projectAuthorization:
      overrides?.projectAuthorization ??
      new MemoryHeadlessProjectOwnershipAdapter(),
    io: new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    }),
    uploadCapability: {
      issueDirectPutCapability: async () => ({
        ok: true as const,
        value: {
          putUrl: "https://example.invalid/put",
          requiredHeaders: {},
          expiresAtMs: 9_000,
        },
      }),
    } as never,
    downloadCapability: null,
    r2Config: CONFIG,
    createdJobIds: [],
    createdProjectIds: [],
    createdObjectIds: [],
    createdR2Locators: [],
    session: emptyFlyRenderLiveSession(),
    env: { HEADLESS_ENV_NAME: "staging" },
    flyAppName: "local-fixture",
    acceptedImageDigestSha256: "fixture",
    restProducer: null,
    tcpConsumer: null,
    streamNames: deriveHeadlessQueueStreamNames("staging"),
    streamAuthority: "production_env",
    dispatchOutbox,
    preflightFingerprint: null,
    trackedStreamIds: [],
    runOwnedActiveStreamIds: [],
    smokePollTimeoutMs: 180_000,
    smokeContentDurationMs: 2_000,
    resourceObservation: null,
  };
}
