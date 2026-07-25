/**
 * Deterministic attempt-bound artifact object identity.
 * Durable recovery uses owned-object staging/finalized rows + this key —
 * not process-memory capability maps alone.
 * Never embeds raw owner/project/job ids in the object key (hashed via key authority).
 */

import { createHash } from "node:crypto";

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import {
  deriveHeadlessR2ObjectKey,
  type HeadlessR2EnvironmentNamespace,
} from "./r2-object-key-authority";

export type AttemptBoundArtifactKeyInput = {
  readonly environmentNamespace: HeadlessR2EnvironmentNamespace;
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly attempt: number;
};

/**
 * Deterministic durable objectId for an artifact attempt.
 * Recorded in owned-object store before any PutObject.
 */
export function deriveAttemptBoundArtifactObjectId(input: {
  readonly jobId: string;
  readonly operationId: string;
  readonly attempt: number;
}): string | null {
  if (
    typeof input.jobId !== "string" ||
    typeof input.operationId !== "string" ||
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1
  ) {
    return null;
  }
  const hex = createHash("sha256")
    .update(
      `headless_artifact_object|${input.jobId}|${input.operationId}|${input.attempt}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
  return `art_${hex}`;
}

/**
 * 32-hex nonce bound to job/attempt/operation — collision-resistant across attempts.
 */
export function deriveAttemptBoundArtifactNonce(input: {
  readonly jobId: string;
  readonly operationId: string;
  readonly attempt: number;
}): string | null {
  if (
    typeof input.jobId !== "string" ||
    typeof input.operationId !== "string" ||
    !Number.isSafeInteger(input.attempt) ||
    input.attempt < 1
  ) {
    return null;
  }
  return createHash("sha256")
    .update(
      `headless_artifact_attempt|${input.jobId}|${input.operationId}|${input.attempt}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
}

/**
 * Derive the opaque storage locator for a job-attempt artifact object.
 * Key is private; never a URL; always artifacts store role.
 */
export function deriveAttemptBoundArtifactLocator(
  input: AttemptBoundArtifactKeyInput,
):
  | { readonly ok: true; readonly locator: HeadlessStorageLocatorIdentity }
  | { readonly ok: false; readonly message: string } {
  const nonce = deriveAttemptBoundArtifactNonce({
    jobId: input.jobId,
    operationId: input.operationId,
    attempt: input.attempt,
  });
  if (nonce == null) {
    return { ok: false, message: "Attempt-bound artifact identity rejected." };
  }
  const derived = deriveHeadlessR2ObjectKey({
    environmentNamespace: input.environmentNamespace,
    objectNamespace: "finalized",
    ownerId: input.ownerId,
    projectId: input.projectId,
    jobId: input.jobId,
    operationId: input.operationId,
    purpose: "artifact",
    slotKey: null,
    nonce,
  });
  if (!derived.ok) {
    return { ok: false, message: derived.message };
  }
  if (derived.storeId !== "artifacts") {
    return { ok: false, message: "Attempt-bound artifact store role rejected." };
  }
  return {
    ok: true,
    locator: Object.freeze({
      kind: "object_storage" as const,
      storeId: derived.storeId,
      objectKey: derived.objectKey,
    }),
  };
}
