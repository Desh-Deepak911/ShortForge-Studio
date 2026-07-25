/**
 * QA-only targeted Fly render job-create probe — Sprint 11E Phase 2E.2D.8B.1.
 * Read-only consumer safety precheck before mutation. Full queued+outbox contract
 * only under exact zero-consumer topology. Blocked while render dispatch sweepers active.
 */

import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { R2UploadCapabilityAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-upload-capability.adapter";
import { NeonHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/neon-render-dispatch-outbox.adapter";
import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import {
  classifyHeadlessR2Environment,
  readConfiguredHeadlessR2Config,
} from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessOwnedObjectStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { defaultFlyRenderLiveCleanup } from "./cleanup";
import { buildFlyRenderLiveSchemaFingerprint } from "./evidence-authority";
import { runAttributedFlyRenderJobCreateChain } from "./job-create-attribution";
import {
  type JobCreateProbeConsumerSafetyAssessment,
  jobCreateProbeRequiresMutationBlock,
  parseJobCreateProbeConsumerTopologyFromFlyListJson,
} from "./job-create-probe-consumer-safety";
import {
  assertJobCreateProbeEvidenceSafe,
  createNotTestedFlyRenderJobCreateProbeEvidence,
  defaultFlyRenderJobCreateProbeEvidencePath,
  JOB_CREATE_PROBE_ELIGIBILITY,
  jobCreateProbeCannotFalsePass,
  preserveOrInitializeFlyRenderJobCreateProbeEvidence,
  writeFlyRenderJobCreateProbeEvidence,
  type FlyRenderJobCreateProbeEvidenceDocument,
  type JobCreateProbeConsumerSafetyMode,
} from "./job-create-probe-evidence";
import {
  attributeFlyRenderLiveEnvironment,
  isFlyRenderLiveConfigAttributionEligible,
  validateFlyRenderLiveQaEnvContract,
} from "./qa-secret-contract";
import { emptyFlyRenderLiveSession } from "./types";
import type { FlyRenderLiveMatrixContext } from "./types";

const execFileAsync = promisify(execFile);

export const HEADLESS_FLY_RENDER_QA_JOB_CREATE_PROBE_GATE =
  "HEADLESS_FLY_RENDER_QA_JOB_CREATE_PROBE" as const;

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  return (
    (env as Record<string, unknown>)[
      HEADLESS_FLY_RENDER_QA_JOB_CREATE_PROBE_GATE
    ] === "1"
  );
}

export type FlyRenderJobCreateProbeDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly forceGateOn?: boolean;
  readonly injectedSql?: HeadlessSqlExecutor;
  readonly cleanupRunner?: typeof defaultFlyRenderLiveCleanup;
  readonly nowIso?: () => string;
  readonly connectionProbe?: () => void;
  readonly readConsumerTopology?: () => Promise<
    JobCreateProbeConsumerSafetyAssessment | { readonly ok: false }
  >;
};

async function defaultReadConsumerTopology(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): Promise<JobCreateProbeConsumerSafetyAssessment | { readonly ok: false }> {
  const appName = (env as Record<string, unknown>).HEADLESS_FLY_STAGING_APP_NAME;
  if (typeof appName !== "string" || appName.length === 0) {
    return { ok: false };
  }
  try {
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
    return parseJobCreateProbeConsumerTopologyFromFlyListJson(json);
  } catch {
    return { ok: false };
  }
}

export async function runFlyRenderJobCreateProbe(
  deps: FlyRenderJobCreateProbeDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: FlyRenderJobCreateProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
  readonly providerMutationCalls: number;
}> {
  console.log(
    "\nSprint 11E Phase 2E.2D.8B.1 — Fly render targeted job-create probe\n",
  );
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultFlyRenderJobCreateProbeEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  let connectionFactoryCalls = 0;
  let providerMutationCalls = 0;

  if (!deps.forceGateOn && !isGateOn(env)) {
    const preserved = preserveOrInitializeFlyRenderJobCreateProbeEvidence(
      evidencePath,
    );
    console.log(
      "  NOT TESTED — set HEADLESS_FLY_RENDER_QA_JOB_CREATE_PROBE=1 with Neon+R2 staging.",
    );
    console.log(
      `  Job-create probe evidence ${preserved.action} (overall=${preserved.overall}). Zero connections.`,
    );
    return {
      exitCode: 0,
      overall: "NOT_TESTED",
      connectionFactoryCalls: 0,
      providerMutationCalls: 0,
    };
  }

  const configAttribution = attributeFlyRenderLiveEnvironment(env);
  const envContract = validateFlyRenderLiveQaEnvContract(env);
  if (
    !isFlyRenderLiveConfigAttributionEligible(configAttribution) ||
    !envContract.ok
  ) {
    writeFlyRenderJobCreateProbeEvidence({
      evidencePath,
      document: {
        ...createNotTestedFlyRenderJobCreateProbeEvidence([
          "Gate on but Neon/R2 QA secret contract incomplete.",
          "Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
        ]),
        overall: "FAIL",
        eligibilityVerdict: JOB_CREATE_PROBE_ELIGIBILITY.FAIL_CONFIG,
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
        consumerSafetyMode: "not_assessed",
      },
    });
    return {
      exitCode: 1,
      overall: "FAIL",
      connectionFactoryCalls: 0,
      providerMutationCalls: 0,
    };
  }

  const startedAtIso = nowIso();
  let sql: HeadlessSqlExecutor | null = null;
  let matrixCtx: FlyRenderLiveMatrixContext | null = null;
  let attributedStages: FlyRenderJobCreateProbeEvidenceDocument["stages"] = [];
  let failureStage: string | null = null;
  let failureReasonId: string | null = null;
  let cleanupStatus: FlyRenderJobCreateProbeEvidenceDocument["cleanupStatus"] =
    "not_run";
  let consumerSafetyMode: JobCreateProbeConsumerSafetyMode = "not_assessed";

  // --- read-only consumer safety precheck (Fly only; no Neon/R2 mutation) ---
  const topologyReader =
    deps.readConsumerTopology ?? (() => defaultReadConsumerTopology(env));
  connectionFactoryCalls += 1;
  const consumerAssessment = await topologyReader();

  if (!("mode" in consumerAssessment)) {
    consumerSafetyMode = "not_assessed";
    failureStage = "consumer_safety_precheck";
    failureReasonId = "consumer_topology_unavailable";
    attributedStages = [
      {
        stage: "consumer_safety_precheck",
        status: "failed",
        reasonId: "consumer_topology_unavailable",
      },
    ];
  } else if (jobCreateProbeRequiresMutationBlock(consumerAssessment)) {
    consumerSafetyMode = "blocked_active_consumers";
    failureStage = "consumer_safety_precheck";
    failureReasonId = "active_staging_consumers_block_mutation";
    attributedStages = [
      {
        stage: "consumer_safety_precheck",
        status: "failed",
        reasonId: "active_staging_consumers_block_mutation",
      },
    ];
  } else {
    consumerSafetyMode = "zero_consumer";
  }

  if (failureStage != null) {
    const document: FlyRenderJobCreateProbeEvidenceDocument = {
      title:
        "Sprint 11E Phase 2E.2D.8B.1 — Fly render targeted job-create probe",
      overall: "FAIL",
      eligibilityVerdict: JOB_CREATE_PROBE_ELIGIBILITY.FAIL_BLOCKED_CONSUMERS,
      startedAtIso,
      endedAtIso: nowIso(),
      failureStage,
      failureReasonId,
      stages: attributedStages,
      cleanupStatus: "not_run",
      consumerSafetyMode,
      notes: [
        "Blocked before Neon/R2 mutation — active staging render dispatch sweepers may race probe outbox reread.",
        "Does not claim queued+pending-outbox contract while verify=1 render=1 workers are operational.",
        "Use separately authorized official render-live matrix for dispatch/hosted render path.",
        "Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
      ],
    };
    writeFlyRenderJobCreateProbeEvidence({ evidencePath, document });
    const safe = assertJobCreateProbeEvidenceSafe(
      readFileSync(evidencePath, "utf8"),
    );
    if (!safe.ok) {
      console.error(`  Evidence safety rejected: ${safe.message}`);
    }
    console.log(`  Overall: FAIL (consumer safety block)`);
    console.log(`  Consumer mode: ${consumerSafetyMode}`);
    return {
      exitCode: 1,
      overall: "FAIL",
      connectionFactoryCalls,
      providerMutationCalls: 0,
    };
  }

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else {
      deps.connectionProbe?.();
      connectionFactoryCalls += 1;
      providerMutationCalls += 1;
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) throw new Error("neon_unconfigured");
      sql = createNeonSqlExecutor({ connectionString });
    }

    if (classifyHeadlessNeonEnvironment(env) !== "configured") {
      throw new Error("neon_unconfigured");
    }
    if (classifyHeadlessR2Environment(env) !== "configured") {
      throw new Error("r2_unconfigured");
    }

    const preflight = await runHeadlessSchemaPreflight({ sql: sql! });
    if (!preflight.ok) throw new Error("schema_preflight_failed");

    const r2Config = readConfiguredHeadlessR2Config(env);
    if (r2Config == null) throw new Error("r2_unconfigured");

    const runId = randomUUID();
    const ownerId = `owner_jcp_${runId.replace(/-/g, "").slice(0, 16)}`;
    const projectId = randomUUID();
    const streamNames = deriveHeadlessQueueStreamNames("staging");
    const ownedObjectStore = new NeonHeadlessOwnedObjectStoreAdapter(sql!);
    const io = new R2StorageAdapter({
      env,
      configOverride: r2Config,
      authorizeOwner: () => true,
    });
    const uploadCapability = new R2UploadCapabilityAdapter({
      ownedObjectStore,
      configOverride: r2Config,
    });

    matrixCtx = {
      runId,
      ownerId,
      otherOwnerId: `other_jcp_${runId.slice(0, 8)}`,
      projectId,
      nowMs: Date.now(),
      sql: sql!,
      jobStore: new NeonHeadlessJobStoreAdapter(sql!),
      ownedObjectStore,
      projectAuthorization: new NeonHeadlessProjectAuthorizationAdapter(sql!),
      io,
      uploadCapability,
      downloadCapability: null,
      r2Config,
      createdJobIds: [],
      createdProjectIds: [],
      createdObjectIds: [],
      createdR2Locators: [],
      session: emptyFlyRenderLiveSession(),
      env,
      flyAppName: "probe-local-only",
      acceptedImageDigestSha256: "probe",
      restProducer: null,
      tcpConsumer: null,
      streamNames,
      streamAuthority: "production_env",
      dispatchOutbox: new NeonHeadlessRenderDispatchOutboxAdapter(sql!),
      preflightFingerprint: buildFlyRenderLiveSchemaFingerprint(),
      trackedStreamIds: [],
      runOwnedActiveStreamIds: [],
      smokePollTimeoutMs: 180_000,
      smokeContentDurationMs: 2_000,
      resourceObservation: null,
    };

    const attributed = await runAttributedFlyRenderJobCreateChain({
      ctx: matrixCtx,
      includeDispatchOutboxIntentReread: true,
      markCleanupSkipped: true,
    });
    attributedStages = attributed.stages;
    if (!attributed.ok) {
      failureStage = attributed.failureStage;
      failureReasonId = attributed.failureReasonId;
      throw new Error("PROBE_ATTRIBUTED_FAIL");
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message !== "PROBE_ATTRIBUTED_FAIL" &&
      failureStage == null
    ) {
      failureStage = "live_manifest_construction";
      failureReasonId = "unknown_safe_failure";
    }
  } finally {
    if (matrixCtx != null) {
      const cleanupRunner = deps.cleanupRunner ?? defaultFlyRenderLiveCleanup;
      cleanupStatus = await cleanupRunner(matrixCtx, false);
    }
  }

  const pass =
    failureStage == null &&
    failureReasonId == null &&
    consumerSafetyMode === "zero_consumer" &&
    attributedStages.some(
      (s) => s.stage === "dispatch_outbox_intent_reread" && s.status === "ok",
    ) &&
    (cleanupStatus === "ok" || cleanupStatus === "preserved");

  const overall: FlyRenderJobCreateProbeEvidenceDocument["overall"] = pass
    ? "PASS"
    : "FAIL";
  const eligibilityVerdict =
    cleanupStatus === "failed"
      ? JOB_CREATE_PROBE_ELIGIBILITY.FAIL_CLEANUP
      : pass
        ? JOB_CREATE_PROBE_ELIGIBILITY.PASS_ZERO_CONSUMER
        : JOB_CREATE_PROBE_ELIGIBILITY.FAIL;

  const document: FlyRenderJobCreateProbeEvidenceDocument = {
    title: "Sprint 11E Phase 2E.2D.8B.1 — Fly render targeted job-create probe",
    overall,
    eligibilityVerdict,
    startedAtIso,
    endedAtIso: nowIso(),
    failureStage,
    failureReasonId,
    stages: attributedStages,
    cleanupStatus,
    consumerSafetyMode,
    notes: [
      "Zero-consumer topology required for queued+pending-outbox contract.",
      "Blocked before mutation when verify=1 render=1 operational consumers exist.",
      "No render delivery; no Fly Machine mutation.",
      "Does not overwrite docs/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
    ],
  };

  writeFlyRenderJobCreateProbeEvidence({ evidencePath, document });
  const safe = assertJobCreateProbeEvidenceSafe(
    readFileSync(evidencePath, "utf8"),
  );
  if (!safe.ok) {
    console.error(`  Evidence safety rejected: ${safe.message}`);
    return {
      exitCode: 1,
      overall: "FAIL",
      connectionFactoryCalls,
      providerMutationCalls,
    };
  }

  if (overall === "PASS") {
    const authority = jobCreateProbeCannotFalsePass(document);
    if (!authority.ok) {
      console.error(`  False PASS rejected: ${authority.message}`);
      return {
        exitCode: 1,
        overall: "FAIL",
        connectionFactoryCalls,
        providerMutationCalls,
      };
    }
  }

  console.log(`  Overall: ${overall}`);
  console.log(`  Consumer mode: ${consumerSafetyMode}`);
  console.log(`  Cleanup: ${cleanupStatus}`);
  if (failureStage != null) {
    console.log(`  Failure stage: ${failureStage}`);
    console.log(`  Failure reasonId: ${failureReasonId ?? "none"}`);
  }

  return {
    exitCode: overall === "PASS" ? 0 : 1,
    overall,
    connectionFactoryCalls,
    providerMutationCalls,
  };
}
