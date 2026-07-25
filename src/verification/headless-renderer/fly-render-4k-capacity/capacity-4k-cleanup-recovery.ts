/**
 * Gated cleanup recovery for Sprint 11E Phase 2E.2D.8K.1 hosted 4K capacity FAIL run.
 * Run-owned Neon/R2/Redis/outbox/cleanup-intent only (f4k_owner scope).
 */

import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

/** Accepted 8K.1 official FAIL evidence SHA — archived cleanup recovery target. */
export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K1 =
  "a1475a6e3b329d9db8a7a51f8d0d0a31d6a56e7ebb4d631661d9dadee3280ee1" as const;

/** Accepted 8K.3 official FAIL evidence SHA — archived cleanup recovery target. */
export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K3 =
  "c40ce8a6db89972c4f3e63cc735595f66fed33a0141899ccc81eb31614a40e03" as const;

/** Accepted 8K.4 official FAIL evidence SHA — active cleanup recovery target. */
export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K4 =
  "cf84dd669c28a469b38107393fead005029d5d6660267c4a4dda813e1e79d63e" as const;

export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_8K1_STARTED_MS = Date.parse(
  "2026-07-25T14:21:08.946Z",
);
export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_8K1_ENDED_MS = Date.parse(
  "2026-07-25T14:29:34.415Z",
);

export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_8K3_STARTED_MS = Date.parse(
  "2026-07-25T15:07:46.416Z",
);
export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_8K3_ENDED_MS = Date.parse(
  "2026-07-25T15:15:29.582Z",
);

export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_8K4_STARTED_MS = Date.parse(
  "2026-07-25T15:31:56.323Z",
);
export const FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_8K4_ENDED_MS = Date.parse(
  "2026-07-25T15:41:09.697Z",
);

export const FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_EVIDENCE_SHA =
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_EVIDENCE_SHA_8K4;
export const FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_STARTED_MS =
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_8K4_STARTED_MS;
export const FLY_RENDER_4K_CAPACITY_CLEANUP_RECOVERY_ACTIVE_ENDED_MS =
  FLY_RENDER_4K_CAPACITY_ARCHIVED_FAIL_8K4_ENDED_MS;

export type FlyRender4kCapacityCleanupRecoveryPreview = {
  readonly ownerId: string;
  readonly jobIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly objectCount: number;
  readonly r2LocatorCount: number;
  readonly redisStreamIdCount: number;
  readonly outboxCount: number;
  readonly cleanupIntentCount: number;
  readonly activeClaimPresent: boolean;
};

export type FlyRender4kCapacityCleanupRecoveryTarget = {
  readonly ownerId: string;
  readonly jobIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly objectIds: readonly string[];
  readonly objectKeys: readonly string[];
  readonly storeIds: readonly string[];
};

export type FlyRender4kCapacityCleanupRecoveryDiscoveryResult =
  | {
      readonly ok: true;
      readonly preview: FlyRender4kCapacityCleanupRecoveryPreview;
      readonly target: FlyRender4kCapacityCleanupRecoveryTarget;
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

function isCapacity4kOwnerId(ownerId: string): boolean {
  return ownerId.startsWith("f4k_owner_");
}

function isCapacity4kCreatorKey(key: string | null): boolean {
  return key != null && key.startsWith("fly-render-4k-");
}

export async function discoverFlyRender4kCapacityCleanupRecoveryTarget(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}): Promise<FlyRender4kCapacityCleanupRecoveryDiscoveryResult> {
  try {
    const jobs = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<DiscoveredJobRow>(
        `
SELECT job_id, owner_id, creator_idempotency_key, claim_token, created_at_ms::text
FROM public.headless_jobs
WHERE owner_id LIKE 'f4k_owner_%'
  AND creator_idempotency_key LIKE 'fly-render-4k-%'
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

    const ownerIds = new Set(rows.map((r) => r.owner_id));
    if (ownerIds.size !== 1) {
      return { ok: false, failClass: "discovery_multiple_owners" };
    }
    const ownerId = [...ownerIds][0]!;
    if (!isCapacity4kOwnerId(ownerId)) {
      return { ok: false, failClass: "discovery_owner_malformed" };
    }
    for (const job of rows) {
      if (!isCapacity4kCreatorKey(job.creator_idempotency_key)) {
        return { ok: false, failClass: "discovery_creator_malformed" };
      }
    }

    const jobIds = rows.map((r) => r.job_id);
    const objects = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<DiscoveredObjectRow>(
        `
SELECT object_id, store_id, object_key
FROM public.headless_owned_objects
WHERE owner_id = $1 AND job_id = ANY($2::text[])
`,
        [ownerId, jobIds],
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
        [ownerId],
      );
    });

    const outbox = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_render_dispatch_outbox
WHERE owner_id = $1 AND job_id = ANY($2::text[])
`,
        [ownerId, jobIds],
      );
    });

    const cleanupIntents = await input.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      return client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_cleanup_intents
WHERE owner_id = $1 AND job_id = ANY($2::text[])
`,
        [ownerId, jobIds],
      );
    });

    const objectRows = objects.rows;
    const projectIds = [...new Set(ownership.rows.map((r) => r.project_id))];

    return {
      ok: true,
      preview: {
        ownerId,
        jobIds: Object.freeze(jobIds.slice()),
        projectIds: Object.freeze(projectIds),
        objectCount: objectRows.length,
        r2LocatorCount: objectRows.length,
        redisStreamIdCount: 0,
        outboxCount: Number(outbox.rows[0]?.n ?? "0"),
        cleanupIntentCount: Number(cleanupIntents.rows[0]?.n ?? "0"),
        activeClaimPresent: rows.some(
          (r) => r.claim_token != null && r.claim_token.length > 0,
        ),
      },
      target: {
        ownerId,
        jobIds: Object.freeze(jobIds.slice()),
        projectIds: Object.freeze(projectIds),
        objectIds: Object.freeze(objectRows.map((o) => o.object_id)),
        objectKeys: Object.freeze(objectRows.map((o) => o.object_key)),
        storeIds: Object.freeze(objectRows.map((o) => o.store_id)),
      },
    };
  } catch {
    return { ok: false, failClass: "discovery_read_failed" };
  }
}

export async function countFlyRender4kCapacityCleanupRecoveryLeftovers(input: {
  readonly sql: HeadlessSqlExecutor;
  readonly ownerId: string;
  readonly jobIds: readonly string[];
}): Promise<{
  readonly jobCount: number;
  readonly objectCount: number;
  readonly projectOwnershipCount: number;
  readonly outboxCount: number;
  readonly cleanupIntentCount: number;
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
WHERE owner_id = $1 AND job_id = ANY($2::text[])
`,
        [input.ownerId, input.jobIds],
      );
      const jobs = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE owner_id = $1 AND job_id = ANY($2::text[])
`,
        [input.ownerId, input.jobIds],
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
WHERE owner_id = $1 AND job_id = ANY($2::text[])
`,
        [input.ownerId, input.jobIds],
      );
      const cleanupIntents = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_cleanup_intents
WHERE owner_id = $1 AND job_id = ANY($2::text[])
`,
        [input.ownerId, input.jobIds],
      );
      return {
        objects: Number(objects.rows[0]?.n ?? "0"),
        jobs: Number(jobs.rows[0]?.n ?? "0"),
        ownership: Number(ownership.rows[0]?.n ?? "0"),
        outbox: Number(outbox.rows[0]?.n ?? "0"),
        cleanupIntents: Number(cleanupIntents.rows[0]?.n ?? "0"),
      };
    });
    return {
      jobCount: remaining.jobs,
      objectCount: remaining.objects,
      projectOwnershipCount: remaining.ownership,
      outboxCount: remaining.outbox,
      cleanupIntentCount: remaining.cleanupIntents,
      totalCount:
        remaining.jobs +
        remaining.objects +
        remaining.ownership +
        remaining.outbox +
        remaining.cleanupIntents,
    };
  } catch {
    return null;
  }
}

export function isFlyRender4kCapacityCleanupRecoveryGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (
      (env as Record<string, unknown>).HEADLESS_FLY_RENDER_4K_QA_CLEANUP_RECOVERY ===
      "1"
    );
  } catch {
    return false;
  }
}

export function isFlyRender4kCapacityCleanupRecoveryMutateGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  return (
    (env as Record<string, unknown>)
      .HEADLESS_FLY_RENDER_4K_QA_CLEANUP_RECOVERY_MUTATE === "1"
  );
}

export function mergeFlyRender4kCapacityCleanupRecoveryTrustedPublicEnv(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): Record<string, unknown> {
  return Object.freeze({
    ...(env as Record<string, unknown>),
    HEADLESS_ENV_NAME: "staging",
  });
}
