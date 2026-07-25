/**
 * Gated hosted Fly render live QA harness.
 * Gate: HEADLESS_FLY_RENDER_QA=1
 *
 * Uses production shared staging render stream — hosted render worker is sole consumer.
 * Never stops/redeploys verify or render Machines.
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
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
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
import { parseHeadlessFlyStagingDualMachineInventoryFromListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import type {
  UpstashLiveConsumerPort,
  UpstashLiveProducerPort,
} from "../upstash-live/types";

import { defaultFlyRenderLiveCleanup } from "./cleanup";
import { createReadHostedDeliveryEvents } from "./hosted-delivery-event-ingestion";
import {
  buildFlyRenderLiveSchemaFingerprint,
  FLY_RENDER_LIVE_ACCEPTED_IMAGE_DIGEST,
  validatePassFlyRenderLiveEvidence,
} from "./evidence-authority";
import {
  createNotTestedFlyRenderLiveEvidence,
  defaultFlyRenderLiveEvidencePath,
  extractJobCreateFailureAttributionFromCases,
  preserveOrInitializeFlyRenderLiveEvidence,
  writeFlyRenderLiveEvidence,
  type FlyRenderLiveCaseEvidence,
  type FlyRenderLiveEvidenceDocument,
} from "./evidence";
import { sampleHostedRenderProcessTreePeakBytes } from "./process-tree-peak-memory";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "./smoke-workload";
import { emptyFlyRenderLiveSession } from "./types";
import {
  DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS,
  runFlyRenderLiveMatrix,
  type FlyRenderLiveCaseRunner,
} from "./live-matrix";
import {
  assertExactRequiredFlyRenderLiveCasePassAuthority,
  assertExactRequiredFlyRenderLiveCasePrefixFailAuthority,
  REQUIRED_FLY_RENDER_LIVE_CASE_IDS,
  validateFlyRenderLiveCaseEvidenceShape,
} from "./required-cases";
import {
  attributeFlyRenderLiveEnvironment,
  isFlyRenderLiveGateEnvironmentEligible,
  isFlyRenderLiveInjectedProvidersOnly,
  isFlyRenderLiveGateOn,
  validateFlyRenderLiveQaEnvContract,
} from "./qa-secret-contract";
import { assertDefaultFlyRenderLiveRunnersAreNotStubs } from "./stub-boundary";
import type {
  FlyRenderLiveMatrixContext,
  FlyRenderLiveSchemaFingerprint,
} from "./types";

const execFileAsync = promisify(execFile);

export type FlyRenderLiveHarnessExit =
  | { readonly exitCode: 0; readonly overall: "NOT_TESTED" | "PASS" }
  | {
      readonly exitCode: 1;
      readonly overall: "FAIL" | "CONFIGURATION_UNAVAILABLE";
    };

export type FlyRenderLiveHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly writeEvidence?: typeof writeFlyRenderLiveEvidence;
  readonly preserveEvidence?: typeof preserveOrInitializeFlyRenderLiveEvidence;
  readonly nowIso?: () => string;
  readonly forceGateOn?: boolean;
  readonly skipStubCheck?: boolean;
  readonly stubCheck?: typeof assertDefaultFlyRenderLiveRunnersAreNotStubs;
  readonly preserveQaRows?: boolean;
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
  readonly injectedFingerprint?: FlyRenderLiveSchemaFingerprint;
  readonly runSchemaPreflight?: typeof runHeadlessSchemaPreflight;
  readonly cleanupRunner?: (
    ctx: FlyRenderLiveMatrixContext,
    preserve?: boolean,
  ) => Promise<"ok" | "failed" | "preserved">;
  readonly caseRunners?: Readonly<
    Partial<
      Record<
        (typeof REQUIRED_FLY_RENDER_LIVE_CASE_IDS)[number],
        FlyRenderLiveCaseRunner
      >
    >
  >;
  readonly readFlyTopology?: FlyRenderLiveMatrixContext["readFlyTopology"];
  readonly pollHostedRenderer?: FlyRenderLiveMatrixContext["pollHostedRenderer"];
  readonly readHostedDeliveryEvents?: FlyRenderLiveMatrixContext["readHostedDeliveryEvents"];
  readonly readFlyLogs?: (appName: string) => Promise<string>;
};

function isPreserveFlag(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_FLY_RENDER_QA_PRESERVE === "1";
  } catch {
    return false;
  }
}

function sanitizeCases(
  cases: readonly unknown[],
): readonly FlyRenderLiveCaseEvidence[] {
  const out: FlyRenderLiveCaseEvidence[] = [];
  for (const raw of cases) {
    const v = validateFlyRenderLiveCaseEvidenceShape(raw);
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
  readonly renderMachineId: string | null;
  readonly verifyImageDigestSha256: string | null;
  readonly renderImageDigestSha256: string | null;
}> {
  const { stdout } = await execFileAsync(
    "fly",
    ["machine", "list", "-a", appName, "--json"],
    { maxBuffer: 4 * 1024 * 1024 },
  );
  let json: unknown;
  try {
    json = JSON.parse(stdout.trim());
  } catch {
    json = [];
  }
  const inventory = parseHeadlessFlyStagingDualMachineInventoryFromListJson(json);
  return {
    verifyCount: inventory.verifyCount,
    renderCount: inventory.renderCount,
    region: inventory.verify?.region ?? inventory.render?.region ?? "",
    verifyMachineId: inventory.verify?.machineId ?? null,
    renderMachineId: inventory.render?.machineId ?? null,
    verifyImageDigestSha256: inventory.verify?.imageDigestSha256 ?? null,
    renderImageDigestSha256: inventory.render?.imageDigestSha256 ?? null,
  };
}

function mergeTailCases(
  prefix: readonly FlyRenderLiveCaseEvidence[],
  tail: readonly FlyRenderLiveCaseEvidence[],
): readonly FlyRenderLiveCaseEvidence[] {
  const byId = new Map(prefix.map((c) => [c.caseId, c]));
  for (const c of tail) {
    byId.set(c.caseId, c);
  }
  return Object.freeze(
    REQUIRED_FLY_RENDER_LIVE_CASE_IDS.map((id) => {
      const c = byId.get(id);
      return c ?? { caseId: id, status: "NOT_TESTED" as const };
    }),
  );
}

export async function runFlyRenderLiveHarness(
  deps: FlyRenderLiveHarnessDeps = {},
): Promise<FlyRenderLiveHarnessExit> {
  const env = deps.env ?? process.env;
  const evidencePath = deps.evidencePath ?? defaultFlyRenderLiveEvidencePath();
  const write = deps.writeEvidence ?? writeFlyRenderLiveEvidence;
  const preserve =
    deps.preserveEvidence ?? preserveOrInitializeFlyRenderLiveEvidence;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const gateOn = deps.forceGateOn === true || isFlyRenderLiveGateOn(env);
  const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();

  if (!gateOn) {
    void preserve({ evidencePath });
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const configAttribution = attributeFlyRenderLiveEnvironment(env);
  const envContract = validateFlyRenderLiveQaEnvContract(env);
  const appName = (env as Record<string, unknown>).HEADLESS_FLY_STAGING_APP_NAME;

  if (!isFlyRenderLiveGateEnvironmentEligible(env)) {
    write({
      evidencePath,
      document: {
        ...createNotTestedFlyRenderLiveEvidence([
          "Gate on but environment incomplete, QA secret contract mismatch, or staging app mismatch.",
          envContract.ok
            ? "Eleven-key QA secret membership satisfied."
            : `QA secret contract rejected (${envContract.failClass}).`,
          "Render activation gate is separate — this harness never scales render Machines.",
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

  const digestOverride = rejectOperatorSuppliedFlyStagingImageDigestOverride(env);
  if (!digestOverride.ok) {
    write({
      evidencePath,
      document: {
        ...createNotTestedFlyRenderLiveEvidence([
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

  const injectedOnly = isFlyRenderLiveInjectedProvidersOnly(deps);

  if (deps.skipStubCheck !== true) {
    const check = deps.stubCheck ?? assertDefaultFlyRenderLiveRunnersAreNotStubs;
    const stubs = check();
    if (!stubs.ok) {
      return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
    }
  }

  const startedAtIso = nowIso();
  let sql: HeadlessSqlExecutor | null = null;
  let tcpConsumer: UpstashLiveConsumerPort | null = null;
  let ownsTcpClose = false;
  let matrixCtx: FlyRenderLiveMatrixContext | null = null;
  let fingerprint: FlyRenderLiveSchemaFingerprint | null = null;
  let prefixCases: readonly FlyRenderLiveCaseEvidence[] = [];
  let tailCases: readonly FlyRenderLiveCaseEvidence[] = [];
  let cleanupStatus: FlyRenderLiveEvidenceDocument["cleanupStatus"] = "not_run";
  let matrixError: unknown = null;
  let gateExecutionStarted = false;
  const resourceStartedAtMs = Date.now();

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else if (injectedOnly) {
      throw new Error("injected_sql_required");
    } else {
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) throw new Error("neon_unconfigured");
      sql = createNeonSqlExecutor({ connectionString });
    }

    let fp: FlyRenderLiveSchemaFingerprint;
    if (deps.injectedFingerprint != null) {
      fp = deps.injectedFingerprint;
    } else {
      const runPreflight = deps.runSchemaPreflight ?? runHeadlessSchemaPreflight;
      const preflight = await runPreflight({ sql: sql! });
      if (!preflight.ok) throw new Error("schema_preflight_failed");
      fp = buildFlyRenderLiveSchemaFingerprint();
    }
    fingerprint = fp;

    const r2Config = readConfiguredHeadlessR2Config(env);
    const producerConfig = readConfiguredHeadlessUpstashProducerConfig(env);
    const consumerConfig = readConfiguredHeadlessUpstashConsumerConfig(env);
    if (
      r2Config == null ||
      producerConfig == null ||
      consumerConfig == null
    ) {
      throw new Error("provider_config_incomplete");
    }

    if (deps.injectedTcpConsumer != null) {
      tcpConsumer = deps.injectedTcpConsumer;
      ownsTcpClose = false;
    } else if (!injectedOnly) {
      tcpConsumer = new UpstashTcpStreamConsumerAdapter({
        config: consumerConfig ?? undefined,
        envName: "staging",
      });
      ownsTcpClose = true;
    }

    let restProducer: UpstashLiveProducerPort | null = null;
    if (deps.injectedRestProducer != null) {
      restProducer = deps.injectedRestProducer;
    } else if (!injectedOnly) {
      restProducer = new UpstashRestQueueProducerAdapter({
        config: producerConfig,
        client: deps.injectedRestClient,
      });
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
        configOverride: r2Config,
        authorizeOwner: () => true,
      });
    const uploadCapability =
      deps.injectedUploadCapability ??
      new R2UploadCapabilityAdapter({
        ownedObjectStore,
        configOverride: r2Config,
      });

    const ctx: FlyRenderLiveMatrixContext = {
      runId,
      ownerId: `frl_owner_${runId.slice(0, 8)}`,
      otherOwnerId: `frl_other_${runId.slice(0, 8)}`,
      projectId: randomUUID(),
      nowMs: Date.now(),
      env,
      flyAppName: flyApp,
      acceptedImageDigestSha256:
        FLY_RENDER_LIVE_ACCEPTED_IMAGE_DIGEST,
      sql,
      jobStore,
      ownedObjectStore,
      projectAuthorization,
      io,
      uploadCapability,
      downloadCapability: null,
      r2Config,
      restProducer,
      tcpConsumer,
      streamNames,
      streamAuthority: "production_env",
      dispatchOutbox,
      preflightFingerprint: fingerprint,
      trackedStreamIds: [],
      runOwnedActiveStreamIds: [],
      createdJobIds: [],
      createdProjectIds: [],
      createdObjectIds: [],
      createdR2Locators: [],
      session: emptyFlyRenderLiveSession(),
      smokePollTimeoutMs: smoke.pollTimeoutMs,
      smokeContentDurationMs: smoke.contentDurationMs,
      resourceObservation: sampleHostedRenderProcessTreePeakBytes({
        startedAtMs: resourceStartedAtMs,
      }),
      readFlyTopology:
        deps.readFlyTopology ??
        (async () => defaultReadFlyTopology(flyApp)),
      readHostedDeliveryEvents:
        deps.readHostedDeliveryEvents ??
        createReadHostedDeliveryEvents({
          flyAppName: flyApp,
          readFlyLogs: deps.readFlyLogs,
          getSession: () => matrixCtx?.session ?? emptyFlyRenderLiveSession(),
        }),
      pollHostedRenderer: deps.pollHostedRenderer,
    };
    matrixCtx = ctx;
    gateExecutionStarted = true;

    const runners = {
      ...DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS,
      ...deps.caseRunners,
    };

    prefixCases = sanitizeCases(
      await runFlyRenderLiveMatrix(ctx, runners, {
        stopBeforeCaseId: "cleanup.complete",
      }),
    );
  } catch (err) {
    matrixError = err;
  } finally {
    if (matrixCtx != null && gateExecutionStarted) {
      const preserveRows =
        deps.preserveQaRows === true || isPreserveFlag(env);
      const cleanupRunner = deps.cleanupRunner ?? defaultFlyRenderLiveCleanup;
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
        ...createNotTestedFlyRenderLiveEvidence([
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
          FLY_RENDER_LIVE_ACCEPTED_IMAGE_DIGEST,
        flyRenderTopology: null,
        smokeWorkload: {
          profileId: smoke.profileId,
          contentDurationMs: smoke.contentDurationMs,
          pollTimeoutMs: smoke.pollTimeoutMs,
          claims4kCapacity: false,
        },
        resourceObservation: matrixCtx?.resourceObservation ?? null,
        cleanupStatus:
          gateExecutionStarted && cleanupStatus !== "not_run"
            ? cleanupStatus
            : gateExecutionStarted
              ? "failed"
              : "not_run",
        configAttribution,
        jobCreateFailureAttribution: extractJobCreateFailureAttributionFromCases(
          mergeTailCases(prefixCases, [
            { caseId: "cleanup.complete", status: "NOT_TESTED" },
            { caseId: "evidence.privacy", status: "NOT_TESTED" },
          ]),
          gateExecutionStarted && cleanupStatus !== "not_run"
            ? cleanupStatus
            : "not_run",
        ),
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
      DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS["cleanup.complete"];
    const privacyRunnerFn =
      deps.caseRunners?.["evidence.privacy"] ??
      DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS["evidence.privacy"];
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
    const cleanupRunnerFn =
      deps.caseRunners?.["cleanup.complete"] ??
      DEFAULT_FLY_RENDER_LIVE_CASE_RUNNERS["cleanup.complete"];
    const cleanupCase = await cleanupRunnerFn(ctx);
    tailCases = sanitizeCases([
      cleanupStatus === "failed" && cleanupCase.status === "PASS"
        ? {
            caseId: "cleanup.complete" as const,
            status: "FAIL" as const,
            failureCategory: "CLEANUP_FAILED" as const,
          }
        : cleanupCase,
      { caseId: "evidence.privacy", status: "NOT_TESTED" },
    ]);
  }

  const cases = mergeTailCases(prefixCases, tailCases);
  const endedAtIso = nowIso();
  const topo = await ctx.readFlyTopology!();

  const notes = [
    "Production shared staging render stream — hosted Fly render worker is sole consumer.",
    "Harness never invokes local render execution or stops/redeploys Fly Machines.",
    "First live workload is bounded 720p smoke — not a 4K capacity claim.",
    "Matrix stops on first failure; remaining cases are NOT_TESTED.",
    "Gate-on cleanup runs in finally before evidence finalization.",
    "Gate-off preserves prior PASS/FAIL evidence with zero provider connections.",
  ];

  const membership = assertExactRequiredFlyRenderLiveCasePassAuthority(cases);
  const allPass =
    membership.ok && (cleanupStatus === "ok" || cleanupStatus === "preserved");

  const smokeDoc = {
    profileId: smoke.profileId,
    contentDurationMs: smoke.contentDurationMs,
    pollTimeoutMs: smoke.pollTimeoutMs,
    claims4kCapacity: false as const,
  };

  if (allPass) {
    const doc: FlyRenderLiveEvidenceDocument = {
      title: "Sprint 11E Phase 2E.2D.8A — Hosted Fly render live evidence",
      overall: "PASS",
      eligibilityVerdict:
        "ELIGIBLE — exact membership PASS with six-migration fingerprint + cleanup.",
      startedAtIso,
      endedAtIso,
      cases,
      schemaFingerprint: fingerprint,
      acceptedImageDigestSha256:
        FLY_RENDER_LIVE_ACCEPTED_IMAGE_DIGEST,
      flyRenderTopology: {
        verifyCount: topo.verifyCount,
        renderCount: topo.renderCount,
        observedRegion: topo.region || "iad",
      },
      smokeWorkload: smokeDoc,
      resourceObservation: ctx.resourceObservation,
      cleanupStatus,
      configAttribution,
      jobCreateFailureAttribution: null,
      notes,
    };
    const authority = validatePassFlyRenderLiveEvidence({ document: doc });
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
    assertExactRequiredFlyRenderLiveCasePrefixFailAuthority(cases);
  const jobCreateFailureAttribution =
    extractJobCreateFailureAttributionFromCases(cases, cleanupStatus);
  write({
    evidencePath,
    document: {
      title: "Sprint 11E Phase 2E.2D.8A — Hosted Fly render live evidence",
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
        FLY_RENDER_LIVE_ACCEPTED_IMAGE_DIGEST,
      flyRenderTopology: {
        verifyCount: topo.verifyCount,
        renderCount: topo.renderCount,
        observedRegion: topo.region || "iad",
      },
      smokeWorkload: smokeDoc,
      resourceObservation: ctx.resourceObservation,
      cleanupStatus,
      configAttribution,
      jobCreateFailureAttribution,
      notes,
    },
  });
  return { exitCode: 1, overall: "FAIL" };
}
