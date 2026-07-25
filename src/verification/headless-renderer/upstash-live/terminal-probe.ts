/**
 * QA-only targeted Upstash terminal no-op probe — Sprint 11E Phase 2D.1C.
 * Chain: env → Neon preflight → ownership → queued job → terminal CAS →
 * authoritative reread → one REST enqueue → exact-delivery match →
 * terminal consume (zero claim) → pending clear → Neon immutability → cleanup.
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
import { fingerprintFromPreflight } from "./evidence-authority";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "./live-fixtures";
import {
  runAttributedTerminalNoopConsume,
  type TerminalAttributionStageResult,
} from "./terminal-attribution";
import {
  createNotTestedUpstashTerminalProbeEvidence,
  defaultUpstashTerminalProbeEvidencePath,
  TERMINAL_PROBE_ELIGIBILITY,
  preserveOrInitializeUpstashTerminalProbeEvidence,
  terminalProbeCannotFalsePass,
  writeUpstashTerminalProbeEvidence,
  type UpstashTerminalProbeEvidenceDocument,
} from "./terminal-probe-evidence";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveMatrixContext,
  UpstashLiveProducerPort,
  UpstashLiveSchemaFingerprint,
} from "./types";

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  return (
    (env as Record<string, unknown>).HEADLESS_UPSTASH_QA_TERMINAL_PROBE === "1"
  );
}

const PRODUCTION_LEASES: HeadlessQueueLeaseSettings = Object.freeze({
  deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
});

export type UpstashTerminalProbeDeps = {
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

export async function runUpstashTerminalProbe(
  deps: UpstashTerminalProbeDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: UpstashTerminalProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
}> {
  console.log(
    "\nSprint 11E Phase 2D.1C — Upstash targeted terminal no-op probe\n",
  );
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultUpstashTerminalProbeEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  let connectionFactoryCalls = 0;

  if (!deps.forceGateOn && !isGateOn(env)) {
    const preserved = preserveOrInitializeUpstashTerminalProbeEvidence(
      evidencePath,
    );
    console.log(
      "  NOT TESTED — set HEADLESS_UPSTASH_QA_TERMINAL_PROBE=1 with Neon+Upstash staging.",
    );
    console.log(
      `  Terminal-probe evidence ${preserved.action} (overall=${preserved.overall}). Zero connections.`,
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
    const doc: UpstashTerminalProbeEvidenceDocument = {
      ...createNotTestedUpstashTerminalProbeEvidence([
        "Terminal probe evidence — does not overwrite official live evidence.",
        "CONFIGURATION UNAVAILABLE — no connection attempted.",
      ]),
      overall: "FAIL",
      eligibilityVerdict: TERMINAL_PROBE_ELIGIBILITY.FAIL_CONFIG,
      startedAtIso: nowIso(),
      endedAtIso: nowIso(),
      cleanupStatus: "not_run",
    };
    writeUpstashTerminalProbeEvidence(doc, evidencePath);
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
    readonly stages: readonly TerminalAttributionStageResult[];
    readonly failureStage: string | null;
    readonly failureReasonId: string | null;
    readonly cleanupStatus: UpstashTerminalProbeEvidenceDocument["cleanupStatus"];
    readonly notes: readonly string[];
    readonly fingerprint?: UpstashLiveSchemaFingerprint | null;
    readonly eligibility?: string;
  }): UpstashTerminalProbeEvidenceDocument => ({
    title: createNotTestedUpstashTerminalProbeEvidence().title,
    overall: "FAIL",
    eligibilityVerdict: input.eligibility ?? TERMINAL_PROBE_ELIGIBILITY.FAIL,
    startedAtIso,
    endedAtIso: nowIso(),
    failureStage: input.failureStage,
    failureReasonId: input.failureReasonId,
    stages: input.stages,
    schemaFingerprint: input.fingerprint ?? null,
    cleanupStatus: input.cleanupStatus,
    notes: [
      "Terminal probe evidence — does not overwrite official live evidence.",
      ...input.notes,
    ],
  });

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else {
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) {
        writeUpstashTerminalProbeEvidence(
          failDoc({
            stages: [],
            failureStage: null,
            failureReasonId: null,
            cleanupStatus: "not_run",
            notes: ["DATABASE_URL unreadable."],
            eligibility: TERMINAL_PROBE_ELIGIBILITY.FAIL_CONFIG,
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
        writeUpstashTerminalProbeEvidence(
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
      const liveRedis = new Redis({
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
      ownerId: `uq_tp_${runId.slice(0, 8)}`,
      otherOwnerId: `uq_tp_o_${runId.slice(0, 8)}`,
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

    const attributed = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });

    if (!attributed.ok) {
      const cleanupStatus = await (deps.cleanupRunner ??
        defaultUpstashLiveCleanup)(ctx, false);
      writeUpstashTerminalProbeEvidence(
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

    if (attributed.claimQueuedJobCallCount !== 0) {
      const cleanupStatus = await (deps.cleanupRunner ??
        defaultUpstashLiveCleanup)(ctx, false);
      writeUpstashTerminalProbeEvidence(
        failDoc({
          stages: attributed.stages,
          failureStage: "redis_ack",
          failureReasonId: "terminal_consume_failed",
          cleanupStatus,
          fingerprint,
          notes: ["Terminal path invoked claimQueuedJob (forbidden)."],
        }),
        evidencePath,
      );
      console.log("  FAIL — claimQueuedJob called on terminal path.");
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const cleanupStatus = await (deps.cleanupRunner ??
      defaultUpstashLiveCleanup)(ctx, false);
    if (cleanupStatus !== "ok" && cleanupStatus !== "preserved") {
      writeUpstashTerminalProbeEvidence(
        failDoc({
          stages: attributed.stages,
          failureStage: "cleanup",
          failureReasonId: null,
          cleanupStatus,
          fingerprint,
          notes: ["Cleanup failed or left residue."],
          eligibility: TERMINAL_PROBE_ELIGIBILITY.FAIL_CLEANUP,
        }),
        evidencePath,
      );
      console.log("  FAIL — cleanup.");
      return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
    }

    const passDoc: UpstashTerminalProbeEvidenceDocument = {
      title: createNotTestedUpstashTerminalProbeEvidence().title,
      overall: "PASS",
      eligibilityVerdict: TERMINAL_PROBE_ELIGIBILITY.PASS,
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
        "Terminal probe evidence — does not overwrite official live evidence.",
        "Exact-delivery match; acked_noop_terminal; zero claimQueuedJob; immutability + cleanup ok.",
      ],
    };

    const passAuth = terminalProbeCannotFalsePass(passDoc);
    if (!passAuth.ok) {
      writeUpstashTerminalProbeEvidence(
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

    writeUpstashTerminalProbeEvidence(passDoc, evidencePath);
    console.log("  PASS — targeted terminal no-op probe.");
    return { exitCode: 0, overall: "PASS", connectionFactoryCalls };
  } catch {
    writeUpstashTerminalProbeEvidence(
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
