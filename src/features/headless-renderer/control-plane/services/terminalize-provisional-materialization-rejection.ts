import type { HeadlessJobStorePort } from "../ports/job-store.port";
import { isProvisionalStoredJobRecord } from "../types/stored-job-record";
import { failProvisionalRecord } from "./provisional-job-lifecycle";

export type ProvisionalMaterializationTerminalizationResult =
  | "failed"
  | "already_terminal"
  | "already_promoted"
  | "unconfirmed";

/**
 * A canonical materialization rejection is terminal for the provisional job.
 *
 * The provider/control-plane failure remains private. The public job receives
 * only the bounded INVALID_MANIFEST reason so browser polling leaves the
 * materializing state without exposing object keys or provider details.
 */
export async function terminalizeProvisionalMaterializationRejection(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly jobId: string;
  readonly ownerId: string;
  readonly nowMs: number;
}): Promise<ProvisionalMaterializationTerminalizationResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const loaded = await input.jobStore.getByJobIdAndOwner(
      input.jobId,
      input.ownerId,
    );
    if (!loaded.ok) return "unconfirmed";
    if (!isProvisionalStoredJobRecord(loaded.value)) {
      return "already_promoted";
    }
    if (loaded.value.state !== "materializing") {
      return "already_terminal";
    }

    const failed = failProvisionalRecord(
      loaded.value,
      Math.max(input.nowMs, loaded.value.updatedAtMs + 1),
      { reasonId: "INVALID_MANIFEST", retryable: false },
    );
    if (!failed.ok) return "unconfirmed";

    const cas = await input.jobStore.compareAndSetProvisional({
      jobId: input.jobId,
      ownerId: input.ownerId,
      expectedStoreVersion: loaded.value.storeVersion,
      next: failed.record,
    });
    if (!cas.ok) return "unconfirmed";
    if (cas.value.kind === "updated") return "failed";
    if (cas.value.kind === "already_promoted") return "already_promoted";
    // A stale or terminal-locked result is resolved by the bounded reread.
  }

  return "unconfirmed";
}
