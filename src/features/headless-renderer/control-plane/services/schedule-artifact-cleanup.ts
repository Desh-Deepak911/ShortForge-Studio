/**
 * Build + persist a private cleanup intent after a failed immediate orphan delete.
 * Intent is bound to durable owned-object identity (objectId) + locator + digest.
 */

import type { HeadlessArtifactCleanupPort } from "../ports/artifact-cleanup.port";
import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import {
  HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
  type HeadlessArtifactCleanupReasonId,
} from "../types/artifact-cleanup-intent";
import {
  stableHeadlessCleanupId,
  stableHeadlessCleanupIdempotencyKey,
} from "./stable-cleanup-id";
import { validateHeadlessArtifactCleanupIntent } from "./validate-artifact-cleanup-intent";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type { HeadlessStoredCleanupIntent } from "../ports/artifact-cleanup.port";

export type HeadlessOrphanCleanupOutcome =
  | { readonly status: "deleted" }
  | {
      readonly status: "scheduled";
      readonly cleanupId: string;
      readonly record: HeadlessStoredCleanupIntent;
    }
  | { readonly status: "unconfirmed" };

export async function deleteOrScheduleArtifactCleanup(input: {
  readonly storage: {
    deleteObject(
      locator: HeadlessStorageLocatorIdentity,
      ownerId: string,
    ): Promise<{ readonly ok: boolean }>;
  };
  readonly cleanup: HeadlessArtifactCleanupPort;
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly objectId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly contentDigest: string;
  readonly reasonId: HeadlessArtifactCleanupReasonId;
  readonly nowMs: number;
  readonly expiresAtMs: number;
}): Promise<HeadlessOrphanCleanupOutcome> {
  let deletedOk = false;
  try {
    const deleted = await input.storage.deleteObject(
      input.locator,
      input.ownerId,
    );
    deletedOk = deleted.ok;
  } catch {
    deletedOk = false;
  }
  if (deletedOk) {
    return { status: "deleted" };
  }

  const cleanupId = stableHeadlessCleanupId({
    jobId: input.jobId,
    attempt: input.attempt,
    storageLocator: input.locator,
  });
  const draft = {
    version: HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
    cleanupId,
    jobId: input.jobId,
    attempt: input.attempt,
    ownerId: input.ownerId,
    projectId: input.projectId,
    objectId: input.objectId,
    storageLocator: {
      kind: input.locator.kind,
      storeId: input.locator.storeId,
      objectKey: input.locator.objectKey,
    },
    contentDigest: input.contentDigest,
    reasonId: input.reasonId,
    createdAtMs: input.nowMs,
    expiresAtMs: input.expiresAtMs,
  };
  const validated = validateHeadlessArtifactCleanupIntent(draft);
  if (!validated.ok) {
    return { status: "unconfirmed" };
  }

  let created: HeadlessControlPlaneResult<
    | { readonly kind: "created"; readonly record: HeadlessStoredCleanupIntent }
    | { readonly kind: "existing"; readonly record: HeadlessStoredCleanupIntent }
  >;
  try {
    created = await input.cleanup.createIfAbsent({
      idempotencyKey: stableHeadlessCleanupIdempotencyKey({
        jobId: input.jobId,
        attempt: input.attempt,
        storageLocator: input.locator,
      }),
      intent: validated.intent,
    });
  } catch {
    return { status: "unconfirmed" };
  }
  if (!created.ok) {
    return { status: "unconfirmed" };
  }
  return {
    status: "scheduled",
    cleanupId: created.value.record.intent.cleanupId,
    record: created.value.record,
  };
}
