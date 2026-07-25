/**
 * Injected context for hosted Fly verifier live matrix runners.
 */

import type { HeadlessRenderDispatchOutboxPort } from "@/features/headless-renderer/control-plane/ports/render-dispatch-outbox.port";

import type { R2LiveMatrixContext, R2LiveSessionState } from "../r2-live/types";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveProducerPort,
  UpstashLiveStreamNames,
} from "../upstash-live/types";

export type FlyVerifyLiveSessionState = R2LiveSessionState & {
  verifyDeliveryId: string | null;
  verifyStreamId: string | null;
  verifyGroup: string | null;
  initialStoreVersion: number | null;
  observedStoreVersion: number | null;
  baselineVerifyMachineId: string | null;
};

export type FlyVerifyLiveTrackedStreamId = {
  readonly stream: string;
  readonly id: string;
  readonly kind: "verify";
};

export type FlyVerifyLiveMatrixContext = R2LiveMatrixContext & {
  readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly flyAppName: string;
  readonly acceptedImageDigestSha256: string;
  readonly restProducer: UpstashLiveProducerPort | null;
  readonly tcpConsumer: UpstashLiveConsumerPort | null;
  readonly streamNames: UpstashLiveStreamNames;
  readonly streamAuthority: "production_env";
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort | null;
  readonly preflightFingerprint: FlyVerifyLiveSchemaFingerprint | null;
  readonly trackedStreamIds: FlyVerifyLiveTrackedStreamId[];
  readonly runOwnedActiveStreamIds: FlyVerifyLiveTrackedStreamId[];
  readonly session: FlyVerifyLiveSessionState;
  readonly readFlyTopology?: () => Promise<{
    readonly verifyCount: number;
    readonly renderCount: number;
    readonly region: string;
    readonly verifyMachineId: string | null;
    readonly imageDigestSha256: string | null;
  }>;
  readonly pollHostedVerifier?: () => Promise<{
    readonly finalized: boolean;
    readonly claimCleared: boolean;
    readonly coverageReconciled: boolean;
    readonly coverageComplete: boolean;
    readonly promoted: boolean;
    readonly renderDispatchPresent: boolean;
    readonly verifyPendingCleared: boolean;
    readonly storeVersion: number | null;
  }>;
};

export type FlyVerifyLiveSchemaFingerprint = {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
};

export function emptyFlyVerifyLiveSession(): FlyVerifyLiveSessionState {
  return {
    jobId: null,
    operationId: null,
    objectId: null,
    objectKey: null,
    storeId: null,
    bytes: null,
    digest: null,
    mime: "application/json",
    expectedByteLength: 0,
    artifactObjectId: null,
    artifactObjectKey: null,
    uploadCapabilityIssued: false,
    verifyDeliveryId: null,
    verifyStreamId: null,
    verifyGroup: null,
    initialStoreVersion: null,
    observedStoreVersion: null,
    baselineVerifyMachineId: null,
  };
}
