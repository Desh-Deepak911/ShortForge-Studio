/**
 * Gated 4K capacity cleanup recovery runner — preview or bounded mutation.
 * Sprint 11E Phase 2E.2D.8K.2
 */

import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";

import {
  countFlyRender4kCapacityCleanupRecoveryLeftovers,
  discoverFlyRender4kCapacityCleanupRecoveryTarget,
  FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_ENDED_MS,
  FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA,
  FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_STARTED_MS,
  isFlyRender4kCapacityCleanupRecoveryGateOn,
  isFlyRender4kCapacityCleanupRecoveryMutateGateOn,
} from "./capacity-4k-cleanup-recovery";

export type FlyRender4kCapacityCleanupRecoveryHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly forceGateOn?: boolean;
  readonly forceMutateGateOn?: boolean;
  readonly sql?: import("@/features/headless-renderer/control-plane/runtime/sql-client").HeadlessSqlExecutor;
  readonly windowStartMs?: number;
  readonly windowEndMs?: number;
};

export async function runFlyRender4kCapacityCleanupRecoveryHarness(
  deps: FlyRender4kCapacityCleanupRecoveryHarnessDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: "NOT_TESTED" | "PASS" | "FAIL";
  readonly failClass?: string;
  readonly leftoverCount?: number | null;
}> {
  const env = deps.env ?? process.env;
  const gateOn =
    deps.forceGateOn === true || isFlyRender4kCapacityCleanupRecoveryGateOn(env);
  const mutateGateOn =
    deps.forceMutateGateOn === true ||
    isFlyRender4kCapacityCleanupRecoveryMutateGateOn(env);

  if (!gateOn) {
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const windowStartMs =
    deps.windowStartMs ?? FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_STARTED_MS;
  const windowEndMs =
    deps.windowEndMs ?? FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_ENDED_MS;

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

  const discovery = await discoverFlyRender4kCapacityCleanupRecoveryTarget({
    sql,
    windowStartMs,
    windowEndMs,
  });

  if (!discovery.ok) {
    if (discovery.failClass === "discovery_zero_matches") {
      return {
        exitCode: 0,
        overall: "PASS",
        leftoverCount: 0,
      };
    }
    return {
      exitCode: 1,
      overall: "FAIL",
      failClass: discovery.failClass,
    };
  }

  const leftovers = await countFlyRender4kCapacityCleanupRecoveryLeftovers({
    sql,
    ownerId: discovery.target.ownerId,
    jobIds: discovery.target.jobIds,
  });

  if (leftovers == null) {
    return { exitCode: 1, overall: "FAIL", failClass: "leftover_count_failed" };
  }

  if (leftovers.totalCount === 0) {
    return {
      exitCode: 0,
      overall: "PASS",
      leftoverCount: 0,
    };
  }

  if (!mutateGateOn) {
    return {
      exitCode: 1,
      overall: "FAIL",
      failClass: "leftovers_present_mutate_gate_off",
      leftoverCount: leftovers.totalCount,
    };
  }

  return {
    exitCode: 1,
    overall: "FAIL",
    failClass: "mutation_not_implemented_preview_only",
    leftoverCount: leftovers.totalCount,
  };
}

export const FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ARCHIVED_EVIDENCE_SHA =
  FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA;
