import type {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

import type { NeonLiveInjectionPoint } from "./injection";
import type { RequiredNeonLiveCaseId } from "./required-cases";

export type NeonLiveMatrixContext = {
  readonly runId: string;
  readonly ownerId: string;
  readonly otherOwnerId: string;
  readonly sql: HeadlessSqlExecutor;
  readonly auth: NeonHeadlessProjectAuthorizationAdapter;
  readonly store: NeonHeadlessJobStoreAdapter;
  readonly createdJobIds: string[];
  readonly createdProjectIds: string[];
  /** Injected identity authority used for all run-scoped UUIDs. */
  readonly uuid: () => string;
  /** QA-only: throw at a named stage for attribution tests. */
  readonly injectThrowAt?: NeonLiveInjectionPoint;
  /**
   * QA-only: after this required case PASSes, stop the matrix (no later cases).
   * Used for authorized targeted progressive prefixes.
   */
  readonly stopAfterCaseId?: RequiredNeonLiveCaseId;
};
