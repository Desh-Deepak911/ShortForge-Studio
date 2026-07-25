/**
 * Gated execution-probe cleanup recovery runner — preview or bounded mutation.
 * Sprint 11E Phase 2E.2D.8I
 */

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { readConfiguredHeadlessR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { readConfiguredHeadlessUpstashConsumerConfig } from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import { executeFlyRenderExecutionProbeCleanupRecoveryMutation } from "./execution-probe-cleanup-recovery-mutation";
import {
  countGlobalExecutionProbeNeonLeftovers,
  discoverFlyRenderExecutionProbeCleanupRecoveryTarget,
  FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
  FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_ENDED_MS,
  FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_STARTED_MS,
  isFlyRenderExecutionProbeCleanupRecoveryGateOn,
  isFlyRenderExecutionProbeCleanupRecoveryMutateGateOn,
  mergeFlyRenderExecutionProbeCleanupRecoveryTrustedPublicEnv,
} from "./execution-probe-cleanup-recovery";
import {
  defaultFlyRenderExecutionProbeCleanupRecoveryEvidencePath,
  writeFlyRenderExecutionProbeCleanupRecoveryEvidence,
} from "./execution-probe-cleanup-recovery-evidence";

export type FlyRenderExecutionProbeCleanupRecoveryHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly nowIso?: () => string;
  readonly forceGateOn?: boolean;
  readonly forceMutateGateOn?: boolean;
  readonly sql?: import("@/features/headless-renderer/control-plane/runtime/sql-client").HeadlessSqlExecutor;
  readonly storage?: R2StorageAdapter;
  readonly redis?: import("./execution-probe-cleanup-recovery-mutation").FlyRenderExecutionProbeCleanupRecoveryRedisPort | null;
  readonly windowStartMs?: number;
  readonly windowEndMs?: number;
};

export async function runFlyRenderExecutionProbeCleanupRecoveryHarness(
  deps: FlyRenderExecutionProbeCleanupRecoveryHarnessDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: "NOT_TESTED" | "PASS" | "FAIL" | "PARTIAL";
}> {
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultFlyRenderExecutionProbeCleanupRecoveryEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const gateOn =
    deps.forceGateOn === true ||
    isFlyRenderExecutionProbeCleanupRecoveryGateOn(env);
  const mutateGateOn =
    deps.forceMutateGateOn === true ||
    isFlyRenderExecutionProbeCleanupRecoveryMutateGateOn(env);

  if (!gateOn) {
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const startedAtIso = nowIso();
  const windowStartMs =
    deps.windowStartMs ?? FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_STARTED_MS;
  const windowEndMs =
    deps.windowEndMs ?? FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_ENDED_MS;

  let sql = deps.sql ?? null;
  if (sql == null) {
    const connectionString = readConfiguredHeadlessDatabaseUrl(env);
    if (connectionString != null) {
      sql = createNeonSqlExecutor({ connectionString });
    }
  }

  if (sql == null) {
    writeFlyRenderExecutionProbeCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.8I — Hosted Fly render execution-probe cleanup recovery",
        overall: "FAIL",
        failClass: "recovery_sql_unavailable",
        archivedLiveEvidenceSha256:
          FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: null,
        globalNeonLeftoverCount: null,
        mutationExecuted: false,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: [
          "Gate on but DATABASE_URL unavailable — recovery requires Neon access.",
          "Never overwrites official execution-probe evidence.",
        ],
      },
    });
    return { exitCode: 1, overall: "FAIL" };
  }

  const globalLeftovers = await countGlobalExecutionProbeNeonLeftovers({ sql });

  const discovery = await discoverFlyRenderExecutionProbeCleanupRecoveryTarget({
    sql,
    windowStartMs,
    windowEndMs,
  });

  if (!discovery.ok) {
    if (
      discovery.failClass === "discovery_zero_matches" &&
      globalLeftovers != null &&
      globalLeftovers.totalCount === 0
    ) {
      writeFlyRenderExecutionProbeCleanupRecoveryEvidence({
        evidencePath,
        document: {
          title:
            "Sprint 11E Phase 2E.2D.8I — Hosted Fly render execution-probe cleanup recovery",
          overall: "PASS",
          failClass: null,
          archivedLiveEvidenceSha256:
            FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
          windowStartMs,
          windowEndMs,
          preview: null,
          globalNeonLeftoverCount: 0,
          mutationExecuted: false,
          startedAtIso,
          endedAtIso: nowIso(),
          notes: [
            "Exact-window discovery found zero probe runs — already clean.",
            "Global Neon fep_owner probe scope total_count=0.",
            "No foreign resources mutated.",
            "Never overwrites official execution-probe evidence.",
          ],
        },
      });
      return { exitCode: 0, overall: "PASS" };
    }

    writeFlyRenderExecutionProbeCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.8I — Hosted Fly render execution-probe cleanup recovery",
        overall: "FAIL",
        failClass: discovery.failClass,
        archivedLiveEvidenceSha256:
          FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: null,
        globalNeonLeftoverCount: globalLeftovers?.totalCount ?? null,
        mutationExecuted: false,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: [
          "Discovery failed closed — no foreign resources deleted.",
          "Never overwrites official execution-probe evidence.",
        ],
      },
    });
    return { exitCode: 1, overall: "FAIL" };
  }

  if (!mutateGateOn) {
    writeFlyRenderExecutionProbeCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.8I — Hosted Fly render execution-probe cleanup recovery",
        overall: "PASS",
        failClass: null,
        archivedLiveEvidenceSha256:
          FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: discovery.preview,
        globalNeonLeftoverCount: globalLeftovers?.totalCount ?? null,
        mutationExecuted: false,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: [
          "Preview-only discovery for archived FAIL window — safe counts only.",
          `coherence_result=ok candidate_runs=1 object_count=${discovery.preview.objectCount} r2_locator_count=${discovery.preview.r2LocatorCount}`,
          "Bounded delete mutation not executed — requires separate authorization.",
          "Never overwrites official execution-probe evidence.",
        ],
      },
    });
    return { exitCode: 0, overall: "PASS" };
  }

  let storage = deps.storage ?? null;
  const providerEnv =
    mergeFlyRenderExecutionProbeCleanupRecoveryTrustedPublicEnv(env);
  if (storage == null) {
    const r2Config = readConfiguredHeadlessR2Config(providerEnv);
    if (r2Config == null) {
      writeFlyRenderExecutionProbeCleanupRecoveryEvidence({
        evidencePath,
        document: {
          title:
            "Sprint 11E Phase 2E.2D.8I — Hosted Fly render execution-probe cleanup recovery",
          overall: "FAIL",
          failClass: "recovery_r2_unavailable",
          archivedLiveEvidenceSha256:
            FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
          windowStartMs,
          windowEndMs,
          preview: discovery.preview,
          globalNeonLeftoverCount: globalLeftovers?.totalCount ?? null,
          mutationExecuted: false,
          startedAtIso,
          endedAtIso: nowIso(),
          notes: [
            "Mutate gate on but R2 config unavailable — zero mutation executed.",
            "Never overwrites official execution-probe evidence.",
          ],
        },
      });
      return { exitCode: 1, overall: "FAIL" };
    }
    storage = new R2StorageAdapter({
      env: providerEnv,
      configOverride: r2Config,
      authorizeOwner: () => true,
    });
  }

  let redis = deps.redis ?? null;
  let ownsTcpClose = false;
  if (redis == null) {
    const consumerConfig = readConfiguredHeadlessUpstashConsumerConfig(providerEnv);
    if (consumerConfig == null) {
      writeFlyRenderExecutionProbeCleanupRecoveryEvidence({
        evidencePath,
        document: {
          title:
            "Sprint 11E Phase 2E.2D.8I — Hosted Fly render execution-probe cleanup recovery",
          overall: "FAIL",
          failClass: "recovery_redis_unavailable",
          archivedLiveEvidenceSha256:
            FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
          windowStartMs,
          windowEndMs,
          preview: discovery.preview,
          globalNeonLeftoverCount: globalLeftovers?.totalCount ?? null,
          mutationExecuted: false,
          startedAtIso,
          endedAtIso: nowIso(),
          notes: [
            "Mutate gate on but Upstash TCP config unavailable — zero mutation executed.",
            "Never overwrites official execution-probe evidence.",
          ],
        },
      });
      return { exitCode: 1, overall: "FAIL" };
    }
    redis = new UpstashTcpStreamConsumerAdapter({
      config: consumerConfig,
      envName: "staging",
    });
    ownsTcpClose = true;
  }

  try {
    const mutation = await executeFlyRenderExecutionProbeCleanupRecoveryMutation({
      sql,
      storage,
      redis,
      target: discovery.target,
      windowStartMs,
      windowEndMs,
      blockOnActiveClaim: true,
      activeClaimPresent: discovery.preview.activeClaimPresent,
    });

    const postGlobal = await countGlobalExecutionProbeNeonLeftovers({ sql });

    if (!mutation.ok) {
      writeFlyRenderExecutionProbeCleanupRecoveryEvidence({
        evidencePath,
        document: {
          title:
            "Sprint 11E Phase 2E.2D.8I — Hosted Fly render execution-probe cleanup recovery",
          overall: "FAIL",
          failClass: mutation.failClass,
          archivedLiveEvidenceSha256:
            FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
          windowStartMs,
          windowEndMs,
          preview: discovery.preview,
          globalNeonLeftoverCount: postGlobal?.totalCount ?? null,
          mutationExecuted: true,
          startedAtIso,
          endedAtIso: nowIso(),
          notes: [
            "Bounded mutation attempted but failed closed.",
            "Never overwrites official execution-probe evidence.",
          ],
        },
      });
      return { exitCode: 1, overall: "FAIL" };
    }

    writeFlyRenderExecutionProbeCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.8I — Hosted Fly render execution-probe cleanup recovery",
        overall: "PASS",
        failClass: null,
        archivedLiveEvidenceSha256:
          FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: discovery.preview,
        globalNeonLeftoverCount: postGlobal?.totalCount ?? 0,
        mutationExecuted: true,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: [
          "Bounded mutation completed — run-owned resources removed.",
          `r2_deleted_count=${mutation.r2DeletedCount}`,
          `post_mutation_neon_total_count=${postGlobal?.totalCount ?? 0}`,
          "Never overwrites official execution-probe evidence.",
        ],
      },
    });
    return { exitCode: 0, overall: "PASS" };
  } finally {
    if (ownsTcpClose && redis != null && "close" in redis) {
      await (redis as { close: () => Promise<void> }).close().catch(() => {});
    }
  }
}
