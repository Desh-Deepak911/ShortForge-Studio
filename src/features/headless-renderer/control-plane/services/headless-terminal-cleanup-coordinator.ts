/**
 * Terminal cleanup coordinator for headless export runs.
 *
 * Runs after durable terminalization inside finally-equivalent containment.
 * Local resource disposal, durable orphan scheduling, and export-owned source
 * cleanup are tracked separately from the primary render disposition so cleanup
 * failures never replace succeeded/failed terminal reasons. Non-staging
 * environments fail closed before any cleanup side effects run.
 */

import { assertHeadlessCleanupStagingEnvironment } from "../../domain/headless-export-retention-authority";
import type { HeadlessJobState } from "../../domain/headless-render.types";
import type { HeadlessArtifactCleanupPort } from "../ports/artifact-cleanup.port";
import type { HeadlessStoredJobRecord } from "../ports/job-store.port";
import type { HeadlessArtifactCleanupReasonId } from "../types/artifact-cleanup-intent";
import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import { deleteOrScheduleArtifactCleanup } from "./schedule-artifact-cleanup";

export type HeadlessTerminalCleanupLocalHooks = {
  readonly disposeChromium?: () => void | Promise<void>;
  readonly disposeFfmpeg?: () => void | Promise<void>;
  readonly cleanupWorkspace?: () => void | Promise<void>;
  readonly releaseClaimLease?: () => void | Promise<void>;
  readonly acknowledgePendingDelivery?: () => void | Promise<void>;
};

export type HeadlessTerminalCleanupOrphanTarget = {
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly objectId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly contentDigest: string;
  readonly reasonId: HeadlessArtifactCleanupReasonId;
  readonly expiresAtMs: number;
};

export type HeadlessTerminalCleanupResult = {
  readonly status: "completed" | "partial" | "scheduled" | "skipped";
  readonly localCleanupClass:
    | "all_local_disposed"
    | "partial_local_disposed"
    | "no_local_hooks";
  readonly scheduledCleanupIntents: number;
  readonly immediateDeletes: number;
  readonly unconfirmedOperations: number;
  readonly primaryDispositionPreserved: true;
};

const LOCAL_HOOK_BUDGET_MS = 5_000;

async function runBoundedLocalHook(
  hook: (() => void | Promise<void>) | undefined,
  budgetMs: number,
): Promise<boolean> {
  if (hook == null) {
    return true;
  }
  try {
    await Promise.race([
      Promise.resolve(hook()),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("local_cleanup_timeout")), budgetMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Executes bounded terminal cleanup after the primary job disposition is durable.
 *
 * Never deletes the final downloadable artifact binding. Cleanup failures create
 * retryable intents via existing orphan scheduling and do not mutate primary
 * terminal state.
 */
export async function runHeadlessTerminalCleanupCoordinator(input: {
  readonly envName: string;
  readonly terminalState: HeadlessJobState;
  readonly job: HeadlessStoredJobRecord;
  readonly nowMs: number;
  readonly local: HeadlessTerminalCleanupLocalHooks;
  readonly orphanTargets: readonly HeadlessTerminalCleanupOrphanTarget[];
  readonly cleanup: HeadlessArtifactCleanupPort;
  readonly storage: {
    deleteObject(
      locator: HeadlessStorageLocatorIdentity,
      ownerId: string,
    ): Promise<{ readonly ok: boolean }>;
  };
}): Promise<HeadlessTerminalCleanupResult> {
  const staging = assertHeadlessCleanupStagingEnvironment(input.envName);
  if (!staging.ok) {
    return {
      status: "skipped",
      localCleanupClass: "no_local_hooks",
      scheduledCleanupIntents: 0,
      immediateDeletes: 0,
      unconfirmedOperations: 0,
      primaryDispositionPreserved: true,
    };
  }

  let localSuccesses = 0;
  let localAttempts = 0;
  for (const hook of [
    input.local.disposeChromium,
    input.local.disposeFfmpeg,
    input.local.cleanupWorkspace,
    input.local.releaseClaimLease,
    input.local.acknowledgePendingDelivery,
  ]) {
    if (hook == null) continue;
    localAttempts += 1;
    if (await runBoundedLocalHook(hook, LOCAL_HOOK_BUDGET_MS)) {
      localSuccesses += 1;
    }
  }

  let scheduledCleanupIntents = 0;
  let immediateDeletes = 0;
  let unconfirmedOperations = 0;

  for (const target of input.orphanTargets) {
    const outcome = await deleteOrScheduleArtifactCleanup({
      storage: input.storage,
      cleanup: input.cleanup,
      locator: target.locator,
      objectId: target.objectId,
      ownerId: target.ownerId,
      projectId: target.projectId,
      jobId: target.jobId,
      attempt: target.attempt,
      contentDigest: target.contentDigest,
      reasonId: target.reasonId,
      nowMs: input.nowMs,
      expiresAtMs: target.expiresAtMs,
    });
    if (outcome.status === "deleted") {
      immediateDeletes += 1;
    } else if (outcome.status === "scheduled") {
      scheduledCleanupIntents += 1;
    } else {
      unconfirmedOperations += 1;
    }
  }

  const localCleanupClass =
    localAttempts === 0
      ? "no_local_hooks"
      : localSuccesses === localAttempts
        ? "all_local_disposed"
        : "partial_local_disposed";

  const status =
    unconfirmedOperations > 0
      ? scheduledCleanupIntents > 0
        ? "scheduled"
        : "partial"
      : scheduledCleanupIntents > 0
        ? "scheduled"
        : "completed";

  return {
    status,
    localCleanupClass,
    scheduledCleanupIntents,
    immediateDeletes,
    unconfirmedOperations,
    primaryDispositionPreserved: true,
  };
}
