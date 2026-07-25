/**
 * QA-only targeted Upstash duplicate-delivery concurrency probe — Sprint 11E 2D.1H.
 * Chain: env → Neon preflight → run-scoped REST/TCP → attributed concurrency.no.steal → cleanup.
 * Never migrates. Never overwrites progressive/official evidence.
 */

import { randomUUID } from "node:crypto";

import { Redis } from "@upstash/redis";

import {
  bindHeadlessUpstashRestClientFromRedis,
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

import { defaultUpstashLiveCleanup } from "./cleanup";
import { composeQaRunScopedHarnessPorts } from "./compose-qa-run-scoped-ports";
import {
  runAttributedConcurrencyNoSteal,
  type ConcurrencyAttributionStageResult,
} from "./concurrency-attribution";
import {
  CONCURRENCY_PROBE_ELIGIBILITY,
  CONCURRENCY_PROBE_EVIDENCE_TITLE,
  concurrencyProbeCannotFalsePass,
  createNotTestedUpstashConcurrencyProbeEvidence,
  defaultUpstashConcurrencyProbeEvidencePath,
  preserveOrInitializeUpstashConcurrencyProbeEvidence,
  writeUpstashConcurrencyProbeEvidence,
  type UpstashConcurrencyProbeEvidenceDocument,
} from "./concurrency-probe-evidence";
import { fingerprintFromPreflight } from "./evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
} from "./live-fixtures";
import { QA_RUN_QUEUE_NAMESPACE_VERSION } from "./qa-run-stream-names";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveMatrixContext,
  UpstashLiveProducerPort,
  UpstashLiveSchemaFingerprint,
} from "./types";

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  return (
    (env as Record<string, unknown>).HEADLESS_UPSTASH_QA_CONCURRENCY_PROBE ===
    "1"
  );
}

const PRODUCTION_LEASES: HeadlessQueueLeaseSettings = Object.freeze({
  deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
});

export type UpstashConcurrencyProbeDeps = {
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
    moveToDlq: (i) => dlqWriter.moveToDlq(i),
  };
}

export async function runUpstashConcurrencyProbe(
  deps: UpstashConcurrencyProbeDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: UpstashConcurrencyProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
}> {
  console.log(
    "\nSprint 11E Phase 2D.1H — Upstash targeted concurrency probe\n",
  );
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultUpstashConcurrencyProbeEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  let connectionFactoryCalls = 0;

  if (!deps.forceGateOn && !isGateOn(env)) {
    const preserved =
      preserveOrInitializeUpstashConcurrencyProbeEvidence(evidencePath);
    console.log(
      "  NOT TESTED — set HEADLESS_UPSTASH_QA_CONCURRENCY_PROBE=1 with Neon+Upstash staging.",
    );
    console.log(
      `  Concurrency-probe evidence ${preserved.action} (overall=${preserved.overall}). Zero connections.`,
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
    const doc: UpstashConcurrencyProbeEvidenceDocument = {
      ...createNotTestedUpstashConcurrencyProbeEvidence([
        "Concurrency probe evidence — does not overwrite progressive/official evidence.",
        "CONFIGURATION UNAVAILABLE — no connection attempted.",
      ]),
      overall: "FAIL",
      eligibilityVerdict: CONCURRENCY_PROBE_ELIGIBILITY.FAIL_CONFIG,
      startedAtIso: nowIso(),
      endedAtIso: nowIso(),
      cleanupStatus: "not_run",
    };
    writeUpstashConcurrencyProbeEvidence(doc, evidencePath);
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
    readonly stages: readonly ConcurrencyAttributionStageResult[];
    readonly failureStage: string | null;
    readonly failureReasonId: string | null;
    readonly cleanupStatus: UpstashConcurrencyProbeEvidenceDocument["cleanupStatus"];
    readonly notes: readonly string[];
    readonly fingerprint?: UpstashLiveSchemaFingerprint | null;
    readonly eligibility?: string;
  }): UpstashConcurrencyProbeEvidenceDocument => ({
    title: createNotTestedUpstashConcurrencyProbeEvidence().title,
    overall: "FAIL",
    eligibilityVerdict:
      input.eligibility ?? CONCURRENCY_PROBE_ELIGIBILITY.FAIL,
    startedAtIso,
    endedAtIso: nowIso(),
    failureStage: input.failureStage,
    failureReasonId: input.failureReasonId,
    stages: input.stages,
    schemaFingerprint: input.fingerprint ?? null,
    cleanupStatus: input.cleanupStatus,
    streamAuthority: "qa_run_scoped",
    groupAuthority: "production_protocol",
    queueNamespaceVersion: QA_RUN_QUEUE_NAMESPACE_VERSION,
    runScopedCleanupStatus: input.cleanupStatus,
    enqueueTransport: "rest_xadd",
    consumeTransport: "tcp_production_protocol",
    duplicateDeliveryModel: "two_distinct_stream_ids",
    notes: [
      "Concurrency probe evidence — does not overwrite progressive/official evidence.",
      ...input.notes,
    ],
  });

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else {
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) {
        writeUpstashConcurrencyProbeEvidence(
          failDoc({
            stages: [],
            failureStage: null,
            failureReasonId: null,
            cleanupStatus: "not_run",
            notes: ["DATABASE_URL unreadable."],
            eligibility: CONCURRENCY_PROBE_ELIGIBILITY.FAIL_CONFIG,
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
        writeUpstashConcurrencyProbeEvidence(
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

    if (restClient == null && producerConfig != null) {
      connectionFactoryCalls += 1;
      deps.connectionProbe?.();
      const liveRedis = new Redis({
        url: producerConfig.restUrl,
        token: producerConfig.restToken,
      });
      restClient = bindHeadlessUpstashRestClientFromRedis(liveRedis);
    }

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
      writeUpstashConcurrencyProbeEvidence(
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
      ownerId: `uq_conc_${runId.slice(0, 8)}`,
      otherOwnerId: `uq_conc_o_${runId.slice(0, 8)}`,
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

    const attributed = await runAttributedConcurrencyNoSteal(ctx);
    if (!attributed.ok) {
      const cleanupStatus = await (deps.cleanupRunner ??
        defaultUpstashLiveCleanup)(ctx, false);
      writeUpstashConcurrencyProbeEvidence(
        failDoc({
          stages: attributed.stages,
          failureStage: attributed.failureStage,
          failureReasonId: attributed.failureReasonId,
          cleanupStatus,
          fingerprint,
          notes: [
            `Stopped at stage=${attributed.failureStage} reasonId=${attributed.failureReasonId}.`,
          ],
          eligibility:
            cleanupStatus === "failed"
              ? CONCURRENCY_PROBE_ELIGIBILITY.FAIL_CLEANUP
              : CONCURRENCY_PROBE_ELIGIBILITY.FAIL,
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
      writeUpstashConcurrencyProbeEvidence(
        failDoc({
          stages: attributed.stages,
          failureStage: "cleanup",
          failureReasonId: "cleanup_tracking_failed",
          cleanupStatus,
          fingerprint,
          notes: ["Concurrency case passed but cleanup failed."],
          eligibility: CONCURRENCY_PROBE_ELIGIBILITY.FAIL_CLEANUP,
        }),
        evidencePath,
      );
      console.log("  FAIL — cleanup.");
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const passDoc: UpstashConcurrencyProbeEvidenceDocument = {
      title: CONCURRENCY_PROBE_EVIDENCE_TITLE,
      overall: "PASS",
      eligibilityVerdict: CONCURRENCY_PROBE_ELIGIBILITY.PASS,
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
      duplicateDeliveryModel: "two_distinct_stream_ids",
      notes: [
        "Concurrency probe evidence — does not overwrite progressive/official evidence.",
        "Two REST XADD deliveries + concurrent Neon claim race; both entries ACKed; cleanup ok.",
      ],
    };

    const passAuth = concurrencyProbeCannotFalsePass(passDoc);
    if (!passAuth.ok) {
      writeUpstashConcurrencyProbeEvidence(
        failDoc({
          stages: attributed.stages,
          failureStage: null,
          failureReasonId: null,
          cleanupStatus,
          fingerprint,
          notes: [`PASS authority: ${passAuth.message}`],
        }),
        evidencePath,
      );
      console.log(`  FAIL — PASS authority: ${passAuth.message}`);
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    writeUpstashConcurrencyProbeEvidence(passDoc, evidencePath);
    console.log("  PASS — targeted concurrency probe.");
    return { exitCode: 0, overall: "PASS", connectionFactoryCalls };
  } catch {
    writeUpstashConcurrencyProbeEvidence(
      failDoc({
        stages: [],
        failureStage: null,
        failureReasonId: null,
        cleanupStatus: "not_run",
        notes: ["Unexpected termination."],
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
        // best-effort
      }
    }
  }
}
