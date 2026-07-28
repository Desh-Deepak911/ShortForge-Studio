/**
 * Gated cleanup recovery for a prior hosted Fly render execution-probe FAIL run.
 * Sprint 11E Phase 2E.2D.8I — run-owned Neon/R2/Redis only.
 */

import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

/** Prior 8H digest probe FAIL window — historical postmortem only. */
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8H =
  "a863e3cf06cb63085f5490f53ff0c69a97614ca540628b32e88ab56d3a621b33" as const;
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_STARTED_MS = Date.parse(
  "2026-07-24T13:40:52.972Z",
);
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_ENDED_MS = Date.parse(
  "2026-07-24T13:47:11.803Z",
);

/** Accepted 8I.1C post-frame probe FAIL — historical cleanup recovery window. */
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I1C =
  "12faa3c663d0b58ef24855062a8a55847bd6051ca1454f1af976f1da46fe0712" as const;

export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I1C_STARTED_MS = Date.parse(
  "2026-07-24T15:41:52.383Z",
);
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I1C_ENDED_MS = Date.parse(
  "2026-07-24T15:45:43.945Z",
);

/** Accepted 8I.2C post-frame-attribution probe FAIL — historical cleanup recovery window. */
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I2C =
  "b5b373987b01fb74705a1d19734d4728274fad09369164c1fea999fd30b67bf3" as const;

export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I2C_STARTED_MS = Date.parse(
  "2026-07-24T16:42:29.781Z",
);
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I2C_ENDED_MS = Date.parse(
  "2026-07-24T16:46:13.721Z",
);

/** Accepted 8I.3C artifact-binding probe FAIL — cleanup recovery window authority. */
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA =
  "f0b157c9535cbd8aece176b782bb7f073f4b40e9d038a0e9002eaef30d6402c2" as const;

export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_STARTED_MS = Date.parse(
  "2026-07-24T19:06:10.795Z",
);
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_ENDED_MS = Date.parse(
  "2026-07-24T19:09:45.510Z",
);

/** Accepted 8I.5.2C object-key binding probe FAIL — current cleanup recovery window. */
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I52C =
  "9355792575999a4fb8fec0032f3519e7a3d0f08033c9e34e842b1a809c3d5076" as const;

export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_STARTED_MS =
  Date.parse("2026-07-24T22:12:13.181Z");
export const FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_ENDED_MS = Date.parse(
  "2026-07-24T22:16:01.170Z",
);

/** Active cleanup-recovery target for Sprint 11E Phase 2E.2D.8I.6. */
export const FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA =
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I52C;
export const FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_STARTED_MS =
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_STARTED_MS;
export const FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_ACTIVE_ENDED_MS =
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I52C_ENDED_MS;

export type FlyRenderExecutionProbeCleanupRecoveryPreview = {
  readonly ownerId: string;
  readonly jobId: string;
  readonly projectId: string;
  readonly objectCount: number;
  readonly projectCount: number;
  readonly r2LocatorCount: number;
  readonly redisStreamIdCount: number;
  readonly activeClaimPresent: boolean;
};

export type FlyRenderExecutionProbeCleanupRecoveryTarget = {
  readonly ownerId: string;
  readonly jobId: string;
  readonly projectId: string;
  readonly objectIds: readonly string[];
  readonly objectKeys: readonly string[];
  readonly storeIds: readonly string[];
};

export type FlyRenderExecutionProbeCleanupRecoveryDiscoveryResult =
  | {
      readonly ok: true;
      readonly preview: FlyRenderExecutionProbeCleanupRecoveryPreview;
      readonly target: FlyRenderExecutionProbeCleanupRecoveryTarget;
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

function isExecutionProbeOwnerId(ownerId: string): boolean {
  return ownerId.startsWith("fep_owner_");
}

function isExecutionProbeCreatorKey(key: string | null): boolean {
  return key != null && key.startsWith("fly-render-live-");
}

export async function discoverFlyRenderExecutionProbeCleanupRecoveryTarget(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}): Promise<FlyRenderExecutionProbeCleanupRecoveryDiscoveryResult> {
  try {
    const jobs = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<DiscoveredJobRow>(
        `
SELECT job_id, owner_id, creator_idempotency_key, claim_token, created_at_ms::text
FROM public.headless_jobs
WHERE owner_id LIKE 'fep_owner_%'
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
    if (!isExecutionProbeOwnerId(job.owner_id)) {
      return { ok: false, failClass: "discovery_owner_malformed" };
    }
    if (!isExecutionProbeCreatorKey(job.creator_idempotency_key)) {
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
WHERE owner_id LIKE 'fep_owner_%'
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
        activeClaimPresent: job.claim_token != null && job.claim_token.length > 0,
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

export async function countFlyRenderExecutionProbeCleanupRecoveryNeonLeftovers(input: {
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

export const FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_EVIDENCE_RELATIVE_PATH =
  "docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE_CLEANUP_RECOVERY_EVIDENCE.md";

export async function countGlobalExecutionProbeNeonLeftovers(input: {
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
WHERE o.owner_id LIKE 'fep_owner_%'
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
WHERE owner_id LIKE 'fep_owner_%'
  AND creator_idempotency_key LIKE 'fly-render-live-%'
`,
      );
      const ownership = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership p
WHERE p.owner_id LIKE 'fep_owner_%'
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

export function isFlyRenderExecutionProbeCleanupRecoveryGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (
      (env as Record<string, unknown>)
        .HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_CLEANUP_RECOVERY === "1"
    );
  } catch {
    return false;
  }
}

export function isFlyRenderExecutionProbeCleanupRecoveryMutateGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  return (
    (env as Record<string, unknown>)
      .HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_CLEANUP_RECOVERY_MUTATE === "1"
  );
}

/** Trusted public staging pins — never bridge secrets. */
export function mergeFlyRenderExecutionProbeCleanupRecoveryTrustedPublicEnv(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): Record<string, unknown> {
  return Object.freeze({
    ...(env as Record<string, unknown>),
    HEADLESS_ENV_NAME: "staging",
  });
}
