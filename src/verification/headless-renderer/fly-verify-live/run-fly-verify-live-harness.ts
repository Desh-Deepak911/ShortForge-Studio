/**
 * Gated hosted Fly verifier live QA harness.
 * Gate: HEADLESS_FLY_VERIFY_QA=1
 *
 * Uses production shared staging verify stream — hosted worker is sole consumer.
 * Never invokes local verification. Never stops/redeploys the verify Machine.
 * Gate-off → zero provider connections; preserve prior PASS/FAIL evidence.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { R2UploadCapabilityAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-upload-capability.adapter";
import { NeonHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/neon-render-dispatch-outbox.adapter";
import { UpstashRestQueueProducerAdapter } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import type { HeadlessUpstashRestClient } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import {
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import { readConfiguredHeadlessR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import {
  readConfiguredHeadlessUpstashConsumerConfig,
  readConfiguredHeadlessUpstashProducerConfig,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import type { HeadlessProjectAuthorizationPort } from "@/features/headless-renderer/control-plane/ports/project-authorization.port";
import type { HeadlessRenderDispatchOutboxPort } from "@/features/headless-renderer/control-plane/ports/render-dispatch-outbox.port";
import type { HeadlessR2ObjectIOPort } from "@/features/headless-renderer/control-plane/ports/r2-object-io.port";
import type { HeadlessUploadCapabilityPort } from "@/features/headless-renderer/control-plane/ports/upload-capability.port";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessOwnedObjectStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import {
  HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import {
  rejectOperatorSuppliedFlyStagingImageDigestOverride,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import {
  parseHeadlessFlyStagingVerifyMachineFromListJson,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secret-activation";
import { parseHeadlessFlyStagingMachineListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-machine-authority";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import type {
  UpstashLiveConsumerPort,
  UpstashLiveProducerPort,
} from "../upstash-live/types";

import { defaultFlyVerifyLiveCleanup } from "./cleanup";
import {
  buildFlyVerifyLiveSchemaFingerprint,
  FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
  validatePassFlyVerifyLiveEvidence,
} from "./evidence-authority";
import {
  createNotTestedFlyVerifyLiveEvidence,
  defaultFlyVerifyLiveEvidencePath,
  preserveOrInitializeFlyVerifyLiveEvidence,
  writeFlyVerifyLiveEvidence,
  type FlyVerifyLiveCaseEvidence,
  type FlyVerifyLiveEvidenceDocument,
} from "./evidence";
import { emptyFlyVerifyLiveSession } from "./types";
import {
  DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS,
  runFlyVerifyLiveMatrix,
  type FlyVerifyLiveCaseRunner,
} from "./live-matrix";
import {
  assertExactRequiredFlyVerifyLiveCasePassAuthority,
  assertExactRequiredFlyVerifyLiveCasePrefixFailAuthority,
  REQUIRED_FLY_VERIFY_LIVE_CASE_IDS,
  validateFlyVerifyLiveCaseEvidenceShape,
} from "./required-cases";
import {
  attributeFlyVerifyLiveEnvironment,
  isFlyVerifyLiveGateEnvironmentEligible,
  isFlyVerifyLiveInjectedProvidersOnly,
  validateFlyVerifyLiveQaEnvContract,
} from "./qa-secret-contract";
import { assertDefaultFlyVerifyLiveRunnersAreNotStubs } from "./stub-boundary";
import type {
  FlyVerifyLiveMatrixContext,
  FlyVerifyLiveSchemaFingerprint,
} from "./types";

const execFileAsync = promisify(execFile);

export type FlyVerifyLiveHarnessExit =
  | { readonly exitCode: 0; readonly overall: "NOT_TESTED" | "PASS" }
  | {
      readonly exitCode: 1;
      readonly overall: "FAIL" | "CONFIGURATION_UNAVAILABLE";
    };

export type FlyVerifyLiveHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly writeEvidence?: typeof writeFlyVerifyLiveEvidence;
  readonly preserveEvidence?: typeof preserveOrInitializeFlyVerifyLiveEvidence;
  readonly nowIso?: () => string;
  readonly forceGateOn?: boolean;
  readonly skipStubCheck?: boolean;
  readonly stubCheck?: typeof assertDefaultFlyVerifyLiveRunnersAreNotStubs;
  readonly preserveQaRows?: boolean;
  readonly connectionProbe?: () => void;
  readonly injectedSql?: HeadlessSqlExecutor;
  readonly injectedRestProducer?: UpstashLiveProducerPort;
  readonly injectedRestClient?: HeadlessUpstashRestClient;
  readonly injectedTcpConsumer?: UpstashLiveConsumerPort;
  readonly injectedJobStore?: HeadlessJobStorePort;
  readonly injectedOwnedObjectStore?: HeadlessOwnedObjectStorePort;
  readonly injectedProjectAuthorization?: HeadlessProjectAuthorizationPort;
  readonly injectedDispatchOutbox?: HeadlessRenderDispatchOutboxPort;
  readonly injectedIo?: HeadlessR2ObjectIOPort;
  readonly injectedUploadCapability?: HeadlessUploadCapabilityPort;
  readonly injectedFingerprint?: FlyVerifyLiveSchemaFingerprint;
  readonly runSchemaPreflight?: typeof runHeadlessSchemaPreflight;
  readonly cleanupRunner?: (
    ctx: FlyVerifyLiveMatrixContext,
    preserve?: boolean,
  ) => Promise<"ok" | "failed" | "preserved">;
  readonly caseRunners?: Readonly<
    Partial<
      Record<
        (typeof REQUIRED_FLY_VERIFY_LIVE_CASE_IDS)[number],
        FlyVerifyLiveCaseRunner
      >
    >
  >;
  readonly readFlyTopology?: FlyVerifyLiveMatrixContext["readFlyTopology"];
  readonly pollHostedVerifier?: FlyVerifyLiveMatrixContext["pollHostedVerifier"];
};

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_FLY_VERIFY_QA === "1";
  } catch {
    return false;
  }
}

function isPreserveFlag(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_FLY_VERIFY_QA_PRESERVE === "1";
  } catch {
    return false;
  }
}

function sanitizeCases(
  cases: readonly unknown[],
): readonly FlyVerifyLiveCaseEvidence[] {
  const out: FlyVerifyLiveCaseEvidence[] = [];
  for (const raw of cases) {
    const v = validateFlyVerifyLiveCaseEvidenceShape(raw);
    if (v.ok) out.push(v.case);
  }
  return Object.freeze(out.slice());
}

async function defaultReadFlyTopology(
  appName: string,
): Promise<{
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly region: string;
  readonly verifyMachineId: string | null;
  readonly imageDigestSha256: string | null;
}> {
  const { stdout } = await execFileAsync(
    "fly",
    ["machine", "list", "-a", appName, "--json"],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const parsed = parseHeadlessFlyStagingMachineListJson(stdout);
  if (parsed.status !== "ok" || parsed.inventory == null) {
    return {
      verifyCount: 0,
      renderCount: 0,
      region: "",
      verifyMachineId: null,
      imageDigestSha256: null,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(stdout.trim());
  } catch {
    json = [];
  }
  const verifyMachine = parseHeadlessFlyStagingVerifyMachineFromListJson(json);
  return {
    verifyCount: parsed.inventory.verifyCount,
    renderCount: parsed.inventory.renderCount,
    region: verifyMachine?.region ?? "",
    verifyMachineId: verifyMachine?.machineId ?? null,
    imageDigestSha256: verifyMachine?.imageDigestSha256 ?? null,
  };
}

function mergeTailCases(
  prefix: readonly FlyVerifyLiveCaseEvidence[],
  tail: readonly FlyVerifyLiveCaseEvidence[],
): readonly FlyVerifyLiveCaseEvidence[] {
  const byId = new Map(prefix.map((c) => [c.caseId, c]));
  for (const c of tail) {
    byId.set(c.caseId, c);
  }
  return Object.freeze(
    REQUIRED_FLY_VERIFY_LIVE_CASE_IDS.map((id) => {
      const c = byId.get(id);
      return c ?? { caseId: id, status: "NOT_TESTED" as const };
    }),
  );
}

export async function runFlyVerifyLiveHarness(
  deps: FlyVerifyLiveHarnessDeps = {},
): Promise<FlyVerifyLiveHarnessExit> {
  const env = deps.env ?? process.env;
  const evidencePath = deps.evidencePath ?? defaultFlyVerifyLiveEvidencePath();
  const write = deps.writeEvidence ?? writeFlyVerifyLiveEvidence;
  const preserve =
    deps.preserveEvidence ?? preserveOrInitializeFlyVerifyLiveEvidence;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const gateOn = deps.forceGateOn === true || isGateOn(env);

  if (!gateOn) {
    void preserve({ evidencePath });
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const configAttribution = attributeFlyVerifyLiveEnvironment(env);
  const envContract = validateFlyVerifyLiveQaEnvContract(env);
  const appName = (env as Record<string, unknown>).HEADLESS_FLY_STAGING_APP_NAME;

  if (!isFlyVerifyLiveGateEnvironmentEligible(env)) {
    const notes = [
      "Gate on but environment incomplete, QA secret contract mismatch, or staging app mismatch.",
      envContract.ok
        ? "Eleven-key QA secret membership satisfied."
        : `QA secret contract rejected (${envContract.failClass}).`,
      "Production Neon, R2, Upstash REST, and Upstash TCP classifiers exercised — no provider contact.",
    ];
    write({
      evidencePath,
      document: {
        ...createNotTestedFlyVerifyLiveEvidence(notes),
        overall: "FAIL",
        eligibilityVerdict: "CONFIGURATION_UNAVAILABLE",
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
        configAttribution,
      },
    });
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const digestOverride = rejectOperatorSuppliedFlyStagingImageDigestOverride(env);
  if (!digestOverride.ok) {
    write({
      evidencePath,
      document: {
        ...createNotTestedFlyVerifyLiveEvidence([
          "Operator-supplied accepted image digest override is forbidden.",
        ]),
        overall: "FAIL",
        eligibilityVerdict: "CONFIGURATION_UNAVAILABLE",
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
        configAttribution,
      },
    });
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const injectedOnly = isFlyVerifyLiveInjectedProvidersOnly(deps);

  if (deps.skipStubCheck !== true) {
    const check = deps.stubCheck ?? assertDefaultFlyVerifyLiveRunnersAreNotStubs;
    const stubs = check();
    if (!stubs.ok) {
      return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
    }
  }

  const startedAtIso = nowIso();
  let sql: HeadlessSqlExecutor | null = null;
  let tcpConsumer: UpstashLiveConsumerPort | null = null;
  let ownsTcpClose = false;
  let matrixCtx: FlyVerifyLiveMatrixContext | null = null;
  let fingerprint: FlyVerifyLiveSchemaFingerprint | null = null;
  let prefixCases: readonly FlyVerifyLiveCaseEvidence[] = [];
  let tailCases: readonly FlyVerifyLiveCaseEvidence[] = [];
  let cleanupStatus: FlyVerifyLiveEvidenceDocument["cleanupStatus"] = "not_run";
  let matrixError: unknown = null;
  let gateExecutionStarted = false;

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else if (injectedOnly) {
      write({
        evidencePath,
        document: {
          ...createNotTestedFlyVerifyLiveEvidence([
            "Injected-provider path requires injectedSql.",
          ]),
          overall: "FAIL",
          eligibilityVerdict: "CONFIGURATION_UNAVAILABLE",
          startedAtIso,
          endedAtIso: nowIso(),
          cleanupStatus: "not_run",
          configAttribution,
        },
      });
      return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
    } else {
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) {
        write({
          evidencePath,
          document: {
            ...createNotTestedFlyVerifyLiveEvidence(["DATABASE_URL unreadable."]),
            overall: "FAIL",
            eligibilityVerdict: "CONFIGURATION_UNAVAILABLE",
            startedAtIso,
            endedAtIso: nowIso(),
            cleanupStatus: "not_run",
          },
        });
        return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
      }
      sql = createNeonSqlExecutor({ connectionString });
    }

    let fp: FlyVerifyLiveSchemaFingerprint;
    if (deps.injectedFingerprint != null) {
      fp = deps.injectedFingerprint;
    } else {
      const runPreflight = deps.runSchemaPreflight ?? runHeadlessSchemaPreflight;
      const preflight = await runPreflight({ sql });
      if (!preflight.ok) {
        write({
          evidencePath,
          document: {
            ...createNotTestedFlyVerifyLiveEvidence([
              "Schema preflight failed before provider contact.",
            ]),
            overall: "FAIL",
            eligibilityVerdict: `NOT ELIGIBLE — schema preflight ${preflight.code}.`,
            startedAtIso,
            endedAtIso: nowIso(),
            cleanupStatus: "not_run",
            cases: [
              {
                caseId: "neon.schema_fingerprint",
                status: "FAIL",
                failureCategory: "SCHEMA_FINGERPRINT_FAILED",
              },
            ],
          },
        });
        return { exitCode: 1, overall: "FAIL" };
      }
      fp = buildFlyVerifyLiveSchemaFingerprint();
    }
    fingerprint = fp;

    deps.connectionProbe?.();

    const r2Config = readConfiguredHeadlessR2Config(env);
    const producerConfig = readConfiguredHeadlessUpstashProducerConfig(env);
    const consumerConfig = readConfiguredHeadlessUpstashConsumerConfig(env);
    if (r2Config == null || producerConfig == null || consumerConfig == null) {
      write({
        evidencePath,
        document: {
          ...createNotTestedFlyVerifyLiveEvidence(["R2/Upstash config unreadable."]),
          overall: "FAIL",
          eligibilityVerdict: "CONFIGURATION_UNAVAILABLE",
          startedAtIso,
          endedAtIso: nowIso(),
          cleanupStatus: "not_run",
          configAttribution,
        },
      });
      return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
    }

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

    let restProducer: UpstashLiveProducerPort;
    if (deps.injectedRestProducer != null) {
      restProducer = deps.injectedRestProducer;
    } else if (deps.injectedRestClient != null) {
      const adapter = new UpstashRestQueueProducerAdapter({
        config: producerConfig ?? null,
        client: deps.injectedRestClient,
      });
      restProducer = adapter;
    } else if (producerConfig != null) {
      restProducer = new UpstashRestQueueProducerAdapter({
        config: producerConfig,
      });
    } else {
      restProducer = new UpstashRestQueueProducerAdapter({ config: null });
    }

    const streamNames = deriveHeadlessQueueStreamNames("staging");
    const runId = randomUUID();
    const flyApp =
      typeof appName === "string"
        ? appName
        : HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP;

    const jobStore =
      deps.injectedJobStore ?? new NeonHeadlessJobStoreAdapter(sql);
    const ownedObjectStore =
      deps.injectedOwnedObjectStore ??
      new NeonHeadlessOwnedObjectStoreAdapter(sql);
    const projectAuthorization =
      deps.injectedProjectAuthorization ??
      new NeonHeadlessProjectAuthorizationAdapter(sql);
    const dispatchOutbox =
      deps.injectedDispatchOutbox ??
      new NeonHeadlessRenderDispatchOutboxAdapter(sql);
    const io =
      deps.injectedIo ??
      new R2StorageAdapter({
        env,
        configOverride: r2Config ?? undefined,
        authorizeOwner: () => true,
      });
    const uploadCapability =
      deps.injectedUploadCapability ??
      new R2UploadCapabilityAdapter({
        ownedObjectStore,
        configOverride: r2Config ?? undefined,
      });

    const trackedStreamIds: FlyVerifyLiveMatrixContext["trackedStreamIds"] = [];
    const runOwnedActiveStreamIds: FlyVerifyLiveMatrixContext["runOwnedActiveStreamIds"] =
      [];

    const ctx: FlyVerifyLiveMatrixContext = {
      runId,
      ownerId: `fvl_owner_${runId.slice(0, 8)}`,
      otherOwnerId: `fvl_other_${runId.slice(0, 8)}`,
      projectId: randomUUID(),
      nowMs: Date.now(),
      env,
      flyAppName: flyApp,
      acceptedImageDigestSha256:
        FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
      sql,
      jobStore,
      ownedObjectStore,
      projectAuthorization,
      io,
      uploadCapability,
      downloadCapability: null,
      r2Config: r2Config!,
      restProducer,
      tcpConsumer,
      streamNames,
      streamAuthority: "production_env",
      dispatchOutbox,
      preflightFingerprint: fp,
      trackedStreamIds,
      runOwnedActiveStreamIds,
      createdJobIds: [],
      createdProjectIds: [],
      createdObjectIds: [],
      createdR2Locators: [],
      session: emptyFlyVerifyLiveSession(),
      readFlyTopology:
        deps.readFlyTopology ??
        (async () => defaultReadFlyTopology(flyApp)),
      pollHostedVerifier: deps.pollHostedVerifier,
    };
    matrixCtx = ctx;
    gateExecutionStarted = true;

    const runners = {
      ...DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS,
      ...deps.caseRunners,
    };

    prefixCases = sanitizeCases(
      await runFlyVerifyLiveMatrix(ctx, runners, {
        stopBeforeCaseId: "cleanup.complete",
      }),
    );
  } catch (err) {
    matrixError = err;
  } finally {
    if (matrixCtx != null && gateExecutionStarted) {
      const preserveRows =
        deps.preserveQaRows === true || isPreserveFlag(env);
      const cleanupRunner = deps.cleanupRunner ?? defaultFlyVerifyLiveCleanup;
      cleanupStatus = await cleanupRunner(matrixCtx, preserveRows);
    }
    if (ownsTcpClose && tcpConsumer?.close != null) {
      try {
        await tcpConsumer.close();
      } catch {
        // ignore
      }
    }
  }

  if (matrixError != null) {
    write({
      evidencePath,
      document: {
        ...createNotTestedFlyVerifyLiveEvidence([
          "Gate-on matrix execution threw before evidence finalization.",
          "Cleanup attempted in finally when run context was created.",
        ]),
        overall: "FAIL",
        eligibilityVerdict: "NOT ELIGIBLE — matrix exception.",
        startedAtIso,
        endedAtIso: nowIso(),
        cases: mergeTailCases(prefixCases, [
          { caseId: "cleanup.complete", status: "NOT_TESTED" },
          { caseId: "evidence.privacy", status: "NOT_TESTED" },
        ]),
        schemaFingerprint: fingerprint,
        acceptedImageDigestSha256:
          FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
        flyVerifyTopology: null,
        cleanupStatus:
          gateExecutionStarted && cleanupStatus !== "not_run"
            ? cleanupStatus
            : gateExecutionStarted
              ? "failed"
              : "not_run",
        configAttribution,
      },
    });
    return { exitCode: 1, overall: "FAIL" };
  }

  if (matrixCtx == null || fingerprint == null) {
    return { exitCode: 1, overall: "FAIL" };
  }

  const ctx = matrixCtx;
  const prefixFailed = prefixCases.some((c) => c.status === "FAIL");

  if (!prefixFailed) {
    const cleanupRunnerFn =
      deps.caseRunners?.["cleanup.complete"] ??
      DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS["cleanup.complete"];
    const privacyRunnerFn =
      deps.caseRunners?.["evidence.privacy"] ??
      DEFAULT_FLY_VERIFY_LIVE_CASE_RUNNERS["evidence.privacy"];
    tailCases = sanitizeCases([
      await cleanupRunnerFn(ctx),
      await privacyRunnerFn(ctx),
    ]);
    if (cleanupStatus === "failed") {
      tailCases = [
        {
          caseId: "cleanup.complete",
          status: "FAIL",
          failureCategory: "CLEANUP_FAILED",
        },
        tailCases[1] ?? {
          caseId: "evidence.privacy",
          status: "NOT_TESTED",
        },
      ];
    }
  } else {
    tailCases = [
      { caseId: "cleanup.complete", status: "NOT_TESTED" },
      { caseId: "evidence.privacy", status: "NOT_TESTED" },
    ];
  }

  const cases = mergeTailCases(prefixCases, tailCases);
  const endedAtIso = nowIso();
  const topo = await ctx.readFlyTopology!();

  const notes = [
    "Production shared staging verify stream — hosted Fly verifier is sole consumer.",
    "Harness never invokes local verification or stops/redeploys the verify Machine.",
    "Matrix stops on first failure; remaining cases are NOT_TESTED.",
    "Gate-on cleanup runs in finally before evidence finalization.",
    "Gate-off preserves prior PASS/FAIL evidence with zero provider connections.",
  ];

  const membership = assertExactRequiredFlyVerifyLiveCasePassAuthority(cases);
  const allPass =
    membership.ok && (cleanupStatus === "ok" || cleanupStatus === "preserved");

  if (allPass) {
    const doc: FlyVerifyLiveEvidenceDocument = {
      title: "Sprint 11E Phase 2E.2D.7A — Hosted Fly verifier live evidence",
      overall: "PASS",
      eligibilityVerdict:
        "ELIGIBLE — exact membership PASS with seven-migration fingerprint + cleanup.",
      startedAtIso,
      endedAtIso,
      cases,
      schemaFingerprint: fingerprint,
      acceptedImageDigestSha256:
        FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
      flyVerifyTopology: {
        verifyCount: topo.verifyCount,
        renderCount: topo.renderCount,
        observedRegion: topo.region || "iad",
      },
      cleanupStatus,
      configAttribution,
      notes,
    };
    const authority = validatePassFlyVerifyLiveEvidence({ document: doc });
    if (!authority.ok) {
      write({
        evidencePath,
        document: {
          ...doc,
          overall: "FAIL",
          eligibilityVerdict: `PASS authority rejected: ${authority.message}`,
        },
      });
      return { exitCode: 1, overall: "FAIL" };
    }
    write({ evidencePath, document: doc });
    return { exitCode: 0, overall: "PASS" };
  }

  const prefixAuth =
    assertExactRequiredFlyVerifyLiveCasePrefixFailAuthority(cases);
  write({
    evidencePath,
    document: {
      title: "Sprint 11E Phase 2E.2D.7A — Hosted Fly verifier live evidence",
      overall: "FAIL",
      eligibilityVerdict:
        prefixAuth.ok
          ? `NOT ELIGIBLE — failed at ${prefixAuth.failedCaseId}.`
          : "NOT ELIGIBLE — matrix or cleanup failure.",
      startedAtIso,
      endedAtIso,
      cases,
      schemaFingerprint: fingerprint,
      acceptedImageDigestSha256:
        FLY_VERIFY_LIVE_ACCEPTED_IMAGE_DIGEST,
      flyVerifyTopology: {
        verifyCount: topo.verifyCount,
        renderCount: topo.renderCount,
        observedRegion: topo.region || "iad",
      },
      cleanupStatus,
      configAttribution,
      notes,
    },
  });
  return { exitCode: 1, overall: "FAIL" };
}
