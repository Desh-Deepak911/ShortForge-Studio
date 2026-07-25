/**
 * Testing-only factory for LocalHeadlessWorkerRunner with race barriers.
 * Production barrels and Route Handlers must not import this module.
 */

import type { HeadlessArtifactCleanupPort } from "../../control-plane/ports/artifact-cleanup.port";
import type { HeadlessJobStorePort } from "../../control-plane/ports/job-store.port";
import type { HeadlessQueuePort } from "../../control-plane/ports/queue.port";
import type { HeadlessStoragePort } from "../../control-plane/ports/storage.port";
import { LocalHeadlessWorkerRunner } from "../runtime/local-worker-runner";
import type { HeadlessWorkerLimits } from "../runtime/worker-types";

/** Test-only barriers for post-finalization race fixtures. */
export interface LocalHeadlessWorkerTestHooks {
  /** Invoked after successful finalize, before binding build / succeeded CAS. */
  readonly afterFinalizeBeforeSucceededCas?: () => Promise<void>;
  /** When true, throw immediately before succeeded CAS (after finalize). */
  readonly throwBeforeSucceededCas?: boolean;
}

export function createTestLocalHeadlessWorkerRunner(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly queue: HeadlessQueuePort;
  readonly storage: HeadlessStoragePort;
  readonly artifactCleanup: HeadlessArtifactCleanupPort;
  readonly nowMs: () => number;
  readonly limits?: Partial<HeadlessWorkerLimits>;
  readonly testHooks?: LocalHeadlessWorkerTestHooks;
}): LocalHeadlessWorkerRunner {
  const hooks = input.testHooks;

  class TestLocalHeadlessWorkerRunner extends LocalHeadlessWorkerRunner {
    protected override async afterFinalizeBeforeSucceededCas(): Promise<void> {
      if (hooks?.afterFinalizeBeforeSucceededCas) {
        await hooks.afterFinalizeBeforeSucceededCas();
      }
    }

    protected override throwBeforeSucceededCas(): boolean {
      return hooks?.throwBeforeSucceededCas === true;
    }
  }

  return new TestLocalHeadlessWorkerRunner({
    jobStore: input.jobStore,
    queue: input.queue,
    storage: input.storage,
    artifactCleanup: input.artifactCleanup,
    nowMs: input.nowMs,
    limits: input.limits,
  });
}
