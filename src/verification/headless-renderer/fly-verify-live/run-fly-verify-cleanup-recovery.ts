/**
 * Gated cleanup recovery runner — preview or bounded mutation when separately authorized.
 */

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { readConfiguredHeadlessR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { readConfiguredHeadlessUpstashConsumerConfig } from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import { executeFlyVerifyCleanupRecoveryMutation } from "./cleanup-recovery-mutation";
import {
  assertFlyVerifyCleanupRecoveryPreviewUnchanged,
  countFlyVerifyCleanupRecoveryNeonLeftovers,
  discoverFlyVerifyCleanupRecoveryTarget,
  FLY_VERIFY_LIVE_ARCHIVED_FAIL_ENDED_MS,
  FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
  FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS,
  isFlyVerifyCleanupRecoveryGateOn,
  isFlyVerifyCleanupRecoveryMutateGateOn,
  mergeFlyVerifyCleanupRecoveryTrustedPublicEnv,
} from "./cleanup-recovery";
import {
  defaultFlyVerifyCleanupRecoveryEvidencePath,
  writeFlyVerifyCleanupRecoveryEvidence,
} from "./cleanup-recovery-evidence";

export type FlyVerifyCleanupRecoveryHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly nowIso?: () => string;
  readonly forceGateOn?: boolean;
  readonly forceMutateGateOn?: boolean;
  readonly sql?: import("@/features/headless-renderer/control-plane/runtime/sql-client").HeadlessSqlExecutor;
  readonly storage?: R2StorageAdapter;
  readonly redis?: import("./cleanup-recovery-mutation").FlyVerifyCleanupRecoveryRedisPort | null;
  readonly windowStartMs?: number;
  readonly windowEndMs?: number;
};

export async function runFlyVerifyCleanupRecoveryHarness(
  deps: FlyVerifyCleanupRecoveryHarnessDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: "NOT_TESTED" | "PASS" | "FAIL" | "PARTIAL";
}> {
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultFlyVerifyCleanupRecoveryEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const gateOn = deps.forceGateOn === true || isFlyVerifyCleanupRecoveryGateOn(env);
  const mutateGateOn =
    deps.forceMutateGateOn === true ||
    isFlyVerifyCleanupRecoveryMutateGateOn(env);

  if (!gateOn) {
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const startedAtIso = nowIso();
  const windowStartMs =
    deps.windowStartMs ?? FLY_VERIFY_LIVE_ARCHIVED_FAIL_STARTED_MS;
  const windowEndMs = deps.windowEndMs ?? FLY_VERIFY_LIVE_ARCHIVED_FAIL_ENDED_MS;

  let sql = deps.sql ?? null;
  if (sql == null) {
    const connectionString = readConfiguredHeadlessDatabaseUrl(env);
    if (connectionString != null) {
      sql = createNeonSqlExecutor({ connectionString });
    }
  }

  if (sql == null) {
    writeFlyVerifyCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.7A.2 — Hosted Fly verifier cleanup recovery",
        overall: "FAIL",
        failClass: "recovery_sql_unavailable",
        archivedLiveEvidenceSha256: FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: null,
        neonLeftoverCount: null,
        mutationDispositions: null,
        postMutationAbsence: null,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: [
          "Gate on but DATABASE_URL unavailable — recovery requires Neon access.",
          "Never overwrites official live evidence.",
        ],
      },
    });
    return { exitCode: 1, overall: "FAIL" };
  }

  const discovery = await discoverFlyVerifyCleanupRecoveryTarget({
    sql,
    windowStartMs,
    windowEndMs,
  });

  if (!discovery.ok) {
    writeFlyVerifyCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.7A.2 — Hosted Fly verifier cleanup recovery",
        overall: "FAIL",
        failClass: discovery.failClass,
        archivedLiveEvidenceSha256: FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: null,
        neonLeftoverCount: null,
        mutationDispositions: null,
        postMutationAbsence: null,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: [
          "Discovery failed closed — no foreign resources deleted.",
          "Never overwrites official live evidence.",
        ],
      },
    });
    return { exitCode: 1, overall: "FAIL" };
  }

  const previewStable = assertFlyVerifyCleanupRecoveryPreviewUnchanged(
    discovery.preview,
  );
  if (!previewStable.ok) {
    writeFlyVerifyCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.7A.2 — Hosted Fly verifier cleanup recovery",
        overall: "FAIL",
        failClass: previewStable.failClass,
        archivedLiveEvidenceSha256: FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: discovery.preview,
        neonLeftoverCount: null,
        mutationDispositions: null,
        postMutationAbsence: null,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: [
          "Pre-mutation discovery drift — zero provider mutation executed.",
          "Never overwrites official live evidence.",
        ],
      },
    });
    return { exitCode: 1, overall: "FAIL" };
  }

  if (!mutateGateOn) {
    const leftovers = await countFlyVerifyCleanupRecoveryNeonLeftovers({
      sql,
      ownerId: discovery.preview.ownerId,
      jobId: discovery.preview.jobId,
    });

    if (leftovers == null) {
      writeFlyVerifyCleanupRecoveryEvidence({
        evidencePath,
        document: {
          title:
            "Sprint 11E Phase 2E.2D.7A.2 — Hosted Fly verifier cleanup recovery",
          overall: "FAIL",
          failClass: "recovery_leftover_read_failed",
          archivedLiveEvidenceSha256: FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
          windowStartMs,
          windowEndMs,
          preview: discovery.preview,
          neonLeftoverCount: null,
          mutationDispositions: null,
          postMutationAbsence: null,
          startedAtIso,
          endedAtIso: nowIso(),
          notes: [
            "Discovery succeeded but leftover count read failed.",
            "No mutation executed.",
            "Never overwrites official live evidence.",
          ],
        },
      });
      return { exitCode: 1, overall: "FAIL" };
    }

    writeFlyVerifyCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.7A.2 — Hosted Fly verifier cleanup recovery",
        overall: "PASS",
        failClass: null,
        archivedLiveEvidenceSha256: FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: discovery.preview,
        neonLeftoverCount: leftovers.totalCount,
        mutationDispositions: null,
        postMutationAbsence: null,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: [
          "Preview-only discovery for archived FAIL window — safe counts only.",
          `coherence_result=ok candidate_runs=1 neon_jobs=${leftovers.jobCount} owned_objects=${leftovers.objectCount} project_ownership_rows=${leftovers.projectOwnershipCount} r2_locators=${discovery.preview.r2LocatorCount} redis_stream_ids=${discovery.preview.redisStreamIdCount} redis_pending=not_probed`,
          "Bounded delete mutation not executed — requires separate authorization.",
          "Never overwrites official live evidence.",
        ],
      },
    });

    return { exitCode: 0, overall: "PASS" };
  }

  let storage = deps.storage ?? null;
  const providerEnv = mergeFlyVerifyCleanupRecoveryTrustedPublicEnv(env);
  if (storage == null) {
    const r2Config = readConfiguredHeadlessR2Config(providerEnv);
    if (r2Config == null) {
      writeFlyVerifyCleanupRecoveryEvidence({
        evidencePath,
        document: {
          title:
            "Sprint 11E Phase 2E.2D.7A.2 — Hosted Fly verifier cleanup recovery",
          overall: "FAIL",
          failClass: "recovery_r2_unavailable",
          archivedLiveEvidenceSha256: FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
          windowStartMs,
          windowEndMs,
          preview: discovery.preview,
          neonLeftoverCount: null,
          mutationDispositions: null,
          postMutationAbsence: null,
          startedAtIso,
          endedAtIso: nowIso(),
          notes: [
            "Mutate gate on but R2 config unavailable — zero mutation executed.",
            "Never overwrites official live evidence.",
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
      writeFlyVerifyCleanupRecoveryEvidence({
        evidencePath,
        document: {
          title:
            "Sprint 11E Phase 2E.2D.7A.2 — Hosted Fly verifier cleanup recovery",
          overall: "FAIL",
          failClass: "recovery_redis_unavailable",
          archivedLiveEvidenceSha256: FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
          windowStartMs,
          windowEndMs,
          preview: discovery.preview,
          neonLeftoverCount: null,
          mutationDispositions: null,
          postMutationAbsence: null,
          startedAtIso,
          endedAtIso: nowIso(),
          notes: [
            "Mutate gate on but Upstash TCP config unavailable — zero mutation executed.",
            "Never overwrites official live evidence.",
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
    const mutation = await executeFlyVerifyCleanupRecoveryMutation({
      sql,
      storage,
      redis,
      target: discovery.target,
      windowStartMs,
      windowEndMs,
    });

    const leftovers = mutation.absence
      ? mutation.absence.neonJobCount +
        mutation.absence.neonObjectCount +
        mutation.absence.neonOwnershipCount
      : null;

    writeFlyVerifyCleanupRecoveryEvidence({
      evidencePath,
      document: {
        title:
          "Sprint 11E Phase 2E.2D.7A.2 — Hosted Fly verifier cleanup recovery",
        overall: mutation.ok ? "PASS" : mutation.overall,
        failClass: mutation.ok ? null : mutation.failClass,
        archivedLiveEvidenceSha256: FLY_VERIFY_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA,
        windowStartMs,
        windowEndMs,
        preview: discovery.preview,
        neonLeftoverCount: leftovers,
        mutationDispositions: mutation.dispositions,
        postMutationAbsence: mutation.absence,
        startedAtIso,
        endedAtIso: nowIso(),
        notes: mutation.ok
          ? [
              "Bounded mutation executed once for single archived FAIL run.",
              `coherence_result=ok candidate_runs=1 pre_neon_jobs=1 pre_owned_objects=1 pre_project_ownership_rows=1`,
              `redis=${mutation.dispositions.redis} r2=${mutation.dispositions.r2} neon=${mutation.dispositions.neon}`,
              "Post-mutation absence verified for Neon, exact R2 locator, and run-owned Redis entries.",
              "Never overwrites official live evidence.",
            ]
          : [
              "Bounded mutation stopped — partial or failed outcome recorded truthfully.",
              `redis=${mutation.dispositions.redis} r2=${mutation.dispositions.r2} neon=${mutation.dispositions.neon}`,
              mutation.overall === "PARTIAL"
                ? "PARTIAL/UNCONFIRMED — idempotent retry may be authorized separately."
                : "FAIL closed before foreign resources could be affected.",
              "Never overwrites official live evidence.",
            ],
      },
    });

    if (mutation.ok) {
      return { exitCode: 0, overall: "PASS" };
    }
    return {
      exitCode: 1,
      overall: mutation.overall,
    };
  } finally {
    if (
      ownsTcpClose &&
      redis != null &&
      "close" in redis &&
      typeof redis.close === "function"
    ) {
      try {
        await redis.close();
      } catch {
        // best effort
      }
    }
  }
}
