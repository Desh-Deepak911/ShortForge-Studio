/**
 * After upload-observed commits, wake the verify worker once.
 * Fly start failure leaves objects durably observed and unclaimed.
 */

import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessWorkerWakePort } from "../ports/worker-wake.port";
import { cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

export type DispatchVerifyWakeKind =
  | "woken"
  | "already_running"
  | "failed_queued"
  | "skipped_empty";

export async function dispatchVerifyWakeAfterObservedUpload(input: {
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly wake: HeadlessWorkerWakePort;
  readonly ownerId: string;
  readonly nowMs: number;
}): Promise<HeadlessControlPlaneResult<{ readonly kind: DispatchVerifyWakeKind }>> {
  const listed = await input.ownedObjectStore.listVerifierCandidates({
    ownerId: input.ownerId,
    limit: 1,
    nowMs: input.nowMs,
  });
  if (!listed.ok) return listed;
  const pending = listed.value.some(
    (row) =>
      row.record.stage === "staging" &&
      row.record.uploadedObservedAtMs != null &&
      row.record.verificationState === "unclaimed" &&
      row.record.verificationClaimToken == null,
  );
  if (!pending) {
    return cpOk({ kind: "skipped_empty" });
  }

  const woken = await input.wake.wake({ nowMs: input.nowMs });
  if (!woken.ok || woken.value.kind === "failed") {
    return cpOk({ kind: "failed_queued" });
  }
  return cpOk({
    kind: woken.value.kind === "already_running" ? "already_running" : "woken",
  });
}
