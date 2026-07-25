/**
 * Bounded execution-probe cleanup-recovery mutation — Redis → R2 → Neon.
 */

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import type { HeadlessOwnedObjectStoreId } from "@/features/headless-renderer/control-plane/types/owned-object-record";
import {
  pendingProbeToDeprecatedBoolean,
  type HeadlessPendingProbeResult,
} from "@/features/headless-renderer/control-plane/runtime/pending-probe";

import {
  countFlyRenderExecutionProbeCleanupRecoveryNeonLeftovers,
  type FlyRenderExecutionProbeCleanupRecoveryTarget,
} from "./execution-probe-cleanup-recovery";

const SHARED_RENDER_STREAM_RE = /^hfq:render:(local|staging|production)$/;

export type FlyRenderExecutionProbeCleanupRecoveryRedisPort = {
  qaXackInGroup(
    stream: string,
    group: string,
    id: string,
  ): Promise<unknown>;
  qaXdel(stream: string, id: string): Promise<unknown>;
  qaProbePendingInGroup(
    stream: string,
    group: string,
    id: string,
  ): Promise<HeadlessPendingProbeResult>;
  qaScanStreamWindow?(
    stream: string,
    startMs: number,
    endMs: number,
    max: number,
  ): Promise<{ readonly ok: boolean; readonly ids: readonly string[] }>;
};

export type FlyRenderExecutionProbeCleanupRecoveryMutationResult =
  | {
      readonly ok: true;
      readonly neonLeftoverCount: number;
      readonly redisPendingCount: number;
      readonly r2DeletedCount: number;
    }
  | { readonly ok: false; readonly failClass: string };

function parseStoreId(value: string): HeadlessOwnedObjectStoreId | null {
  return value === "assets" || value === "artifacts" ? value : null;
}

export async function executeFlyRenderExecutionProbeCleanupRecoveryMutation(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly storage: R2StorageAdapter;
  readonly redis: FlyRenderExecutionProbeCleanupRecoveryRedisPort | null;
  readonly target: FlyRenderExecutionProbeCleanupRecoveryTarget;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly blockOnActiveClaim: boolean;
  readonly activeClaimPresent: boolean;
}): Promise<FlyRenderExecutionProbeCleanupRecoveryMutationResult> {
  if (input.blockOnActiveClaim && input.activeClaimPresent) {
    return { ok: false, failClass: "active_claim_still_present" };
  }

  const streamNames = deriveHeadlessQueueStreamNames("staging");
  let redisPendingCount = 0;
  let r2DeletedCount = 0;

  if (input.redis != null) {
    const scanResult =
      input.redis.qaScanStreamWindow != null
        ? await input.redis.qaScanStreamWindow(
            streamNames.renderStream,
            input.windowStartMs,
            input.windowEndMs,
            32,
          )
        : null;
    const ids =
      scanResult != null && scanResult.ok ? scanResult.ids : [];
    for (const streamId of ids) {
      if (!SHARED_RENDER_STREAM_RE.test(streamNames.renderStream)) {
        return { ok: false, failClass: "redis_stream_not_authorized" };
      }
      try {
        await input.redis.qaXackInGroup(
          streamNames.renderStream,
          streamNames.renderGroup,
          streamId,
        );
      } catch {
        // continue
      }
      try {
        await input.redis.qaXdel(streamNames.renderStream, streamId);
      } catch {
        // continue
      }
      const pending = await input.redis.qaProbePendingInGroup(
        streamNames.renderStream,
        streamNames.renderGroup,
        streamId,
      );
      if (pendingProbeToDeprecatedBoolean(pending)) {
        redisPendingCount += 1;
      }
    }
    if (redisPendingCount > 0) {
      return { ok: false, failClass: "redis_pending_still_present" };
    }
  }

  for (let i = 0; i < input.target.objectIds.length; i += 1) {
    const storeId = parseStoreId(input.target.storeIds[i] ?? "");
    const objectKey = input.target.objectKeys[i];
    if (storeId == null || objectKey == null || objectKey.length === 0) {
      return { ok: false, failClass: "r2_locator_malformed" };
    }
    try {
      await input.storage.deleteObject(
        { storeId, objectKey },
        input.target.ownerId,
      );
      r2DeletedCount += 1;
    } catch {
      // continue — verify absence below
    }
  }

  try {
    await input.sql.withTransaction(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      await client.query(
        `
DELETE FROM public.headless_owned_objects
WHERE owner_id = $1 AND job_id = $2
`,
        [input.target.ownerId, input.target.jobId],
      );
      await client.query(
        `
DELETE FROM public.headless_render_dispatch_outbox
WHERE owner_id = $1 AND job_id = $2
`,
        [input.target.ownerId, input.target.jobId],
      );
      await client.query(
        `
DELETE FROM public.headless_jobs
WHERE owner_id = $1 AND job_id = $2
`,
        [input.target.ownerId, input.target.jobId],
      );
      await client.query(
        `
DELETE FROM public.headless_project_ownership
WHERE owner_id = $1 AND project_id = $2
`,
        [input.target.ownerId, input.target.projectId],
      );
    });
  } catch {
    return { ok: false, failClass: "neon_mutation_failed" };
  }

  const leftovers = await countFlyRenderExecutionProbeCleanupRecoveryNeonLeftovers({
    sql: input.sql,
    ownerId: input.target.ownerId,
    jobId: input.target.jobId,
  });
  if (leftovers == null || leftovers.totalCount > 0) {
    return { ok: false, failClass: "neon_leftovers_remain" };
  }

  return {
    ok: true,
    neonLeftoverCount: 0,
    redisPendingCount: 0,
    r2DeletedCount,
  };
}
