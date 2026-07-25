/**
 * Explicit QA / verification control-plane composition.
 * Never selected by production Route Handlers.
 */

import { MemoryHeadlessArtifactCleanupAdapter } from "../adapters/memory-artifact-cleanup.adapter";
import { MemoryHeadlessJobStoreAdapter } from "../adapters/memory-job-store.adapter";
import { MemoryHeadlessQueueAdapter } from "../adapters/memory-queue.adapter";
import { MemoryHeadlessRenderDispatchOutboxAdapter } from "../adapters/memory-render-dispatch-outbox.adapter";
import { MemoryHeadlessStorageAdapter } from "../adapters/memory-storage.adapter";
import { TestHeadlessPrincipalAdapter } from "../adapters/test-principal.adapter";
import { TestHeadlessProjectAuthorizationAdapter } from "../adapters/test-project-authorization.adapter";
import { HeadlessFakeWorker } from "../fake-worker/fake-worker";
import type { HeadlessAuthenticatedPrincipal } from "../ports/principal.port";
import { HeadlessControlPlaneService } from "../services/control-plane.service";

export interface HeadlessTestControlPlaneStack {
  readonly service: HeadlessControlPlaneService;
  readonly storage: MemoryHeadlessStorageAdapter;
  readonly jobStore: MemoryHeadlessJobStoreAdapter;
  readonly queue: MemoryHeadlessQueueAdapter;
  readonly artifactCleanup: MemoryHeadlessArtifactCleanupAdapter;
  readonly dispatchOutbox: MemoryHeadlessRenderDispatchOutboxAdapter;
  readonly fakeWorker: HeadlessFakeWorker;
  readonly productionAvailable: false;
}

export function composeTestHeadlessControlPlane(input: {
  principal: HeadlessAuthenticatedPrincipal;
  /**
   * Explicit fixture project authorization. Required for createJob success.
   * Authentication alone never implies project access.
   */
  authorizedProjectIds?: readonly string[];
  allowProjectMutate?: boolean;
  nowMs?: () => number;
  workerMode?: "succeed" | "fail" | "noop";
  maxVerifiedAssetBytes?: number;
}): HeadlessTestControlPlaneStack {
  const storage = new MemoryHeadlessStorageAdapter();
  const dispatchOutbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
  const jobStore = new MemoryHeadlessJobStoreAdapter({ dispatchOutbox });
  const queue = new MemoryHeadlessQueueAdapter();
  const artifactCleanup = new MemoryHeadlessArtifactCleanupAdapter();
  const nowMs = input.nowMs ?? (() => Date.now());
  const service = new HeadlessControlPlaneService({
    principal: new TestHeadlessPrincipalAdapter(input.principal),
    projectAuthorization: new TestHeadlessProjectAuthorizationAdapter({
      ownerId: input.principal.ownerId,
      allowedProjectIds: input.authorizedProjectIds ?? [],
      allowMutate: input.allowProjectMutate ?? true,
    }),
    storage,
    jobStore,
    queue,
    nowMs,
    maxVerifiedAssetBytes: input.maxVerifiedAssetBytes,
  });
  const fakeWorker = new HeadlessFakeWorker(jobStore, queue, storage, {
    mode: input.workerMode ?? "succeed",
    nowMs,
  });
  return {
    service,
    storage,
    jobStore,
    queue,
    artifactCleanup,
    dispatchOutbox,
    fakeWorker,
    productionAvailable: false,
  };
}
