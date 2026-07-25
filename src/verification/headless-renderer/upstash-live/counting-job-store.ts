/**
 * QA-only HeadlessJobStorePort wrapper that counts claimQueuedJob calls.
 * Used to prove terminal no-op consume performs zero Neon claims.
 */

import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";

export type CountingHeadlessJobStore = HeadlessJobStorePort & {
  readonly claimQueuedJobCallCount: number;
  resetClaimQueuedJobCallCount(): void;
};

/**
 * Wrap any job-store port and count claimQueuedJob invocations.
 * All other methods are delegated unchanged via Proxy.
 */
export function createCountingJobStore(
  inner: HeadlessJobStorePort,
): CountingHeadlessJobStore {
  let claimQueuedJobCallCount = 0;
  const wrapper = {
    get claimQueuedJobCallCount() {
      return claimQueuedJobCallCount;
    },
    resetClaimQueuedJobCallCount() {
      claimQueuedJobCallCount = 0;
    },
  };

  return new Proxy(wrapper as CountingHeadlessJobStore, {
    get(target, prop, receiver) {
      if (prop === "claimQueuedJobCallCount") {
        return claimQueuedJobCallCount;
      }
      if (prop === "resetClaimQueuedJobCallCount") {
        return () => {
          claimQueuedJobCallCount = 0;
        };
      }
      if (prop === "claimQueuedJob") {
        return async (
          input: Parameters<HeadlessJobStorePort["claimQueuedJob"]>[0],
        ) => {
          claimQueuedJobCallCount += 1;
          return inner.claimQueuedJob(input);
        };
      }
      const value = Reflect.get(inner as object, prop, receiver);
      return typeof value === "function" ? value.bind(inner) : value;
    },
  });
}
