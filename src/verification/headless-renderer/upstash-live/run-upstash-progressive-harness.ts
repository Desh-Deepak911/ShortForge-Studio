/**
 * Gated progressive Upstash dual-lease diagnostic harness (Sprint 11E 2D.1D).
 * SAME DEFAULT_UPSTASH_LIVE_CASE_RUNNERS as the official harness — no stubs.
 * Gate: HEADLESS_UPSTASH_QA_PROGRESSIVE=1
 * Optional: HEADLESS_UPSTASH_QA_PROGRESSIVE_STOP_AFTER=<caseId>
 * Evidence: docs/HEADLESS_11E_UPSTASH_PROGRESSIVE_DIAGNOSTIC.md
 * Never overwrites official LIVE_EVIDENCE. Never migrates.
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
  readHeadlessQueueLeaseSettings,
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
  fingerprintFromPreflight,
  validatePassUpstashLiveEvidence,
} from "./evidence-authority";
import type { UpstashLiveCaseEvidence, UpstashLiveEvidenceDocument } from "./evidence";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "./live-fixtures";
import {
  DEFAULT_UPSTASH_LIVE_CASE_RUNNERS,
  runUpstashLiveMatrix,
  type UpstashLiveCaseRunner,
} from "./live-matrix";
import {
  createNotTestedUpstashProgressiveEvidence,
  defaultUpstashProgressiveEvidencePath,
  preserveOrInitializeUpstashProgressiveEvidence,
  progressiveCannotFalsePass,
  UPSTASH_PROGRESSIVE_EVIDENCE_TITLE,
  writeUpstashProgressiveEvidence,
} from "./progressive-evidence";
import {
  assertExactRequiredUpstashLiveCasePassAuthority,
  assertExactRequiredUpstashLiveCasePrefixFailAuthority,
  isRequiredUpstashLiveCaseId,
  REQUIRED_UPSTASH_LIVE_CASE_IDS,
  validateUpstashLiveCaseEvidenceShape,
  type RequiredUpstashLiveCaseId,
} from "./required-cases";
import { assertDefaultUpstashLiveRunnersAreNotStubs } from "./stub-boundary";
import type {
  UpstashLiveConsumerPort,
  UpstashLiveMatrixContext,
  UpstashLiveProducerPort,
  UpstashLiveSchemaFingerprint,
} from "./types";

export type UpstashProgressiveHarnessExit =
  | { readonly exitCode: 0; readonly overall: "NOT_TESTED" | "PASS" }
  | {
      readonly exitCode: 1;
      readonly overall: "FAIL" | "CONFIGURATION_UNAVAILABLE";
    };

export type UpstashProgressiveHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly writeEvidence?: typeof writeUpstashProgressiveEvidence;
  readonly preserveEvidence?: typeof preserveOrInitializeUpstashProgressiveEvidence;
  readonly nowIso?: () => string;
  readonly forceGateOn?: boolean;
  readonly assumeConfigured?: boolean;
  readonly skipStubCheck?: boolean;
  readonly stubCheck?: typeof assertDefaultUpstashLiveRunnersAreNotStubs;
  readonly preserveQaRows?: boolean;
  readonly connectionProbe?: () => void;
  readonly injectedSql?: HeadlessSqlExecutor;
  readonly injectedRestProducer?: UpstashLiveProducerPort;
  readonly injectedRestClient?: HeadlessUpstashRestClient;
  readonly injectedTcpConsumer?: UpstashLiveConsumerPort;
  readonly injectedJobStore?: HeadlessJobStorePort;
  readonly injectedOwnedObjectStore?: HeadlessOwnedObjectStorePort;
  readonly injectedProjectAuthorization?: HeadlessProjectAuthorizationPort;
  readonly injectedStreamQueue?: HeadlessStreamQueuePort;
  readonly injectedFingerprint?: UpstashLiveSchemaFingerprint;
  readonly runSchemaPreflight?: typeof runHeadlessSchemaPreflight;
  readonly cleanupRunner?: (
    ctx: UpstashLiveMatrixContext,
    preserve?: boolean,
  ) => Promise<"ok" | "failed" | "preserved">;
  readonly caseRunners?: Readonly<
    Partial<Record<RequiredUpstashLiveCaseId, UpstashLiveCaseRunner>>
  >;
  readonly deadlineMs?: number;
  readonly qaIdleMs?: number;
  readonly stopAfterCaseId?: RequiredUpstashLiveCaseId;
};

function isProgressiveGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_UPSTASH_QA_PROGRESSIVE === "1";
  } catch {
    return false;
  }
}

function isPreserveFlag(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_UPSTASH_QA_PRESERVE === "1";
  } catch {
    return false;
  }
}

function readStopAfter(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): RequiredUpstashLiveCaseId | null {
  try {
    const raw = (env as Record<string, unknown>)
      .HEADLESS_UPSTASH_QA_PROGRESSIVE_STOP_AFTER;
    if (typeof raw !== "string" || raw.length === 0) return null;
    return isRequiredUpstashLiveCaseId(raw) ? raw : null;
  } catch {
    return null;
  }
}

function sanitizeCases(
  cases: readonly unknown[],
): readonly UpstashLiveCaseEvidence[] {
  const out: UpstashLiveCaseEvidence[] = [];
  for (const raw of cases) {
    const v = validateUpstashLiveCaseEvidenceShape(raw);
    if (v.ok) out.push(v.case);
  }
  return Object.freeze(out.slice());
}

function productionLeaseSettings(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): HeadlessQueueLeaseSettings {
  return (
    readHeadlessQueueLeaseSettings(env) ?? {
      deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
      renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
      verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
      verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
    }
  );
}

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

export async function runUpstashProgressiveHarness(
  deps: UpstashProgressiveHarnessDeps = {},
): Promise<UpstashProgressiveHarnessExit> {
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultUpstashProgressiveEvidencePath();
  const write = deps.writeEvidence ?? writeUpstashProgressiveEvidence;
  const preserve =
    deps.preserveEvidence ?? preserveOrInitializeUpstashProgressiveEvidence;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());

  const gateOn = deps.forceGateOn === true || isProgressiveGateOn(env);

  if (!gateOn) {
    void preserve(evidencePath);
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const stopAfter =
    deps.stopAfterCaseId ?? readStopAfter(env) ?? undefined;
  if (
    (env as Record<string, unknown>).HEADLESS_UPSTASH_QA_PROGRESSIVE_STOP_AFTER !=
      null &&
    (env as Record<string, unknown>).HEADLESS_UPSTASH_QA_PROGRESSIVE_STOP_AFTER !==
      "" &&
    stopAfter == null &&
    deps.stopAfterCaseId == null
  ) {
    write(
      {
        ...createNotTestedUpstashProgressiveEvidence([
          "HEADLESS_UPSTASH_QA_PROGRESSIVE_STOP_AFTER must be a required case id.",
        ]),
        overall: "FAIL",
        eligibilityVerdict: "CONFIGURATION_UNAVAILABLE",
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
      },
      evidencePath,
    );
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const neonStatus = classifyHeadlessNeonEnvironment(env);
  const producerStatus = classifyHeadlessUpstashProducerEnvironment(env);
  const consumerStatus = classifyHeadlessUpstashConsumerEnvironment(env);
  const envName = (env as Record<string, unknown>).HEADLESS_ENV_NAME;

  if (
    !deps.assumeConfigured &&
    (neonStatus !== "configured" ||
      producerStatus !== "configured" ||
      consumerStatus !== "configured" ||
      envName !== "staging")
  ) {
    write(
      {
        ...createNotTestedUpstashProgressiveEvidence([
          "Gate on but environment incomplete or HEADLESS_ENV_NAME != staging.",
        ]),
        overall: "FAIL",
        eligibilityVerdict: "CONFIGURATION_UNAVAILABLE",
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
      },
      evidencePath,
    );
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  if (deps.skipStubCheck !== true) {
    const check = deps.stubCheck ?? assertDefaultUpstashLiveRunnersAreNotStubs;
    const stubs = check();
    if (!stubs.ok) {
      return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
    }
  }

  const startedAtIso = nowIso();
  const deadlineMs = deps.deadlineMs ?? Date.now() + 120_000;
  const abort = new AbortController();

  let sql: HeadlessSqlExecutor | null = null;
  let tcpConsumer: UpstashLiveConsumerPort | null = null;
  let ownsTcpClose = false;

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else {
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) {
        write(
          {
            ...createNotTestedUpstashProgressiveEvidence([
              "DATABASE_URL unreadable.",
            ]),
            overall: "FAIL",
            eligibilityVerdict: "CONFIGURATION_UNAVAILABLE",
            startedAtIso,
            endedAtIso: nowIso(),
            cleanupStatus: "not_run",
          },
          evidencePath,
        );
        return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
      }
      sql = createNeonSqlExecutor({ connectionString });
    }

    let fingerprint: UpstashLiveSchemaFingerprint;
    if (deps.injectedFingerprint != null) {
      fingerprint = deps.injectedFingerprint;
    } else {
      const runPreflight = deps.runSchemaPreflight ?? runHeadlessSchemaPreflight;
      const preflight = await runPreflight({ sql });
      if (!preflight.ok) {
        write(
          {
            ...createNotTestedUpstashProgressiveEvidence([
              "Schema preflight failed before Upstash contact.",
            ]),
            overall: "FAIL",
            eligibilityVerdict: `NOT ELIGIBLE — schema preflight ${preflight.code}.`,
            startedAtIso,
            endedAtIso: nowIso(),
            cleanupStatus: "not_run",
          },
          evidencePath,
        );
        return { exitCode: 1, overall: "FAIL" };
      }
      fingerprint = fingerprintFromPreflight(preflight.fingerprint);
    }

    deps.connectionProbe?.();

    const producerConfig = readConfiguredHeadlessUpstashProducerConfig(env);
    const consumerConfig = readConfiguredHeadlessUpstashConsumerConfig(env);

    if (deps.injectedTcpConsumer != null) {
      tcpConsumer = deps.injectedTcpConsumer;
      ownsTcpClose = false;
    } else {
      tcpConsumer = new UpstashTcpStreamConsumerAdapter({
        config: consumerConfig ?? undefined,
        envName: "staging",
      });
      ownsTcpClose = true;
    }

    const runId = randomUUID();
    let harnessRestClient: HeadlessUpstashRestClient | null =
      deps.injectedRestClient ?? null;
    if (harnessRestClient == null && producerConfig != null) {
      harnessRestClient = bindHeadlessUpstashRestClientFromRedis(
        new Redis({
          url: producerConfig.restUrl,
          token: producerConfig.restToken,
        }),
      );
    }
    const scoped = await composeQaRunScopedHarnessPorts({
      envName: "staging",
      runId,
      redis: tcpConsumer,
      restClient: harnessRestClient,
    });
    if (scoped == null) {
      writeUpstashProgressiveEvidence(
        {
          ...createNotTestedUpstashProgressiveEvidence(),
          overall: "FAIL",
          startedAtIso,
          endedAtIso: new Date().toISOString(),
          cleanupStatus: "not_run",
          schemaFingerprint: fingerprint,
          cases: [
            {
              caseId: "stream.names",
              status: "FAIL",
              failureCategory: "STREAM_NAMES_FAILED",
            },
          ],
        },
        evidencePath,
      );
      return { exitCode: 1, overall: "FAIL" };
    }

    const restProducer: UpstashLiveProducerPort =
      deps.injectedRestProducer ?? scoped.restProducer;

    const jobStore: HeadlessJobStorePort =
      deps.injectedJobStore ?? new NeonHeadlessJobStoreAdapter(sql);
    const ownedObjectStore: HeadlessOwnedObjectStorePort =
      deps.injectedOwnedObjectStore ??
      new NeonHeadlessOwnedObjectStoreAdapter(sql);
    const projectAuthorization: HeadlessProjectAuthorizationPort =
      deps.injectedProjectAuthorization ??
      new NeonHeadlessProjectAuthorizationAdapter(sql);

    const streamQueue =
      deps.injectedStreamQueue ??
      composeStreamQueue(restProducer, tcpConsumer, scoped.dlqWriter);

    const leaseSettings = productionLeaseSettings(env);
    Object.freeze(leaseSettings);
    const lifecycle = createUpstashLifecycleTracking();

    const ctx: UpstashLiveMatrixContext = {
      runId,
      ownerId: `uq_owner_${runId.slice(0, 8)}`,
      otherOwnerId: `uq_other_${runId.slice(0, 8)}`,
      projectId: randomUUID(),
      env,
      nowMs: Date.now(),
      leaseSettings,
      qaIdleMs: deps.qaIdleMs ?? 50,
      sql,
      jobStore,
      ownedObjectStore,
      projectAuthorization,
      restProducer,
      tcpConsumer,
      streamQueue,
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
      abortSignal: abort.signal,
      deadlineMs,
    };

    const rawCases = await runUpstashLiveMatrix(
      ctx,
      deps.caseRunners ?? DEFAULT_UPSTASH_LIVE_CASE_RUNNERS,
      stopAfter != null ? { stopAfterCaseId: stopAfter } : undefined,
    );
    const cases = sanitizeCases(rawCases);

    const preserveRows =
      deps.preserveQaRows === true || isPreserveFlag(env);
    const cleanupRunner = deps.cleanupRunner ?? defaultUpstashLiveCleanup;
    const cleanupStatus = await cleanupRunner(ctx, preserveRows);

    const endedAtIso = nowIso();
    const membership = assertExactRequiredUpstashLiveCasePassAuthority(cases);
    const allPass =
      membership.ok &&
      (cleanupStatus === "ok" || cleanupStatus === "preserved") &&
      stopAfter == null;

    const notes = [
      "Progressive harness — same DEFAULT_UPSTASH_LIVE_CASE_RUNNERS as official.",
      "Harness never migrates and never uses DATABASE_URL_UNPOOLED.",
      "Matrix stops on first failure; remaining cases are NOT_TESTED.",
      "Does not overwrite docs/HEADLESS_11E_UPSTASH_LIVE_EVIDENCE.md.",
      "QA-isolated pending clear does not prove production-group pending removal.",
      "consume.claim.ack uses production-group isolation authority.",
      stopAfter != null
        ? `Progressive stop-after=${stopAfter} — not eligible for full-matrix PASS.`
        : "Full progressive matrix (no stop-after).",
    ];

    if (allPass) {
      const doc: UpstashLiveEvidenceDocument = {
        title: UPSTASH_PROGRESSIVE_EVIDENCE_TITLE,
        overall: "PASS",
        eligibilityVerdict:
          "ELIGIBLE — exact 22/22 PASS with Neon fingerprint + protocol + cleanup.",
        startedAtIso,
        endedAtIso,
        cases,
        schemaFingerprint: fingerprint,
        cleanupStatus,
        notes,
      };
      const falsePass = progressiveCannotFalsePass({
        cases,
        cleanupStatus,
        claimedOverall: "PASS",
      });
      if (!falsePass.ok) {
        write(
          {
            ...doc,
            overall: "FAIL",
            eligibilityVerdict: `PASS authority rejected: ${falsePass.message}`,
          },
          evidencePath,
        );
        return { exitCode: 1, overall: "FAIL" };
      }
      const authority = validatePassUpstashLiveEvidence(doc);
      if (!authority.ok) {
        write(
          {
            ...doc,
            overall: "FAIL",
            eligibilityVerdict: `PASS authority rejected: ${authority.message}`,
          },
          evidencePath,
        );
        return { exitCode: 1, overall: "FAIL" };
      }
      write(doc, evidencePath);
      return { exitCode: 0, overall: "PASS" };
    }

    const prefix = assertExactRequiredUpstashLiveCasePrefixFailAuthority(cases);
    const stopAfterPass =
      stopAfter != null &&
      cases.some((c) => c.caseId === stopAfter && c.status === "PASS") &&
      !cases.some((c) => c.status === "FAIL");

    const doc: UpstashLiveEvidenceDocument = {
      title: UPSTASH_PROGRESSIVE_EVIDENCE_TITLE,
      overall: "FAIL",
      eligibilityVerdict: stopAfterPass
        ? `NOT ELIGIBLE — progressive stop-after ${stopAfter} (prefix PASS then NOT_TESTED).`
        : prefix.ok
          ? `NOT ELIGIBLE — prefix-FAIL at ${prefix.failedCaseId}.`
          : cleanupStatus === "failed"
            ? "NOT ELIGIBLE — cleanup failed."
            : "NOT ELIGIBLE — one or more required cases failed.",
      startedAtIso,
      endedAtIso,
      cases,
      schemaFingerprint: fingerprint,
      cleanupStatus,
      notes,
    };
    write(doc, evidencePath);
    return { exitCode: 1, overall: "FAIL" };
  } finally {
    abort.abort();
    if (ownsTcpClose && tcpConsumer != null && tcpConsumer.close) {
      try {
        await tcpConsumer.close();
      } catch {
        // ignore
      }
    }
    void REQUIRED_UPSTASH_LIVE_CASE_IDS;
    void deadlineMs;
  }
}
