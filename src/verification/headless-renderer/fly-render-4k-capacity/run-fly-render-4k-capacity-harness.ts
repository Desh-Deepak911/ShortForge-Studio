/**
 * Sprint 11E Phase 2E.2D.8K.1 — gated hosted Fly render 4K capacity QA harness.
 * Gate: HEADLESS_FLY_RENDER_4K_QA=1
 *
 * Mirrors run-fly-render-live-harness.ts wiring (Neon/R2/Upstash/Fly), but is
 * a fully separate matrix/gate/evidence surface from HEADLESS_FLY_RENDER_QA.
 * Gate-off → zero provider connections; preserve prior PASS/FAIL evidence.
 * Gate-on without full precontact readiness → refuse contact
 * (CONFIGURATION_UNAVAILABLE), never touching Neon/R2/Upstash/Fly.
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
import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import { rejectOperatorSuppliedFlyStagingImageDigestOverride } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { parseHeadlessFlyStagingDualMachineInventoryFromListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";
import { HEADLESS_FLY_STAGING_RENDER_VM } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-topology";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import type {
  UpstashLiveConsumerPort,
  UpstashLiveProducerPort,
} from "../upstash-live/types";
import { defaultFlyRenderLiveCleanup } from "../fly-render-live/cleanup";
import { createReadHostedDeliveryEvents } from "../fly-render-live/hosted-delivery-event-ingestion";
import { emptyFlyRenderLiveSession } from "../fly-render-live/types";
import type {
  FlyRenderLiveMatrixContext,
  FlyRenderLiveSchemaFingerprint,
} from "../fly-render-live/types";
import { isFlyRenderLiveInjectedProvidersOnly } from "../fly-render-live/qa-secret-contract";

import {
  createNotTestedFlyRender4kCapacityEvidence,
  createNotTestedFlyRender4kOperationalCapacityEvidence,
  defaultFlyRender4kCapacityEvidencePath,
  defaultFlyRender4kOperationalCapacityEvidencePath,
  preserveOrInitializeFlyRender4kCapacityEvidence,
  preserveOrInitializeFlyRender4kOperationalCapacityEvidence,
  writeFlyRender4kCapacityEvidence,
  type FlyRender4kCapacityCaseEvidence,
  type FlyRender4kCapacityCertificationRecord,
  type FlyRender4kCapacityEvidenceDocument,
} from "./capacity-4k-evidence";
import {
  buildFlyRender4kCapacitySchemaFingerprint,
  FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
  validatePassFlyRender4kCapacityEvidence,
} from "./capacity-4k-evidence-authority";
import { validatePassFlyRender4kOperationalCapacityEvidence } from "./capacity-4k-operational-evidence-authority";
import { evaluateCapacity4kPrecontactReadiness } from "./capacity-4k-precontact-authority";
import {
  DEFAULT_CAPACITY_4K_CASE_RUNNERS,
  runCapacity4kLiveMatrix,
  type FlyRender4kCapacityCaseRunner,
} from "./capacity-4k-live-matrix";
import {
  REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS,
  assertExactRequiredFlyRender4kCapacityCasePassAuthority,
  type RequiredFlyRender4kCapacityCaseId,
  validateFlyRender4kCapacityCaseEvidenceShape,
} from "./capacity-4k-required-cases";
import {
  attributeFlyRender4kCapacityEnvironment,
  isFlyRender4kCapacityGateEnvironmentEligible,
  isFlyRender4kCapacityGateOn,
  isFlyRender4kCapacityInjectedProvidersOnly,
  validateFlyRender4kCapacityQaEnvContract,
  HEADLESS_FLY_RENDER_4K_QA_PRESERVE_ENV,
} from "./capacity-4k-qa-gate";
import {
  buildCapacity4kOperationalDurationBoundary,
  buildCapacity4kOperationalDurationMatrixBoundaries,
  buildCapacity4kShortFunctionalMatrixBoundaries,
} from "./capacity-4k-workload";
import {
  startHosted4kRenderMachineProcessTreeSampler,
  type Hosted4kRenderMachineProcessTreeSamplerHandle,
} from "./hosted-render-machine-process-tree-sampler";

const execFileAsync = promisify(execFile);

export type FlyRender4kCapacityHarnessExit =
  | { readonly exitCode: 0; readonly overall: "NOT_TESTED" | "PASS" }
  | {
      readonly exitCode: 1;
      readonly overall: "FAIL" | "CONFIGURATION_UNAVAILABLE";
    };

export type FlyRender4kCapacityHarnessMode =
  | "short_functional"
  | "operational_duration";

export type FlyRender4kCapacityHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly mode?: FlyRender4kCapacityHarnessMode;
  readonly evidencePath?: string;
  readonly writeEvidence?: typeof writeFlyRender4kCapacityEvidence;
  readonly preserveEvidence?: typeof preserveOrInitializeFlyRender4kCapacityEvidence;
  readonly nowIso?: () => string;
  readonly forceGateOn?: boolean;
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
    Partial<Record<RequiredFlyRender4kCapacityCaseId, FlyRender4kCapacityCaseRunner>>
  >;
  readonly readFlyTopology?: FlyRenderLiveMatrixContext["readFlyTopology"];
  readonly pollHostedRenderer?: FlyRenderLiveMatrixContext["pollHostedRenderer"];
  readonly readHostedDeliveryEvents?: FlyRenderLiveMatrixContext["readHostedDeliveryEvents"];
  readonly readFlyLogs?: (appName: string) => Promise<string>;
  readonly processTreeSampler?: Hosted4kRenderMachineProcessTreeSamplerHandle;
  readonly startProcessTreeSampler?: typeof startHosted4kRenderMachineProcessTreeSampler;
};

function isPreserveFlag(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (
      (env as Record<string, unknown>)[HEADLESS_FLY_RENDER_4K_QA_PRESERVE_ENV] ===
      "1"
    );
  } catch {
    return false;
  }
}

function sanitizeCases(
  cases: readonly unknown[],
): readonly FlyRender4kCapacityCaseEvidence[] {
  const out: FlyRender4kCapacityCaseEvidence[] = [];
  for (const raw of cases) {
    const v = validateFlyRender4kCapacityCaseEvidenceShape(raw);
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

function buildCertificationRecords(
  mode: FlyRender4kCapacityHarnessMode,
): readonly FlyRender4kCapacityCertificationRecord[] {
  const boundaries =
    mode === "operational_duration"
      ? buildCapacity4kOperationalDurationMatrixBoundaries()
      : buildCapacity4kShortFunctionalMatrixBoundaries();
  return Object.freeze(
    boundaries.map((b) =>
      Object.freeze({
        profileId: b.profileId,
        certificationLevel: b.certificationLevel,
        audioMode:
          b.profileId === "4k-webm-30"
            ? ("silent" as const)
            : ("with-voice-and-music" as const),
        contentDurationMs: b.contentDurationMs,
        renderDurationMs: b.renderDurationMs,
        contentFrames: b.framePlan.contentFrames,
        renderedFrames: b.framePlan.renderedFrames,
        paddingTailFrames: b.framePlan.paddingTailFrames,
        shortFunctional4kSupport: b.claimsShortFunctional4kSupport,
        operationalDuration4kCapacity: b.claimsOperationalDuration4kCapacity,
      }),
    ),
  );
}

function harnessEvidenceTitle(mode: FlyRender4kCapacityHarnessMode): string {
  return mode === "operational_duration"
    ? "Sprint 11E Phase 2E.2D.8L — Hosted 4K operational capacity evidence"
    : "Sprint 11E Phase 2E.2D.8K.1 — Hosted 4K capacity evidence";
}

function harnessNotes(mode: FlyRender4kCapacityHarnessMode): readonly string[] {
  if (mode === "operational_duration") {
    return Object.freeze([
      "Hosted 4K operational-duration matrix — separate evidence from short functional 4K PASS.",
      "Operational certification does not modify or overwrite short functional evidence.",
      "Matrix stops on first failure; remaining cases are NOT_TESTED.",
      "Process-tree memory observation excludes the local observer process.",
      "Gate-on cleanup runs in finally before evidence finalization.",
      "Gate-off preserves prior PASS/FAIL operational evidence with zero provider connections.",
    ]);
  }
  return Object.freeze([
    "Hosted 4K capacity matrix — separate gate/evidence from HEADLESS_FLY_RENDER_QA render-live.",
    "Short functional smoke does not infer operational-duration 4K capacity.",
    "Matrix stops on first failure; remaining cases are NOT_TESTED.",
    "Process-tree memory observation excludes the local observer process.",
    "Gate-on cleanup runs in finally before evidence finalization.",
    "Gate-off preserves prior PASS/FAIL evidence with zero provider connections.",
  ]);
}

function createNotTestedEvidenceForMode(
  mode: FlyRender4kCapacityHarnessMode,
  notes?: readonly string[],
): FlyRender4kCapacityEvidenceDocument {
  return mode === "operational_duration"
    ? createNotTestedFlyRender4kOperationalCapacityEvidence(notes)
    : createNotTestedFlyRender4kCapacityEvidence(notes);
}

function buildNotTestedCases(): readonly FlyRender4kCapacityCaseEvidence[] {
  return Object.freeze(
    REQUIRED_FLY_RENDER_4K_CAPACITY_CASE_IDS.map((caseId) =>
      Object.freeze({ caseId, status: "NOT_TESTED" as const }),
    ),
  );
}

export async function runFlyRender4kCapacityHarness(
  deps: FlyRender4kCapacityHarnessDeps = {},
): Promise<FlyRender4kCapacityHarnessExit> {
  const mode = deps.mode ?? "short_functional";
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ??
    (mode === "operational_duration"
      ? defaultFlyRender4kOperationalCapacityEvidencePath()
      : defaultFlyRender4kCapacityEvidencePath());
  const write = deps.writeEvidence ?? writeFlyRender4kCapacityEvidence;
  const preserve =
    deps.preserveEvidence ??
    (mode === "operational_duration"
      ? preserveOrInitializeFlyRender4kOperationalCapacityEvidence
      : preserveOrInitializeFlyRender4kCapacityEvidence);
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const gateOn = deps.forceGateOn === true || isFlyRender4kCapacityGateOn(env);
  const certificationRecords = buildCertificationRecords(mode);
  const notes = harnessNotes(mode);
  const evidenceTitle = harnessEvidenceTitle(mode);

  if (!gateOn) {
    void preserve({ evidencePath });
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const configAttribution = attributeFlyRender4kCapacityEnvironment(env);
  const envContract = validateFlyRender4kCapacityQaEnvContract(env);
  const appName = (env as Record<string, unknown>).HEADLESS_FLY_STAGING_APP_NAME;

  if (!isFlyRender4kCapacityGateEnvironmentEligible(env) || !envContract.ok) {
    write({
      evidencePath,
      document: {
        ...createNotTestedEvidenceForMode(mode, [
          "4K gate on but environment ineligible or QA secret contract failed.",
          "Zero Neon, R2, Upstash, or Fly connection attempted.",
        ]),
        title: evidenceTitle,
        overall: "FAIL",
        eligibilityVerdict: "CONFIGURATION_UNAVAILABLE — env contract failed.",
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        cases: buildNotTestedCases(),
        certificationRecords,
        configAttribution,
        cleanupStatus: "not_run",
      },
    });
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const digestOverride = rejectOperatorSuppliedFlyStagingImageDigestOverride(env);
  if (!digestOverride.ok) {
    write({
      evidencePath,
      document: {
        ...createNotTestedEvidenceForMode(mode, [
          "Operator-supplied accepted image digest override is forbidden.",
        ]),
        title: evidenceTitle,
        overall: "FAIL",
        eligibilityVerdict: "CONFIGURATION_UNAVAILABLE — digest override forbidden.",
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        cases: buildNotTestedCases(),
        certificationRecords,
        configAttribution,
        cleanupStatus: "not_run",
      },
    });
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const injectedOnly = isFlyRender4kCapacityInjectedProvidersOnly(deps);

  const startedAtIso = nowIso();
  let sql: HeadlessSqlExecutor | null = null;
  let tcpConsumer: UpstashLiveConsumerPort | null = null;
  let ownsTcpClose = false;
  let matrixCtx: FlyRenderLiveMatrixContext | null = null;
  let fingerprint: FlyRenderLiveSchemaFingerprint | null = null;
  let cases: readonly FlyRender4kCapacityCaseEvidence[] = [];
  let cleanupStatus: FlyRender4kCapacityEvidenceDocument["cleanupStatus"] =
    "not_run";
  let matrixError: unknown = null;
  let gateExecutionStarted = false;
  let processTreeSampler: Hosted4kRenderMachineProcessTreeSamplerHandle | null =
    null;
  let processTreeObservation: FlyRender4kCapacityEvidenceDocument["processTreeObservation"] =
    null;
  let headroomEvaluation: FlyRender4kCapacityEvidenceDocument["headroomEvaluation"] =
    null;

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
      fp = buildFlyRender4kCapacitySchemaFingerprint();
    }
    fingerprint = fp;

    const r2Config = readConfiguredHeadlessR2Config(env);
    const producerConfig = readConfiguredHeadlessUpstashProducerConfig(env);
    const consumerConfig = readConfiguredHeadlessUpstashConsumerConfig(env);
    if (r2Config == null || producerConfig == null || consumerConfig == null) {
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

    const jobStore = deps.injectedJobStore ?? new NeonHeadlessJobStoreAdapter(sql);
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

    const readFlyTopology =
      deps.readFlyTopology ?? (async () => defaultReadFlyTopology(flyApp));

    const precontactTopology = await readFlyTopology().catch(() => null);
    const precontact = evaluateCapacity4kPrecontactReadiness({
      env,
      topology:
        precontactTopology == null
          ? null
          : {
              verifyCount: precontactTopology.verifyCount,
              renderCount: precontactTopology.renderCount,
              renderCpuKind: HEADLESS_FLY_STAGING_RENDER_VM.cpuKind,
              renderCpus: HEADLESS_FLY_STAGING_RENDER_VM.cpus,
              renderMemoryMb: HEADLESS_FLY_STAGING_RENDER_VM.memoryMb,
              verifyImageDigestSha256: precontactTopology.verifyImageDigestSha256,
              renderImageDigestSha256: precontactTopology.renderImageDigestSha256,
              pendingOutboxCount: 0,
              activeClaimCount: 0,
            },
      schemaReady: true,
      forceGateOn: deps.forceGateOn,
    });
    if (!precontact.contactAllowed) {
      write({
        evidencePath,
        document: {
          ...createNotTestedEvidenceForMode(mode, [
            `Precontact refused — ${precontact.blockReason ?? "unknown"}.`,
            "Zero Neon, R2, Upstash, or Fly connection attempted for execution.",
            mode === "operational_duration"
              ? "Operational-duration certification is separate from short functional evidence."
              : "Short functional smoke does not infer operational-duration capacity.",
          ]),
          title: evidenceTitle,
          overall: "FAIL",
          eligibilityVerdict: `CONFIGURATION_UNAVAILABLE — precontact blocked (${precontact.blockReason}).`,
          startedAtIso,
          endedAtIso: nowIso(),
          cases: buildNotTestedCases(),
          acceptedImageDigestSha256: FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
          schemaFingerprint: fingerprint,
          certificationRecords,
          configAttribution,
          cleanupStatus: "not_run",
        },
      });
      return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
    }

    const ctx: FlyRenderLiveMatrixContext = {
      runId,
      ownerId: `f4k_owner_${runId.slice(0, 8)}`,
      otherOwnerId: `f4k_other_${runId.slice(0, 8)}`,
      projectId: randomUUID(),
      nowMs: Date.now(),
      env,
      flyAppName: flyApp,
      acceptedImageDigestSha256: FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
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
      smokePollTimeoutMs: 300_000,
      smokeContentDurationMs: 2_000,
      resourceObservation: null,
      readFlyTopology,
      readHostedDeliveryEvents:
        deps.readHostedDeliveryEvents ??
        createReadHostedDeliveryEvents({
          flyAppName: flyApp,
          readFlyLogs: deps.readFlyLogs,
          getSession: () => matrixCtx?.session ?? emptyFlyRenderLiveSession(),
        }),
      pollHostedRenderer: deps.pollHostedRenderer,
      capacity4kBoundary: null,
      capacity4kProcessTreeSampler: null,
    };

    const startSampler =
      deps.startProcessTreeSampler ?? startHosted4kRenderMachineProcessTreeSampler;
    processTreeSampler =
      deps.processTreeSampler ??
      startSampler({
        flyAppName: flyApp,
        renderMachineId: precontactTopology?.renderMachineId ?? null,
      });
    ctx.capacity4kProcessTreeSampler = processTreeSampler;

    matrixCtx = ctx;
    gateExecutionStarted = true;

    const runners = {
      ...DEFAULT_CAPACITY_4K_CASE_RUNNERS,
      ...deps.caseRunners,
    };

    const result = await runCapacity4kLiveMatrix(ctx, runners, {
      buildProfileBoundary:
        mode === "operational_duration"
          ? buildCapacity4kOperationalDurationBoundary
          : undefined,
    });
    cases = sanitizeCases(result.cases);
    processTreeObservation = result.processTreeObservation;
    headroomEvaluation = result.headroomEvaluation;
  } catch (err) {
    matrixError = err;
  } finally {
    if (processTreeSampler != null) {
      try {
        const finalObservation = await processTreeSampler.stop();
        if (processTreeObservation == null) {
          processTreeObservation = finalObservation;
        }
      } catch {
        // best effort — evidence already reflects unavailable observation.
      }
    }
    if (matrixCtx != null && gateExecutionStarted) {
      const preserveRows = deps.preserveQaRows === true || isPreserveFlag(env);
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
        ...createNotTestedEvidenceForMode(mode, [
          "Gate-on matrix execution threw before evidence finalization.",
          "Cleanup attempted in finally when run context was created.",
        ]),
        title: evidenceTitle,
        overall: "FAIL",
        eligibilityVerdict: "NOT ELIGIBLE — matrix exception.",
        startedAtIso,
        endedAtIso: nowIso(),
        cases: cases.length > 0 ? cases : buildNotTestedCases(),
        schemaFingerprint: fingerprint,
        acceptedImageDigestSha256: FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
        certificationRecords,
        processTreeObservation,
        headroomEvaluation,
        cleanupStatus:
          gateExecutionStarted && cleanupStatus !== "not_run"
            ? cleanupStatus
            : gateExecutionStarted
              ? "failed"
              : "not_run",
        configAttribution,
        notes,
      },
    });
    return { exitCode: 1, overall: "FAIL" };
  }

  if (matrixCtx == null || fingerprint == null) {
    return { exitCode: 1, overall: "FAIL" };
  }

  const ctx = matrixCtx;
  const endedAtIso = nowIso();
  const topo = await ctx.readFlyTopology!();

  const flyRenderTopology = {
    verifyCount: topo.verifyCount,
    renderCount: topo.renderCount,
    renderCpuKind: HEADLESS_FLY_STAGING_RENDER_VM.cpuKind,
    renderCpus: HEADLESS_FLY_STAGING_RENDER_VM.cpus,
    renderMemoryMb: HEADLESS_FLY_STAGING_RENDER_VM.memoryMb,
    observedRegion: topo.region || "iad",
  };

  const membership = assertExactRequiredFlyRender4kCapacityCasePassAuthority(cases);
  const allPass =
    membership.ok && (cleanupStatus === "ok" || cleanupStatus === "preserved");

  if (allPass) {
    const fullCapacityClaimJustified =
      mode === "operational_duration" &&
      headroomEvaluation?.fullCapacityClaimJustified === true;
    const doc: FlyRender4kCapacityEvidenceDocument = {
      title: evidenceTitle,
      overall: "PASS",
      eligibilityVerdict:
        mode === "operational_duration"
          ? "ELIGIBLE — exact 35-case operational-duration membership PASS."
          : "ELIGIBLE — exact 35-case membership PASS with short functional smoke.",
      startedAtIso,
      endedAtIso,
      cases,
      schemaFingerprint: fingerprint,
      acceptedImageDigestSha256: FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
      flyRenderTopology,
      certificationRecords,
      processTreeObservation,
      headroomEvaluation,
      fullCapacityClaimJustified,
      cleanupStatus,
      configAttribution,
      notes,
    };
    const authority =
      mode === "operational_duration"
        ? validatePassFlyRender4kOperationalCapacityEvidence({ document: doc })
        : validatePassFlyRender4kCapacityEvidence({ document: doc });
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

  const firstFailed = cases.find((c) => c.status === "FAIL");
  write({
    evidencePath,
    document: {
      title: evidenceTitle,
      overall: "FAIL",
      eligibilityVerdict:
        firstFailed != null
          ? `NOT ELIGIBLE — failed at ${firstFailed.caseId}.`
          : "NOT ELIGIBLE — matrix or cleanup failure.",
      startedAtIso,
      endedAtIso,
      cases,
      schemaFingerprint: fingerprint,
      acceptedImageDigestSha256: FLY_RENDER_4K_CAPACITY_ACCEPTED_IMAGE_DIGEST,
      flyRenderTopology,
      certificationRecords,
      processTreeObservation,
      headroomEvaluation,
      fullCapacityClaimJustified: false,
      cleanupStatus,
      configAttribution,
      notes,
    },
  });
  return { exitCode: 1, overall: "FAIL" };
}
