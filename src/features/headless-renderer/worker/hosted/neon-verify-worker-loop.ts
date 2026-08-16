/**
 * Neon-backed verify worker loop: claim-next drain, heartbeat, idle stop.
 * Does not block-read Upstash. Does not rely on Fly Proxy autostop.
 */

import { randomUUID } from "node:crypto";

import type { HeadlessOwnedObjectStorePort } from "../../control-plane/ports/owned-object-store.port";
import type { HeadlessStoredOwnedObject } from "../../control-plane/ports/owned-object-store.port";
import type { HeadlessWorkerWakePort } from "../../control-plane/ports/worker-wake.port";
import {
  HEADLESS_HEARTBEAT_MS,
  HEADLESS_IDLE_GRACE_MS,
} from "../../control-plane/runtime/queue-fairness";

export type NeonVerifyWorkerLoopDeps = {
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly onClaimedVerify: (input: {
    readonly claimToken: string;
    readonly claimedObject: HeadlessStoredOwnedObject;
    readonly ownerId: string;
    readonly objectId: string;
    readonly expectedStoreVersion: number;
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
  readonly wake?: HeadlessWorkerWakePort;
  readonly nowMs?: () => number;
  readonly idleGraceMs?: number;
  readonly heartbeatMs?: number;
  readonly claimLeaseMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
};

export type NeonVerifyWorkerLoopHandle = {
  readonly run: () => Promise<{ readonly exitCode: number }>;
  readonly requestShutdown: () => void;
  readonly requestForcedAbort: () => void;
  readonly isAccepting: () => boolean;
  readonly isBusy: () => boolean;
};

export function createNeonVerifyWorkerLoop(
  deps: NeonVerifyWorkerLoopDeps,
): NeonVerifyWorkerLoopHandle {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const idleGraceMs = deps.idleGraceMs ?? HEADLESS_IDLE_GRACE_MS;
  const heartbeatMs = deps.heartbeatMs ?? HEADLESS_HEARTBEAT_MS;
  const sleep = deps.sleep ?? defaultSleep;
  const executionAbort = new AbortController();
  let accepting = true;
  let busy = false;
  let fatal = false;
  let shutdownRequested = false;

  const requestShutdown = () => {
    shutdownRequested = true;
    accepting = false;
  };

  const requestForcedAbort = () => {
    shutdownRequested = true;
    accepting = false;
    executionAbort.abort();
  };

  const run = async (): Promise<{ readonly exitCode: number }> => {
    const claimNext = deps.ownedObjectStore.claimNextVerification;
    if (claimNext == null) {
      return { exitCode: 1 };
    }
    let emptySinceMs: number | null = null;

    while (accepting && !fatal) {
      if (busy) {
        await sleep(25);
        continue;
      }

      const claimToken = `neon-vfy-${randomUUID().slice(0, 12)}`;
      const claimed = await claimNext.call(deps.ownedObjectStore, {
        claimToken,
        nowMs: nowMs(),
        claimLeaseMs: deps.claimLeaseMs,
      });
      if (!claimed.ok) {
        fatal = true;
        break;
      }
      if (claimed.value.kind === "empty") {
        if (emptySinceMs == null) emptySinceMs = nowMs();
        if (nowMs() - emptySinceMs >= idleGraceMs) {
          accepting = false;
          if (deps.wake) {
            await deps.wake.stop({ nowMs: nowMs() });
          }
          break;
        }
        await sleep(Math.min(250, idleGraceMs));
        continue;
      }

      emptySinceMs = null;
      busy = true;
      const stored = claimed.value.stored;
      const heartbeat = setInterval(() => {
        void deps.ownedObjectStore.renewVerificationClaim?.({
          objectId: stored.record.objectId,
          ownerId: stored.record.ownerId,
          claimToken,
          nowMs: nowMs(),
        });
      }, heartbeatMs);
      try {
        await deps.onClaimedVerify({
          claimToken,
          claimedObject: stored,
          ownerId: stored.record.ownerId,
          objectId: stored.record.objectId,
          expectedStoreVersion: stored.storeVersion,
          signal: executionAbort.signal,
        });
      } catch {
        fatal = true;
        accepting = false;
      } finally {
        clearInterval(heartbeat);
        busy = false;
      }
    }

    while (busy) {
      await sleep(25);
    }
    void shutdownRequested;
    return { exitCode: fatal ? 1 : 0 };
  };

  return {
    run,
    requestShutdown,
    requestForcedAbort,
    isAccepting: () => accepting,
    isBusy: () => busy,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
