/**
 * QA-only targeted Upstash claim/ACK probe — Sprint 11E Phase 2D.1E.
 * Chain: env → Neon preflight → lifecycle cases (enqueue/render/verify/read) →
 * prior render finalization check → production claim+ACK → cleanup → evidence.
 * Never migrates. Never overwrites official live evidence.
 */

import { randomUUID } from "node:crypto";

import { Redis } from "@upstash/redis";

import {
  bindHeadlessUpstashRestClientFromRedis,
  UpstashRestQueueProducerAdapter,
  type HeadlessUpstashRestClient,
} from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  readConfiguredHeadlessUpstashConsumerConfig,
  readConfiguredHeadlessUpstashProducerConfig,
  type HeadlessQueueLeaseSettings,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import type { HeadlessStreamQueuePort } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";
import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import type { HeadlessProjectAuthorizationPort } from "@/features/headless-renderer/control-plane/ports/project-authorization.port";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessOwnedObjectStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import {
  runAttributedClaimAckConsume,
  type ClaimAckAttributionStageResult,
} from "./claim-ack-attribution";
import {
  createNotTestedUpstashClaimAckProbeEvidence,
  defaultUpstashClaimAckProbeEvidencePath,
  CLAIM_ACK_PROBE_ELIGIBILITY,
  claimAckProbeCannotFalsePass,
  preserveOrInitializeUpstashClaimAckProbeEvidence,
  writeUpstashClaimAckProbeEvidence,
  type UpstashClaimAckProbeEvidenceDocument,
} from "./claim-ack-probe-evidence";
import { defaultUpstashLiveCleanup } from "./cleanup";
import { composeQaRunScopedHarnessPorts } from "./compose-qa-run-scoped-ports";
import { fingerprintFromPreflight } from "./evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  hasNoActiveRunOwnedRenderEntries,
} from "./live-fixtures";
import { DEFAULT_UPSTASH_LIVE_CASE_RUNNERS } from "./live-matrix";
import { QA_RUN_QUEUE_NAMESPACE_VERSION } from "./qa-run-stream-names";
import type { RequiredUpstashLiveCaseId } from "./required-cases";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveMatrixContext,
  UpstashLiveProducerPort,
  UpstashLiveSchemaFingerprint,
} from "./types";

const LIFECYCLE_CASE_IDS = Object.freeze([
  "enqueue.render",
  "enqueue.verify",
  "group.create",
  "read.group",
] as const satisfies readonly RequiredUpstashLiveCaseId[]);

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  return (
    (env as Record<string, unknown>).HEADLESS_UPSTASH_QA_CLAIM_ACK_PROBE === "1"
  );
}

const PRODUCTION_LEASES: HeadlessQueueLeaseSettings = Object.freeze({
  deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
});

export type UpstashClaimAckProbeDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly forceGateOn?: boolean;
  readonly assumeConfigured?: boolean;
  readonly connectionProbe?: () => void;
  readonly injectedSql?: HeadlessSqlExecutor;
  readonly injectedJobStore?: HeadlessJobStorePort;
  readonly injectedOwnedObjectStore?: HeadlessOwnedObjectStorePort;
  readonly injectedProjectAuthorization?: HeadlessProjectAuthorizationPort;
  readonly injectedRestProducer?: UpstashLiveProducerPort;
  readonly injectedTcpConsumer?: UpstashLiveConsumerPort;
  readonly injectedRestClient?: HeadlessUpstashRestClient;
  readonly injectedFingerprint?: UpstashLiveSchemaFingerprint;
  readonly cleanupRunner?: typeof defaultUpstashLiveCleanup;
  readonly nowIso?: () => string;
};

function composeStreamQueue(
  producer: UpstashLiveProducerPort,
  consumer: UpstashLiveConsumerPort,
  dlqWriter: { moveToDlq: HeadlessStreamQueuePort["moveToDlq"] },
): HeadlessStreamQueuePort {
  return {
    enqueueRender: (m) => producer.enqueueRender(m),
    enqueueVerify: (m) => producer.enqueueVerify(m),
    ensureConsumerGroups: () => consumer.ensureConsumerGroups(),
    readGroup: (i) => consumer.readGroup(i),
    ack: (i) => consumer.ack(i),
    autoClaimIdle: (i) => consumer.autoClaimIdle(i),
    // Run-scoped: never tcpConsumer.moveToDlq (shared staging DLQ).
    moveToDlq: (i) => dlqWriter.moveToDlq(i),
  };
}

export async function runUpstashClaimAckProbe(
  deps: UpstashClaimAckProbeDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: UpstashClaimAckProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
}> {
  console.log(
    "\nSprint 11E Phase 2D.1E — Upstash targeted claim/ACK probe\n",
  );
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultUpstashClaimAckProbeEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  let connectionFactoryCalls = 0;

  if (!deps.forceGateOn && !isGateOn(env)) {
    const preserved = preserveOrInitializeUpstashClaimAckProbeEvidence(
      evidencePath,
    );
    console.log(
      "  NOT TESTED — set HEADLESS_UPSTASH_QA_CLAIM_ACK_PROBE=1 with Neon+Upstash staging.",
    );
    console.log(
      `  Claim/ACK-probe evidence ${preserved.action} (overall=${preserved.overall}). Zero connections.`,
    );
    return {
      exitCode: 0,
      overall: "NOT_TESTED",
      connectionFactoryCalls: 0,
    };
  }

  const neonStatus = classifyHeadlessNeonEnvironment(env);
  const producerStatus = classifyHeadlessUpstashProducerEnvironment(env);
  const consumerStatus = classifyHeadlessUpstashConsumerEnvironment(env);
  const envName = String(
    (env as Record<string, unknown>).HEADLESS_ENV_NAME ?? "",
  );

  if (
    !deps.assumeConfigured &&
    (neonStatus !== "configured" ||
      producerStatus !== "configured" ||
      consumerStatus !== "configured" ||
      envName !== "staging")
  ) {
    const doc: UpstashClaimAckProbeEvidenceDocument = {
      ...createNotTestedUpstashClaimAckProbeEvidence([
        "Claim/ACK probe evidence — does not overwrite official live evidence.",
        "CONFIGURATION UNAVAILABLE — no connection attempted.",
      ]),
      overall: "FAIL",
      eligibilityVerdict: CLAIM_ACK_PROBE_ELIGIBILITY.FAIL_CONFIG,
      startedAtIso: nowIso(),
      endedAtIso: nowIso(),
      cleanupStatus: "not_run",
    };
    writeUpstashClaimAckProbeEvidence(doc, evidencePath);
    console.log("  FAIL — CONFIGURATION UNAVAILABLE.");
    return { exitCode: 1, overall: "FAIL", connectionFactoryCalls: 0 };
  }

  const startedAtIso = nowIso();
  let sql: HeadlessSqlExecutor | null = null;
  let tcpConsumer: UpstashLiveConsumerPort | null = null;
  let ownsTcpClose = false;
  let restClient: HeadlessUpstashRestClient | null =
    deps.injectedRestClient ?? null;

  const failDoc = (input: {
    readonly stages: readonly ClaimAckAttributionStageResult[];
    readonly failureStage: string | null;
    readonly failureReasonId: string | null;
    readonly cleanupStatus: UpstashClaimAckProbeEvidenceDocument["cleanupStatus"];
    readonly notes: readonly string[];
    readonly fingerprint?: UpstashLiveSchemaFingerprint | null;
    readonly eligibility?: string;
    readonly streamAuthority?: UpstashClaimAckProbeEvidenceDocument["streamAuthority"];
    readonly groupAuthority?: UpstashClaimAckProbeEvidenceDocument["groupAuthority"];
    readonly queueNamespaceVersion?: UpstashClaimAckProbeEvidenceDocument["queueNamespaceVersion"];
    readonly runScopedCleanupStatus?: UpstashClaimAckProbeEvidenceDocument["runScopedCleanupStatus"];
    readonly enqueueTransport?: UpstashClaimAckProbeEvidenceDocument["enqueueTransport"];
    readonly consumeTransport?: UpstashClaimAckProbeEvidenceDocument["consumeTransport"];
  }): UpstashClaimAckProbeEvidenceDocument => ({
    title: createNotTestedUpstashClaimAckProbeEvidence().title,
    overall: "FAIL",
    eligibilityVerdict: input.eligibility ?? CLAIM_ACK_PROBE_ELIGIBILITY.FAIL,
    startedAtIso,
    endedAtIso: nowIso(),
    failureStage: input.failureStage,
    failureReasonId: input.failureReasonId,
    stages: input.stages,
    schemaFingerprint: input.fingerprint ?? null,
    cleanupStatus: input.cleanupStatus,
    streamAuthority: input.streamAuthority ?? "qa_run_scoped",
    groupAuthority: input.groupAuthority ?? "production_protocol",
    queueNamespaceVersion:
      input.queueNamespaceVersion ?? QA_RUN_QUEUE_NAMESPACE_VERSION,
    runScopedCleanupStatus: input.runScopedCleanupStatus ?? input.cleanupStatus,
    enqueueTransport: input.enqueueTransport ?? "rest_xadd",
    consumeTransport: input.consumeTransport ?? "tcp_production_protocol",
    notes: [
      "Claim/ACK probe evidence — does not overwrite official live evidence.",
      ...input.notes,
    ],
  });

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else {
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) {
        writeUpstashClaimAckProbeEvidence(
          failDoc({
            stages: [],
            failureStage: null,
            failureReasonId: null,
            cleanupStatus: "not_run",
            notes: ["DATABASE_URL unreadable."],
            eligibility: CLAIM_ACK_PROBE_ELIGIBILITY.FAIL_CONFIG,
          }),
          evidencePath,
        );
        return { exitCode: 1, overall: "FAIL", connectionFactoryCalls: 0 };
      }
      connectionFactoryCalls += 1;
      deps.connectionProbe?.();
      sql = createNeonSqlExecutor({ connectionString });
    }

    let fingerprint: UpstashLiveSchemaFingerprint;
    if (deps.injectedFingerprint != null) {
      fingerprint = deps.injectedFingerprint;
    } else {
      const preflight = await runHeadlessSchemaPreflight({ sql });
      if (!preflight.ok) {
        writeUpstashClaimAckProbeEvidence(
          failDoc({
            stages: [],
            failureStage: null,
            failureReasonId: null,
            cleanupStatus: "not_run",
            notes: ["Schema preflight failed before Upstash contact."],
          }),
          evidencePath,
        );
        console.log("  FAIL — schema preflight.");
        return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
      }
      fingerprint = fingerprintFromPreflight(preflight.fingerprint);
    }

    const producerConfig = readConfiguredHeadlessUpstashProducerConfig(env);
    const consumerConfig = readConfiguredHeadlessUpstashConsumerConfig(env);

    // REST client for run-scoped XADD (never shared staging stream names).
    if (restClient == null && producerConfig != null) {
      connectionFactoryCalls += 1;
      deps.connectionProbe?.();
      const liveRedis = new Redis({
        url: producerConfig.restUrl,
        token: producerConfig.restToken,
      });
      restClient = bindHeadlessUpstashRestClientFromRedis(liveRedis);
    }
    void UpstashRestQueueProducerAdapter;

    if (deps.injectedTcpConsumer != null) {
      tcpConsumer = deps.injectedTcpConsumer;
    } else {
      connectionFactoryCalls += 1;
      deps.connectionProbe?.();
      tcpConsumer = new UpstashTcpStreamConsumerAdapter({
        config: consumerConfig ?? undefined,
        envName: "staging",
      });
      ownsTcpClose = true;
    }

    const runId = randomUUID();
    const scoped = await composeQaRunScopedHarnessPorts({
      envName: "staging",
      runId,
      redis: tcpConsumer,
      restClient,
    });
    if (scoped == null) {
      writeUpstashClaimAckProbeEvidence(
        failDoc({
          stages: [],
          failureStage: null,
          failureReasonId: null,
          cleanupStatus: "not_run",
          fingerprint,
          notes: ["QA run-scoped stream binding failed closed."],
        }),
        evidencePath,
      );
      console.log("  FAIL — run-scoped stream binding.");
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const restProducer: UpstashLiveProducerPort =
      deps.injectedRestProducer ?? scoped.restProducer;

    const lifecycle = createUpstashLifecycleTracking();
    const ctx: UpstashLiveMatrixContext = {
      runId,
      ownerId: `uq_ca_${runId.slice(0, 8)}`,
      otherOwnerId: `uq_ca_o_${runId.slice(0, 8)}`,
      projectId: randomUUID(),
      env,
      nowMs: Date.now(),
      leaseSettings: PRODUCTION_LEASES,
      qaIdleMs: 50,
      sql,
      jobStore:
        deps.injectedJobStore ?? new NeonHeadlessJobStoreAdapter(sql),
      ownedObjectStore:
        deps.injectedOwnedObjectStore ??
        new NeonHeadlessOwnedObjectStoreAdapter(sql),
      projectAuthorization:
        deps.injectedProjectAuthorization ??
        new NeonHeadlessProjectAuthorizationAdapter(sql),
      restProducer,
      tcpConsumer,
      streamQueue: composeStreamQueue(
        restProducer,
        tcpConsumer,
        scoped.dlqWriter,
      ),
      streamNames: scoped.streamNames,
      streamAuthority: scoped.streamAuthority,
      groupAuthorityEvidence: scoped.groupAuthorityEvidence,
      qaRunStreamBinding: scoped.binding,
      envName: "staging",
      createdJobIds: [],
      createdObjectIds: [],
      createdProjectIds: [],
      runOwnedActiveStreamIds: lifecycle.runOwnedActiveStreamIds,
      runOwnedStreamIds: lifecycle.runOwnedStreamIds,
      trackedStreamIds: lifecycle.trackedStreamIds,
      caseFinalizedStreamIds: lifecycle.caseFinalizedStreamIds,
      observedForeignStreamIds: [],
      trackedConsumerNames: [],
      activeQaGroups: lifecycle.activeQaGroups,
      trackedQaGroups: lifecycle.trackedQaGroups,
      finalizedQaGroups: lifecycle.finalizedQaGroups,
      trackedDlqIds: lifecycle.trackedDlqIds,
      session: emptyUpstashLiveSession(),
      preflightFingerprint: fingerprint,
    };

    for (const caseId of LIFECYCLE_CASE_IDS) {
      const runner = DEFAULT_UPSTASH_LIVE_CASE_RUNNERS[caseId];
      const result = await runner(ctx);
      if (result.status !== "PASS") {
        const cleanupStatus = await (deps.cleanupRunner ??
          defaultUpstashLiveCleanup)(ctx, false);
        writeUpstashClaimAckProbeEvidence(
          failDoc({
            stages: [],
            failureStage: caseId,
            failureReasonId: null,
            cleanupStatus,
            fingerprint,
            notes: [`Lifecycle case ${caseId} did not PASS.`],
          }),
          evidencePath,
        );
        console.log(`  FAIL — lifecycle case ${caseId}.`);
        return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
      }
      if (ctx.runOwnedActiveStreamIds.length > 0) {
        const cleanupStatus = await (deps.cleanupRunner ??
          defaultUpstashLiveCleanup)(ctx, false);
        writeUpstashClaimAckProbeEvidence(
          failDoc({
            stages: [],
            failureStage: caseId,
            failureReasonId: "prior_run_entry_not_finalized",
            cleanupStatus,
            fingerprint,
            notes: [
              `Lifecycle case ${caseId} left active run-owned entries.`,
            ],
          }),
          evidencePath,
        );
        console.log(`  FAIL — active residue after ${caseId}.`);
        return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
      }
    }

    if (!hasNoActiveRunOwnedRenderEntries(ctx)) {
      const cleanupStatus = await (deps.cleanupRunner ??
        defaultUpstashLiveCleanup)(ctx, false);
      writeUpstashClaimAckProbeEvidence(
        failDoc({
          stages: [],
          failureStage: "queued_job_seed",
          failureReasonId: "prior_run_entry_not_finalized",
          cleanupStatus,
          fingerprint,
          notes: ["Prior run-owned render entries not case-finalized."],
        }),
        evidencePath,
      );
      console.log("  FAIL — prior render entries not finalized.");
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const attributed = await runAttributedClaimAckConsume(ctx);

    if (!attributed.ok) {
      const cleanupStatus = await (deps.cleanupRunner ??
        defaultUpstashLiveCleanup)(ctx, false);
      writeUpstashClaimAckProbeEvidence(
        failDoc({
          stages: attributed.stages,
          failureStage: attributed.failureStage,
          failureReasonId: attributed.failureReasonId,
          cleanupStatus,
          fingerprint,
          notes: [
            `Stopped at stage=${attributed.failureStage} reasonId=${attributed.failureReasonId}.`,
          ],
        }),
        evidencePath,
      );
      console.log(
        `  FAIL — stage=${attributed.failureStage} reasonId=${attributed.failureReasonId}`,
      );
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const cleanupStatus = await (deps.cleanupRunner ??
      defaultUpstashLiveCleanup)(ctx, false);
    if (cleanupStatus !== "ok" && cleanupStatus !== "preserved") {
      writeUpstashClaimAckProbeEvidence(
        failDoc({
          stages: attributed.stages,
          failureStage: "stream_finalize",
          failureReasonId: null,
          cleanupStatus,
          fingerprint,
          notes: ["Cleanup failed or left residue."],
          eligibility: CLAIM_ACK_PROBE_ELIGIBILITY.FAIL_CLEANUP,
        }),
        evidencePath,
      );
      console.log("  FAIL — cleanup.");
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const passDoc: UpstashClaimAckProbeEvidenceDocument = {
      title: createNotTestedUpstashClaimAckProbeEvidence().title,
      overall: "PASS",
      eligibilityVerdict: CLAIM_ACK_PROBE_ELIGIBILITY.PASS,
      startedAtIso,
      endedAtIso: nowIso(),
      failureStage: null,
      failureReasonId: null,
      stages: attributed.stages,
      schemaFingerprint: fingerprint,
      cleanupStatus,
      streamAuthority: "qa_run_scoped",
      groupAuthority: "production_protocol",
      queueNamespaceVersion: QA_RUN_QUEUE_NAMESPACE_VERSION,
      runScopedCleanupStatus: cleanupStatus,
      enqueueTransport: "rest_xadd",
      consumeTransport: "tcp_production_protocol",
      notes: [
        "Claim/ACK probe evidence — does not overwrite official live evidence.",
        "Lifecycle cases finalized; REST XADD + TCP production-protocol claim+ACK passed; cleanup ok.",
      ],
    };

    const passAuth = claimAckProbeCannotFalsePass(passDoc);
    if (!passAuth.ok) {
      writeUpstashClaimAckProbeEvidence(
        failDoc({
          stages: passDoc.stages,
          failureStage: null,
          failureReasonId: null,
          cleanupStatus,
          fingerprint,
          notes: [passAuth.message],
        }),
        evidencePath,
      );
      console.log(`  FAIL — PASS authority: ${passAuth.message}`);
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    writeUpstashClaimAckProbeEvidence(passDoc, evidencePath);
    console.log("  PASS — targeted claim/ACK probe.");
    return { exitCode: 0, overall: "PASS", connectionFactoryCalls };
  } catch {
    writeUpstashClaimAckProbeEvidence(
      failDoc({
        stages: [],
        failureStage: null,
        failureReasonId: null,
        cleanupStatus: "not_run",
        notes: ["Probe terminated unexpectedly (scrubbed)."],
      }),
      evidencePath,
    );
    console.log("  FAIL — unexpected termination.");
    return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
  } finally {
    if (ownsTcpClose && tcpConsumer?.close != null) {
      try {
        await tcpConsumer.close();
      } catch {
        // ignore
      }
    }
  }
}
