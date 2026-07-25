/**
 * QA-only targeted Upstash render-enqueue probe — Sprint 11E Phase 2D.1B.
 * Chain: env → Neon preflight → ownership → canonical job → insert → reread →
 * queue entry → one REST XADD → provider-backed read → cleanup → zero residue.
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
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
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
import {
  runAttributedRenderEnqueue,
  type EnqueueAttributionStageResult,
} from "./enqueue-attribution";
import {
  createNotTestedUpstashEnqueueProbeEvidence,
  defaultUpstashEnqueueProbeEvidencePath,
  ENQUEUE_PROBE_ELIGIBILITY,
  enqueueProbeCannotFalsePass,
  preserveOrInitializeUpstashEnqueueProbeEvidence,
  writeUpstashEnqueueProbeEvidence,
  type UpstashEnqueueProbeEvidenceDocument,
} from "./enqueue-probe-evidence";
import { fingerprintFromPreflight } from "./evidence-authority";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "./live-fixtures";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveMatrixContext,
  UpstashLiveProducerPort,
  UpstashLiveSchemaFingerprint,
} from "./types";

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  return (
    (env as Record<string, unknown>).HEADLESS_UPSTASH_QA_ENQUEUE_PROBE === "1"
  );
}

const PRODUCTION_LEASES: HeadlessQueueLeaseSettings = Object.freeze({
  deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
});

export type UpstashEnqueueProbeDeps = {
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
  readonly verifyStreamEntry?: (input: {
    readonly streamKey: string;
    readonly streamId: string;
  }) => Promise<boolean>;
  readonly cleanupRunner?: typeof defaultUpstashLiveCleanup;
  readonly nowIso?: () => string;
};

function composeStreamQueue(
  producer: UpstashLiveProducerPort,
  consumer: UpstashLiveConsumerPort,
): HeadlessStreamQueuePort {
  return {
    enqueueRender: (m) => producer.enqueueRender(m),
    enqueueVerify: (m) => producer.enqueueVerify(m),
    ensureConsumerGroups: () => consumer.ensureConsumerGroups(),
    readGroup: (i) => consumer.readGroup(i),
    ack: (i) => consumer.ack(i),
    autoClaimIdle: (i) => consumer.autoClaimIdle(i),
    moveToDlq: (i) => consumer.moveToDlq(i),
  };
}

export async function runUpstashEnqueueProbe(
  deps: UpstashEnqueueProbeDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: UpstashEnqueueProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
}> {
  console.log("\nSprint 11E Phase 2D.1B — Upstash targeted enqueue probe\n");
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultUpstashEnqueueProbeEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  let connectionFactoryCalls = 0;

  if (!deps.forceGateOn && !isGateOn(env)) {
    const preserved = preserveOrInitializeUpstashEnqueueProbeEvidence(
      evidencePath,
    );
    console.log(
      "  NOT TESTED — set HEADLESS_UPSTASH_QA_ENQUEUE_PROBE=1 with Neon+Upstash staging.",
    );
    console.log(
      `  Enqueue-probe evidence ${preserved.action} (overall=${preserved.overall}). Zero connections.`,
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
    const doc: UpstashEnqueueProbeEvidenceDocument = {
      ...createNotTestedUpstashEnqueueProbeEvidence([
        "Enqueue probe evidence — does not overwrite official live evidence.",
        "CONFIGURATION UNAVAILABLE — no connection attempted.",
      ]),
      overall: "FAIL",
      eligibilityVerdict: ENQUEUE_PROBE_ELIGIBILITY.FAIL_CONFIG,
      startedAtIso: nowIso(),
      endedAtIso: nowIso(),
      cleanupStatus: "not_run",
    };
    writeUpstashEnqueueProbeEvidence(doc, evidencePath);
    console.log("  FAIL — CONFIGURATION UNAVAILABLE.");
    return { exitCode: 1, overall: "FAIL", connectionFactoryCalls: 0 };
  }

  const startedAtIso = nowIso();
  let sql: HeadlessSqlExecutor | null = null;
  let tcpConsumer: UpstashLiveConsumerPort | null = null;
  let ownsTcpClose = false;
  let restClient: HeadlessUpstashRestClient | null =
    deps.injectedRestClient ?? null;
  let liveRedis: Redis | null = null;

  const failDoc = (input: {
    readonly stages: readonly EnqueueAttributionStageResult[];
    readonly failureStage: string | null;
    readonly failureReasonId: string | null;
    readonly cleanupStatus: UpstashEnqueueProbeEvidenceDocument["cleanupStatus"];
    readonly notes: readonly string[];
    readonly fingerprint?: UpstashLiveSchemaFingerprint | null;
    readonly eligibility?: string;
  }): UpstashEnqueueProbeEvidenceDocument => ({
    title: createNotTestedUpstashEnqueueProbeEvidence().title,
    overall: "FAIL",
    eligibilityVerdict: input.eligibility ?? ENQUEUE_PROBE_ELIGIBILITY.FAIL,
    startedAtIso,
    endedAtIso: nowIso(),
    failureStage: input.failureStage,
    failureReasonId: input.failureReasonId,
    stages: input.stages,
    schemaFingerprint: input.fingerprint ?? null,
    cleanupStatus: input.cleanupStatus,
    notes: [
      "Enqueue probe evidence — does not overwrite official live evidence.",
      ...input.notes,
    ],
  });

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else {
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) {
        writeUpstashEnqueueProbeEvidence(
          failDoc({
            stages: [],
            failureStage: null,
            failureReasonId: null,
            cleanupStatus: "not_run",
            notes: ["DATABASE_URL unreadable."],
            eligibility: ENQUEUE_PROBE_ELIGIBILITY.FAIL_CONFIG,
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
        writeUpstashEnqueueProbeEvidence(
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
    const streamNames = deriveHeadlessQueueStreamNames("staging");

    if (restClient == null && producerConfig != null) {
      connectionFactoryCalls += 1;
      deps.connectionProbe?.();
      liveRedis = new Redis({
        url: producerConfig.restUrl,
        token: producerConfig.restToken,
      });
      restClient = bindHeadlessUpstashRestClientFromRedis(liveRedis);
    }

    const restProducer: UpstashLiveProducerPort =
      deps.injectedRestProducer ??
      new UpstashRestQueueProducerAdapter({
        client: restClient ?? undefined,
        config: producerConfig ?? undefined,
        envName: "staging",
      });

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
    const lifecycle = createUpstashLifecycleTracking();
    const ctx: UpstashLiveMatrixContext = {
      runId,
      ownerId: `uq_ep_${runId.slice(0, 8)}`,
      otherOwnerId: `uq_ep_o_${runId.slice(0, 8)}`,
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
      streamQueue: composeStreamQueue(restProducer, tcpConsumer),
      streamNames,
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

    const restOps =
      restClient != null
        ? {
            xadd: restClient.xadd.bind(restClient),
            xtrim: restClient.xtrim.bind(restClient),
            streamKey: streamNames.renderStream,
          }
        : undefined;

    const attributed = await runAttributedRenderEnqueue({
      ctx,
      restOps,
      markCleanupSkipped: true,
    });

    if (!attributed.ok) {
      const cleanupStatus = await (deps.cleanupRunner ??
        defaultUpstashLiveCleanup)(ctx, false);
      writeUpstashEnqueueProbeEvidence(
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

    // Provider-backed read verify (exactly one XADD already performed).
    let readOk = false;
    if (deps.verifyStreamEntry != null) {
      readOk = await deps.verifyStreamEntry({
        streamKey: streamNames.renderStream,
        streamId: attributed.streamId,
      });
    } else if (liveRedis != null) {
      const range = await liveRedis.xrange(
        streamNames.renderStream,
        attributed.streamId,
        attributed.streamId,
        1,
      );
      readOk =
        range != null &&
        typeof range === "object" &&
        Object.keys(range as object).length > 0;
    } else {
      readOk = false;
    }

    if (!readOk) {
      const cleanupStatus = await (deps.cleanupRunner ??
        defaultUpstashLiveCleanup)(ctx, false);
      const stages = [
        ...attributed.stages.filter((s) => s.stage !== "cleanup"),
        {
          stage: "rest_response_validation" as const,
          status: "failed" as const,
          reasonId: "rest_response_invalid" as const,
        },
      ];
      writeUpstashEnqueueProbeEvidence(
        failDoc({
          stages,
          failureStage: "rest_response_validation",
          failureReasonId: "rest_response_invalid",
          cleanupStatus,
          fingerprint,
          notes: ["Provider-backed stream read verify failed."],
        }),
        evidencePath,
      );
      console.log("  FAIL — provider-backed read verify.");
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const cleanupStatus = await (deps.cleanupRunner ??
      defaultUpstashLiveCleanup)(ctx, false);
    if (cleanupStatus !== "ok" && cleanupStatus !== "preserved") {
      writeUpstashEnqueueProbeEvidence(
        failDoc({
          stages: attributed.stages,
          failureStage: "cleanup",
          failureReasonId: null,
          cleanupStatus,
          fingerprint,
          notes: ["Cleanup failed or left residue."],
          eligibility: ENQUEUE_PROBE_ELIGIBILITY.FAIL_CLEANUP,
        }),
        evidencePath,
      );
      console.log("  FAIL — cleanup.");
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const passDoc: UpstashEnqueueProbeEvidenceDocument = {
      title: createNotTestedUpstashEnqueueProbeEvidence().title,
      overall: "PASS",
      eligibilityVerdict: ENQUEUE_PROBE_ELIGIBILITY.PASS,
      startedAtIso,
      endedAtIso: nowIso(),
      failureStage: null,
      failureReasonId: null,
      stages: attributed.stages.map((s) =>
        s.stage === "cleanup" ? { stage: "cleanup", status: "ok" } : s,
      ),
      schemaFingerprint: fingerprint,
      cleanupStatus,
      notes: [
        "Enqueue probe evidence — does not overwrite official live evidence.",
        "Exactly one REST XADD; provider-backed read verified; cleanup ok.",
        attributed.trimBestEffortFailed
          ? "XTRIM best-effort failed (non-fatal)."
          : "XTRIM best-effort ok or not separately observed.",
      ],
    };

    const passAuth = enqueueProbeCannotFalsePass(passDoc);
    if (!passAuth.ok) {
      writeUpstashEnqueueProbeEvidence(
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

    writeUpstashEnqueueProbeEvidence(passDoc, evidencePath);
    console.log("  PASS — targeted enqueue probe.");
    return { exitCode: 0, overall: "PASS", connectionFactoryCalls };
  } catch {
    writeUpstashEnqueueProbeEvidence(
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
