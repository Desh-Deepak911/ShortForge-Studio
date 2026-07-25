/**
 * Injected context for hosted Fly render live matrix runners.
 */

import type { HeadlessRenderDispatchOutboxPort } from "@/features/headless-renderer/control-plane/ports/render-dispatch-outbox.port";

import type { R2LiveMatrixContext, R2LiveSessionState } from "../r2-live/types";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveProducerPort,
  UpstashLiveStreamNames,
} from "../upstash-live/types";
import type { HostedRenderProcessTreePeakObservation } from "./process-tree-peak-memory";
import type { FlyRenderLiveDispatchOutboxObservationAnchor } from "./dispatch-outbox-observation-capture";
import type { Capacity4kWorkloadBoundary } from "../fly-render-4k-capacity/capacity-4k-workload";
import type { Hosted4kRenderMachineProcessTreeSamplerHandle } from "../fly-render-4k-capacity/hosted-render-machine-process-tree-sampler";

export type FlyRenderLiveSessionState = R2LiveSessionState & {
  renderDeliveryId: string | null;
  renderStreamId: string | null;
  renderGroup: string | null;
  initialStoreVersion: number | null;
  observedStoreVersion: number | null;
  baselineVerifyMachineId: string | null;
  baselineRenderMachineId: string | null;
  renderStartedAtMs: number | null;
  renderEnqueuedAtMs: number | null;
  probeObservationBoundaryMs: number | null;
  renderCompletedAtMs: number | null;
  artifactByteLength: number | null;
  artifactContentDigest: string | null;
  dispatchOutboxObservationAnchor: FlyRenderLiveDispatchOutboxObservationAnchor | null;
};

export type FlyRenderLiveTrackedStreamId = {
  readonly stream: string;
  readonly id: string;
  readonly kind: "render";
};

export type FlyRenderLiveMatrixContext = R2LiveMatrixContext & {
  readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly flyAppName: string;
  readonly acceptedImageDigestSha256: string;
  readonly restProducer: UpstashLiveProducerPort | null;
  readonly tcpConsumer: UpstashLiveConsumerPort | null;
  readonly streamNames: UpstashLiveStreamNames;
  readonly streamAuthority: "production_env";
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort | null;
  readonly preflightFingerprint: FlyRenderLiveSchemaFingerprint | null;
  readonly trackedStreamIds: FlyRenderLiveTrackedStreamId[];
  readonly runOwnedActiveStreamIds: FlyRenderLiveTrackedStreamId[];
  readonly session: FlyRenderLiveSessionState;
  readonly smokePollTimeoutMs: number;
  readonly smokeContentDurationMs: number;
  readonly resourceObservation: HostedRenderProcessTreePeakObservation | null;
  readonly readFlyTopology?: () => Promise<FlyRenderLiveTopologySnapshot>;
  readonly readHostedDeliveryEvents?: () => Promise<
    readonly import("./claim-correlation-authority").HostedRenderDeliveryEventObservation[]
  >;
  readonly pollHostedRenderer?: () => Promise<HostedRendererObservedState>;
  /**
   * Sprint 11E Phase 2E.2D.8K.1 — hosted 4K capacity extensions.
   * All optional; render-live matrix leaves these undefined/null.
   */
  capacity4kBoundary?: Capacity4kWorkloadBoundary | null;
  capacity4kAudioMode?: "silent" | "with-voice-and-music";
  capacity4kCreatorPrefix?: string;
  capacity4kProcessTreeSampler?: Hosted4kRenderMachineProcessTreeSamplerHandle | null;
};

export type FlyRenderLiveSchemaFingerprint = {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
};

export type FlyRenderLiveTopologySnapshot = {
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly region: string;
  readonly verifyMachineId: string | null;
  readonly renderMachineId: string | null;
  readonly verifyImageDigestSha256: string | null;
  readonly renderImageDigestSha256: string | null;
};

export type HostedRendererObservedState = {
  readonly claimCleared: boolean;
  readonly renderPendingCleared: boolean;
  readonly jobSucceeded: boolean;
  readonly artifactFinalized: boolean;
  readonly dispatchOutboxCompleted: boolean;
  readonly cleanupIntentRetryable: boolean;
  readonly storeVersion: number | null;
  readonly jobTerminalFailed: boolean;
  readonly chromiumExecuted: boolean;
  readonly ffmpegExecuted: boolean;
  readonly artifactUploaded: boolean;
};

export function emptyFlyRenderLiveSession(): FlyRenderLiveSessionState {
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
    renderDeliveryId: null,
    renderStreamId: null,
    renderGroup: null,
    initialStoreVersion: null,
    observedStoreVersion: null,
    baselineVerifyMachineId: null,
    baselineRenderMachineId: null,
    renderStartedAtMs: null,
    renderEnqueuedAtMs: null,
    probeObservationBoundaryMs: null,
    renderCompletedAtMs: null,
    artifactByteLength: null,
    artifactContentDigest: null,
    dispatchOutboxObservationAnchor: null,
  };
}
