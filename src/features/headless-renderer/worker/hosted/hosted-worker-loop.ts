/**
 * Hosted dual-lease consumer loop — verify|render mode isolation.
 * Does not acknowledge Redis before durable Neon claim authority
 * (consume*DeliveryOnce owns that order).
 *
 * Shutdown: stop accepting/reading new deliveries; do not abort already-claimed
 * work merely because intake stopped. Drain the current claimed execution.
 * Forced abort may abort execution separately (deadline / second signal).
 *
 * Claimed-hook throws are caught at the loop boundary: bounded fatal reason,
 * no invented success/ACK, Neon claim remains recovery authority.
 */

import { randomUUID } from "node:crypto";

import { consumeRenderDeliveryOnce } from "../../control-plane/services/dual-lease-render-consume";
import { consumeVerifyDeliveryOnce } from "../../control-plane/services/dual-lease-verify-consume";
import type { HeadlessJobStorePort } from "../../control-plane/ports/job-store.port";
import type {
  HeadlessOwnedObjectStorePort,
  HeadlessStoredOwnedObject,
} from "../../control-plane/ports/owned-object-store.port";
import type { HeadlessStreamQueuePort } from "../../control-plane/ports/stream-queue.port";
import type { HeadlessQueueLeaseSettings } from "../../control-plane/runtime/upstash-environment";
import type { HeadlessCanonicalStoredJobRecord } from "../../control-plane/types/stored-job-record";
import type { HeadlessHostedWorkerMode } from "./hosted-environment";
import {
  emitHostedWorkerEvent,
  type HeadlessHostedWorkerEventSink,
} from "./hosted-events";

export type HostedClaimedRenderHookInput = {
  readonly claimedRecord: HeadlessCanonicalStoredJobRecord;
  readonly claimToken: string;
  readonly signal: AbortSignal;
};

export type HostedWorkerLoopDeps = {
  readonly mode: HeadlessHostedWorkerMode;
  readonly streamQueue: HeadlessStreamQueuePort;
  readonly leaseSettings: HeadlessQueueLeaseSettings;
  readonly concurrency: number;
  /** Required when mode === render. Also used by verify promotion. */
  readonly jobStore?: HeadlessJobStorePort;
  /** Required when mode === verify. */
  readonly ownedObjectStore?: HeadlessOwnedObjectStorePort;
  readonly consumerName?: string;
  readonly nowMs?: () => number;
  readonly blockMs?: number;
  readonly eventSink?: HeadlessHostedWorkerEventSink;
  /**
   * Required when mode === render. Invoked only after claimed_and_acked with
   * the exact durable claimed record + claim token (Neon claim remains
   * authority even when Redis ACK fails). Never acquires a second claim.
   */
  readonly onClaimedRender?: (
    input: HostedClaimedRenderHookInput,
  ) => Promise<unknown>;
  /**
   * Required when mode === verify. Invoked only after claimed_and_acked with
   * the durable claimed record. Must execute under the provided claimToken —
   * never acquire a second claim.
   */
  readonly onClaimedVerify?: (input: {
    readonly claimToken: string;
    readonly claimedObject: HeadlessStoredOwnedObject;
    readonly ownerId: string;
    readonly objectId: string;
    readonly expectedStoreVersion: number;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
};

export type HostedWorkerLoopHandle = {
  readonly run: () => Promise<{ readonly exitCode: number }>;
  /** Stop intake; drain claimed work without aborting it. */
  readonly requestShutdown: () => void;
  /** Force-abort in-flight claimed execution (deadline / hard stop). */
  readonly requestForcedAbort: () => void;
  readonly isAcceptingDeliveries: () => boolean;
  readonly isBusy: () => boolean;
};

const DEFAULT_BLOCK_MS = 5_000;

/**
 * Create a blocking TCP consumer loop for exactly one mode/stream.
 * Render concurrency must be 1 (enforced).
 */
export function createHostedWorkerLoop(
  deps: HostedWorkerLoopDeps,
): HostedWorkerLoopHandle {
  if (deps.mode === "render" && deps.concurrency !== 1) {
    throw new Error("HOSTED_RENDER_CONCURRENCY_MUST_BE_1");
  }
  if (deps.mode === "render" && deps.jobStore == null) {
    throw new Error("HOSTED_RENDER_REQUIRES_JOB_STORE");
  }
  if (deps.mode === "render" && deps.onClaimedRender == null) {
    throw new Error("HOSTED_RENDER_REQUIRES_ON_CLAIMED_RENDER");
  }
  if (deps.mode === "verify" && deps.ownedObjectStore == null) {
    throw new Error("HOSTED_VERIFY_REQUIRES_OWNED_OBJECT_STORE");
  }
  if (deps.mode === "verify" && deps.onClaimedVerify == null) {
    throw new Error("HOSTED_VERIFY_REQUIRES_ON_CLAIMED_VERIFY");
  }
  // jobStore is required for verify promotion composition.
  if (deps.mode === "verify" && deps.jobStore == null) {
    throw new Error("HOSTED_VERIFY_REQUIRES_JOB_STORE");
  }

  const consumerName =
    deps.consumerName ??
    `hosted-${deps.mode}-${randomUUID().slice(0, 8)}`;
  const nowMs = deps.nowMs ?? (() => Date.now());
  const blockMs = deps.blockMs ?? DEFAULT_BLOCK_MS;
  /** Aborts stream intake only — not claimed execution. */
  const intakeAbort = new AbortController();
  /** Aborts claimed execution only on forced deadline. */
  const executionAbort = new AbortController();
  let accepting = true;
  let busy = false;
  let fatal = false;
  let shutdownRequested = false;
  let forcedAbortRequested = false;

  const requestShutdown = () => {
    if (shutdownRequested && !accepting) {
      // Idempotent: intake already stopped.
      return;
    }
    shutdownRequested = true;
    accepting = false;
    intakeAbort.abort();
    emitHostedWorkerEvent(deps.eventSink, {
      name: "hosted.loop.shutdown",
      atMs: nowMs(),
      mode: deps.mode,
      reasonId: "signal_shutdown",
      status: busy ? "draining_claimed_work" : "idle",
    });
  };

  const requestForcedAbort = () => {
    if (forcedAbortRequested) {
      // Idempotent.
      return;
    }
    forcedAbortRequested = true;
    shutdownRequested = true;
    accepting = false;
    intakeAbort.abort();
    executionAbort.abort();
    emitHostedWorkerEvent(deps.eventSink, {
      name: "hosted.loop.shutdown",
      atMs: nowMs(),
      mode: deps.mode,
      reasonId: "forced_abort",
      status: busy ? "aborting_claimed_work" : "idle",
    });
  };

  const run = async (): Promise<{ readonly exitCode: number }> => {
    emitHostedWorkerEvent(deps.eventSink, {
      name: "hosted.loop.started",
      atMs: nowMs(),
      mode: deps.mode,
      facts: { concurrency: deps.concurrency },
    });

    const ensured = await deps.streamQueue.ensureConsumerGroups();
    if (!ensured.ok) {
      fatal = true;
      emitHostedWorkerEvent(deps.eventSink, {
        name: "hosted.loop.fatal",
        atMs: nowMs(),
        mode: deps.mode,
        reasonId: "consumer_group_ensure_failed",
      });
      return { exitCode: 1 };
    }

    while (accepting && !fatal) {
      if (busy) {
        // One-in-flight: never read while claimed work is running.
        await sleep(25);
        continue;
      }

      let read;
      try {
        read = await deps.streamQueue.readGroup({
          kind: deps.mode,
          consumerName,
          count: deps.concurrency,
          blockMs,
          signal: intakeAbort.signal,
        });
      } catch {
        if (!accepting) break;
        fatal = true;
        emitHostedWorkerEvent(deps.eventSink, {
          name: "hosted.loop.fatal",
          atMs: nowMs(),
          mode: deps.mode,
          reasonId: "stream_read_failed",
        });
        break;
      }

      if (!accepting) break;

      if (!read.ok) {
        // Aborted / transient — continue unless shutting down.
        if (!accepting || intakeAbort.signal.aborted) break;
        await sleep(Math.min(blockMs, 50));
        continue;
      }

      if (read.value.length === 0) {
        if (!accepting || intakeAbort.signal.aborted) break;
        // Yield so SIGTERM handlers / timers can run between empty reads.
        await sleep(Math.min(blockMs, 50));
        continue;
      }

      // Mode isolation: refuse the opposite delivery kind at the loop boundary.
      for (const item of read.value) {
        if (!accepting) break;
        const entryKind =
          item.entry &&
          typeof item.entry === "object" &&
          "deliveryKind" in item.entry
            ? (item.entry as { deliveryKind?: string }).deliveryKind
            : undefined;
        if (entryKind != null && entryKind !== deps.mode) {
          emitHostedWorkerEvent(deps.eventSink, {
            name: "hosted.loop.delivery",
            atMs: nowMs(),
            mode: deps.mode,
            reasonId: "stream_isolation_violation",
            action: "left_pending",
          });
          // Do not ack the foreign stream entry from this mode.
          continue;
        }

        busy = true;
        try {
          const consume =
            deps.mode === "render"
              ? await consumeRenderDeliveryOnce({
                  streamQueue: deps.streamQueue,
                  jobStore: deps.jobStore!,
                  entry: item.entry,
                  streamId: item.streamId,
                  nowMs: nowMs(),
                  leaseSettings: deps.leaseSettings,
                  consumerName,
                })
              : await consumeVerifyDeliveryOnce({
                  streamQueue: deps.streamQueue,
                  ownedObjectStore: deps.ownedObjectStore!,
                  entry: item.entry,
                  streamId: item.streamId,
                  nowMs: nowMs(),
                  leaseSettings: deps.leaseSettings,
                  consumerName,
                });

          if (!consume.ok) {
            emitHostedWorkerEvent(deps.eventSink, {
              name: "hosted.loop.delivery",
              atMs: nowMs(),
              mode: deps.mode,
              reasonId: "consume_failed",
              action: "left_pending",
            });
            continue;
          }

          const action = consume.value.action;
          emitHostedWorkerEvent(deps.eventSink, {
            name: "hosted.loop.delivery",
            atMs: nowMs(),
            mode: deps.mode,
            action,
            reasonId:
              action === "claimed_and_acked"
                ? "claimed_and_acked"
                : action === "acked_duplicate_live"
                  ? "stale_or_duplicate"
                  : action,
          });

          if (
            action === "claimed_and_acked" &&
            consume.value.claimToken != null
          ) {
            const claimToken = consume.value.claimToken;
            try {
              if (deps.mode === "render") {
                const renderConsume = consume.value;
                if (
                  !("claimedRecord" in renderConsume) ||
                  renderConsume.claimedRecord == null
                ) {
                  fatal = true;
                  accepting = false;
                  intakeAbort.abort();
                  emitHostedWorkerEvent(deps.eventSink, {
                    name: "hosted.loop.fatal",
                    atMs: nowMs(),
                    mode: deps.mode,
                    reasonId: "claimed_record_missing",
                  });
                  break;
                }
                // Neon claim is execution authority — invoke even if Redis ACK failed.
                await deps.onClaimedRender!({
                  claimedRecord: renderConsume.claimedRecord,
                  claimToken,
                  signal: executionAbort.signal,
                });
              } else if (deps.mode === "verify") {
                const verifyConsume = consume.value;
                if (
                  "claimedObject" in verifyConsume &&
                  verifyConsume.claimedObject != null
                ) {
                  const claimedObject = verifyConsume.claimedObject;
                  await deps.onClaimedVerify!({
                    claimToken,
                    claimedObject,
                    ownerId: claimedObject.record.ownerId,
                    objectId: claimedObject.record.objectId,
                    expectedStoreVersion: claimedObject.storeVersion,
                    signal: executionAbort.signal,
                  });
                }
              }
            } catch {
              // Do not ACK again, mutate terminal state, or invent success.
              // Durable Neon claim remains recovery authority.
              fatal = true;
              accepting = false;
              intakeAbort.abort();
              emitHostedWorkerEvent(deps.eventSink, {
                name: "hosted.loop.fatal",
                atMs: nowMs(),
                mode: deps.mode,
                reasonId: "claimed_execution_failed",
              });
              break;
            }
          }
        } finally {
          busy = false;
        }
      }
    }

    // Drain: if shutdown stopped intake mid-batch, wait until busy clears.
    while (busy) {
      await sleep(25);
    }

    return { exitCode: fatal ? 1 : 0 };
  };

  return {
    run,
    requestShutdown,
    requestForcedAbort,
    isAcceptingDeliveries: () => accepting,
    isBusy: () => busy,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
