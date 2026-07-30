/**
 * Terminal cleanup session for claimed render execution.
 *
 * Queues orphan targets during the primary lifecycle, then runs the staging
 * cleanup coordinator exactly once after durable terminalization. Primary job
 * disposition is never replaced by cleanup failures.
 */

import { deriveAttemptBoundArtifactObjectId } from "../../control-plane/services/attempt-bound-artifact-key";
import {
  runHeadlessTerminalCleanupCoordinator,
  type HeadlessTerminalCleanupLocalHooks,
  type HeadlessTerminalCleanupOrphanTarget,
  type HeadlessTerminalCleanupResult,
} from "../../control-plane/services/headless-terminal-cleanup-coordinator";
import type { HeadlessArtifactCleanupPort } from "../../control-plane/ports/artifact-cleanup.port";
import type { HeadlessStoredJobRecord } from "../../control-plane/ports/job-store.port";
import type { HeadlessArtifactCleanupReasonId } from "../../control-plane/types/artifact-cleanup-intent";
import type { HeadlessJobState } from "../../domain/headless-render.types";
import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import type { HeadlessOrphanCleanupReport } from "./execute-claimed-render";

export type ClaimedRenderTerminalCleanupSession = {
  readonly queueOrphanTarget: (input: {
    readonly locator: HeadlessStorageLocatorIdentity | null;
    readonly reasonId: HeadlessArtifactCleanupReasonId;
    readonly objectId: string | null;
    readonly ownerId: string;
    readonly projectId: string;
    readonly jobId: string;
    readonly attempt: number;
    readonly contentDigest: string;
    readonly expiresAtMs: number;
  }) => void;
  /**
   * Runs bounded terminal cleanup once per render attempt. Idempotent on replay.
   */
  readonly runOnceAfterTerminalization: (input: {
    readonly envName: string;
    readonly terminalState: HeadlessJobState;
    readonly job: HeadlessStoredJobRecord;
    readonly nowMs: number;
    readonly local: HeadlessTerminalCleanupLocalHooks;
    readonly cleanup: HeadlessArtifactCleanupPort;
    readonly storage: {
      deleteObject(
        locator: HeadlessStorageLocatorIdentity,
        ownerId: string,
      ): Promise<{ readonly ok: boolean }>;
    };
  }) => Promise<{
    readonly coordinator: HeadlessTerminalCleanupResult;
    readonly orphanReports: readonly HeadlessOrphanCleanupReport[];
    readonly hasUnconfirmed: boolean;
  }>;
  readonly orphanTargetCount: () => number;
};

function dedupeTargetKey(target: HeadlessTerminalCleanupOrphanTarget): string {
  return `${target.objectId}:${target.locator.storeId}:${target.locator.objectKey}:${target.reasonId}`;
}

/**
 * Creates a per-attempt cleanup session. Orphan targets accumulate until
 * `runOnceAfterTerminalization` executes after the durable terminal CAS.
 */
export function createClaimedRenderTerminalCleanupSession(): ClaimedRenderTerminalCleanupSession {
  const targets = new Map<string, HeadlessTerminalCleanupOrphanTarget>();
  let ran = false;
  let lastCoordinator: HeadlessTerminalCleanupResult | null = null;
  let lastReports: HeadlessOrphanCleanupReport[] = [];

  return {
    queueOrphanTarget(input) {
      if (input.locator == null || input.objectId == null) {
        return;
      }
      const target: HeadlessTerminalCleanupOrphanTarget = Object.freeze({
        locator: input.locator,
        objectId: input.objectId,
        ownerId: input.ownerId,
        projectId: input.projectId,
        jobId: input.jobId,
        attempt: input.attempt,
        contentDigest: input.contentDigest,
        reasonId: input.reasonId,
        expiresAtMs: input.expiresAtMs,
      });
      targets.set(dedupeTargetKey(target), target);
    },
    orphanTargetCount() {
      return targets.size;
    },
    async runOnceAfterTerminalization(input) {
      if (ran && lastCoordinator != null) {
        return {
          coordinator: lastCoordinator,
          orphanReports: lastReports,
          hasUnconfirmed: lastReports.some((r) => r.status === "unconfirmed"),
        };
      }
      ran = true;
      const coordinator = await runHeadlessTerminalCleanupCoordinator({
        envName: input.envName,
        terminalState: input.terminalState,
        job: input.job,
        nowMs: input.nowMs,
        local: input.local,
        orphanTargets: Object.freeze([...targets.values()]),
        cleanup: input.cleanup,
        storage: input.storage,
      });
      const orphanReports: HeadlessOrphanCleanupReport[] = [];
      if (coordinator.scheduledCleanupIntents > 0) {
        orphanReports.push({
          status: "scheduled",
          cleanupId: null,
        });
      } else if (coordinator.unconfirmedOperations > 0) {
        orphanReports.push({
          status: "unconfirmed",
          cleanupId: null,
        });
      } else if (coordinator.immediateDeletes > 0 || targets.size === 0) {
        orphanReports.push({
          status: "deleted",
          cleanupId: null,
        });
      }
      lastCoordinator = coordinator;
      lastReports = orphanReports;
      return {
        coordinator,
        orphanReports,
        hasUnconfirmed: orphanReports.some((r) => r.status === "unconfirmed"),
      };
    },
  };
}

/**
 * Derives the durable artifact object id for orphan cleanup scheduling.
 */
export function deriveClaimedRenderOrphanObjectId(input: {
  readonly jobId: string;
  readonly operationId: string;
  readonly attempt: number;
}): string | null {
  return deriveAttemptBoundArtifactObjectId(input);
}
