/**
 * Gated cleanup recovery for a prior hosted Fly render-live matrix FAIL run.
 * Sprint 11E Phase 2E.2D.8J.1 — run-owned Neon/R2/Redis only (frl_owner scope).
 */

import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

/** Official 8J render-live matrix FAIL — active cleanup recovery target. */
export const FLY_RENDER_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA_8J =
  "2e6942334843b664e7089d13bfca488c29f888bfac897e89aceb2fb1768feb01" as const;

export const FLY_RENDER_LIVE_ARCHIVED_FAIL_8J_STARTED_MS = Date.parse(
  "2026-07-25T09:15:29.297Z",
);
export const FLY_RENDER_LIVE_ARCHIVED_FAIL_8J_ENDED_MS = Date.parse(
  "2026-07-25T09:19:01.176Z",
);

export const FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA =
  FLY_RENDER_LIVE_ARCHIVED_FAIL_EVIDENCE_SHA_8J;
export const FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_STARTED_MS =
  FLY_RENDER_LIVE_ARCHIVED_FAIL_8J_STARTED_MS;
export const FLY_RENDER_LIVE_CLEANUP_RECOVERY_ACTIVE_ENDED_MS =
  FLY_RENDER_LIVE_ARCHIVED_FAIL_8J_ENDED_MS;

export type FlyRenderLiveCleanupRecoveryPreview = {
  readonly ownerId: string;
  readonly jobId: string;
  readonly projectId: string;
  readonly objectCount: number;
  readonly projectCount: number;
  readonly r2LocatorCount: number;
  readonly redisStreamIdCount: number;
  readonly activeClaimPresent: boolean;
};

export type FlyRenderLiveCleanupRecoveryTarget = {
  readonly ownerId: string;
  readonly jobId: string;
  readonly projectId: string;
  readonly objectIds: readonly string[];
  readonly objectKeys: readonly string[];
  readonly storeIds: readonly string[];
};

export type FlyRenderLiveCleanupRecoveryDiscoveryResult =
  | {
      readonly ok: true;
      readonly preview: FlyRenderLiveCleanupRecoveryPreview;
      readonly target: FlyRenderLiveCleanupRecoveryTarget;
    }
  | { readonly ok: false; readonly failClass: string };

type DiscoveredJobRow = {
  readonly job_id: string;
  readonly owner_id: string;
  readonly creator_idempotency_key: string | null;
  readonly claim_token: string | null;
  readonly created_at_ms: string;
};

type DiscoveredObjectRow = {
  readonly object_id: string;
  readonly store_id: string;
  readonly object_key: string;
};

function isRenderLiveOwnerId(ownerId: string): boolean {
  return ownerId.startsWith("frl_owner_");
}

function isRenderLiveCreatorKey(key: string | null): boolean {
  return key != null && key.startsWith("fly-render-live-");
}

export async function discoverFlyRenderLiveCleanupRecoveryTarget(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}): Promise<FlyRenderLiveCleanupRecoveryDiscoveryResult> {
  try {
    const jobs = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<DiscoveredJobRow>(
        `
SELECT job_id, owner_id, creator_idempotency_key, claim_token, created_at_ms::text
FROM public.headless_jobs
WHERE owner_id LIKE 'frl_owner_%'
  AND creator_idempotency_key LIKE 'fly-render-live-%'
  AND created_at_ms >= $1
  AND created_at_ms <= $2
ORDER BY created_at_ms ASC
`,
        [input.windowStartMs, input.windowEndMs],
      );
    });

    const rows = jobs.rows;
    if (rows.length === 0) {
      return { ok: false, failClass: "discovery_zero_matches" };
    }
    if (rows.length !== 1) {
      return { ok: false, failClass: "discovery_multiple_matches" };
    }

    const job = rows[0]!;
    if (!isRenderLiveOwnerId(job.owner_id)) {
      return { ok: false, failClass: "discovery_owner_malformed" };
    }
    if (!isRenderLiveCreatorKey(job.creator_idempotency_key)) {
      return { ok: false, failClass: "discovery_creator_malformed" };
    }

    const objects = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<DiscoveredObjectRow>(
        `
SELECT object_id, store_id, object_key
FROM public.headless_owned_objects
WHERE owner_id = $1 AND job_id = $2
`,
        [job.owner_id, job.job_id],
      );
    });

    const ownership = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<{ project_id: string }>(
        `
SELECT project_id
FROM public.headless_project_ownership
WHERE owner_id = $1
`,
        [job.owner_id],
      );
    });

    const objectRows = objects.rows;
    if (objectRows.length === 0) {
      return { ok: false, failClass: "discovery_no_owned_objects" };
    }

    const projectIds = new Set(ownership.rows.map((r) => r.project_id));
    if (projectIds.size !== 1) {
      return { ok: false, failClass: "discovery_ambiguous_project_ownership" };
    }

    for (const obj of objectRows) {
      if (obj.object_id.length === 0 || obj.object_key.length === 0) {
        return { ok: false, failClass: "discovery_object_malformed" };
      }
    }

    const foreignJobs = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE owner_id LIKE 'frl_owner_%'
  AND creator_idempotency_key LIKE 'fly-render-live-%'
  AND created_at_ms >= $1
  AND created_at_ms <= $2
  AND job_id <> $3
`,
        [input.windowStartMs, input.windowEndMs, job.job_id],
      );
    });
    if (Number(foreignJobs.rows[0]?.n ?? "0") > 0) {
      return { ok: false, failClass: "discovery_foreign_job_in_window" };
    }

    const projectId = [...projectIds][0]!;
    return {
      ok: true,
      preview: {
        ownerId: job.owner_id,
        jobId: job.job_id,
        projectId,
        objectCount: objectRows.length,
        projectCount: 1,
        r2LocatorCount: objectRows.length,
        redisStreamIdCount: 0,
        activeClaimPresent:
          job.claim_token != null && job.claim_token.length > 0,
      },
      target: {
        ownerId: job.owner_id,
        jobId: job.job_id,
        projectId,
        objectIds: Object.freeze(objectRows.map((o) => o.object_id)),
        objectKeys: Object.freeze(objectRows.map((o) => o.object_key)),
        storeIds: Object.freeze(objectRows.map((o) => o.store_id)),
      },
    };
  } catch {
    return { ok: false, failClass: "discovery_read_failed" };
  }
}

export async function countFlyRenderLiveCleanupRecoveryNeonLeftovers(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly ownerId: string;
  readonly jobId: string;
}): Promise<{
  readonly jobCount: number;
  readonly objectCount: number;
  readonly projectOwnershipCount: number;
  readonly totalCount: number;
} | null> {
  try {
    const remaining = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      const objects = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_owned_objects
WHERE owner_id = $1 AND job_id = $2
`,
        [input.ownerId, input.jobId],
      );
      const jobs = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE owner_id = $1 AND job_id = $2
`,
        [input.ownerId, input.jobId],
      );
      const ownership = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership
WHERE owner_id = $1
`,
        [input.ownerId],
      );
      const outbox = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_render_dispatch_outbox
WHERE owner_id = $1 AND job_id = $2
`,
        [input.ownerId, input.jobId],
      );
      return {
        objects: Number(objects.rows[0]?.n ?? "0"),
        jobs: Number(jobs.rows[0]?.n ?? "0"),
        ownership: Number(ownership.rows[0]?.n ?? "0"),
        outbox: Number(outbox.rows[0]?.n ?? "0"),
      };
    });
    return {
      jobCount: remaining.jobs,
      objectCount: remaining.objects,
      projectOwnershipCount: remaining.ownership,
      totalCount:
        remaining.jobs +
        remaining.objects +
        remaining.ownership +
        remaining.outbox,
    };
  } catch {
    return null;
  }
}

export async function countGlobalFlyRenderLiveNeonLeftovers(input: {
  readonly sql: HeadlessSqlExecutor;
}): Promise<{
  readonly jobCount: number;
  readonly objectCount: number;
  readonly projectOwnershipCount: number;
  readonly totalCount: number;
} | null> {
  try {
    const remaining = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      const objects = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_owned_objects o
WHERE o.owner_id LIKE 'frl_owner_%'
  AND EXISTS (
    SELECT 1
    FROM public.headless_jobs j
    WHERE j.owner_id = o.owner_id
      AND j.job_id = o.job_id
      AND j.creator_idempotency_key LIKE 'fly-render-live-%'
  )
`,
      );
      const jobs = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE owner_id LIKE 'frl_owner_%'
  AND creator_idempotency_key LIKE 'fly-render-live-%'
`,
      );
      const ownership = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership p
WHERE p.owner_id LIKE 'frl_owner_%'
  AND EXISTS (
    SELECT 1
    FROM public.headless_jobs j
    WHERE j.owner_id = p.owner_id
      AND j.creator_idempotency_key LIKE 'fly-render-live-%'
  )
`,
      );
      return {
        objects: Number(objects.rows[0]?.n ?? "0"),
        jobs: Number(jobs.rows[0]?.n ?? "0"),
        ownership: Number(ownership.rows[0]?.n ?? "0"),
      };
    });
    return {
      jobCount: remaining.jobs,
      objectCount: remaining.objects,
      projectOwnershipCount: remaining.ownership,
      totalCount: remaining.jobs + remaining.objects + remaining.ownership,
    };
  } catch {
    return null;
  }
}

export const FLY_RENDER_LIVE_CLEANUP_RECOVERY_EVIDENCE_RELATIVE_PATH =
  "docs/HEADLESS_11E_FLY_RENDER_LIVE_CLEANUP_RECOVERY_EVIDENCE.md";

export function isFlyRenderLiveCleanupRecoveryGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (
      (env as Record<string, unknown>)
        .HEADLESS_FLY_RENDER_QA_CLEANUP_RECOVERY === "1"
    );
  } catch {
    return false;
  }
}

export function isFlyRenderLiveCleanupRecoveryMutateGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  return (
    (env as Record<string, unknown>)
      .HEADLESS_FLY_RENDER_QA_CLEANUP_RECOVERY_MUTATE === "1"
  );
}

export function mergeFlyRenderLiveCleanupRecoveryTrustedPublicEnv(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): Record<string, unknown> {
  return Object.freeze({
    ...(env as Record<string, unknown>),
    HEADLESS_ENV_NAME: "staging",
  });
}
