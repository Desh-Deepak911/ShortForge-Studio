/**
 * Gated render-live cleanup recovery runner — preview or bounded mutation.
 * Sprint 11E Phase 2E.2D.8J.1
 */

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { readConfiguredHeadlessR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { readConfiguredHeadlessUpstashConsumerConfig } from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import { executeFlyRenderExecutionProbeCleanupRecoveryMutation } from "./execution-probe-cleanup-recovery-mutation";
import {
  countFlyRenderLiveCleanupRecoveryNeonLeftovers,
  countGlobalFlyRenderLiveNeonLeftovers,
  discoverFlyRenderLiveCleanupRecoveryTarget,
  FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_ENDED_MS,
  FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
  FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_STARTED_MS,
  isFlyRenderLiveCleanupRecoveryGateOn,
  isFlyRenderLiveCleanupRecoveryMutateGateOn,
  mergeFlyRenderLiveCleanupRecoveryTrustedPublicEnv,
} from "./render-live-cleanup-recovery";

export type FlyRenderLiveCleanupRecoveryHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly nowIso?: () => string;
  readonly forceGateOn?: boolean;
  readonly forceMutateGateOn?: boolean;
  readonly sql?: import("@/features/headless-renderer/control-plane/runtime/sql-client").HeadlessSqlExecutor;
  readonly storage?: R2StorageAdapter;
  readonly redis?: import("./execution-probe-cleanup-recovery-mutation").FlyRenderExecutionProbeCleanupRecoveryRedisPort | null;
  readonly windowStartMs?: number;
  readonly windowEndMs?: number;
};

export async function runFlyRenderLiveCleanupRecoveryHarness(
  deps: FlyRenderLiveCleanupRecoveryHarnessDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: "NOT_TESTED" | "PASS" | "FAIL";
  readonly failClass?: string;
  readonly globalNeonLeftoverCount?: number | null;
}> {
  const env = deps.env ?? process.env;
  const gateOn =
    deps.forceGateOn === true || isFlyRenderLiveCleanupRecoveryGateOn(env);
  const mutateGateOn =
    deps.forceMutateGateOn === true ||
    isFlyRenderLiveCleanupRecoveryMutateGateOn(env);

  if (!gateOn) {
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const windowStartMs =
    deps.windowStartMs ?? FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_STARTED_MS;
  const windowEndMs =
    deps.windowEndMs ?? FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_ENDED_MS;

  let sql = deps.sql ?? null;
  if (sql == null) {
    const connectionString = readConfiguredHeadlessDatabaseUrl(env);
    if (connectionString != null) {
      sql = createNeonSqlExecutor({ connectionString });
    }
  }
  if (sql == null) {
    return { exitCode: 1, overall: "FAIL", failClass: "recovery_sql_unavailable" };
  }

  const globalLeftovers = await countGlobalFlyRenderLiveNeonLeftovers({ sql });
  const discovery = await discoverFlyRenderLiveCleanupRecoveryTarget({
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
      return {
        exitCode: 0,
        overall: "PASS",
        globalNeonLeftoverCount: 0,
      };
    }
    return {
      exitCode: 1,
      overall: "FAIL",
      failClass: discovery.failClass,
      globalNeonLeftoverCount: globalLeftovers?.totalCount ?? null,
    };
  }

  if (!mutateGateOn) {
    return {
      exitCode: 0,
      overall: "PASS",
      globalNeonLeftoverCount: globalLeftovers?.totalCount ?? null,
    };
  }

  const providerEnv = mergeFlyRenderLiveCleanupRecoveryTrustedPublicEnv(env);
  let storage = deps.storage ?? null;
  if (storage == null) {
    const r2Config = readConfiguredHeadlessR2Config(providerEnv);
    if (r2Config == null) {
      return { exitCode: 1, overall: "FAIL", failClass: "recovery_r2_unavailable" };
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
      return {
        exitCode: 1,
        overall: "FAIL",
        failClass: "recovery_redis_unavailable",
      };
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
      blockOnActiveClaim: false,
      activeClaimPresent: discovery.preview.activeClaimPresent,
    });
    const postTarget = await countFlyRenderLiveCleanupRecoveryNeonLeftovers({
      sql,
      ownerId: discovery.target.ownerId,
      jobId: discovery.target.jobId,
    });
    const postGlobal = await countGlobalFlyRenderLiveNeonLeftovers({ sql });

    if (!mutation.ok) {
      return {
        exitCode: 1,
        overall: "FAIL",
        failClass: mutation.failClass,
        globalNeonLeftoverCount: postGlobal?.totalCount ?? null,
      };
    }
    if (postTarget != null && postTarget.totalCount > 0) {
      return {
        exitCode: 1,
        overall: "FAIL",
        failClass: "post_mutation_neon_leftovers",
        globalNeonLeftoverCount: postGlobal?.totalCount ?? null,
      };
    }
    return {
      exitCode: 0,
      overall: "PASS",
      globalNeonLeftoverCount: postGlobal?.totalCount ?? 0,
    };
  } finally {
    if (ownsTcpClose && redis != null && "close" in redis) {
      await (redis as { close: () => Promise<void> }).close().catch(() => {});
    }
  }
}

export const FLY_RENDER_LIVE_CLEANUP_RECOVERY_ARCHIVED_EVIDENCE_SHA =
  FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA;
