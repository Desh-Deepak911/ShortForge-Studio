/**
 * Injected context for Upstash dual-lease live matrix runners.
 * Gate-on constructs Neon + Upstash adapters; deterministic suites inject fakes.
 * NEVER put credentials on ctx.
 */

import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import type { HeadlessProjectAuthorizationPort } from "@/features/headless-renderer/control-plane/ports/project-authorization.port";
import type { HeadlessStreamQueuePort } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";
import type { HeadlessGroupListProbeResult } from "@/features/headless-renderer/control-plane/runtime/group-presence-probe";
import type {
  HeadlessKeyDeleteResult,
  HeadlessKeyProbeResult,
} from "@/features/headless-renderer/control-plane/runtime/key-presence-probe";
import type { HeadlessPendingProbeResult } from "@/features/headless-renderer/control-plane/runtime/pending-probe";
import type { HeadlessStreamPresenceProbeResult } from "@/features/headless-renderer/control-plane/runtime/stream-presence-probe";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import type {
  HeadlessEnvName,
  HeadlessQueueLeaseSettings,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import type { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";

import type {
  QaRunScopedStreamBinding,
  UpstashLiveGroupAuthorityEvidence,
  UpstashLiveStreamAuthority,
} from "./qa-run-stream-names";

export type UpstashLiveStreamNames = ReturnType<
  typeof deriveHeadlessQueueStreamNames
>;

export type {
  QaRunScopedStreamBinding,
  UpstashLiveGroupAuthorityEvidence,
  UpstashLiveStreamAuthority,
};

export type UpstashLiveQaGroupInfo = {
  readonly name: string;
  readonly lastDeliveredId: string;
  readonly pending: number;
  readonly consumers: number;
};

export type UpstashLiveQaStreamEntry = {
  readonly streamId: string;
  readonly fields: Readonly<Record<string, string>>;
};

/** QA Redis ops used by cleanup + forged DLQ cases (Memory + TCP adapters). */
export type UpstashLiveRedisQaPort = {
  qaXack(kind: "render" | "verify", streamId: string): Promise<boolean>;
  qaXdel(streamKey: string, ...streamIds: string[]): Promise<number>;
  qaDelConsumer(
    kind: "render" | "verify",
    consumerName: string,
  ): Promise<boolean>;
  /**
   * Exact pending probe on the production worker group.
   * XPENDING stream group streamId streamId 1
   */
  qaProbePending(
    kind: "render" | "verify",
    streamId: string,
  ): Promise<HeadlessPendingProbeResult>;
  /**
   * @deprecated Fail-closed boolean — use `qaProbePending` for evidence authority.
   */
  qaIsPending(kind: "render" | "verify", streamId: string): Promise<boolean>;
  qaXaddRaw(
    streamKey: string,
    fields: Readonly<Record<string, string>>,
  ): Promise<string | null>;
  streamNames(): UpstashLiveStreamNames | null;
  close?(): Promise<void>;
  trimStream?(kind: "render" | "verify"): Promise<void>;

  /** SET key value NX PX — true when acquired. */
  qaSetNxPx(key: string, value: string, pxMs: number): Promise<boolean>;
  /** Non-lock test cleanup only — never use for exclusivity lock release. */
  qaDelKey(key: string): Promise<boolean>;
  /**
   * Exact DEL of one key with authoritative count (0|1).
   * Never encodes provider failure as deletedCount 0.
   */
  qaDelExactKey(key: string): Promise<HeadlessKeyDeleteResult>;
  /**
   * Exact EXISTS probe — never encodes failure as exists:false.
   */
  qaProbeKeyExists(key: string): Promise<HeadlessKeyProbeResult>;
  /** Atomic compare-and-renew (EVAL) — true when token still owns the key. */
  qaCompareAndRenewLock(
    key: string,
    token: string,
    ttlMs: number,
  ): Promise<boolean>;
  /**
   * Atomic compare-and-delete (EVAL).
   * `deleted` = owned and removed; `not_owner` = token mismatch/expired;
   * `error` = provider/transport failure (must not yield overall PASS).
   */
  qaCompareAndDeleteLock(
    key: string,
    token: string,
  ): Promise<"deleted" | "not_owner" | "error">;
  /** XGROUP CREATE … id ($|0|explicit) [MKSTREAM]. busy → false. */
  qaXgroupCreate(input: {
    readonly streamKey: string;
    readonly group: string;
    readonly id: "$" | "0" | string;
    readonly mkstream?: boolean;
  }): Promise<"created" | "busy" | "failed">;
  /** DESTROY only QA-owned groups — never production workers. */
  qaXgroupDestroy(streamKey: string, group: string): Promise<boolean>;
  /**
   * Result-bearing XINFO GROUPS — never encodes failure as [].
   * `ok:true, groups:[]` is confirmed empty; `ok:false` is probe failure.
   */
  qaXinfoGroups(streamKey: string): Promise<HeadlessGroupListProbeResult>;
  qaXrange(input: {
    readonly streamKey: string;
    readonly start: string;
    readonly end: string;
    readonly count?: number;
  }): Promise<readonly UpstashLiveQaStreamEntry[]>;
  qaXreadGroupInGroup(input: {
    readonly streamKey: string;
    readonly group: string;
    readonly consumerName: string;
    readonly count: number;
    readonly blockMs: number;
    readonly signal?: AbortSignal;
  }): Promise<
    | { readonly ok: true; readonly items: readonly UpstashLiveQaStreamEntry[] }
    | { readonly ok: false }
  >;
  qaXackInGroup(
    streamKey: string,
    group: string,
    streamId: string,
  ): Promise<boolean>;
  /**
   * Exact pending probe: XPENDING streamKey group streamId streamId 1
   * Distinguishes confirmed absent from probe failure.
   */
  qaProbePendingInGroup(
    streamKey: string,
    group: string,
    streamId: string,
  ): Promise<HeadlessPendingProbeResult>;
  /**
   * Exact stream presence: XRANGE streamKey streamId streamId COUNT 1
   */
  qaProbeStreamEntry(
    streamKey: string,
    streamId: string,
  ): Promise<HeadlessStreamPresenceProbeResult>;
  /**
   * @deprecated Fail-closed boolean — use `qaProbePendingInGroup` for evidence authority.
   */
  qaIsPendingInGroup(
    streamKey: string,
    group: string,
    streamId: string,
  ): Promise<boolean>;
  qaDelConsumerInGroup(
    streamKey: string,
    group: string,
    consumerName: string,
  ): Promise<boolean>;
  /** XAUTOCLAIM on an explicit group (QA or production) — never scans foreign groups. */
  qaAutoClaimIdleInGroup(input: {
    readonly streamKey: string;
    readonly group: string;
    readonly consumerName: string;
    readonly minIdleMs: number;
    readonly count: number;
  }): Promise<
    | {
        readonly ok: true;
        readonly items: readonly UpstashLiveQaStreamEntry[];
      }
    | { readonly ok: false }
  >;
};

export type UpstashLiveProducerPort = Pick<
  HeadlessStreamQueuePort,
  "enqueueRender" | "enqueueVerify"
>;

export type UpstashLiveConsumerPort = HeadlessStreamQueuePort &
  UpstashLiveRedisQaPort;

export type UpstashLiveTrackedStreamId = {
  readonly stream: string;
  readonly id: string;
  readonly kind?: "render" | "verify" | "render-dlq" | "verify-dlq";
};

export type UpstashLiveSessionState = {
  renderStreamId: string | null;
  verifyStreamId: string | null;
  renderDeliveryId: string | null;
  verifyDeliveryId: string | null;
  jobId: string | null;
  claimToken: string | null;
  ownedObjectId: string | null;
  consumerA: string | null;
  consumerB: string | null;
  recoveryStreamId: string | null;
  recoveryJobId: string | null;
  dlqStreamId: string | null;
};

export type UpstashLiveSchemaFingerprint = {
  readonly migrationIds: readonly string[];
  readonly checksumPrefixes: readonly string[];
  readonly queueProtocolVersion: string;
};

export type UpstashLiveMatrixContext = {
  readonly runId: string;
  readonly ownerId: string;
  readonly otherOwnerId: string;
  /** UUID project identity (Neon ownership CHECK). */
  readonly projectId: string;
  readonly env: NodeJS.ProcessEnv | Record<string, unknown>;
  /** Mutable harness clock — advance for claim-expiry cases only. */
  nowMs: number;
  /**
   * Production lease defaults from classifier (never mutated for QA timing).
   * Autoclaim tests use qaIdleMs / minIdleMs:0 only.
   */
  readonly leaseSettings: HeadlessQueueLeaseSettings;
  /** Autoclaim QA idle only — never assigned into leaseSettings. */
  readonly qaIdleMs: number;
  readonly sql: HeadlessSqlExecutor;
  readonly jobStore: HeadlessJobStorePort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly projectAuthorization: HeadlessProjectAuthorizationPort;
  readonly restProducer: UpstashLiveProducerPort;
  readonly tcpConsumer: UpstashLiveConsumerPort;
  /**
   * Composed port: enqueue → restProducer; consume/ack/dlq → tcpConsumer.
   * Deterministic suites may inject a single Memory adapter for both.
   */
  readonly streamQueue: HeadlessStreamQueuePort;
  readonly streamNames: UpstashLiveStreamNames;
  /**
   * `production_env` — canonical env streams (shared staging possible).
   * `qa_run_scoped` — unguessable run-owned remote streams for delivery cases.
   * Defaults to `production_env` when omitted by older fixtures.
   */
  readonly streamAuthority?: UpstashLiveStreamAuthority;
  /**
   * Evidence-facing group authority for production-protocol worker groups.
   * Present when streamAuthority is `qa_run_scoped`.
   */
  readonly groupAuthorityEvidence?: UpstashLiveGroupAuthorityEvidence;
  /** Frozen QA run-scoped binding when streamAuthority is `qa_run_scoped`. */
  readonly qaRunStreamBinding?: QaRunScopedStreamBinding | null;
  readonly envName: HeadlessEnvName;
  readonly createdJobIds: string[];
  readonly createdObjectIds: string[];
  readonly createdProjectIds: string[];
  /**
   * Active run-owned stream IDs (successful XADD; not yet case-finalized).
   * Same array as `runOwnedStreamIds` / `trackedStreamIds`.
   */
  readonly runOwnedActiveStreamIds: UpstashLiveTrackedStreamId[];
  /**
   * @deprecated Alias of `runOwnedActiveStreamIds` — never foreign IDs.
   */
  readonly runOwnedStreamIds: UpstashLiveTrackedStreamId[];
  /** @deprecated Same array as runOwnedActiveStreamIds. */
  readonly trackedStreamIds: UpstashLiveTrackedStreamId[];
  /** Case-finalized run-owned IDs — global cleanup verifies absence only. */
  readonly caseFinalizedStreamIds: UpstashLiveTrackedStreamId[];
  /**
   * Optional observation-only foreign IDs — NEVER passed to XACK/XDEL.
   */
  readonly observedForeignStreamIds: UpstashLiveTrackedStreamId[];
  readonly trackedConsumerNames: string[];
  /** Active QA-only groups — DESTROY in case finalize or global cleanup. */
  readonly activeQaGroups: string[];
  /** @deprecated Alias of `activeQaGroups`. */
  readonly trackedQaGroups: string[];
  /** Case-finalized QA groups — global cleanup verifies absence only. */
  readonly finalizedQaGroups: string[];
  /** Active DLQ entries still needing cleanup (alias via trackedDlqIds). */
  readonly trackedDlqIds: UpstashLiveTrackedStreamId[];
  readonly session: UpstashLiveSessionState;
  readonly preflightFingerprint: UpstashLiveSchemaFingerprint;
  readonly abortSignal?: AbortSignal;
  readonly deadlineMs?: number;
};
