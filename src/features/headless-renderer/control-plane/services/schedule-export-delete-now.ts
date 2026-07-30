/**
 * Schedules durable delete-now cleanup for terminal succeeded exports.
 *
 * The browser submits only an authorized job reference; the server reloads
 * ownership and artifact binding before scheduling cleanup intent.
 */

import type { HeadlessArtifactCleanupPort } from "../ports/artifact-cleanup.port";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import { assertHeadlessCleanupStagingEnvironment } from "../../domain/headless-export-retention-authority";
import { deriveAttemptBoundArtifactObjectId } from "./attempt-bound-artifact-key";
import { stableHeadlessCleanupIdempotencyKey } from "./stable-cleanup-id";
import {
  HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
  type HeadlessArtifactCleanupReasonId,
} from "../types/artifact-cleanup-intent";
import { validateHeadlessArtifactCleanupIntent } from "./validate-artifact-cleanup-intent";
import { cpFail, cpOk } from "../types/control-plane.types";

const DELETE_NOW_REASON: HeadlessArtifactCleanupReasonId =
  "SUCCEEDED_CAS_STALE";

/**
 * Schedules durable export deletion for an authenticated owner.
 * Fails closed for non-staging environments, non-terminal jobs, and cross-owner access.
 */
export async function scheduleHeadlessExportDeleteNow(input: {
  readonly envName: string;
  readonly ownerId: string;
  readonly jobId: string;
  readonly jobStore: HeadlessJobStorePort;
  readonly cleanup: HeadlessArtifactCleanupPort;
  readonly nowMs: number;
}) {
  const staging = assertHeadlessCleanupStagingEnvironment(input.envName);
  if (!staging.ok) {
    return cpFail("FORBIDDEN", "Delete now rejected outside staging.");
  }

  const loaded = await input.jobStore.getByJobIdAndOwner(
    input.jobId,
    input.ownerId,
  );
  if (!loaded.ok) {
    return cpFail("JOB_NOT_FOUND", "Export not found.");
  }
  if (loaded.value.stage !== "canonical") {
    return cpFail("FORBIDDEN", "Export not found.");
  }
  if (loaded.value.canonicalJob.state !== "succeeded") {
    return cpFail("FORBIDDEN", "Export delete unavailable.");
  }
  const binding = loaded.value.artifactObjectBinding;
  if (binding == null) {
    return cpFail("FORBIDDEN", "Export delete unavailable.");
  }

  const objectId = deriveAttemptBoundArtifactObjectId({
    jobId: input.jobId,
    operationId: loaded.value.operationId,
    attempt: loaded.value.canonicalJob.attempt,
  });
  if (objectId == null) {
    return cpFail("INTERNAL_ERROR", "Export delete unavailable.");
  }

  const scheduleAnchorMs = loaded.value.canonicalJob.updatedAtMs;
  const draft = {
    version: HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
    cleanupId: `delete_now_${input.jobId}_${loaded.value.canonicalJob.attempt}`,
    jobId: input.jobId,
    attempt: loaded.value.canonicalJob.attempt,
    ownerId: input.ownerId,
    projectId: loaded.value.projectId,
    objectId,
    storageLocator: binding.storageLocator,
    contentDigest: binding.contentDigest,
    reasonId: DELETE_NOW_REASON,
    createdAtMs: scheduleAnchorMs,
    expiresAtMs: scheduleAnchorMs,
  };
  const validated = validateHeadlessArtifactCleanupIntent(draft);
  if (!validated.ok) {
    return cpFail("HOSTILE_INPUT", "Delete now scheduling rejected.");
  }

  const created = await input.cleanup.createIfAbsent({
    idempotencyKey: stableHeadlessCleanupIdempotencyKey({
      jobId: input.jobId,
      attempt: loaded.value.canonicalJob.attempt,
      storageLocator: binding.storageLocator,
    }),
    intent: validated.intent,
  });
  if (!created.ok) {
    return cpFail("INTERNAL_ERROR", "Delete now scheduling failed.");
  }

  return cpOk(
    Object.freeze({
      scheduled: true,
      cleanupPending: true,
    }),
  );
}
